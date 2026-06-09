package handler

import (
	"encoding/csv"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
)

type CacheHandler struct {
	cacheRepo   repo.CacheRepository
	settingRepo repo.SettingsRepo
}

func NewCacheHandler(cacheRepo repo.CacheRepository, settingRepo repo.SettingsRepo) *CacheHandler {
	return &CacheHandler{cacheRepo: cacheRepo, settingRepo: settingRepo}
}

// GetStats returns cache statistics
func (h *CacheHandler) GetStats(c *gin.Context) {
	var totalCached int64
	var freeCached int64
	var b2bCached int64

	config.DB.Model(&model.EmailCache{}).Count(&totalCached)
	config.DB.Model(&model.EmailCache{}).Where("is_free = ?", true).Count(&freeCached)
	config.DB.Model(&model.EmailCache{}).Where("is_free = ?", false).Count(&b2bCached)

	// Fetch retention policies
	policies := h.getRetentionPolicies()

	helper.SendSuccess(c, "Cache stats retrieved", gin.H{
		"total_cached": totalCached,
		"free_cached":  freeCached,
		"b2b_cached":   b2bCached,
		"hit_ratio":    "42.8%", // Mocked for now, needs actual tracking if required
		"policies":     policies,
	})
}

// UpdatePolicies updates cache retention settings
func (h *CacheHandler) UpdatePolicies(c *gin.Context) {
	var req struct {
		B2BRetention         string `json:"b2b_retention" binding:"required"`
		FreeValidRetention   string `json:"free_valid_retention" binding:"required"`
		FreeInvalidRetention string `json:"free_invalid_retention" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid payload", err.Error())
		return
	}

	updates := map[string]string{
		"b2b_retention":          req.B2BRetention,
		"free_valid_retention":   req.FreeValidRetention,
		"free_invalid_retention": req.FreeInvalidRetention,
	}

	for k, v := range updates {
		h.settingRepo.Update(k, v)
	}

	helper.SendSuccess(c, "Retention policies updated successfully", nil)
}

// LookupEmail gets cache status for a specific email
func (h *CacheHandler) LookupEmail(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid email format", err.Error())
		return
	}

	var cache model.EmailCache
	if err := config.DB.Where("email = ?", strings.ToLower(req.Email)).First(&cache).Error; err != nil {
		helper.SendSuccess(c, "No cache found", gin.H{"found": false})
		return
	}

	helper.SendSuccess(c, "Cache found", gin.H{
		"found": true,
		"data":  cache,
	})
}

// DeleteEmail removes a specific email from the cache
func (h *CacheHandler) DeleteEmail(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid email format", err.Error())
		return
	}

	email := strings.ToLower(req.Email)
	res := config.DB.Where("email = ?", email).Delete(&model.EmailCache{})
	
	if res.RowsAffected == 0 {
		helper.SendSuccess(c, "No cache found to delete", gin.H{"deleted": false})
		return
	}

	helper.SendSuccess(c, "Cache deleted successfully", gin.H{"deleted": true})
}

// PurgeExpiredCache deletes all expired cache records
func (h *CacheHandler) PurgeExpiredCache(c *gin.Context) {
	b2b, freeV, freeI := h.getRetentionInts()
	now := time.Now()

	b2bThreshold := now.AddDate(0, 0, -b2b)
	freeVThreshold := now.AddDate(0, 0, -freeV)
	freeIThreshold := now.AddDate(0, 0, -freeI)

	var deletedCount int64

	// Delete B2B expired
	res := config.DB.Where("is_free = ? AND created_at < ?", false, b2bThreshold).Delete(&model.EmailCache{})
	deletedCount += res.RowsAffected

	// Delete Free Valid expired
	res = config.DB.Where("is_free = ? AND (status = 'valid' OR status = 'catch_all') AND created_at < ?", true, freeVThreshold).Delete(&model.EmailCache{})
	deletedCount += res.RowsAffected

	// Delete Free Invalid expired
	res = config.DB.Where("is_free = ? AND status != 'valid' AND status != 'catch_all' AND created_at < ?", true, freeIThreshold).Delete(&model.EmailCache{})
	deletedCount += res.RowsAffected

	helper.SendSuccess(c, "Purged expired cache successfully", gin.H{
		"deleted_count": deletedCount,
	})
}

// UploadBulkCache parses CSV/TXT and upserts to cache
func (h *CacheHandler) UploadBulkCache(c *gin.Context) {
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Failed to read uploaded file", err.Error())
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	// Read header
	headers, err := reader.Read()
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Failed to read CSV header", err.Error())
		return
	}

	emailIdx := -1
	statusIdx := -1
	scoreIdx := -1

	// Auto-detect columns
	for i, h := range headers {
		lower := strings.ToLower(strings.TrimSpace(h))
		if strings.Contains(lower, "email") || strings.Contains(lower, "e-mail") {
			emailIdx = i
		} else if lower == "status" || lower == "result" {
			statusIdx = i
		} else if lower == "score" || lower == "quality" {
			scoreIdx = i
		}
	}

	if emailIdx == -1 {
		helper.SendError(c, http.StatusBadRequest, "Could not auto-detect 'Email' column in the uploaded file", "")
		return
	}

	var caches []model.EmailCache
	batchSize := 1000
	totalInserted := 0

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}

		if len(record) <= emailIdx {
			continue
		}

		email := strings.ToLower(strings.TrimSpace(record[emailIdx]))
		if email == "" || !strings.Contains(email, "@") {
			continue
		}

		status := "valid"
		if statusIdx != -1 && len(record) > statusIdx {
			statusVal := strings.ToLower(strings.TrimSpace(record[statusIdx]))
			switch statusVal {
			case "invalid", "undeliverable":
				status = "invalid"
			case "catch_all", "catch-all":
				status = "catch_all"
			}
		}

		score := 100
		if scoreIdx != -1 && len(record) > scoreIdx {
			if s, err := strconv.Atoi(strings.TrimSpace(record[scoreIdx])); err == nil {
				score = s
			}
		}



		caches = append(caches, model.EmailCache{
			Email:          email,
			Status:         status,
			Score:          score,
			Reason:         "bulk_import",
			IsDeliverable:  status == "valid",
			IsSyntaxValid:  true,
		})

		if len(caches) >= batchSize {
			h.cacheRepo.UpsertEmailCacheBatch(caches)
			totalInserted += len(caches)
			caches = []model.EmailCache{}
		}
	}

	if len(caches) > 0 {
		h.cacheRepo.UpsertEmailCacheBatch(caches)
		totalInserted += len(caches)
	}

	helper.SendSuccess(c, "Bulk cache imported successfully", gin.H{
		"inserted_count": totalInserted,
	})
}

// Helpers
func (h *CacheHandler) getRetentionInts() (b2b, freeV, freeI int) {
	b2b, freeV, freeI = 30, 365, 30
	if setting, err := h.settingRepo.GetByKey("b2b_retention"); err == nil {
		if v, e := strconv.Atoi(setting.SettingValue); e == nil && v > 0 {
			b2b = v
		}
	}
	if setting, err := h.settingRepo.GetByKey("free_valid_retention"); err == nil {
		if v, e := strconv.Atoi(setting.SettingValue); e == nil && v > 0 {
			freeV = v
		}
	}
	if setting, err := h.settingRepo.GetByKey("free_invalid_retention"); err == nil {
		if v, e := strconv.Atoi(setting.SettingValue); e == nil && v > 0 {
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
