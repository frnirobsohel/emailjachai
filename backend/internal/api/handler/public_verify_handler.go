package handler

import (
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/security"
	"ejp-backend/internal/verifier"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

var publicVerifierEnabledCache struct {
	mu        sync.RWMutex
	enabled   bool
	expiresAt time.Time
}

func isPublicVerifierEnabled() bool {
	publicVerifierEnabledCache.mu.RLock()
	if time.Now().Before(publicVerifierEnabledCache.expiresAt) {
		v := publicVerifierEnabledCache.enabled
		publicVerifierEnabledCache.mu.RUnlock()
		return v
	}
	publicVerifierEnabledCache.mu.RUnlock()

	enabled := true // default
	var setting model.Setting
	if err := config.DB.Where("setting_key = ?", "public_verifier_enabled").First(&setting).Error; err == nil {
		enabled = setting.SettingValue != "false"
	}

	publicVerifierEnabledCache.mu.Lock()
	publicVerifierEnabledCache.enabled = enabled
	publicVerifierEnabledCache.expiresAt = time.Now().Add(5 * time.Minute)
	publicVerifierEnabledCache.mu.Unlock()

	return enabled
}

func ClearPublicVerifierEnabledCache() {
	publicVerifierEnabledCache.mu.Lock()
	publicVerifierEnabledCache.expiresAt = time.Time{}
	publicVerifierEnabledCache.mu.Unlock()
}

// PublicVerifyHandler handles the no-auth, no-credit public email verification endpoint.
// Used for the landing page demo verifier — no DB writes, no credit deductions.
type PublicVerifyHandler struct {
	cacheRepo repo.CacheRepository
}

func NewPublicVerifyHandler() *PublicVerifyHandler {
	return &PublicVerifyHandler{
		cacheRepo: repo.NewCacheRepository(config.DB),
	}
}

type publicVerifyRequest struct {
	Email string `json:"email" binding:"required"`
}

// VerifyPublic handles POST /api/v1/jobs/verify-public
// No authentication required. No credits deducted. No DB writes.
// Uses cache first, then falls back to live SMTP/DNS verification.
func (h *PublicVerifyHandler) VerifyPublic(c *gin.Context) {
	if !isPublicVerifierEnabled() {
		helper.SendError(c, http.StatusForbidden, "Public verifier is disabled by administrator", "ERR_DISABLED")
		return
	}

	var req publicVerifyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Email is required", "ERR_BAD_REQUEST")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || !strings.Contains(email, "@") {
		helper.SendError(c, http.StatusBadRequest, "Invalid email address", "ERR_INVALID_EMAIL")
		return
	}

	ip := c.ClientIP()
	cookieId, err := c.Cookie("device_id")
	if err != nil || cookieId == "" {
		cookieId = uuid.New().String()
		secureCookie := strings.EqualFold(os.Getenv("GO_ENV"), "production") || strings.EqualFold(os.Getenv("ENVIRONMENT"), "production")
		c.SetCookie("device_id", cookieId, 365*24*60*60, "/", "", secureCookie, true)
	}
	browser := c.GetHeader("User-Agent")

	guard := security.NewFraudGuard()
	action, msg := guard.CheckRequest(ip, cookieId)

	if action == security.ActionHardBlock || action == security.ActionSoftBlock {
		helper.SendError(c, http.StatusForbidden, msg, "ERR_BLOCKED")
		return
	}
	if action == security.ActionWarning {
		helper.SendError(c, http.StatusTooManyRequests, msg, "ERR_QUOTA_EXHAUSTED")
		return
	}

	// 1. Cache check first (same retention policies as authenticated verify)
	var res verifier.VerifyResult
	fromCache := false

	// Fetch dynamic retention policies from settings table
	b2bRet, freeValidRet, freeInvalidRet := 30, 365, 30
	var settings []model.Setting
	if err := config.DB.Where("setting_key IN ?", []string{
		"b2b_retention", "free_valid_retention", "free_invalid_retention",
	}).Find(&settings).Error; err == nil {
		for _, s := range settings {
			if v, e := helper.SafeAtoi(s.SettingValue); e == nil && v > 0 {
				switch s.SettingKey {
				case "b2b_retention":
					b2bRet = v
				case "free_valid_retention":
					freeValidRet = v
				case "free_invalid_retention":
					freeInvalidRet = v
				}
			}
		}
	}

	cachedResults, err := h.cacheRepo.GetCachedEmailsInBatches([]string{email}, b2bRet, freeValidRet, freeInvalidRet)
	if err == nil {
		if hit, ok := cachedResults[email]; ok {
			fromCache = true
			res = verifier.VerifyResult{
				Status:         hit.Status,
				Score:          hit.Score,
				Deliverable:    hit.IsDeliverable,
				CatchAll:       hit.IsCatchAll,
				MailboxFull:    hit.MailboxFull,
				SyntaxValid:    hit.IsSyntaxValid,
				SMTPConnect:    hit.SmtpConnect,
				HasMX:          hit.HasMx,
				MxRecords:      hit.MxRecords,
				IsFree:         hit.IsFree,
				IsRole:         hit.IsRole,
				IsSpamTrap:     hit.IsSpamTrap,
				IsBlacklisted:  hit.IsBlacklisted,
				ProcessingTime: 0.01,
				Reason:         hit.Reason,
			}
		}
	}

	// 2. Live verify on cache miss
	if !fromCache {
		res = verifier.VerifyEmail(email)

		// Async cache upsert so future requests benefit from cache
		go func(r verifier.VerifyResult, e string) {
			cacheRows := []model.EmailCache{{
				Email:          e,
				Status:         r.Status,
				Score:          r.Score,
				Reason:         r.Reason,
				IsCatchAll:     r.CatchAll,
				IsDeliverable:  r.Deliverable,
				IsDisposable:   r.Status == "disposable",
				IsFree:         r.IsFree,
				IsRole:         r.IsRole,
				HasMx:          r.HasMX,
				MxRecords:      r.MxRecords,
				SmtpConnect:    r.SMTPConnect,
				UserExists:     r.Deliverable,
				IsSyntaxValid:  r.SyntaxValid,
				IsSpamTrap:     r.IsSpamTrap,
				IsBlacklisted:  r.IsBlacklisted,
				MailboxFull:    r.MailboxFull,
				ProcessingTime: r.ProcessingTime,
				CreatedAt:      time.Now(),
				UpdatedAt:      time.Now(),
			}}
			_ = h.cacheRepo.UpsertEmailCacheBatch(cacheRows)
		}(res, email)
	}

	// 3. Return result — same shape as authenticated verify for frontend compatibility
	helper.SendSuccess(c, "Email verified", gin.H{
		"email":          email,
		"status":         res.Status,
		"score":          res.Score,
		"processingTime": res.ProcessingTime,
		"fromCache":      fromCache,
		"detailedChecks": gin.H{
			"safeToSend":      res.Deliverable,
			"deliverable":     res.Deliverable,
			"invalidSyntax":   !res.SyntaxValid,
			"disposableEmail": res.Status == "disposable",
			"mxRecords":       res.HasMX,
			"smtpConnect":     res.SMTPConnect,
			"userExist":       res.Deliverable,
			"unknown":         res.Status == "unknown",
			"mailboxFull":     res.MailboxFull,
			"catchAll":        res.CatchAll,
			"roleAccount":     res.IsRole,
			"freeAccount":     res.IsFree,
			"spamTrap":        res.IsSpamTrap,
			"blacklist":       res.IsBlacklisted,
		},
	})

	// 4. Save Public Verification Log asynchronously
	go func(e, i, cook, brow, stat string) {
		logEntry := model.PublicVerifyLog{
			Email:    e,
			IP:       i,
			CookieID: cook,
			Browser:  brow,
			Status:   stat,
		}
		if err := config.DB.Create(&logEntry).Error; err == nil {
			ws.GlobalHub.BroadcastToAdmins("security_log", logEntry)
		}
	}(email, ip, cookieId, browser, res.Status)
}

// GetPublicStatus returns the remaining verifications based on the user's IP and Cookie tracking.
func (h *PublicVerifyHandler) GetPublicStatus(c *gin.Context) {
	ip := c.ClientIP()
	cookieId, err := c.Cookie("device_id")
	if err != nil || cookieId == "" {
		cookieId = uuid.New().String()
		secureCookie := strings.EqualFold(os.Getenv("GO_ENV"), "production") || strings.EqualFold(os.Getenv("ENVIRONMENT"), "production")
		c.SetCookie("device_id", cookieId, 365*24*60*60, "/", "", secureCookie, true)
	}

	guard := security.NewFraudGuard()
	limit, remaining := guard.GetUsage(ip, cookieId)

	helper.SendSuccess(c, "Public verifier status", gin.H{
		"limit":     limit,
		"remaining": remaining,
	})
}
