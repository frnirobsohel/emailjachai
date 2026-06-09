package service

import (
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"errors"
)

type PackageService interface {
	GetAllPackages(activeOnly bool) ([]model.Package, error)
	GetPackageByID(id uint) (*model.Package, error)
	CreatePackage(pkg *model.Package) error
	UpdatePackage(pkg *model.Package) error
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

func (s *packageService) GetPackageByID(id uint) (*model.Package, error) {
	return s.repo.GetByID(id)
}

func (s *packageService) CreatePackage(pkg *model.Package) error {
	// Validation checks
	if pkg.CreditsAmount <= 0 {
		return errors.New("credits amount must be greater than 0")
	}
	if pkg.Price < 0 {
		return errors.New("price cannot be negative")
	}

	// Unique Free Plan validation (price = 0)
	if pkg.Price == 0 {
		count, err := s.repo.CountFreePackages(0)
		if err != nil {
			return err
		}
		if count > 0 {
			return errors.New("Only one Free Plan (price = 0) can exist.")
		}
	}

	return s.repo.Create(pkg)
}

func (s *packageService) UpdatePackage(pkg *model.Package) error {
	// Validation checks
	if pkg.CreditsAmount <= 0 {
		return errors.New("credits amount must be greater than 0")
	}
	if pkg.Price < 0 {
		return errors.New("price cannot be negative")
	}

	// Unique Free Plan validation (price = 0)
	if pkg.Price == 0 {
		count, err := s.repo.CountFreePackages(pkg.ID)
		if err != nil {
			return err
		}
		if count > 0 {
			return errors.New("Only one Free Plan (price = 0) can exist.")
		}
	}

	return s.repo.Update(pkg)
}

func (s *packageService) DeletePackage(id uint) error {
	return s.repo.Delete(id)
}
