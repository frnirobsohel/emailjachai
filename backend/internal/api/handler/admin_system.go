package handler

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"
	"ejp-backend/internal/license"
	"encoding/json"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	BackupDir = "backups"
	Version   = config.Version
)

type BackupFile struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	Size string `json:"size"`
	Date string `json:"date"`
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

// GetSystemStatus returns license info and current version
func (h *AdminHandler) GetSystemStatus(c *gin.Context) {
	systemVersion := getOrSetSettingUnscoped("system_version", Version)
	systemReleaseDate := getOrSetSettingUnscoped("system_release_date", "2026-04-20")

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
		// Mask license key except the last 4 characters
		k := licenseSetting.SettingValue
		if len(k) >= 8 {
			maskedKey = strings.Repeat("*", len(k)-4) + k[len(k)-4:]
		} else {
			maskedKey = strings.Repeat("*", len(k))
		}
	}

	helper.SendSuccess(c, "System status retrieved", gin.H{
		"version":        systemVersion,
		"author":         config.AuthorName,
		"license_status": status,
		"license_key":    maskedKey,
		"release_date":   systemReleaseDate,
	})
}

// SaveLicenseKey validates and stores a new license key
func (h *AdminHandler) SaveLicenseKey(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		LicenseKey string `json:"license_key" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	trimmedKey := strings.TrimSpace(input.LicenseKey)
	if _, err := license.ValidateLicense(trimmedKey); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	saveSettingUnscoped("license_key", trimmedKey)

	logAction(adminID.(uint), "INFO", "Admin", "System license key updated and activated")
	
	status := "Active / Lifetime"
	maskedKey := ""
	if len(trimmedKey) >= 8 {
		maskedKey = strings.Repeat("*", len(trimmedKey)-4) + trimmedKey[len(trimmedKey)-4:]
	} else {
		maskedKey = strings.Repeat("*", len(trimmedKey))
	}

	helper.SendSuccess(c, "License key activated successfully", gin.H{
		"license_status": status,
		"license_key":    maskedKey,
	})
}

	// UploadUpdate handles file upload and updates system version info based on manifest.json
func (h *AdminHandler) UploadUpdate(c *gin.Context) {
	adminID, _ := c.Get("userID")
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "File is required", err.Error())
		return
	}
	defer file.Close()

	// Enforce size limit on update packages
	const maxUpdateSize = 50 * 1024 * 1024 // 50MB
	if header.Size > maxUpdateSize {
		helper.SendError(c, http.StatusBadRequest, "Update package size exceeds maximum limit of 50MB", "")
		return
	}

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
		helper.SendError(c, http.StatusBadRequest, "Invalid file format. Only .zip updates allowed", "")
		return
	}

	zipReader, err := zip.NewReader(file, header.Size)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Failed to read zip archive", err.Error())
		return
	}

	var manifestFound bool
	var manifestData struct {
		Version     string `json:"version"`
		ReleaseDate string `json:"release_date"`
		Description string `json:"description"`
	}

	for _, f := range zipReader.File {
		if f.Name == "manifest.json" {
			manifestFound = true
			rc, err := f.Open()
			if err != nil {
				helper.SendError(c, http.StatusInternalServerError, "Failed to open manifest.json in package", err.Error())
				return
			}
			defer rc.Close()

			// Safety Guard: Limit manifest.json reading to 1MB to prevent zip bomb / memory exhaustion
			manifestBytes, err := io.ReadAll(io.LimitReader(rc, 1*1024*1024))
			if err != nil {
				helper.SendError(c, http.StatusInternalServerError, "Failed to read manifest.json in package", err.Error())
				return
			}

			if err := json.Unmarshal(manifestBytes, &manifestData); err != nil {
				helper.SendError(c, http.StatusBadRequest, "Invalid manifest.json content", err.Error())
				return
			}
			break
		}
	}

	if !manifestFound {
		helper.SendError(c, http.StatusBadRequest, "manifest.json not found in update package", "")
		return
	}

	if manifestData.Version == "" || manifestData.ReleaseDate == "" {
		helper.SendError(c, http.StatusBadRequest, "manifest.json is missing required fields (version, release_date)", "")
		return
	}

	saveSettingUnscoped("system_version", manifestData.Version)
	saveSettingUnscoped("system_release_date", manifestData.ReleaseDate)

	logAction(adminID.(uint), "INFO", "Admin", fmt.Sprintf("System updated to version %s (released: %s). Description: %s", manifestData.Version, manifestData.ReleaseDate, manifestData.Description))

	helper.SendSuccess(c, "System updated successfully", gin.H{
		"version":      manifestData.Version,
		"release_date": manifestData.ReleaseDate,
	})
}

// ListBackups returns a list of files in the backups directory
func (h *AdminHandler) ListBackups(c *gin.Context) {
	if err := os.MkdirAll(BackupDir, 0750); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to access backups directory", err.Error())
		return
	}

	files, err := os.ReadDir(BackupDir)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to read backups", err.Error())
		return
	}

	var backups []BackupFile
	for i, f := range files {
		if f.IsDir() {
			continue
		}
		info, _ := f.Info()
		
		fileType := "Full System"
		if strings.HasSuffix(f.Name(), ".sql") {
			fileType = "Database"
		} else if strings.Contains(f.Name(), "user_details") {
			fileType = "User Details"
		}

		backups = append(backups, BackupFile{
			ID:   int64(i + 1),
			Name: f.Name(),
			Type: fileType,
			Size: formatSize(info.Size()),
			Date: info.ModTime().Format("2006-01-02 15:04"),
		})
	}

	// Sort by date desc
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].Date > backups[j].Date
	})

	helper.SendSuccess(c, "Backups retrieved", backups)
}

// CreateBackup generates a new backup file
func (h *AdminHandler) CreateBackup(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		Type string `json:"type" binding:"required"` // "Full System", "Database", "Conversation"
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	timestamp := time.Now().Format("2006_01_02_150405")
	var fileName string
	var err error

	if err := os.MkdirAll(BackupDir, 0750); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to create backups directory", err.Error())
		return
	}

	switch input.Type {
	case "Database":
		fileName = fmt.Sprintf("db_backup_%s.sql", timestamp)
		err = dumpDatabase(filepath.Join(BackupDir, fileName))
	case "Full System":
		fileName = fmt.Sprintf("full_system_%s.zip", timestamp)
		err = zipDirectory(".", filepath.Join(BackupDir, fileName))
	case "User Details":
		fileName = fmt.Sprintf("user_details_export_%s.json", timestamp)
		err = exportChats(filepath.Join(BackupDir, fileName))
	default:
		helper.SendError(c, http.StatusBadRequest, "Invalid backup type", "")
		return
	}

	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Backup failed", err.Error())
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", fmt.Sprintf("Generated %s backup: %s", input.Type, fileName))
	helper.SendSuccess(c, "Backup created successfully", nil)
}

// DeleteBackup removes a backup file
func (h *AdminHandler) DeleteBackup(c *gin.Context) {
	adminID, _ := c.Get("userID")
	fileName := c.Query("name")
	if fileName == "" {
		helper.SendError(c, http.StatusBadRequest, "File name is required", "")
		return
	}

	// Clean and extract base name to prevent directory traversal attacks
	cleanFileName := filepath.Base(filepath.Clean(fileName))
	if cleanFileName == "." || cleanFileName == ".." || strings.Contains(fileName, "..") {
		helper.SendError(c, http.StatusBadRequest, "Invalid backup file name path", "")
		return
	}

	path := filepath.Join(BackupDir, cleanFileName)
	if err := os.Remove(path); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete backup", err.Error())
		return
	}

	logAction(adminID.(uint), "WARN", "Admin", fmt.Sprintf("Deleted backup file: %s", cleanFileName))
	helper.SendSuccess(c, "Backup deleted", nil)
}

// RestoreBackup restores a database backup SQL file
func (h *AdminHandler) RestoreBackup(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	// Clean and extract base name to prevent directory traversal attacks
	cleanFileName := filepath.Base(filepath.Clean(input.Name))
	if cleanFileName == "." || cleanFileName == ".." || strings.Contains(input.Name, "..") {
		helper.SendError(c, http.StatusBadRequest, "Invalid backup file name path", "")
		return
	}

	if !strings.HasSuffix(cleanFileName, ".sql") {
		helper.SendError(c, http.StatusBadRequest, "Only SQL database backups can be restored online", "")
		return
	}

	path := filepath.Join(BackupDir, cleanFileName)
	if _, err := os.Stat(path); os.IsNotExist(err) {
		helper.SendError(c, http.StatusNotFound, "Backup file not found", "")
		return
	}

	err := restoreDatabase(path)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Database restore failed", err.Error())
		return
	}

	logAction(adminID.(uint), "WARN", "Admin", fmt.Sprintf("Restored database from backup: %s", cleanFileName))
	helper.SendSuccess(c, "Database restored successfully.", nil)
}

// Helper: Restore database from SQL using psql.exe
func restoreDatabase(targetPath string) error {
	psqlPath := os.Getenv("PSQL_PATH")
	if psqlPath == "" {
		psqlPath = `C:\Program Files\PostgreSQL\18\bin\psql.exe`
	}
	
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL environment variable is not set")
	}

	cmd := exec.Command(psqlPath, "--dbname="+dbURL, "--file="+targetPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("psql failed: %v, output: %s", err, string(output))
	}
	return nil
}

// Helper: Format file size
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

// Helper: Dump Postgres DB using pg_dump
func dumpDatabase(targetPath string) error {
	// Example: pg_dump -U postgres -d emailjachai > backup.sql
	pgDumpPath := os.Getenv("PG_DUMP_PATH")
	if pgDumpPath == "" {
		// Fallback to default path on common Windows install
		pgDumpPath = `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`
	}
	
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return fmt.Errorf("DATABASE_URL environment variable is not set")
	}

	cmd := exec.Command(pgDumpPath, "--dbname="+dbURL, "--file="+targetPath, "--no-owner", "--no-privileges")
	
	// Set PGPASSWORD if needed, but for local it might be fine or using URL
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("pg_dump failed: %v, output: %s", err, string(output))
	}
	return nil
}

// Helper: Zip a directory
func zipDirectory(source, target string) error {
	zipFile, err := os.Create(target)
	if err != nil {
		return err
	}
	defer zipFile.Close()

	archive := zip.NewWriter(zipFile)
	defer archive.Close()

	err = filepath.Walk(source, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		baseName := filepath.Base(path)
		if info.IsDir() {
			if baseName == "backups" || baseName == ".git" || baseName == "node_modules" || baseName == "tmp" {
				return filepath.SkipDir
			}
		}

		if baseName == ".env" || strings.HasSuffix(baseName, ".env.production") {
			return nil
		}

		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}

		header.Name = strings.TrimPrefix(path, source+string(filepath.Separator))

		if info.IsDir() {
			header.Name += "/"
		} else {
			header.Method = zip.Deflate
		}

		writer, err := archive.CreateHeader(header)
		if err != nil {
			return err
		}

		if !info.IsDir() {
			file, err := os.Open(path)
			if err != nil {
				return err
			}
			defer file.Close()
			_, err = io.Copy(writer, file)
		}
		return err
	})

	return err
}

// Helper: Export chats (mock for now, could be real JSON dump)
func exportChats(targetPath string) error {
	type UserBackupData struct {
		ID        uint               `json:"id"`
		Name      string             `json:"name"`
		Email     string             `json:"email"`
		Role      string             `json:"role"`
		Credits   int                `json:"credits"`
		Status    string             `json:"status"`
		CreatedAt time.Time          `json:"created_at"`
		History   []model.Transaction `json:"history"`
	}

	var users []model.User
	if err := config.DB.Find(&users).Error; err != nil {
		return err
	}

	var backupData []UserBackupData
	for _, u := range users {
		var history []model.Transaction
		if err := config.DB.Where("user_id = ?", u.ID).Order("created_at desc").Find(&history).Error; err != nil {
			// Skip or handle error. Here we just log or proceed with empty history
			history = []model.Transaction{}
		}

		backupData = append(backupData, UserBackupData{
			ID:        u.ID,
			Name:      u.Name,
			Email:     u.Email,
			Role:      u.Role,
			Credits:   u.Credits,
			Status:    u.Status,
			CreatedAt: u.CreatedAt,
			History:   history,
		})
	}

	fileContent, err := json.MarshalIndent(backupData, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(targetPath, fileContent, 0644)
}



