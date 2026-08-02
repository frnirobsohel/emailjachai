package handler

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/logger"

	"github.com/gin-gonic/gin"
)

const (
	cacheRetentionMinDays = 1
	cacheRetentionMaxDays = 3650
	cacheUploadMaxBytes   = 20 * 1024 * 1024
	cacheUploadMaxRows    = 100_000
)

var cacheFreeDomains = map[string]struct{}{
	"gmail.com": {}, "googlemail.com": {},
	"yahoo.com": {}, "yahoo.co.uk": {}, "ymail.com": {}, "rocketmail.com": {},
	"outlook.com": {}, "hotmail.com": {}, "live.com": {}, "msn.com": {},
	"icloud.com": {}, "me.com": {}, "mac.com": {},
	"aol.com": {}, "protonmail.com": {}, "proton.me": {},
	"zoho.com": {}, "zohomail.com": {}, "gmx.com": {}, "gmx.net": {},
	"mail.com": {}, "yandex.com": {}, "yandex.ru": {},
	"mail.ru": {}, "inbox.com": {}, "fastmail.com": {},
}

type CacheHandler struct {
	cacheRepo   repo.CacheRepository
	settingRepo repo.SettingsRepo
}

func NewCacheHandler(cacheRepo repo.CacheRepository, settingRepo repo.SettingsRepo) *CacheHandler {
	return &CacheHandler{cacheRepo: cacheRepo, settingRepo: settingRepo}
}

