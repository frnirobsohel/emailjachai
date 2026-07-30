package handler

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"

	"github.com/gin-gonic/gin"
)

func mapDomainError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrDomainRequired), errors.Is(err, service.ErrDomainInvalidFormat):
		helper.SendError(c, http.StatusBadRequest, "Invalid domain format.", "ERR_INVALID_DOMAIN")
	case errors.Is(err, service.ErrDomainInvalidType):
		helper.SendError(c, http.StatusBadRequest, "Domain type must be disposable, free, blacklist, or spam-trap.", "ERR_INVALID_DOMAIN_TYPE")
	case errors.Is(err, service.ErrDomainExists):
		helper.SendError(c, http.StatusConflict, "Domain already exists.", "ERR_DOMAIN_EXISTS")
	case errors.Is(err, service.ErrDomainNotFound):
		helper.SendError(c, http.StatusNotFound, "Domain not found.", "ERR_DOMAIN_NOT_FOUND")
	case errors.Is(err, service.ErrDomainBulkTooLarge):
		helper.SendError(c, http.StatusBadRequest, "Bulk upload exceeds maximum of 50,000 domains.", "ERR_DOMAIN_BULK_TOO_LARGE")
	case errors.Is(err, service.ErrDomainBulkEmpty):
		helper.SendError(c, http.StatusBadRequest, "No valid domains found in upload.", "ERR_DOMAIN_BULK_EMPTY")
	default:
		helper.SendError(c, http.StatusInternalServerError, "Domain operation failed. Please try again.", "ERR_DOMAIN_FAILED")
	}
}

// GetAllDomains returns a list of domain rules with search, filtering and pagination
func (h *AdminHandler) GetAllDomains(c *gin.Context) {
	search := c.Query("search")
	domainType := c.Query("type")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))

	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 20
	}
	if perPage > 100 {
		perPage = 100
	}
	offset := (page - 1) * perPage

	domains, total, stats, err := h.domainService.GetDomains(search, domainType, perPage, offset)
	if err != nil {
		mapDomainError(c, err)
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
		helper.SendError(c, http.StatusBadRequest, "Domain and type are required.", "ERR_INVALID_REQUEST")
		return
	}

	err := h.domainService.AddDomain(input.Domain, input.Type, uID)
	if err != nil {
		mapDomainError(c, err)
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
		helper.SendError(c, http.StatusBadRequest, "Domain ID is required", "ERR_INVALID_REQUEST")
		return
	}

	idVal, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid Domain ID format", "ERR_INVALID_REQUEST")
		return
	}

	err = h.domainService.DeleteDomain(uint(idVal), uID)
	if err != nil {
		mapDomainError(c, err)
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
		helper.SendError(c, http.StatusBadRequest, "Domain ID is required.", "ERR_INVALID_REQUEST")
		return
	}

	excluded, err := h.domainService.ToggleDomain(input.ID, uID)
	if err != nil {
		mapDomainError(c, err)
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

	file, err := c.FormFile("file")
	if err == nil {
		const maxDomainUploadSize = 20 * 1024 * 1024 // 20MB
		if file.Size > maxDomainUploadSize {
			helper.SendError(c, http.StatusBadRequest, "File size exceeds maximum limit of 20MB", "ERR_FILE_TOO_LARGE")
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
		var input struct {
			Domains []string `json:"domains"`
			Content string   `json:"content"`
			Type    string   `json:"type"`
		}
		if err := c.ShouldBindJSON(&input); err == nil {
			if domainType == "" && input.Type != "" {
				domainType = input.Type
			}
			if len(input.Domains) > 50000 {
				helper.SendError(c, http.StatusBadRequest, "Bulk upload exceeds maximum of 50,000 domains.", "ERR_DOMAIN_BULK_TOO_LARGE")
				return
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
		mapDomainError(c, err)
		return
	}

	helper.SendSuccess(c, fmt.Sprintf("Upload complete: %d added, %d duplicates skipped, %d invalid.", added, duplicates, invalid), gin.H{
		"added":      added,
		"duplicates": duplicates,
		"invalid":    invalid,
	})
}
