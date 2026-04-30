package handler

import (
	"bufio"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// GetAllDomains returns a list of domain rules with search, filtering and pagination
func (h *AdminHandler) GetAllDomains(c *gin.Context) {
	search := c.Query("search")
	domainType := c.Query("type")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "100"))

	if page < 1 {
		page = 1
	}
	if perPage < 10 {
		perPage = 100
	}
	offset := (page - 1) * perPage

	var domains []model.Domain
	var total int64

	query := config.DB.Model(&model.Domain{})

	if search != "" {
		query = query.Where("domain LIKE ?", "%"+search+"%")
	}

	if domainType != "" {
		query = query.Where("type = ?", domainType)
	}

	// Get total count for pagination
	query.Count(&total)

	// Fetch results
	if err := query.Order("id DESC").Limit(perPage).Offset(offset).Find(&domains).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch domains", "")
		return
	}

	// Fetch Stats (Legacy Parity)
	var stats struct {
		Total      int64 `json:"total"`
		Disposable int64 `json:"disposable"`
		Free       int64 `json:"free"`
		Blacklist  int64 `json:"blacklist"`
		Spam       int64 `json:"spam"`
	}

	config.DB.Model(&model.Domain{}).Count(&stats.Total)
	config.DB.Model(&model.Domain{}).Where("type = ?", "disposable").Count(&stats.Disposable)
	config.DB.Model(&model.Domain{}).Where("type = ?", "free").Count(&stats.Free)
	config.DB.Model(&model.Domain{}).Where("type = ?", "blacklist").Count(&stats.Blacklist)
	config.DB.Model(&model.Domain{}).Where("type = ?", "spam-trap").Count(&stats.Spam)

	helper.SendSuccess(c, "Domains retrieved", gin.H{
		"domains":  domains,
		"stats":    stats,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

// AddDomain adds a new domain rule
func (h *AdminHandler) AddDomain(c *gin.Context) {
	adminID, _ := c.Get("userID")
	uID := adminID.(uint)
	var input struct {
		Domain string `json:"domain" binding:"required"`
		Type   string `json:"type" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	domain := model.Domain{
		Domain:   strings.ToLower(strings.TrimSpace(input.Domain)),
		Type:     input.Type,
		Excluded: false,
		AddedBy:  &uID,
	}

	if err := config.DB.Create(&domain).Error; err != nil {
		helper.SendError(c, http.StatusConflict, "Domain already exists.", "")
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", fmt.Sprintf("Added domain: %s (%s)", domain.Domain, domain.Type))

	helper.SendSuccess(c, "Domain added successfully", domain)
}

// DeleteDomain removes a domain rule
func (h *AdminHandler) DeleteDomain(c *gin.Context) {
	adminID, _ := c.Get("userID")
	id := c.Param("id")

	if id == "" {
		id = c.Query("id")
	}
	if id == "" {
		var input struct {
			ID uint `json:"id"`
		}
		if err := c.ShouldBindJSON(&input); err == nil && input.ID != 0 {
			id = strconv.FormatUint(uint64(input.ID), 10)
		}
	}
	if id == "" {
		helper.SendError(c, http.StatusBadRequest, "Domain ID is required", "")
		return
	}

	result := config.DB.Delete(&model.Domain{}, id)
	if result.Error != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete domain", "")
		return
	}
	if result.RowsAffected == 0 {
		helper.SendError(c, http.StatusNotFound, "Domain not found", "")
		return
	}

	logAction(adminID.(uint), "WARN", "Admin", fmt.Sprintf("Deleted domain #%s", id))

	helper.SendSuccess(c, "Domain rule deleted", nil)
}

// ToggleDomain enables or disables a domain rule
func (h *AdminHandler) ToggleDomain(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		ID uint `json:"id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	var domain model.Domain
	if err := config.DB.First(&domain, input.ID).Error; err != nil {
		helper.SendError(c, http.StatusNotFound, "Domain not found", "")
		return
	}

	newExcluded := !domain.Excluded

	if err := config.DB.Model(&domain).Update("excluded", newExcluded).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to toggle domain", "")
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", fmt.Sprintf("Toggled domain #%d excluded=%v", domain.ID, newExcluded))

	helper.SendSuccess(c, "Domain status toggled", gin.H{"excluded": newExcluded})
}

// UploadDomains allows bulk uploading of domains via JSON or File (Legacy Parity)
func (h *AdminHandler) UploadDomains(c *gin.Context) {
	adminID, _ := c.Get("userID")
	domainType := c.PostForm("type")
	if domainType == "" {
		// Fallback for JSON
		var jsonInput struct {
			Type string `json:"type"`
		}
		c.ShouldBindJSON(&jsonInput)
		domainType = jsonInput.Type
	}

	if domainType == "" {
		domainType = "disposable"
	}

	added := 0
	duplicates := 0
	invalid := 0

	// Handle File Upload
	file, err := c.FormFile("file")
	if err == nil {
		f, _ := file.Open()
		defer f.Close()
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			// Simple CSV/Line parsing
			parts := strings.Split(line, ",")
			domainName := strings.ToLower(strings.TrimSpace(parts[0]))

			if !helper.IsValidDomain(domainName) {
				invalid++
				continue
			}

			d := model.Domain{Domain: domainName, Type: domainType}
			if err := config.DB.Create(&d).Error; err != nil {
				duplicates++
			} else {
				added++
			}
		}
	} else {
		// Handle JSON Body with 'domains' array or 'content' string
		var input struct {
			Domains []string `json:"domains"`
			Content string   `json:"content"`
			Type    string   `json:"type"`
		}
		if err := c.ShouldBindJSON(&input); err == nil {
			if domainType == "" && input.Type != "" {
				domainType = input.Type
			}

			if len(input.Domains) > 0 {
				for _, dName := range input.Domains {
					domainName := strings.ToLower(strings.TrimSpace(dName))
					if !helper.IsValidDomain(domainName) {
						invalid++
						continue
					}
					d := model.Domain{Domain: domainName, Type: domainType}
					if err := config.DB.Create(&d).Error; err != nil {
						duplicates++
					} else {
						added++
					}
				}
			} else if input.Content != "" {
				lines := strings.Split(input.Content, "\n")
				for _, line := range lines {
					domainName := strings.ToLower(strings.TrimSpace(line))
					if domainName == "" {
						continue
					}
					if !helper.IsValidDomain(domainName) {
						invalid++
						continue
					}
					d := model.Domain{Domain: domainName, Type: domainType}
					if err := config.DB.Create(&d).Error; err != nil {
						duplicates++
					} else {
						added++
					}
				}
			}
		}
	}

	logAction(adminID.(uint), "INFO", "Admin", fmt.Sprintf("Bulk uploaded domains: added=%d duplicates=%d invalid=%d", added, duplicates, invalid))

	helper.SendSuccess(c, fmt.Sprintf("Upload complete: %d added, %d duplicates skipped, %d invalid.", added, duplicates, invalid), gin.H{
		"added":      added,
		"duplicates": duplicates,
		"invalid":    invalid,
	})
}



