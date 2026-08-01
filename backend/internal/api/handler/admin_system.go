package handler

import (
	"archive/zip"
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
	BackupDir      = "backups"
	Version        = config.Version
	maxUpdateSize  = 50 * 1024 * 1024 // 50MB
	maxMaintMsgLen = 2000
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

	zipReader, err := zip.NewReader(file, header.Size)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Failed to read zip archive", "ERR_UPDATE_ZIP")
		return
	}

	var manifestFound bool
	var manifestData struct {
		Version     string `json:"version"`
		ReleaseDate string `json:"release_date"`
		Description string `json:"description"`
	}

	for _, f := range zipReader.File {
		base := filepath.Base(f.Name)
		if base != "manifest.json" {
			continue
		}
		manifestFound = true
		rc, err := f.Open()
		if err != nil {
			helper.SendError(c, http.StatusBadRequest, "Failed to open manifest.json", "ERR_UPDATE_MANIFEST")
			return
		}
		manifestBytes, err := io.ReadAll(io.LimitReader(rc, 1*1024*1024))
		_ = rc.Close()
		if err != nil {
			helper.SendError(c, http.StatusBadRequest, "Failed to read manifest.json", "ERR_UPDATE_MANIFEST")
			return
		}
		if err := json.Unmarshal(manifestBytes, &manifestData); err != nil {
			helper.SendError(c, http.StatusBadRequest, "Invalid manifest.json content", "ERR_UPDATE_MANIFEST")
			return
		}
		break
	}

	if !manifestFound {
		helper.SendError(c, http.StatusBadRequest, "manifest.json not found in package", "ERR_UPDATE_MANIFEST")
		return
	}
	if strings.TrimSpace(manifestData.Version) == "" || strings.TrimSpace(manifestData.ReleaseDate) == "" {
		helper.SendError(c, http.StatusBadRequest, "manifest.json requires version and release_date", "ERR_UPDATE_MANIFEST")
		return
	}

	notes := strings.TrimSpace(manifestData.Description)
	if utf8.RuneCountInString(notes) > maxMaintMsgLen {
		notes = string([]rune(notes)[:maxMaintMsgLen])
	}

	saveSettingUnscoped("system_version", strings.TrimSpace(manifestData.Version))
	saveSettingUnscoped("system_release_date", strings.TrimSpace(manifestData.ReleaseDate))
	saveSettingUnscoped("system_release_notes", notes)

	logAction(adminID, "INFO", "Admin", fmt.Sprintf(
		"Release metadata registered: %s (%s)", manifestData.Version, manifestData.ReleaseDate,
	))

	helper.SendSuccess(c, "Release metadata registered (code package is not applied automatically)", gin.H{
		"version":             manifestData.Version,
		"release_date":        manifestData.ReleaseDate,
		"release_notes":       notes,
		"update_applies_code": false,
	})
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

// RestoreBackup restores a database backup SQL file.
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
	if !strings.HasSuffix(cleanFileName, ".sql") {
		helper.SendError(c, http.StatusBadRequest, "Only SQL database backups can be restored online", "ERR_BACKUP_TYPE")
		return
	}

	path := filepath.Join(BackupDir, cleanFileName)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		helper.SendError(c, http.StatusNotFound, "Backup file not found", "ERR_BACKUP_NOT_FOUND")
		return
	}

	if err := restoreDatabase(path); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Database restore failed. Ensure psql is on PATH or set PSQL_PATH.", "ERR_BACKUP_RESTORE")
		return
	}

	logAction(adminID, "WARN", "Admin", fmt.Sprintf("Restored database from backup: %s", cleanFileName))
	helper.SendSuccess(c, "Database restored successfully.", nil)
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
