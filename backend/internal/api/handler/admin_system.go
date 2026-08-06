package handler

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/license"
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	BackupDir       = "backups"
	Version         = config.Version
	maxUpdateSize   = 50 * 1024 * 1024  // 50MB — release metadata zip
	maxBackupUpload = 500 * 1024 * 1024 // 500MB — backup upload
	maxMaintMsgLen  = 2000
)

type BackupFile struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	Size string `json:"size"`
	Date string `json:"date"`
}

func systemAdminID(c *gin.Context) (uint, bool) {
	adminIDVal, ok := c.Get("userID")
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return 0, false
	}
	adminID, ok := adminIDVal.(uint)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return 0, false
	}
	return adminID, true
}

func getOrSetSettingUnscoped(key, defaultValue string) string {
	var setting model.Setting
	err := config.DB.Unscoped().Where("setting_key = ?", key).First(&setting).Error
	if err != nil {
		setting = model.Setting{SettingKey: key, SettingValue: defaultValue}
		config.DB.Create(&setting)
		return defaultValue
	}
	if setting.DeletedAt.Valid {
		setting.DeletedAt = gorm.DeletedAt{}
		setting.SettingValue = defaultValue
		config.DB.Save(&setting)
	}
	return setting.SettingValue
}

func saveSettingUnscoped(key, value string) {
	var setting model.Setting
	err := config.DB.Unscoped().Where("setting_key = ?", key).First(&setting).Error
	if err != nil {
		setting = model.Setting{SettingKey: key, SettingValue: value}
		config.DB.Create(&setting)
	} else {
		setting.SettingValue = value
		setting.DeletedAt = gorm.DeletedAt{}
		config.DB.Save(&setting)
	}
}

func safeBackupName(name string) (string, error) {
	clean := filepath.Base(filepath.Clean(strings.TrimSpace(name)))
	if clean == "." || clean == ".." || clean == "" || strings.Contains(name, "..") {
		return "", errors.New("invalid backup file name")
	}
	return clean, nil
}

// GetSystemStatus returns license info and current version / release notes.
func (h *AdminHandler) GetSystemStatus(c *gin.Context) {
	systemVersion := getOrSetSettingUnscoped("system_version", Version)
	systemReleaseDate := getOrSetSettingUnscoped("system_release_date", "2026-04-20")
	systemNotes := getOrSetSettingUnscoped("system_release_notes", "")

	var licenseSetting model.Setting
	config.DB.Unscoped().Where("setting_key = ?", "license_key").First(&licenseSetting)

	status := "Inactive / Trial"
	maskedKey := ""
	if licenseSetting.SettingValue != "" && !licenseSetting.DeletedAt.Valid {
		if _, err := license.ValidateLicense(licenseSetting.SettingValue); err != nil {
			status = "Invalid / Expired"
		} else {
			status = "Active / Lifetime"
		}
		k := licenseSetting.SettingValue
		if len(k) >= 8 {
			maskedKey = strings.Repeat("*", len(k)-4) + k[len(k)-4:]
		} else {
			maskedKey = strings.Repeat("*", len(k))
		}
	}

	helper.SendSuccess(c, "System status retrieved", gin.H{
		"version":             systemVersion,
		"author":              config.AuthorName,
		"license_status":      status,
		"license_key":         maskedKey,
		"release_date":        systemReleaseDate,
		"release_notes":       systemNotes,
		"update_applies_code": false, // metadata registration only
	})
}

