package service

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"unicode/utf8"

	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrPackageCreditsInvalid  = errors.New("credits amount must be between 1 and 10000000")
	ErrPackagePriceNegative   = errors.New("price cannot be negative")
	ErrPackagePriceTooHigh    = errors.New("price exceeds maximum of 999999.99")
	ErrPackageOfferNegative   = errors.New("offer price cannot be negative")
	ErrPackageOfferTooHigh    = errors.New("offer price exceeds maximum of 999999.99")
	ErrPackageOfferInvalid    = errors.New("offer price must be greater than 0 and less than regular price")
	ErrPackageNameRequired    = errors.New("package name is required")
	ErrPackageNameTooLong     = errors.New("package name exceeds 100 characters")
	ErrPackageTaglineTooLong  = errors.New("tagline exceeds 255 characters")
	ErrPackageFeaturesEmpty   = errors.New("at least one feature is required")
	ErrPackageFeaturesTooMany = errors.New("features exceed maximum of 20")
	ErrPackageFeatureTooLong  = errors.New("a feature exceeds 200 characters")
	ErrPackageFeaturesInvalid = errors.New("features must be a JSON array of strings")
	ErrDuplicateFreePlan      = errors.New("only one free plan (price = 0) can exist")
	ErrPackageNotFound        = errors.New("package not found")
)

const (
	maxPackageNameLen     = 100
	maxPackageTaglineLen  = 255
	maxPackageFeatures    = 20
	maxPackageFeatureLen  = 200
	maxPackageCredits     = 10_000_000
	maxPackagePrice       = 999999.99
)

type PackageService interface {
	GetAllPackages(activeOnly bool) ([]model.Package, error)
	GetPackageByID(id uint) (*model.Package, error)
	CreatePackage(pkg *model.Package) error
	UpdatePackage(pkg *model.Package) error
	DeletePackage(id uint) error
	TogglePackagePublic(id uint) (*model.Package, error)
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
	pkg, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPackageNotFound
		}
		return nil, err
	}
	return pkg, nil
}

func (s *packageService) CreatePackage(pkg *model.Package) error {
	if err := normalizeAndValidatePackage(pkg); err != nil {
		return err
	}

	return s.repo.DB().Transaction(func(tx *gorm.DB) error {
		if err := ensureSingleFreePlan(tx, 0, pkg.Price); err != nil {
			return err
		}
		if pkg.Popular {
			if err := clearOtherPopular(tx, 0); err != nil {
				return err
			}
		}
		return tx.Create(pkg).Error
	})
}

func (s *packageService) UpdatePackage(pkg *model.Package) error {
	if err := normalizeAndValidatePackage(pkg); err != nil {
		return err
	}

	return s.repo.DB().Transaction(func(tx *gorm.DB) error {
		if err := ensureSingleFreePlan(tx, pkg.ID, pkg.Price); err != nil {
			return err
		}
		if pkg.Popular {
			if err := clearOtherPopular(tx, pkg.ID); err != nil {
				return err
			}
		}
		return tx.Save(pkg).Error
	})
}

func (s *packageService) DeletePackage(id uint) error {
	if _, err := s.GetPackageByID(id); err != nil {
		return err
	}
	return s.repo.Delete(id)
}

func (s *packageService) TogglePackagePublic(id uint) (*model.Package, error) {
	pkg, err := s.GetPackageByID(id)
	if err != nil {
		return nil, err
	}
	pkg.IsPublic = !pkg.IsPublic
	if err := s.repo.Update(pkg); err != nil {
		return nil, err
	}
	return pkg, nil
}

func ensureSingleFreePlan(tx *gorm.DB, excludeID uint, price float64) error {
	if price != 0 {
		return nil
	}
	query := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Model(&model.Package{}).
		Where("price = 0")
	if excludeID > 0 {
		query = query.Where("id != ?", excludeID)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrDuplicateFreePlan
	}
	return nil
}

func clearOtherPopular(tx *gorm.DB, keepID uint) error {
	query := tx.Model(&model.Package{}).Where("popular = ?", true)
	if keepID > 0 {
		query = query.Where("id != ?", keepID)
	}
	return query.Update("popular", false).Error
}

// normalizeAndValidatePackage rounds money and enforces catalog bounds.
func normalizeAndValidatePackage(pkg *model.Package) error {
	pkg.Name = strings.TrimSpace(pkg.Name)
	pkg.Tagline = strings.TrimSpace(pkg.Tagline)
	if pkg.Name == "" {
		return ErrPackageNameRequired
	}
	if utf8.RuneCountInString(pkg.Name) > maxPackageNameLen {
		return ErrPackageNameTooLong
	}
	if utf8.RuneCountInString(pkg.Tagline) > maxPackageTaglineLen {
		return ErrPackageTaglineTooLong
	}

	if pkg.CreditsAmount < 1 || pkg.CreditsAmount > maxPackageCredits {
		return ErrPackageCreditsInvalid
	}

	if pkg.Price < 0 {
		return ErrPackagePriceNegative
	}
	pkg.Price = math.Round(pkg.Price*100) / 100
	if pkg.Price > maxPackagePrice {
		return ErrPackagePriceTooHigh
	}

	if pkg.OfferPrice < 0 {
		return ErrPackageOfferNegative
	}
	pkg.OfferPrice = math.Round(pkg.OfferPrice*100) / 100
	if pkg.OfferPrice > maxPackagePrice {
		return ErrPackageOfferTooHigh
	}
	// 0 clears the offer. Any positive value must undercut the regular price.
	if pkg.OfferPrice > 0 && (pkg.Price <= 0 || pkg.OfferPrice >= pkg.Price) {
		return ErrPackageOfferInvalid
	}

	features, err := normalizeFeaturesJSON(pkg.Features)
	if err != nil {
		return err
	}
	pkg.Features = features

	// Keep description in sync with tagline so the column is not dead.
	pkg.Description = pkg.Tagline

	if pkg.Status == "" {
		pkg.Status = "active"
	}

	return nil
}

func normalizeFeaturesJSON(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return "", ErrPackageFeaturesEmpty
	}

	var items []string
	if err := json.Unmarshal([]byte(raw), &items); err != nil {
		return "", ErrPackageFeaturesInvalid
	}

	cleaned := make([]string, 0, len(items))
	for _, item := range items {
		v := strings.TrimSpace(item)
		if v == "" {
			continue
		}
		if utf8.RuneCountInString(v) > maxPackageFeatureLen {
			return "", ErrPackageFeatureTooLong
		}
		cleaned = append(cleaned, v)
	}
	if len(cleaned) == 0 {
		return "", ErrPackageFeaturesEmpty
	}
	if len(cleaned) > maxPackageFeatures {
		return "", ErrPackageFeaturesTooMany
	}

	b, err := json.Marshal(cleaned)
	if err != nil {
		return "", ErrPackageFeaturesInvalid
	}
	return string(b), nil
}
