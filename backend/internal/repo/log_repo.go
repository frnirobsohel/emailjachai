package repo

import (
	"strings"
	"time"

	"ejp-backend/internal/model"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

// LogListParams filters and paginates activity_logs for the admin Log View.
type LogListParams struct {
	Limit           int
	Level           string
	Query           string
	BeforeCreatedAt *time.Time
	BeforeID        uint64
}

type LogRepo interface {
	Create(log *model.ActivityLog) error
	Broadcast(log *model.ActivityLog)
	List(params LogListParams) ([]model.ActivityLog, int64, error)
	ClearOperational() (int64, error)
	PurgeExpired(operationalRetentionDays, authFailedRetentionDays int) (int64, error)
	CountFailedLogins(ip, email string, since time.Time) (int64, error)
	DB() *gorm.DB
}

type logRepo struct {
	db *gorm.DB
}

func NewLogRepo() LogRepo {
	return &logRepo{db: config.DB}
}

func (r *logRepo) DB() *gorm.DB {
	return r.db
}

func (r *logRepo) CountFailedLogins(ip, email string, since time.Time) (int64, error) {
	var failedCount int64
	err := r.db.Model(&model.ActivityLog{}).
		Where("source = 'Auth' AND event = 'Login Failed' AND (ip = ? OR identifier = ?) AND created_at >= ?", ip, email, since).
		Count(&failedCount).Error
	return failedCount, err
}

func (r *logRepo) Create(log *model.ActivityLog) error {
	err := r.db.Create(log).Error
	if err == nil {
		r.Broadcast(log)
	}
	return err
}

// Broadcast pushes an already-persisted log to connected admins (e.g. after a TX commit).
func (r *logRepo) Broadcast(log *model.ActivityLog) {
	if log == nil || ws.GlobalHub == nil {
		return
	}
	normalizeLogTime(log)
	ws.GlobalHub.BroadcastToAdmins("system_log_update", log)
}

func (r *logRepo) applySearchFilters(q *gorm.DB, params LogListParams) *gorm.DB {
	level := strings.TrimSpace(params.Level)
	if level != "" && !strings.EqualFold(level, "ALL") {
		q = q.Where("activity_logs.level = ?", strings.ToUpper(level))
	}

	search := strings.TrimSpace(params.Query)
	if search != "" {
		like := "%" + escapeLike(search) + "%"
		q = q.Where(
			"(activity_logs.message ILIKE ? ESCAPE '\\' OR activity_logs.source ILIKE ? ESCAPE '\\' OR activity_logs.event ILIKE ? ESCAPE '\\')",
			like, like, like,
		)
	}

	return q
}

func (r *logRepo) applyCursor(q *gorm.DB, params LogListParams) *gorm.DB {
	if params.BeforeCreatedAt != nil && !params.BeforeCreatedAt.IsZero() && params.BeforeID > 0 {
		q = q.Where(
			"(activity_logs.created_at < ? OR (activity_logs.created_at = ? AND activity_logs.id < ?))",
			*params.BeforeCreatedAt, *params.BeforeCreatedAt, params.BeforeID,
		)
	}
	return q
}

func (r *logRepo) List(params LogListParams) ([]model.ActivityLog, int64, error) {
	if params.Limit <= 0 || params.Limit > 200 {
		params.Limit = 50
	}

	var total int64
	countQ := r.applySearchFilters(r.db.Table("activity_logs"), params)
	if err := countQ.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var logs []model.ActivityLog
	listQ := r.applyCursor(
		r.applySearchFilters(
			r.db.Table("activity_logs").
				Select("activity_logs.*, users.name as user_name").
				Joins("LEFT JOIN users ON activity_logs.user_id = users.id"),
			params,
		),
		params,
	)

	err := listQ.
		Order("activity_logs.created_at DESC, activity_logs.id DESC").
		Limit(params.Limit).
		Scan(&logs).Error
	if err != nil {
		return nil, 0, err
	}

	for i := range logs {
		normalizeLogTime(&logs[i])
	}

	return logs, total, nil
}

// ClearOperational deletes clearable activity rows but preserves Auth Login Failed
// rows used by login throttling.
func (r *logRepo) ClearOperational() (int64, error) {
	result := r.db.Exec(`
		DELETE FROM activity_logs
		WHERE NOT (source = 'Auth' AND event = 'Login Failed')
	`)
	return result.RowsAffected, result.Error
}

// PurgeExpired removes old operational logs and aged auth-failure rows.
func (r *logRepo) PurgeExpired(operationalRetentionDays, authFailedRetentionDays int) (int64, error) {
	if operationalRetentionDays <= 0 {
		operationalRetentionDays = 90
	}
	if authFailedRetentionDays <= 0 {
		authFailedRetentionDays = 7
	}

	opCutoff := time.Now().AddDate(0, 0, -operationalRetentionDays)
	authCutoff := time.Now().AddDate(0, 0, -authFailedRetentionDays)

	opResult := r.db.Exec(`
		DELETE FROM activity_logs
		WHERE created_at < ?
		  AND NOT (source = 'Auth' AND event = 'Login Failed')
	`, opCutoff)
	if opResult.Error != nil {
		return 0, opResult.Error
	}

	authResult := r.db.Exec(`
		DELETE FROM activity_logs
		WHERE source = 'Auth' AND event = 'Login Failed' AND created_at < ?
	`, authCutoff)
	if authResult.Error != nil {
		return opResult.RowsAffected, authResult.Error
	}

	return opResult.RowsAffected + authResult.RowsAffected, nil
}

func normalizeLogTime(log *model.ActivityLog) {
	if log == nil || log.CreatedAt.IsZero() {
		return
	}
	log.Time = log.CreatedAt.UTC().Format("2006-01-02 15:04:05")
}