// SaveLicenseKey validates format and stores a license key (enforcement deferred).
func (h *AdminHandler) SaveLicenseKey(c *gin.Context) {
	adminID, ok := systemAdminID(c)
	if !ok {
		return
	}
	var input struct {
		LicenseKey string `json:"license_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid license payload", "ERR_LICENSE_PAYLOAD")
		return
	}

	trimmedKey := strings.TrimSpace(input.LicenseKey)
	if _, err := license.ValidateLicense(trimmedKey); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid license key format", "ERR_LICENSE_FORMAT")
		return
	}

	saveSettingUnscoped("license_key", trimmedKey)
	logAction(adminID, "INFO", "Admin", "System license key updated and activated")

	maskedKey := ""
	if len(trimmedKey) >= 8 {
		maskedKey = strings.Repeat("*", len(trimmedKey)-4) + trimmedKey[len(trimmedKey)-4:]
	} else {
		maskedKey = strings.Repeat("*", len(trimmedKey))
	}

	helper.SendSuccess(c, "License key activated successfully", gin.H{
		"license_status": "Active / Lifetime",
		"license_key":    maskedKey,
	})
}

// UploadUpdate registers release metadata from manifest.json inside a zip.
// It does not extract or replace application binaries.
func (h *AdminHandler) UploadUpdate(c *gin.Context) {
	adminID, ok := systemAdminID(c)
	if !ok {
		return
	}
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "File is required", "ERR_UPDATE_FILE")
		return
	}
	defer file.Close()

	if header.Size > maxUpdateSize {
		helper.SendError(c, http.StatusBadRequest, "Update package size exceeds maximum limit of 50MB", "ERR_UPDATE_SIZE")
		return
	}
	if !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
		helper.SendError(c, http.StatusBadRequest, "Invalid file format. Only .zip packages allowed", "ERR_UPDATE_FORMAT")
		return
	}

	raw, err := io.ReadAll(io.LimitReader(file, maxUpdateSize+1))
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Failed to read zip archive", "ERR_UPDATE_ZIP")
		return
	}
	if int64(len(raw)) > maxUpdateSize {
		helper.SendError(c, http.StatusBadRequest, "Update package size exceeds maximum limit of 50MB", "ERR_UPDATE_SIZE")
		return
	}

	meta, err := registerReleaseMetadataFromZip(raw)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "ERR_UPDATE_MANIFEST")
		return
	}

	logAction(adminID, "INFO", "Admin", fmt.Sprintf(
		"Release metadata registered: %s (%s)", meta.Version, meta.ReleaseDate,
	))

	helper.SendSuccess(c, "Release metadata registered (code package is not applied automatically)", gin.H{
		"version":             meta.Version,
		"release_date":        meta.ReleaseDate,
		"release_notes":       meta.Notes,
		"update_applies_code": false,
		"kind":                "release_metadata",
	})
}

type releaseManifestMeta struct {
	Version     string
	ReleaseDate string
	Notes       string
}

func registerReleaseMetadataFromZip(raw []byte) (*releaseManifestMeta, error) {
	zipReader, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return nil, fmt.Errorf("failed to read zip archive")
	}

	var manifestFound bool
	var manifestData struct {
		Version     string `json:"version"`
		ReleaseDate string `json:"release_date"`
		Description string `json:"description"`
	}

	for _, f := range zipReader.File {
		if filepath.Base(f.Name) != "manifest.json" {
			continue
		}
		manifestFound = true
		rc, err := f.Open()
		if err != nil {
			return nil, fmt.Errorf("failed to open manifest.json")
		}
		manifestBytes, err := io.ReadAll(io.LimitReader(rc, 1*1024*1024))
		_ = rc.Close()
		if err != nil {
			return nil, fmt.Errorf("failed to read manifest.json")
		}
		if err := json.Unmarshal(manifestBytes, &manifestData); err != nil {
			return nil, fmt.Errorf("invalid manifest.json content")
		}
		break
	}

	if !manifestFound {
		return nil, fmt.Errorf("manifest.json not found in package")
	}
	if strings.TrimSpace(manifestData.Version) == "" || strings.TrimSpace(manifestData.ReleaseDate) == "" {
		return nil, fmt.Errorf("manifest.json requires version and release_date")
	}

	notes := strings.TrimSpace(manifestData.Description)
	if utf8.RuneCountInString(notes) > maxMaintMsgLen {
		notes = string([]rune(notes)[:maxMaintMsgLen])
	}

	version := strings.TrimSpace(manifestData.Version)
	releaseDate := strings.TrimSpace(manifestData.ReleaseDate)
	saveSettingUnscoped("system_version", version)
	saveSettingUnscoped("system_release_date", releaseDate)
	saveSettingUnscoped("system_release_notes", notes)

	return &releaseManifestMeta{
		Version:     version,
		ReleaseDate: releaseDate,
		Notes:       notes,
	}, nil
}

func zipContainsManifest(raw []byte) bool {
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		return false
	}
	for _, f := range zr.File {
		if filepath.Base(f.Name) == "manifest.json" {
			return true
		}
	}
	return false
}

func zipFileContainsManifest(path string) bool {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return false
	}
	defer zr.Close()
	for _, f := range zr.File {
		if filepath.Base(f.Name) == "manifest.json" {
			return true
		}
	}
	return false
}

func registerReleaseMetadataFromZipFile(path string) (*releaseManifestMeta, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read zip archive")
	}
	// Release packages are expected to be small; refuse huge "manifest" zips.
	if int64(len(raw)) > maxUpdateSize {
		return nil, fmt.Errorf("release package exceeds maximum limit of 50MB")
	}
	return registerReleaseMetadataFromZip(raw)
}

// ListBackups returns files in the backups directory.
func (h *AdminHandler) ListBackups(c *gin.Context) {
	if err := os.MkdirAll(BackupDir, 0750); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to access backups directory", "ERR_BACKUP_DIR")
		return
	}

	files, err := os.ReadDir(BackupDir)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to read backups", "ERR_BACKUP_LIST")
		return
	}

	var backups []BackupFile
	for i, f := range files {
		if f.IsDir() {
			continue
		}
		info, err := f.Info()
		if err != nil {
			continue
		}

		fileType := "Storage Data"
		if strings.HasSuffix(f.Name(), ".sql") {
			fileType = "Database"
		} else if strings.Contains(f.Name(), "user_details") {
			fileType = "User Details"
		} else if strings.HasPrefix(f.Name(), "full_system_") {
			fileType = "Full System" // legacy files
		}

		backups = append(backups, BackupFile{
			ID:   int64(i + 1),
			Name: f.Name(),
			Type: fileType,
			Size: formatSize(info.Size()),
			Date: info.ModTime().Format("2006-01-02 15:04"),
		})
	}

	sort.Slice(backups, func(i, j int) bool {
		return backups[i].Date > backups[j].Date
	})

	helper.SendSuccess(c, "Backups retrieved", backups)
}

// CreateBackup generates a new backup file.
func (h *AdminHandler) CreateBackup(c *gin.Context) {
	adminID, ok := systemAdminID(c)
	if !ok {
		return
	}
	var input struct {
		Type string `json:"type" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid backup payload", "ERR_BACKUP_PAYLOAD")
		return
	}

	timestamp := time.Now().Format("2006_01_02_150405")
	var fileName string
	var err error

	if err := os.MkdirAll(BackupDir, 0750); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to create backups directory", "ERR_BACKUP_DIR")
		return
	}

	switch input.Type {
	case "Database":
		fileName = fmt.Sprintf("db_backup_%s.sql", timestamp)
		err = dumpDatabase(filepath.Join(BackupDir, fileName))
	case "Storage Data", "Full System":
		// "Full System" kept as alias for older UI clients; no longer zips CWD.
		fileName = fmt.Sprintf("storage_data_%s.zip", timestamp)
		err = zipStorageData(filepath.Join(BackupDir, fileName))
	case "User Details":
		fileName = fmt.Sprintf("user_details_export_%s.json", timestamp)
		err = exportUsers(filepath.Join(BackupDir, fileName))
	default:
		helper.SendError(c, http.StatusBadRequest, "Invalid backup type", "ERR_BACKUP_TYPE")
		return
	}

	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Backup failed. Check server tooling (pg_dump) and storage paths.", "ERR_BACKUP_CREATE")
		return
	}

	logAction(adminID, "INFO", "Admin", fmt.Sprintf("Generated %s backup: %s", input.Type, fileName))
	helper.SendSuccess(c, "Backup created successfully", nil)
}

