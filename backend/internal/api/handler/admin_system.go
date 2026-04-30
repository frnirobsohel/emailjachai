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

	"github.com/gin-gonic/gin"
)

const (
	BackupDir = "backups"
	Version   = "v2.4.0"
)

type BackupFile struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
	Size string `json:"size"`
	Date string `json:"date"`
}

// GetSystemStatus returns license info and current version
func (h *AdminHandler) GetSystemStatus(c *gin.Context) {
	var license model.Setting
	config.DB.Where("setting_key = ?", "license_key").First(&license)

	status := "Active / Lifetime"
	if license.SettingValue == "" {
		status = "Inactive / Trial"
	}

	helper.SendSuccess(c, "System status retrieved", gin.H{
		"version":        Version,
		"license_status": status,
		"license_key":    license.SettingValue,
		"release_date":   "2026-04-20",
	})
}

// ListBackups returns a list of files in the backups directory
func (h *AdminHandler) ListBackups(c *gin.Context) {
	if _, err := os.Stat(BackupDir); os.IsNotExist(err) {
		os.Mkdir(BackupDir, 0755)
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
		} else if strings.Contains(f.Name(), "chats") {
			fileType = "Conversation"
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

	if _, err := os.Stat(BackupDir); os.IsNotExist(err) {
		os.Mkdir(BackupDir, 0755)
	}

	switch input.Type {
	case "Database":
		fileName = fmt.Sprintf("db_backup_%s.sql", timestamp)
		err = dumpDatabase(filepath.Join(BackupDir, fileName))
	case "Full System":
		fileName = fmt.Sprintf("full_system_%s.zip", timestamp)
		err = zipDirectory(".", filepath.Join(BackupDir, fileName))
	case "Conversation":
		fileName = fmt.Sprintf("chats_export_%s.json", timestamp)
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

	path := filepath.Join(BackupDir, fileName)
	if err := os.Remove(path); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete backup", err.Error())
		return
	}

	logAction(adminID.(uint), "WARN", "Admin", fmt.Sprintf("Deleted backup file: %s", fileName))
	helper.SendSuccess(c, "Backup deleted", nil)
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
	// On Windows, we might need the full path to pg_dump.exe
	pgDumpPath := `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`
	
	// Get DB URL from env or use config
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:Pass321@localhost:5432/emailjachai?sslmode=disable"
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

		// Skip the backups directory itself and .git, node_modules etc.
		if strings.Contains(path, "backups") || strings.Contains(path, ".git") || strings.Contains(path, "node_modules") || strings.Contains(path, "tmp") {
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
	return os.WriteFile(targetPath, []byte(`[]`), 0644)
}



