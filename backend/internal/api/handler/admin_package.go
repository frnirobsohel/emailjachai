package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PackageResponse matches the legacy normalization
type PackageResponse struct {
	ID            uint        `json:"id"`
	Name          string      `json:"name"`
	Tagline       string      `json:"tagline"`
	Description   string      `json:"description"`
	CreditsAmount int         `json:"credits_amount"`
	Price         float64     `json:"price"`
	Features      interface{} `json:"features"`
	Status        string      `json:"status"`
	Popular       bool        `json:"popular"`
	IsPublic      bool        `json:"is_public"`
}

func normalizePackage(p model.Package) PackageResponse {
	features := []string{}
	if strings.TrimSpace(p.Features) != "" {
		var parsed []string
		if err := json.Unmarshal([]byte(p.Features), &parsed); err == nil {
			features = parsed
		}
	}
	return PackageResponse{
		ID:            p.ID,
		Name:          p.Name,
		Tagline:       p.Tagline,
		Description:   p.Description,
		CreditsAmount: p.CreditsAmount,
		Price:         p.Price,
		Features:      features,
		Status:        p.Status,
		Popular:       p.Popular,
		IsPublic:      p.IsPublic,
	}
}

func mapPackageError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrDuplicateFreePlan):
		helper.SendError(c, http.StatusBadRequest, "Only one Free Plan (price = 0) can exist.", "ERR_DUPLICATE_FREE_PLAN")
	case errors.Is(err, service.ErrPackageNotFound), errors.Is(err, gorm.ErrRecordNotFound):
		helper.SendError(c, http.StatusNotFound, "Package not found", "ERR_PACKAGE_NOT_FOUND")
	case errors.Is(err, service.ErrPackageNameRequired):
		helper.SendError(c, http.StatusBadRequest, "Package name is required", "ERR_PACKAGE_NAME")
	case errors.Is(err, service.ErrPackageNameTooLong):
		helper.SendError(c, http.StatusBadRequest, "Package name is too long", "ERR_PACKAGE_NAME")
	case errors.Is(err, service.ErrPackageTaglineTooLong):
		helper.SendError(c, http.StatusBadRequest, "Tagline is too long", "ERR_PACKAGE_TAGLINE")
	case errors.Is(err, service.ErrPackageCreditsInvalid):
		helper.SendError(c, http.StatusBadRequest, "Credits must be between 1 and 10,000,000", "ERR_PACKAGE_CREDITS")
	case errors.Is(err, service.ErrPackagePriceNegative):
		helper.SendError(c, http.StatusBadRequest, "Price cannot be negative", "ERR_PACKAGE_PRICE")
	case errors.Is(err, service.ErrPackagePriceTooHigh):
		helper.SendError(c, http.StatusBadRequest, "Price exceeds maximum", "ERR_PACKAGE_PRICE")
	case errors.Is(err, service.ErrPackageFeaturesEmpty):
		helper.SendError(c, http.StatusBadRequest, "At least one feature is required", "ERR_PACKAGE_FEATURES")
	case errors.Is(err, service.ErrPackageFeaturesTooMany):
		helper.SendError(c, http.StatusBadRequest, "Too many features (max 20)", "ERR_PACKAGE_FEATURES")
	case errors.Is(err, service.ErrPackageFeatureTooLong):
		helper.SendError(c, http.StatusBadRequest, "A feature is too long (max 200 characters)", "ERR_PACKAGE_FEATURES")
	case errors.Is(err, service.ErrPackageFeaturesInvalid):
		helper.SendError(c, http.StatusBadRequest, "Invalid features format", "ERR_PACKAGE_FEATURES")
	default:
		helper.SendError(c, http.StatusBadRequest, "Failed to save package", "ERR_PACKAGE_SAVE")
	}
}

func packageAdminID(c *gin.Context) (uint, bool) {
	adminIDVal, ok := c.Get("userID")
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return 0, false
	}
	adminID, ok := adminIDVal.(uint)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return 0, false
	}
	return adminID, true
}

func marshalFeatures(features interface{}) (string, error) {
	if features == nil {
		return "[]", nil
	}
	b, err := json.Marshal(features)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// GetActivePackages is for users to see available packages
func (h *AdminHandler) GetActivePackages(c *gin.Context) {
	packages, err := h.packageService.GetAllPackages(true)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch packages", "ERR_PACKAGE_LIST")
		return
	}

	responses := make([]PackageResponse, len(packages))
	for i, p := range packages {
		responses[i] = normalizePackage(p)
	}

	helper.SendSuccess(c, "Active packages retrieved", responses)
}

// Admin Routes below