// DeleteBackup removes a backup file.
func (h *AdminHandler) DeleteBackup(c *gin.Context) {
	adminID, ok := systemAdminID(c)
	if !ok {
		return
	}
	cleanFileName, err := safeBackupName(c.Query("name"))
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid backup file name", "ERR_BACKUP_NAME")
		return
	}

	path := filepath.Join(BackupDir, cleanFileName)
	if err := os.Remove(path); err != nil {
		if os.IsNotExist(err) {
			helper.SendError(c, http.StatusNotFound, "Backup file not found", "ERR_BACKUP_NOT_FOUND")
			return
		}
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete backup", "ERR_BACKUP_DELETE")
		return
	}

	logAction(adminID, "WARN", "Admin", fmt.Sprintf("Deleted backup file: %s", cleanFileName))
	helper.SendSuccess(c, "Backup deleted", nil)
}

// DownloadBackup streams a backup file (path-safe).
func (h *AdminHandler) DownloadBackup(c *gin.Context) {
	cleanFileName, err := safeBackupName(c.Query("name"))
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid backup file name", "ERR_BACKUP_NAME")
		return
	}
	path := filepath.Join(BackupDir, cleanFileName)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		helper.SendError(c, http.StatusNotFound, "Backup file not found", "ERR_BACKUP_NOT_FOUND")
		return
	}
	c.FileAttachment(path, cleanFileName)
}

