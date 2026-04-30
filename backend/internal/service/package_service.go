package service

import (
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
)

type PackageService interface {
	GetAllPackages(activeOnly bool) ([]model.Package, error)
	CreatePackage(name string, credits int, price float64) error
	DeletePackage(id uint) error
}

type packageService struct {
	repo repo.PackageRepo
}

func NewPackageService(repo repo.PackageRepo) PackageService {
	return &packageService{repo: repo}
}

func (s *packageService) GetAllPackages(activeOnly bool) ([]model.Package, error) {
	return s.repo.List(activeOnly)
}

func (s *packageService) CreatePackage(name string, credits int, price float64) error {
	pkg := &model.Package{
		Name:          name,
		CreditsAmount: credits,
		Price:         price,
		Status:        "active",
	}
	return s.repo.Create(pkg)
}

func (s *packageService) DeletePackage(id uint) error {
	return s.repo.Delete(id)
}
