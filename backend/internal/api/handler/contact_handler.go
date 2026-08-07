package handler

import (
	"fmt"
	"html"
	"net/http"
	"net/mail"
	"strings"
	"unicode/utf8"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/security"
	"ejp-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type ContactHandler struct {
	settingsRepo repo.SettingsRepo
	emailService service.EmailService
}

func NewContactHandler(settingsRepo repo.SettingsRepo, emailService service.EmailService) *ContactHandler {
	return &ContactHandler{
		settingsRepo: settingsRepo,
		emailService: emailService,
	}
}

type contactRequest struct {
	Name           string `json:"name"`
	Email          string `json:"email"`
	Subject        string `json:"subject"`
	Message        string `json:"message"`
	TurnstileToken string `json:"turnstile_token"`
}

// SubmitContact emails the home-page contact form to brand support_email.
func (h *ContactHandler) SubmitContact(c *gin.Context) {
	var req contactRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid request body", "ERR_INVALID_REQUEST")
		return
	}

	if err := security.VerifyTurnstileToken(req.TurnstileToken, c.ClientIP()); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Captcha verification failed", "ERR_CAPTCHA")
		return
	}

	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	subject := strings.TrimSpace(req.Subject)
	message := strings.TrimSpace(req.Message)

	if name == "" || email == "" || message == "" {
		helper.SendError(c, http.StatusBadRequest, "Name, email, and message are required.", "ERR_INVALID_REQUEST")
		return
	}
	if utf8.RuneCountInString(name) > 100 {
		helper.SendError(c, http.StatusBadRequest, "Name is too long.", "ERR_INVALID_REQUEST")
		return
	}
	if utf8.RuneCountInString(subject) > 200 {
		helper.SendError(c, http.StatusBadRequest, "Subject is too long.", "ERR_INVALID_REQUEST")
		return
	}
	if utf8.RuneCountInString(message) > 5000 {
		helper.SendError(c, http.StatusBadRequest, "Message is too long.", "ERR_INVALID_REQUEST")
		return
	}
	if addr, err := mail.ParseAddress(email); err != nil || addr.Address != email {
		helper.SendError(c, http.StatusBadRequest, "Invalid email address.", "ERR_INVALID_EMAIL")
		return
	}

	supportSetting, err := h.settingsRepo.GetByKey("support_email")
	if err != nil || strings.TrimSpace(supportSetting.SettingValue) == "" {
		helper.SendError(c, http.StatusServiceUnavailable, "Support email is not configured yet.", "ERR_SUPPORT_NOT_CONFIGURED")
		return
	}
	supportEmail := strings.TrimSpace(supportSetting.SettingValue)

	if subject == "" {
		subject = "Website contact form"
	}
	mailSubject := fmt.Sprintf("[Contact] %s", subject)

	safeName := html.EscapeString(name)
	safeEmail := html.EscapeString(email)
	safeSubject := html.EscapeString(subject)
	safeMessage := html.EscapeString(message)

	body := fmt.Sprintf(
		"New contact form submission\n\nName: %s\nEmail: %s\nSubject: %s\n\nMessage:\n%s\n",
		safeName, safeEmail, safeSubject, safeMessage,
	)

	if err := h.emailService.SendRawEmail(supportEmail, mailSubject, body, email); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to send message. Please try again later.", "ERR_CONTACT_SEND")
		return
	}

	helper.SendSuccess(c, "Message sent successfully", nil)
}