// RestoreBackup restores a backup from the backups directory.
// Supports Database (.sql), Storage Data (.zip), and User Details (.json — hybrid).
func (h *AdminHandler) RestoreBackup(c *gin.Context) {
	adminID, ok := systemAdminID(c)
	if !ok {
		return
	}
	var input struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid restore payload", "ERR_BACKUP_PAYLOAD")
		return
	}

	cleanFileName, err := safeBackupName(input.Name)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid backup file name", "ERR_BACKUP_NAME")
		return
	}

	path := filepath.Join(BackupDir, cleanFileName)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		helper.SendError(c, http.StatusNotFound, "Backup file not found", "ERR_BACKUP_NOT_FOUND")
		return
	}

	backupType := classifyBackupName(cleanFileName)
	var restoreErr error
	var detail string

	switch backupType {
	case "Database":
		restoreErr = restoreDatabase(path)
		detail = "Database restored successfully."
	case "Storage Data":
		restoreErr = restoreStorageData(path)
		detail = "Storage data restored successfully."
	case "User Details":
		var stats userRestoreStats
		stats, restoreErr = restoreUsersHybrid(path)
		detail = fmt.Sprintf(
			"User details restored (hybrid): updated=%d created=%d history_added=%d skipped_tx=%d",
			stats.Updated, stats.Created, stats.HistoryAdded, stats.HistorySkipped,
		)
	default:
		helper.SendError(c, http.StatusBadRequest, "Unsupported backup type for restore", "ERR_BACKUP_TYPE")
		return
	}

	if restoreErr != nil {
		helper.SendError(c, http.StatusInternalServerError, "Restore failed: "+restoreErr.Error(), "ERR_BACKUP_RESTORE")
		return
	}

	logAction(adminID, "WARN", "Admin", fmt.Sprintf("Restored %s backup: %s (%s)", backupType, cleanFileName, detail))
	helper.SendSuccess(c, detail, gin.H{"type": backupType, "file": cleanFileName})
}

