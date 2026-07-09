package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type DomainRepo interface {
	Create(domain *model.Domain) error
	BulkCreate(domains []*model.Domain) (int64, error)
	List(search, domainType string, limit, offset int) ([]model.Domain, int64, error)
	Delete(id uint) error
	ToggleStatus(id uint) (bool, error)
	GetStats() (map[string]interface{}, error)
}

type domainRepo struct {
	db *gorm.DB
}

func NewDomainRepo() DomainRepo {
	return &domainRepo{db: config.DB}
}

func (r *domainRepo) Create(domain *model.Domain) error {
	return r.db.Create(domain).Error
}

func (r *domainRepo) BulkCreate(domains []*model.Domain) (int64, error) {
	// Use CreateInBatches with OnConflict DoNothing to ignore duplicates
	res := r.db.Clauses(clause.OnConflict{DoNothing: true}).CreateInBatches(domains, 1000)
	return res.RowsAffected, res.Error
}

func (r *domainRepo) List(search, domainType string, limit, offset int) ([]model.Domain, int64, error) {
	var domains []model.Domain
	var total int64

	query := r.db.Model(&model.Domain{})

	if search != "" {
		query = query.Where("domain LIKE ?", "%"+search+"%")
	}

	if domainType != "" {
		query = query.Where("type = ?", domainType)
	}

	query.Count(&total)

	err := query.Order("id desc").Limit(limit).Offset(offset).Find(&domains).Error
	return domains, total, err
}

func (r *domainRepo) Delete(id uint) error {
	return r.db.Delete(&model.Domain{}, id).Error
}

func (r *domainRepo) ToggleStatus(id uint) (bool, error) {
	var domain model.Domain
	if err := r.db.First(&domain, id).Error; err != nil {
		return false, err
	}

	newStatus := !domain.Excluded
	err := r.db.Model(&domain).Update("excluded", newStatus).Error
	return newStatus, err
}

func (r *domainRepo) GetStats() (map[string]interface{}, error) {
	var stats struct {
		Total      int64 `gorm:"column:total"`
		Disposable int64 `gorm:"column:disposable"`
		Free       int64 `gorm:"column:free"`
		Blacklist  int64 `gorm:"column:blacklist"`
		Spam       int64 `gorm:"column:spam"`
	}

	err := r.db.Model(&model.Domain{}).Select(`
		COUNT(*) as total,
		COUNT(CASE WHEN type = 'disposable' THEN 1 END) as disposable,
		COUNT(CASE WHEN type = 'free' THEN 1 END) as free,
		COUNT(CASE WHEN type = 'blacklist' THEN 1 END) as blacklist,
		COUNT(CASE WHEN type = 'spam-trap' THEN 1 END) as spam
	`).Scan(&stats).Error

	return map[string]interface{}{
		"total":      stats.Total,
		"disposable": stats.Disposable,
		"free":       stats.Free,
		"blacklist":  stats.Blacklist,
		"spam":       stats.Spam,
	}, err
}
