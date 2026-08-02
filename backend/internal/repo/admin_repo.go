package repo

import (
	"database/sql"
	"time"

	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type AdminRepo interface {
	GetJobStatsSummary(todayStart, sevenDaysAgo, fourteenDaysAgo, thirtyDaysAgo time.Time) (interface{}, error)
	CleanupJobsByDate(cutoff time.Time) (jobIDs []string, deletedCount int64, err error)
	AdminDownloadAllJobs(jobType string, since time.Time) (*sql.Rows, error)
}

type adminRepo struct {
	db *gorm.DB
}

func NewAdminRepo() AdminRepo {
	return &adminRepo{db: config.DB}
}

func (r *adminRepo) GetJobStatsSummary(todayStart, sevenDaysAgo, fourteenDaysAgo, thirtyDaysAgo time.Time) (interface{}, error) {
	var summary struct {
		TotalJobs       int64 `gorm:"column:total_jobs"`
		TotalEmails     int64 `gorm:"column:total_emails"`
		ProcessedEmails int64 `gorm:"column:processed_emails"`
		JobsToday       int64 `gorm:"column:jobs_today"`
		ProcessedToday  int64 `gorm:"column:processed_today"`
		Jobs7d          int64 `gorm:"column:jobs_7d"`
		Processed7d     int64 `gorm:"column:processed_7d"`
		Jobs14d         int64 `gorm:"column:jobs_14d"`
		Processed14d    int64 `gorm:"column:processed_14d"`
		Jobs30d         int64 `gorm:"column:jobs_30d"`
		Processed30d    int64 `gorm:"column:processed_30d"`
		Valid           int64 `gorm:"column:valid"`
		Unknown         int64 `gorm:"column:unknown"`
		Invalid         int64 `gorm:"column:invalid"`
		CatchAll        int64 `gorm:"column:catch_all"`
		Disposable      int64 `gorm:"column:disposable"`
	}

	if err := r.db.Model(&model.Job{}).Select(`
		COUNT(*) as total_jobs,
		COALESCE(SUM(total_emails), 0) as total_emails,
		COALESCE(SUM(processed_count), 0) as processed_emails,
		COUNT(CASE WHEN created_at >= ? THEN 1 END) as jobs_today,
		COALESCE(SUM(CASE WHEN created_at >= ? THEN processed_count ELSE 0 END), 0) as processed_today,
		COUNT(CASE WHEN created_at >= ? THEN 1 END) as jobs_7d,
		COALESCE(SUM(CASE WHEN created_at >= ? THEN processed_count ELSE 0 END), 0) as processed_7d,
		COUNT(CASE WHEN created_at >= ? THEN 1 END) as jobs_14d,
		COALESCE(SUM(CASE WHEN created_at >= ? THEN processed_count ELSE 0 END), 0) as processed_14d,
		COUNT(CASE WHEN created_at >= ? THEN 1 END) as jobs_30d,
		COALESCE(SUM(CASE WHEN created_at >= ? THEN processed_count ELSE 0 END), 0) as processed_30d,
		COALESCE(SUM(deliverable), 0) as valid,
		COALESCE(SUM(risky), 0) as unknown,
		COALESCE(SUM(undeliverable), 0) as invalid,
		COALESCE(SUM(catch_all), 0) as catch_all,
		COALESCE(SUM(disposable), 0) as disposable
	`,
		todayStart, todayStart,
		sevenDaysAgo, sevenDaysAgo,
		fourteenDaysAgo, fourteenDaysAgo,
		thirtyDaysAgo, thirtyDaysAgo,
	).Scan(&summary).Error; err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"overview": map[string]interface{}{
			"total_jobs":       summary.TotalJobs,
			"total_emails":     summary.TotalEmails,
			"processed_emails": summary.ProcessedEmails,
			"jobs_today":       summary.JobsToday,
			"processed_today":  summary.ProcessedToday,
			"jobs_7d":          summary.Jobs7d,
			"processed_7d":     summary.Processed7d,
			"jobs_14d":         summary.Jobs14d,
			"processed_14d":    summary.Processed14d,
			"jobs_30d":         summary.Jobs30d,
			"processed_30d":    summary.Processed30d,
		},
		"breakdown": map[string]interface{}{
			"valid":      summary.Valid,
			"unknown":    summary.Unknown,
			"invalid":    summary.Invalid,
			"catch_all":  summary.CatchAll,
			"disposable": summary.Disposable,
		},
	}, nil
}

func (r *adminRepo) CleanupJobsByDate(cutoff time.Time) (jobIDs []string, deletedCount int64, err error) {
	// Only terminal jobs — never soft-delete pending/processing mid-flight.
	if err := r.db.Model(&model.Job{}).
		Where("created_at < ? AND status IN ?", cutoff, []string{"completed", "failed"}).
		Pluck("job_id", &jobIDs).Error; err != nil {
		return nil, 0, err
	}

	if len(jobIDs) == 0 {
		return nil, 0, nil
	}

	err = r.db.Transaction(func(tx *gorm.DB) error {
		var internalIDs []uint
		if err := tx.Model(&model.Job{}).Where("job_id IN ?", jobIDs).Pluck("id", &internalIDs).Error; err != nil {
			return err
		}
		if len(internalIDs) > 0 {
			if err := tx.Where("job_internal_id IN ?", internalIDs).Delete(&model.JobResult{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("job_id IN ?", jobIDs).Delete(&model.JobTask{}).Error; err != nil {
			return err
		}
		res := tx.Where("job_id IN ?", jobIDs).Delete(&model.Job{})
		deletedCount = res.RowsAffected
		return res.Error
	})

	return jobIDs, deletedCount, err
}

func (r *adminRepo) AdminDownloadAllJobs(jobType string, since time.Time) (*sql.Rows, error) {
	query := r.db.Model(&model.JobResult{}).
		Joins("JOIN jobs ON jobs.id = job_results.job_internal_id").
		Select("job_results.email, job_results.status, job_results.reason, job_results.is_catch_all, job_results.score, job_results.created_at, jobs.job_id as legacy_job_id, job_results.mx_records").
		Where("job_results.created_at >= ?", since)

	switch jobType {
	case "single":
		query = query.Where("jobs.type = ?", "single")
	case "bulk":
		query = query.Where("jobs.type = ?", "bulk")
	}

	return query.Order("job_results.created_at DESC").Rows()
}