// UploadBackup saves an uploaded backup file into the backups directory (restore is a separate step).
// Zip packages that contain manifest.json are treated as release metadata (version/notes), not storage backups.
func (h *AdminHandler) UploadBackup(c *gin.Context) {
	adminID, ok := systemAdminID(c)
	if !ok {
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "File is required", "ERR_BACKUP_FILE")
		return
	}
	defer file.Close()

	if header.Size > maxBackupUpload {
		helper.SendError(c, http.StatusBadRequest, "Backup file exceeds maximum size of 500MB", "ERR_BACKUP_SIZE")
		return
	}

	origName, err := safeBackupName(header.Filename)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid backup file name", "ERR_BACKUP_NAME")
		return
	}

	backupType := classifyBackupName(origName)
	if backupType == "" {
		helper.SendError(c, http.StatusBadRequest, "Unsupported file. Use .sql (DB), .zip (Storage or Release), or .json (User Details).", "ERR_BACKUP_TYPE")
		return
	}

	if err := os.MkdirAll(BackupDir, 0750); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to create backups directory", "ERR_BACKUP_DIR")
		return
	}

	tmp, err := os.CreateTemp(BackupDir, "upload_tmp_*")
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to save backup file", "ERR_BACKUP_SAVE")
		return
	}
	tmpPath := tmp.Name()
	written, copyErr := io.Copy(tmp, io.LimitReader(file, maxBackupUpload+1))
	_ = tmp.Close()
	if copyErr != nil {
		_ = os.Remove(tmpPath)
		helper.SendError(c, http.StatusInternalServerError, "Failed to save backup file", "ERR_BACKUP_SAVE")
		return
	}
	if written > maxBackupUpload {
		_ = os.Remove(tmpPath)
		helper.SendError(c, http.StatusBadRequest, "Backup file exceeds maximum size of 500MB", "ERR_BACKUP_SIZE")
		return
	}

	// Release metadata zip (manifest.json) — register version info, do not store as storage backup.
	if backupType == "Storage Data" && zipFileContainsManifest(tmpPath) {
		meta, regErr := registerReleaseMetadataFromZipFile(tmpPath)
		_ = os.Remove(tmpPath)
		if regErr != nil {
			helper.SendError(c, http.StatusBadRequest, regErr.Error(), "ERR_UPDATE_MANIFEST")
			return
		}
		logAction(adminID, "INFO", "Admin", fmt.Sprintf(
			"Release metadata registered via Upload & Restore: %s (%s)", meta.Version, meta.ReleaseDate,
		))
		helper.SendSuccess(c, "Release metadata registered (code package is not applied automatically)", gin.H{
			"kind":                "release_metadata",
			"version":             meta.Version,
			"release_date":        meta.ReleaseDate,
			"release_notes":       meta.Notes,
			"update_applies_code": false,
		})
		return
	}

	timestamp := time.Now().Format("2006_01_02_150405")
	var storedName string
	switch backupType {
	case "Database":
		storedName = fmt.Sprintf("db_backup_upload_%s.sql", timestamp)
	case "Storage Data":
		storedName = fmt.Sprintf("storage_data_upload_%s.zip", timestamp)
	case "User Details":
		storedName = fmt.Sprintf("user_details_export_upload_%s.json", timestamp)
	default:
		_ = os.Remove(tmpPath)
		helper.SendError(c, http.StatusBadRequest, "Unsupported backup type", "ERR_BACKUP_TYPE")
		return
	}

	dest := filepath.Join(BackupDir, storedName)
	if err := os.Rename(tmpPath, dest); err != nil {
		// Cross-device fallback
		data, readErr := os.ReadFile(tmpPath)
		_ = os.Remove(tmpPath)
		if readErr != nil {
			helper.SendError(c, http.StatusInternalServerError, "Failed to save backup file", "ERR_BACKUP_SAVE")
			return
		}
		if writeErr := os.WriteFile(dest, data, 0640); writeErr != nil {
			helper.SendError(c, http.StatusInternalServerError, "Failed to save backup file", "ERR_BACKUP_SAVE")
			return
		}
	}

	logAction(adminID, "INFO", "Admin", fmt.Sprintf("Uploaded %s backup: %s (from %s)", backupType, storedName, origName))
	helper.SendSuccess(c, "Backup uploaded. Click Restore when ready.", gin.H{
		"kind": "backup",
		"name": storedName,
		"type": backupType,
	})
}

