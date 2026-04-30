package audit

import (
	"fmt"
	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"time"
)

func LogAction(userID uint, severity string, module string, message string) {
	log := model.SecurityLog{
		UserID:    userID,
		Severity:  severity,
		Module:    module,
		Message:   message,
		CreatedAt: time.Now(),
	}
	
	// Direct DB access for auditing is usually fine, or move to repo
	config.DB.Create(&log)
	
	// Also log to console/zap
	fmt.Printf("[AUDIT] [%s] User %d: %s\n", severity, userID, message)
}
