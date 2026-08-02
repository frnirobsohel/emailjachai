package repo

import (
	"time"

	"ejp-backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type CacheRepository interface {
	DB() *gorm.DB
	GetCachedEmailsInBatches(emails []string, b2bRetention, freeValidRetention, freeInvalidRetention int) (map[string]model.EmailCache, error)
	UpsertEmailCacheBatch(results []model.EmailCache) error
}

type cacheRepository struct {
	db *gorm.DB
}

func NewCacheRepository(db *gorm.DB) CacheRepository {
	return &cacheRepository{db: db}
}

func (r *cacheRepository) DB() *gorm.DB {
	return r.db
}

func (r *cacheRepository) GetCachedEmailsInBatches(emails []string, b2bRetention, freeValidRetention, freeInvalidRetention int) (map[string]model.EmailCache, error) {
	if len(emails) == 0 {
		return nil, nil
	}

	var cachedEmails []model.EmailCache

	// Fetch all cache records for these emails first without date filtering
	err := r.db.Where("email IN ?", emails).Find(&cachedEmails).Error
	if err != nil {
		return nil, err
	}

	cacheMap := make(map[string]model.EmailCache)
	now := time.Now()

	for _, ce := range cachedEmails {
		var retentionDays int

		// Determine which retention policy applies
		if ce.IsFree {
			if ce.Status == "valid" || ce.Status == "catch_all" {
				retentionDays = freeValidRetention
			} else {
				retentionDays = freeInvalidRetention
			}
		} else {
			// B2B Domain
			retentionDays = b2bRetention
		}

		retentionThreshold := now.AddDate(0, 0, -retentionDays)

		// Only include if it's within the retention threshold
		if ce.CreatedAt.After(retentionThreshold) {
			cacheMap[ce.Email] = ce
		}
	}

	return cacheMap, nil
}

func (r *cacheRepository) UpsertEmailCacheBatch(results []model.EmailCache) error {
	if len(results) == 0 {
		return nil
	}

	now := time.Now().UTC()
	for i := range results {
		results[i].CreatedAt = now
		results[i].UpdatedAt = now
	}

	// Refresh created_at on conflict so retention TTL restarts after re-verify (H2).
	return r.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "email"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"status", "score", "reason", "is_disposable", "is_free", "is_role",
			"has_mx", "smtp_connect", "user_exists", "is_catch_all", "is_deliverable",
			"is_syntax_valid", "is_spam_trap", "is_blacklisted", "mailbox_full",
			"processing_time", "created_at", "updated_at",
		}),
	}).CreateInBatches(results, 1000).Error
}