// GetStats returns cache statistics (no fabricated hit ratio).
func (h *CacheHandler) GetStats(c *gin.Context) {
	type counts struct {
		Total int64 `gorm:"column:total"`
		Free  int64 `gorm:"column:free_cached"`
		B2B   int64 `gorm:"column:b2b_cached"`
	}
	var row counts
	err := h.cacheRepo.DB().Model(&model.EmailCache{}).
		Select(`COUNT(*) AS total,
			COUNT(*) FILTER (WHERE is_free = TRUE) AS free_cached,
			COUNT(*) FILTER (WHERE is_free = FALSE) AS b2b_cached`).
		Scan(&row).Error
	if err != nil {
		logger.Error("Failed to fetch cache stats", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch cache stats", "ERR_CACHE_STATS")
		return
	}

	helper.SendSuccess(c, "Cache stats retrieved", gin.H{
		"total_cached": row.Total,
		"free_cached":  row.Free,
		"b2b_cached":   row.B2B,
		"hit_ratio":    nil, // not tracked yet — FE shows em dash
		"policies":     h.getRetentionPolicies(),
	})
}

// UpdatePolicies updates cache retention settings with bounds + audit.
func (h *CacheHandler) UpdatePolicies(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var req struct {
		B2BRetention         string `json:"b2b_retention" binding:"required"`
		FreeValidRetention   string `json:"free_valid_retention" binding:"required"`
		FreeInvalidRetention string `json:"free_invalid_retention" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid retention payload", "ERR_BAD_REQUEST")
		return
	}

	b2b, err := parseRetentionDays(req.B2BRetention)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "B2B retention must be between 1 and 3650 days", "ERR_CACHE_RETENTION")
		return
	}
	freeV, err := parseRetentionDays(req.FreeValidRetention)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Free valid retention must be between 1 and 3650 days", "ERR_CACHE_RETENTION")
		return
	}
	freeI, err := parseRetentionDays(req.FreeInvalidRetention)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Free invalid retention must be between 1 and 3650 days", "ERR_CACHE_RETENTION")
		return
	}

	updates := map[string]string{
		"b2b_retention":          strconv.Itoa(b2b),
		"free_valid_retention":   strconv.Itoa(freeV),
		"free_invalid_retention": strconv.Itoa(freeI),
	}
	if err := h.settingRepo.UpdateMany(updates); err != nil {
		logger.Error("Failed to update cache retention policies", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to update retention policies", "ERR_CACHE_POLICIES")
		return
	}

	logAction(adminID, "INFO", "Admin",
		fmt.Sprintf("Cache retention updated: b2b=%d free_valid=%d free_invalid=%d", b2b, freeV, freeI))

	helper.SendSuccess(c, "Retention policies updated successfully", gin.H{
		"policies": updates,
	})
}

// LookupEmail gets cache status for a specific email.
func (h *CacheHandler) LookupEmail(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid email format", "ERR_CACHE_EMAIL")
		return
	}

	var cache model.EmailCache
	if err := h.cacheRepo.DB().Where("email = ?", strings.ToLower(strings.TrimSpace(req.Email))).First(&cache).Error; err != nil {
		helper.SendSuccess(c, "No cache found", gin.H{"found": false})
		return
	}

	helper.SendSuccess(c, "Cache found", gin.H{
		"found": true,
		"data":  cache,
	})
}

// DeleteEmail removes a specific email from the cache.
func (h *CacheHandler) DeleteEmail(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var req struct {
		Email   string `json:"email" binding:"required,email"`
		Confirm string `json:"confirm"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid email format", "ERR_CACHE_EMAIL")
		return
	}
	if strings.ToUpper(strings.TrimSpace(req.Confirm)) != "DELETE" {
		helper.SendError(c, http.StatusBadRequest, "Type DELETE to confirm", "ERR_CACHE_CONFIRM")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	res := h.cacheRepo.DB().Where("email = ?", email).Delete(&model.EmailCache{})
	if res.Error != nil {
		logger.Error("Failed to delete cache email", "error", res.Error, "email", email)
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete cache entry", "ERR_CACHE_DELETE")
		return
	}
	if res.RowsAffected == 0 {
		helper.SendSuccess(c, "No cache found to delete", gin.H{"deleted": false})
		return
	}

	logAction(adminID, "WARN", "Admin", "Cache invalidated for "+email)
	helper.SendSuccess(c, "Cache deleted successfully", gin.H{"deleted": true})
}

// PurgeExpiredCache deletes all expired cache records.
func (h *CacheHandler) PurgeExpiredCache(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var req struct {
		Confirm string `json:"confirm" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Type DELETE to confirm purge", "ERR_BAD_REQUEST")
		return
	}
	if strings.ToUpper(strings.TrimSpace(req.Confirm)) != "DELETE" {
		helper.SendError(c, http.StatusBadRequest, "Type DELETE to confirm", "ERR_CACHE_CONFIRM")
		return
	}

	b2b, freeV, freeI := h.getRetentionInts()
	now := time.Now().UTC()
	b2bThreshold := now.AddDate(0, 0, -b2b)
	freeVThreshold := now.AddDate(0, 0, -freeV)
	freeIThreshold := now.AddDate(0, 0, -freeI)

	var deletedCount int64
	db := h.cacheRepo.DB()

	res := db.Where("is_free = ? AND created_at < ?", false, b2bThreshold).Delete(&model.EmailCache{})
	if res.Error != nil {
		logger.Error("Cache purge B2B failed", "error", res.Error)
		helper.SendError(c, http.StatusInternalServerError, "Failed to purge expired cache", "ERR_CACHE_PURGE")
		return
	}
	deletedCount += res.RowsAffected

	res = db.Where("is_free = ? AND (status = 'valid' OR status = 'catch_all') AND created_at < ?", true, freeVThreshold).Delete(&model.EmailCache{})
	if res.Error != nil {
		logger.Error("Cache purge free-valid failed", "error", res.Error)
		helper.SendError(c, http.StatusInternalServerError, "Failed to purge expired cache", "ERR_CACHE_PURGE")
		return
	}
	deletedCount += res.RowsAffected

	res = db.Where("is_free = ? AND status != 'valid' AND status != 'catch_all' AND created_at < ?", true, freeIThreshold).Delete(&model.EmailCache{})
	if res.Error != nil {
		logger.Error("Cache purge free-invalid failed", "error", res.Error)
		helper.SendError(c, http.StatusInternalServerError, "Failed to purge expired cache", "ERR_CACHE_PURGE")
		return
	}
	deletedCount += res.RowsAffected

	logAction(adminID, "WARN", "Admin",
		fmt.Sprintf("Purged %d expired cache records (b2b=%dd free_valid=%dd free_invalid=%dd)", deletedCount, b2b, freeV, freeI))

	helper.SendSuccess(c, "Purged expired cache successfully", gin.H{
		"deleted_count": deletedCount,
	})
}

// UploadBulkCache parses CSV/TXT and upserts to cache.
func (h *CacheHandler) UploadBulkCache(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, cacheUploadMaxBytes)

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Failed to read uploaded file", "ERR_CACHE_UPLOAD")
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1
	headers, err := reader.Read()
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Failed to read CSV header", "ERR_CACHE_UPLOAD")
		return
	}

	emailIdx, statusIdx, scoreIdx := -1, -1, -1
	for i, header := range headers {
		lower := strings.ToLower(strings.TrimSpace(header))
		switch {
		case strings.Contains(lower, "email") || strings.Contains(lower, "e-mail"):
			emailIdx = i
		case lower == "status" || lower == "result":
			statusIdx = i
		case lower == "score" || lower == "quality":
			scoreIdx = i
		}
	}
	if emailIdx == -1 {
		helper.SendError(c, http.StatusBadRequest, "Could not auto-detect Email column in the uploaded file", "ERR_CACHE_UPLOAD_COLUMNS")
		return
	}

	var caches []model.EmailCache
	batchSize := 1000
	totalInserted := 0
	skipped := 0
	rowCount := 0

	flush := func() error {
		if len(caches) == 0 {
			return nil
		}
		if err := h.cacheRepo.UpsertEmailCacheBatch(caches); err != nil {
			return err
		}
		totalInserted += len(caches)
		caches = caches[:0]
		return nil
	}

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			skipped++
			continue
		}
		rowCount++
		if rowCount > cacheUploadMaxRows {
			helper.SendError(c, http.StatusBadRequest,
				fmt.Sprintf("File exceeds maximum of %d data rows", cacheUploadMaxRows),
				"ERR_CACHE_UPLOAD_LIMIT")
			return
		}

		if len(record) <= emailIdx {
			skipped++
			continue
		}
		email := strings.ToLower(strings.TrimSpace(record[emailIdx]))
		if email == "" || !strings.Contains(email, "@") {
			skipped++
			continue
		}

		status := ""
		if statusIdx != -1 && len(record) > statusIdx {
			status = normalizeCacheStatus(record[statusIdx])
		}
		if status == "" {
			skipped++
			continue
		}

		score := 0
		if scoreIdx != -1 && len(record) > scoreIdx {
			if s, err := strconv.Atoi(strings.TrimSpace(record[scoreIdx])); err == nil {
				score = s
			}
		}
		if score == 0 {
			switch status {
			case "valid":
				score = 100
			case "catch_all":
				score = 50
			default:
				score = 0
			}
		}

		caches = append(caches, model.EmailCache{
			Email:         email,
			Status:        status,
			Score:         score,
			Reason:        "bulk_import",
			IsDeliverable: status == "valid",
			IsCatchAll:    status == "catch_all",
			IsSyntaxValid: true,
			IsFree:        isCacheFreeDomain(email),
			CreatedAt:     time.Now().UTC(),
			UpdatedAt:     time.Now().UTC(),
		})

		if len(caches) >= batchSize {
			if err := flush(); err != nil {
				logger.Error("Bulk cache upsert failed", "error", err)
				helper.SendError(c, http.StatusInternalServerError, "Failed to import cache batch", "ERR_CACHE_UPSERT")
				return
			}
		}
	}

	if err := flush(); err != nil {
		logger.Error("Bulk cache upsert failed", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to import cache batch", "ERR_CACHE_UPSERT")
		return
	}

	logAction(adminID, "WARN", "Admin",
		fmt.Sprintf("Bulk cache import: inserted=%d skipped=%d", totalInserted, skipped))

	helper.SendSuccess(c, "Bulk cache imported successfully", gin.H{
		"inserted_count": totalInserted,
		"skipped_count":  skipped,
	})
}

func parseRetentionDays(raw string) (int, error) {
	v, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || v < cacheRetentionMinDays || v > cacheRetentionMaxDays {
		return 0, fmt.Errorf("out of range")
	}
	return v, nil
}

func normalizeCacheStatus(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "valid", "deliverable", "ok", "good":
		return "valid"
	case "invalid", "undeliverable", "bad":
		return "invalid"
	case "catch_all", "catch-all", "catchall":
		return "catch_all"
	case "unknown", "risky":
		return "unknown"
	default:
		return ""
	}
}

func isCacheFreeDomain(email string) bool {
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return false
	}
	_, ok := cacheFreeDomains[strings.ToLower(strings.TrimSpace(parts[1]))]
	return ok
}

func (h *CacheHandler) getRetentionInts() (b2b, freeV, freeI int) {
	b2b, freeV, freeI = 30, 365, 30
	if setting, err := h.settingRepo.GetByKey("b2b_retention"); err == nil {
		if v, e := strconv.Atoi(setting.SettingValue); e == nil && v >= cacheRetentionMinDays && v <= cacheRetentionMaxDays {
			b2b = v
		}
	}
	if setting, err := h.settingRepo.GetByKey("free_valid_retention"); err == nil {
		if v, e := strconv.Atoi(setting.SettingValue); e == nil && v >= cacheRetentionMinDays && v <= cacheRetentionMaxDays {
			freeV = v
		}
	}
	if setting, err := h.settingRepo.GetByKey("free_invalid_retention"); err == nil {
		if v, e := strconv.Atoi(setting.SettingValue); e == nil && v >= cacheRetentionMinDays && v <= cacheRetentionMaxDays {
			freeI = v
		}
	}
	return
}

func (h *CacheHandler) getRetentionPolicies() map[string]string {
	policies := map[string]string{
		"b2b_retention":          "30",
		"free_valid_retention":   "365",
		"free_invalid_retention": "30",
	}
	if setting, err := h.settingRepo.GetByKey("b2b_retention"); err == nil {
		policies["b2b_retention"] = setting.SettingValue
	}
	if setting, err := h.settingRepo.GetByKey("free_valid_retention"); err == nil {
		policies["free_valid_retention"] = setting.SettingValue
	}
	if setting, err := h.settingRepo.GetByKey("free_invalid_retention"); err == nil {
		policies["free_invalid_retention"] = setting.SettingValue
	}
	return policies
}
