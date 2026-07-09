package handler

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

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

	domains, total, stats, err := h.domainService.GetDomains(search, domainType, perPage, offset)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

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

	err := h.domainService.AddDomain(input.Domain, input.Type, uID)
	if err != nil {
		helper.SendError(c, http.StatusConflict, err.Error(), "")
		return
	}

	helper.SendSuccess(c, "Domain added successfully", nil)
}

// DeleteDomain removes a domain rule
func (h *AdminHandler) DeleteDomain(c *gin.Context) {
	adminID, _ := c.Get("userID")
	uID := adminID.(uint)
	idStr := c.Param("id")

	if idStr == "" {
		idStr = c.Query("id")
	}
	if idStr == "" {
		var input struct {
			ID uint `json:"id"`
		}
		if err := c.ShouldBindJSON(&input); err == nil && input.ID != 0 {
			idStr = strconv.FormatUint(uint64(input.ID), 10)
		}
	}
	if idStr == "" {
		helper.SendError(c, http.StatusBadRequest, "Domain ID is required", "")
		return
	}

	idVal, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid Domain ID format", "")
		return
	}

	err = h.domainService.DeleteDomain(uint(idVal), uID)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	helper.SendSuccess(c, "Domain rule deleted", nil)
}

// ToggleDomain enables or disables a domain rule
func (h *AdminHandler) ToggleDomain(c *gin.Context) {
	adminID, _ := c.Get("userID")
	uID := adminID.(uint)
	var input struct {
		ID uint `json:"id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	excluded, err := h.domainService.ToggleDomain(input.ID, uID)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	helper.SendSuccess(c, "Domain status toggled", gin.H{"excluded": excluded})
}

// UploadDomains allows bulk uploading of domains via JSON or File
func (h *AdminHandler) UploadDomains(c *gin.Context) {
	adminID, _ := c.Get("userID")
	uID := adminID.(uint)
	domainType := c.PostForm("type")

	var content string

	// 1. Handle File Upload (Multipart Form)
	file, err := c.FormFile("file")
	if err == nil {
		const maxDomainUploadSize = 20 * 1024 * 1024 // 20MB
		if file.Size > maxDomainUploadSize {
			helper.SendError(c, http.StatusBadRequest, "File size exceeds maximum limit of 20MB", "")
			return
		}
		f, err := file.Open()
		if err == nil {
			defer f.Close()
			bytes, err := io.ReadAll(io.LimitReader(f, maxDomainUploadSize))
			if err == nil {
				content = string(bytes)
			}
		}
	} else {
		// 2. Handle JSON Body (if not a multipart form)
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
				content = strings.Join(input.Domains, "\n")
			} else {
				content = input.Content
			}
		}
	}

	if domainType == "" {
		domainType = "disposable"
	}

	added, duplicates, invalid, err := h.domainService.BulkUpload(content, domainType, uID)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, err.Error(), "")
		return
	}

	helper.SendSuccess(c, fmt.Sprintf("Upload complete: %d added, %d duplicates skipped, %d invalid.", added, duplicates, invalid), gin.H{
		"added":      added,
		"duplicates": duplicates,
		"invalid":    invalid,
	})
}



