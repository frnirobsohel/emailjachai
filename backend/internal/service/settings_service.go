package service

import (
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"strconv"
	"strings"
)

type SettingsService interface {
	GetAllSettings() ([]model.Setting, error)
	UpdateSettings(updates map[string]string, adminID uint) error
}

type settingsService struct {
	repo    repo.SettingsRepo
	logRepo repo.LogRepo
}

func NewSettingsService(repo repo.SettingsRepo, logRepo repo.LogRepo) SettingsService {
	return &settingsService{repo: repo, logRepo: logRepo}
}

func (s *settingsService) GetAllSettings() ([]model.Setting, error) {
	return s.repo.GetAll()
}

func (s *settingsService) UpdateSettings(updates map[string]string, adminID uint) error {
	numericRules := map[string]struct {
		min, max, def int
	}{
		"chunk_size":               {10, 50000, 1000},
		"task_timeout":             {1, 1440, 60},
		"max_emails_per_job":       {10, 1000000, 100000},
		"max_active_jobs_per_user": {0, 10000, 0},
	}

	sensitiveKeys := map[string]bool{
		"stripe_secret_key":        true,
		"stripe_webhook_secret":    true,
		"paypal_secret_key":        true,
		"paypal_webhook_id":        true,
		"cryptomus_payment_key":    true,
		"cryptomus_secret_key":     true,
		"cryptomus_webhook_secret": true,
	}

	for k, v := range updates {
		if sensitiveKeys[k] {
			if v == "********" || strings.TrimSpace(v) == "" {
				continue
			}
		}

		if rule, ok := numericRules[k]; ok {
			val, err := strconv.Atoi(v)
			if err != nil {
				val = rule.def
			}
			if val < rule.min {
				val = rule.min
			}
			if val > rule.max {
				val = rule.max
			}
			v = strconv.Itoa(val)
		}

		if err := s.repo.Update(k, v); err != nil {
			return err
		}
	}

	s.logActivity("INFO", "Admin", "System settings updated", adminID)
	return nil
}

func (s *settingsService) logActivity(level, source, message string, adminID uint) {
	log := &model.ActivityLog{
		UserID:  &adminID,
		Level:   level,
		Source:  source,
		Message: message,
	}
	_ = s.logRepo.Create(log)
}
