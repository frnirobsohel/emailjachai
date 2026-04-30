package repo

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"

	"gorm.io/gorm"
)

type PackageRepo interface {
	Create(pkg *model.Package) error
	List(activeOnly bool) ([]model.Package, error)
	GetByID(id uint) (*model.Package, error)
	Update(pkg *model.Package) error
	Delete(id uint) error
}

type packageRepo struct {
	db *gorm.DB
}

func NewPackageRepo() PackageRepo {
	return &packageRepo{db: config.DB}
}

func (r *packageRepo) Create(pkg *model.Package) error {
	return r.db.Create(pkg).Error
}

func (r *packageRepo) List(activeOnly bool) ([]model.Package, error) {
	var pkgs []model.Package
	query := r.db.Order("price asc")
	if activeOnly {
		query = query.Where("status = ?", "active")
	}
	err := query.Find(&pkgs).Error
	return pkgs, err
}

func (r *packageRepo) GetByID(id uint) (*model.Package, error) {
	var pkg model.Package
	if err := r.db.First(&pkg, id).Error; err != nil {
		return nil, err
	}
	return &pkg, nil
}

func (r *packageRepo) Update(pkg *model.Package) error {
	return r.db.Save(pkg).Error
}

func (r *packageRepo) Delete(id uint) error {
	return r.db.Delete(&model.Package{}, id).Error
}