func classifyBackupName(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.HasSuffix(lower, ".sql"):
		return "Database"
	case strings.Contains(lower, "user_details") && strings.HasSuffix(lower, ".json"):
		return "User Details"
	case strings.HasSuffix(lower, ".json"):
		return "User Details"
	case strings.HasPrefix(lower, "storage_data") && strings.HasSuffix(lower, ".zip"):
		return "Storage Data"
	case strings.HasSuffix(lower, ".zip"):
		return "Storage Data"
	default:
		return ""
	}
}

func formatSize(size int64) string {
	const unit = 1024
	if size < unit {
		return fmt.Sprintf("%d B", size)
	}
	div, exp := int64(unit), 0
	for n := size / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(size)/float64(div), "KMGTPE"[exp])
}

func resolveTool(envKey, binary string, windowsFallbacks []string) (string, error) {
	if p := strings.TrimSpace(os.Getenv(envKey)); p != "" {
		return p, nil
	}
	if p, err := exec.LookPath(binary); err == nil {
		return p, nil
	}
	for _, fb := range windowsFallbacks {
		if _, err := os.Stat(fb); err == nil {
			return fb, nil
		}
	}
	return "", fmt.Errorf("%s not found (set %s or install %s on PATH)", binary, envKey, binary)
}

func restoreDatabase(targetPath string) error {
	psqlPath, err := resolveTool("PSQL_PATH", "psql", []string{
		`C:\Program Files\PostgreSQL\18\bin\psql.exe`,
		`C:\Program Files\PostgreSQL\17\bin\psql.exe`,
		`C:\Program Files\PostgreSQL\16\bin\psql.exe`,
	})
	if err != nil {
		return err
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	cmd := exec.Command(psqlPath, "--dbname="+dbURL, "--file="+targetPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("psql failed: %v (%s)", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func dumpDatabase(targetPath string) error {
	pgDumpPath, err := resolveTool("PG_DUMP_PATH", "pg_dump", []string{
		`C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`,
		`C:\Program Files\PostgreSQL\17\bin\pg_dump.exe`,
		`C:\Program Files\PostgreSQL\16\bin\pg_dump.exe`,
	})
	if err != nil {
		return err
	}
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL is not set")
	}
	cmd := exec.Command(pgDumpPath, "--dbname="+dbURL, "--file="+targetPath, "--no-owner", "--no-privileges")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("pg_dump failed: %v (%s)", err, strings.TrimSpace(string(output)))
	}
	return nil
}

// zipStorageData archives configured job/result storage dirs only (never the full CWD).
func zipStorageData(target string) error {
	dirs := storageBackupDirs()
	if len(dirs) == 0 {
		return fmt.Errorf("no storage directories configured for backup")
	}

	zipFile, err := os.Create(target)
	if err != nil {
		return err
	}
	defer zipFile.Close()

	archive := zip.NewWriter(zipFile)
	defer archive.Close()

	for _, root := range dirs {
		root = filepath.Clean(root)
		info, err := os.Stat(root)
		if err != nil {
			continue
		}
		if !info.IsDir() {
			continue
		}
		base := filepath.Base(root)
		err = filepath.Walk(root, func(path string, fi os.FileInfo, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			rel, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}
			name := filepath.ToSlash(filepath.Join(base, rel))
			header, err := zip.FileInfoHeader(fi)
			if err != nil {
				return err
			}
			header.Name = name
			if fi.IsDir() {
				header.Name += "/"
			} else {
				header.Method = zip.Deflate
			}
			w, err := archive.CreateHeader(header)
			if err != nil {
				return err
			}
			if fi.IsDir() {
				return nil
			}
			f, err := os.Open(path)
			if err != nil {
				return err
			}
			_, copyErr := io.Copy(w, f)
			_ = f.Close()
			return copyErr
		})
		if err != nil {
			return err
		}
	}
	return nil
}

func storageBackupDirs() []string {
	keys := []string{"BULK_RESULTS_PATH", "BULK_SOURCE_PATH", "SINGLE_RESULTS_PATH"}
	seen := map[string]bool{}
	var out []string
	for _, k := range keys {
		p := strings.TrimSpace(os.Getenv(k))
		if p == "" {
			continue
		}
		p = filepath.Clean(p)
		if seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	return out
}

func exportUsers(targetPath string) error {
	type UserBackupData struct {
		ID        uint                `json:"id"`
		Name      string              `json:"name"`
		Email     string              `json:"email"`
		Role      string              `json:"role"`
		Credits   int                 `json:"credits"`
		Status    string              `json:"status"`
		CreatedAt time.Time           `json:"created_at"`
		History   []model.Transaction `json:"history"`
	}

	var users []model.User
	if err := config.DB.Find(&users).Error; err != nil {
		return err
	}

	userIDs := make([]uint, 0, len(users))
	for _, u := range users {
		userIDs = append(userIDs, u.ID)
	}

	historyByUser := map[uint][]model.Transaction{}
	if len(userIDs) > 0 {
		var all []model.Transaction
		if err := config.DB.Where("user_id IN ?", userIDs).Order("created_at desc").Find(&all).Error; err == nil {
			for _, t := range all {
				historyByUser[t.UserID] = append(historyByUser[t.UserID], t)
			}
		}
	}

	backupData := make([]UserBackupData, 0, len(users))
	for _, u := range users {
		hist := historyByUser[u.ID]
		if hist == nil {
			hist = []model.Transaction{}
		}
		backupData = append(backupData, UserBackupData{
			ID: u.ID, Name: u.Name, Email: u.Email, Role: u.Role,
			Credits: u.Credits, Status: u.Status, CreatedAt: u.CreatedAt, History: hist,
		})
	}

	fileContent, err := json.MarshalIndent(backupData, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(targetPath, fileContent, 0640)
}

type userRestoreStats struct {
	Updated        int
	Created        int
	HistoryAdded   int
	HistorySkipped int
}

type userBackupPayload struct {
	ID        uint                `json:"id"`
	Name      string              `json:"name"`
	Email     string              `json:"email"`
	Role      string              `json:"role"`
	Credits   int                 `json:"credits"`
	Status    string              `json:"status"`
	CreatedAt time.Time           `json:"created_at"`
	History   []model.Transaction `json:"history"`
}

// restoreUsersHybrid updates existing users by email, creates missing users with a random
// unusable password hash, and inserts history rows whose transaction_id is not already present.
func restoreUsersHybrid(path string) (userRestoreStats, error) {
	var stats userRestoreStats
	raw, err := os.ReadFile(path)
	if err != nil {
		return stats, err
	}

	var payload []userBackupPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return stats, fmt.Errorf("invalid user details JSON: %w", err)
	}
	if len(payload) == 0 {
		return stats, fmt.Errorf("user details file is empty")
	}

	err = config.DB.Transaction(func(tx *gorm.DB) error {
		for _, entry := range payload {
			email := strings.ToLower(strings.TrimSpace(entry.Email))
			if email == "" || !strings.Contains(email, "@") {
				continue
			}
			name := strings.TrimSpace(entry.Name)
			if name == "" {
				name = email
			}
			role := strings.TrimSpace(entry.Role)
			if role == "" {
				role = "user"
			}
			status := strings.TrimSpace(entry.Status)
			if status == "" {
				status = "Active"
			}

			var user model.User
			findErr := tx.Where("LOWER(email) = ?", email).First(&user).Error
			if findErr == nil {
				updates := map[string]interface{}{
					"name":    name,
					"role":    role,
					"credits": entry.Credits,
					"status":  status,
				}
				if err := tx.Model(&user).Updates(updates).Error; err != nil {
					return err
				}
				stats.Updated++
			} else if errors.Is(findErr, gorm.ErrRecordNotFound) {
				plain := "restore_" + helper.GenerateRandomHex(24)
				hashed, hashErr := helper.HashPassword(plain)
				if hashErr != nil {
					return hashErr
				}
				user = model.User{
					Name:     name,
					Email:    email,
					Password: hashed,
					Role:     role,
					Credits:  entry.Credits,
					Status:   status,
				}
				if !entry.CreatedAt.IsZero() {
					user.CreatedAt = entry.CreatedAt
				}
				if err := tx.Create(&user).Error; err != nil {
					return err
				}
				stats.Created++
			} else {
				return findErr
			}

			for _, hist := range entry.History {
				txnID := strings.TrimSpace(hist.TransactionID)
				if txnID == "" {
					stats.HistorySkipped++
					continue
				}
				var existing model.Transaction
				qErr := tx.Where("transaction_id = ?", txnID).First(&existing).Error
				if qErr == nil {
					stats.HistorySkipped++
					continue
				}
				if !errors.Is(qErr, gorm.ErrRecordNotFound) {
					return qErr
				}
				row := model.Transaction{
					UserID:        user.ID,
					TransactionID: txnID,
					ExternalID:    hist.ExternalID,
					Amount:        hist.Amount,
					CreditsAdded:  hist.CreditsAdded,
					PaymentMethod: hist.PaymentMethod,
					Type:          hist.Type,
					Status:        hist.Status,
					Provider:      hist.Provider,
					Package:       hist.Package,
					Description:   hist.Description,
				}
				if row.Type == "" {
					row.Type = "purchase"
				}
				if row.Status == "" {
					row.Status = "completed"
				}
				if row.Provider == "" {
					row.Provider = "system"
				}
				if !hist.CreatedAt.IsZero() {
					row.CreatedAt = hist.CreatedAt
				}
				if err := tx.Create(&row).Error; err != nil {
					return err
				}
				stats.HistoryAdded++
			}
		}
		return nil
	})
	return stats, err
}

// restoreStorageData extracts a storage_data zip into configured storage directories only.
func restoreStorageData(zipPath string) error {
	dirs := storageBackupDirs()
	if len(dirs) == 0 {
		return fmt.Errorf("no storage directories configured for restore")
	}

	byBase := map[string]string{}
	for _, d := range dirs {
		byBase[filepath.Base(d)] = d
	}

	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("invalid storage zip: %w", err)
	}
	defer zr.Close()

	written := 0
	for _, f := range zr.File {
		name := filepath.ToSlash(f.Name)
		if name == "" || strings.HasSuffix(name, "/") {
			continue
		}
		// Reject absolute / traversal paths
		if strings.HasPrefix(name, "/") || strings.Contains(name, "..") {
			return fmt.Errorf("unsafe path in zip: %s", f.Name)
		}
		parts := strings.SplitN(name, "/", 2)
		if len(parts) < 2 || parts[0] == "" {
			continue // skip entries not under a storage root folder
		}
		root, ok := byBase[parts[0]]
		if !ok {
			continue // unknown root — ignore (other envs may differ)
		}
		rel := parts[1]
		if rel == "" || strings.Contains(rel, "..") {
			return fmt.Errorf("unsafe relative path in zip: %s", f.Name)
		}
		dest := filepath.Join(root, filepath.FromSlash(rel))
		cleanRoot := filepath.Clean(root) + string(os.PathSeparator)
		cleanDest := filepath.Clean(dest)
		if cleanDest != filepath.Clean(root) && !strings.HasPrefix(cleanDest+string(os.PathSeparator), cleanRoot) {
			return fmt.Errorf("path escapes storage root: %s", f.Name)
		}

		if err := os.MkdirAll(filepath.Dir(dest), 0750); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
		if err != nil {
			_ = rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		_ = out.Close()
		_ = rc.Close()
		if copyErr != nil {
			return copyErr
		}
		written++
	}
	if written == 0 {
		return fmt.Errorf("no matching storage files found in zip for configured paths")
	}
	return nil
}