func (h *AdminHandler) ListPackages(c *gin.Context) {
	packages, err := h.packageService.GetAllPackages(false)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch packages", "ERR_PACKAGE_LIST")
		return
	}

	responses := make([]PackageResponse, len(packages))
	for i, p := range packages {
		responses[i] = normalizePackage(p)
	}

	helper.SendSuccess(c, "Packages retrieved", responses)
}

func (h *AdminHandler) CreatePackage(c *gin.Context) {
	adminID, ok := packageAdminID(c)
	if !ok {
		return
	}

	var input struct {
		Name          string      `json:"name" binding:"required"`
		Tagline       string      `json:"tagline"`
		CreditsAmount int         `json:"credits_amount" binding:"required"`
		Price         float64     `json:"price"`
		Features      interface{} `json:"features"`
		Enabled       bool        `json:"enabled"`
		Popular       bool        `json:"popular"`
		IsPublic      *bool       `json:"is_public"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid package payload", "ERR_PACKAGE_PAYLOAD")
		return
	}

	featuresJSON, err := marshalFeatures(input.Features)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid features format", "ERR_PACKAGE_FEATURES")
		return
	}

	status := "active"
	if !input.Enabled {
		status = "inactive"
	}
	isPublic := true
	if input.IsPublic != nil {
		isPublic = *input.IsPublic
	}

	pkg := &model.Package{
		Name:          input.Name,
		Tagline:       input.Tagline,
		CreditsAmount: input.CreditsAmount,
		Price:         input.Price,
		Features:      featuresJSON,
		Status:        status,
		Popular:       input.Popular,
		IsPublic:      isPublic,
	}

	if err := h.packageService.CreatePackage(pkg); err != nil {
		mapPackageError(c, err)
		return
	}

	logAction(adminID, "INFO", "Admin", fmt.Sprintf("New package '%s' created ($%.2f, %d credits)", pkg.Name, pkg.Price, pkg.CreditsAmount))

	helper.SendSuccess(c, "Package added successfully", normalizePackage(*pkg))
}

func (h *AdminHandler) UpdatePackage(c *gin.Context) {
	adminID, ok := packageAdminID(c)
	if !ok {
		return
	}

	var input struct {
		ID            uint        `json:"id" binding:"required"`
		Name          string      `json:"name"`
		Tagline       string      `json:"tagline"`
		CreditsAmount int         `json:"credits_amount"`
		Price         float64     `json:"price"`
		Features      interface{} `json:"features"`
		Enabled       bool        `json:"enabled"`
		Popular       bool        `json:"popular"`
		IsPublic      *bool       `json:"is_public"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid package payload", "ERR_PACKAGE_PAYLOAD")
		return
	}

	pkg, err := h.packageService.GetPackageByID(input.ID)
	if err != nil {
		mapPackageError(c, err)
		return
	}

	if input.Name != "" {
		pkg.Name = input.Name
	}
	pkg.Tagline = input.Tagline
	if input.CreditsAmount > 0 {
		pkg.CreditsAmount = input.CreditsAmount
	}
	pkg.Price = input.Price
	if input.Features != nil {
		featuresJSON, mErr := marshalFeatures(input.Features)
		if mErr != nil {
			helper.SendError(c, http.StatusBadRequest, "Invalid features format", "ERR_PACKAGE_FEATURES")
			return
		}
		pkg.Features = featuresJSON
	}
	if input.Enabled {
		pkg.Status = "active"
	} else {
		pkg.Status = "inactive"
	}
	pkg.Popular = input.Popular
	if input.IsPublic != nil {
		pkg.IsPublic = *input.IsPublic
	}

	if err := h.packageService.UpdatePackage(pkg); err != nil {
		mapPackageError(c, err)
		return
	}

	logAction(adminID, "INFO", "Admin", fmt.Sprintf("Package '%s' (ID:%d) updated", pkg.Name, pkg.ID))

	helper.SendSuccess(c, "Package updated successfully", normalizePackage(*pkg))
}

func (h *AdminHandler) DeletePackage(c *gin.Context) {
	adminID, ok := packageAdminID(c)
	if !ok {
		return
	}

	var input struct {
		ID uint `json:"id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid package payload", "ERR_PACKAGE_PAYLOAD")
		return
	}

	pkg, err := h.packageService.GetPackageByID(input.ID)
	if err != nil {
		mapPackageError(c, err)
		return
	}

	pkgName := pkg.Name
	if err := h.packageService.DeletePackage(input.ID); err != nil {
		mapPackageError(c, err)
		return
	}

	logAction(adminID, "WARN", "Admin", fmt.Sprintf("Package '%s' (ID:%d) deleted", pkgName, input.ID))

	helper.SendSuccess(c, "Package deleted", nil)
}
