package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"

	"github.com/gin-gonic/gin"
)

// PackageResponse matches the legacy normalization
type PackageResponse struct {
	ID            uint        `json:"id"`
	Name          string      `json:"name"`
	Tagline       string      `json:"tagline"`
	CreditsAmount int         `json:"credits_amount"`
	Price         float64     `json:"price"`
	Features      interface{} `json:"features"`
	Status        string      `json:"status"`
	Popular       bool        `json:"popular"`
	IsPublic      bool        `json:"is_public"`
}

func normalizePackage(p model.Package) PackageResponse {
	var features interface{}
	if p.Features == "" {
		features = []string{}
	} else {
		json.Unmarshal([]byte(p.Features), &features)
	}
	return PackageResponse{
		ID:            p.ID,
		Name:          p.Name,
		Tagline:       p.Tagline,
		CreditsAmount: p.CreditsAmount,
		Price:         p.Price,
		Features:      features,
		Status:        p.Status,
		Popular:       p.Popular,
		IsPublic:      p.IsPublic,
	}
}

// GetActivePackages is for users to see available packages
func (h *AdminHandler) GetActivePackages(c *gin.Context) {
	packages, err := h.packageService.GetAllPackages(true)
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch packages", "")
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
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch packages", "")
		return
	}

	responses := make([]PackageResponse, len(packages))
	for i, p := range packages {
		responses[i] = normalizePackage(p)
	}

	helper.SendSuccess(c, "Packages retrieved", responses)
}

func (h *AdminHandler) CreatePackage(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		Name          string      `json:"name" binding:"required"`
		Tagline       string      `json:"tagline"`
		CreditsAmount int         `json:"credits_amount" binding:"required"`
		Price         float64     `json:"price"`
		Features      interface{} `json:"features"`
		Enabled       bool        `json:"enabled"`
		Popular       bool        `json:"popular"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	featuresJSON, _ := json.Marshal(input.Features)
	status := "active"
	if !input.Enabled {
		status = "inactive"
	}

	pkg := &model.Package{
		Name:          input.Name,
		Tagline:       input.Tagline,
		CreditsAmount: input.CreditsAmount,
		Price:         input.Price,
		Features:      string(featuresJSON),
		Status:        status,
		Popular:       input.Popular,
	}

	if err := h.packageService.CreatePackage(pkg); err != nil {
		if err.Error() == "Only one Free Plan (price = 0) can exist." {
			helper.SendError(c, http.StatusBadRequest, err.Error(), "ERR_DUPLICATE_FREE_PLAN")
		} else {
			helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		}
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", fmt.Sprintf("New package '%s' created ($%.2f, %d credits)", pkg.Name, pkg.Price, pkg.CreditsAmount))

	helper.SendSuccess(c, "Package added successfully", normalizePackage(*pkg))
}

func (h *AdminHandler) UpdatePackage(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		ID            uint        `json:"id" binding:"required"`
		Name          string      `json:"name"`
		Tagline       string      `json:"tagline"`
		CreditsAmount int         `json:"credits_amount"`
		Price         float64     `json:"price"`
		Features      interface{} `json:"features"`
		Enabled       bool        `json:"enabled"`
		Popular       bool        `json:"popular"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	pkg, err := h.packageService.GetPackageByID(input.ID)
	if err != nil {
		helper.SendError(c, http.StatusNotFound, "Package not found", "")
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
		featuresJSON, _ := json.Marshal(input.Features)
		pkg.Features = string(featuresJSON)
	}
	if input.Enabled {
		pkg.Status = "active"
	} else {
		pkg.Status = "inactive"
	}
	pkg.Popular = input.Popular

	if err := h.packageService.UpdatePackage(pkg); err != nil {
		if err.Error() == "Only one Free Plan (price = 0) can exist." {
			helper.SendError(c, http.StatusBadRequest, err.Error(), "ERR_DUPLICATE_FREE_PLAN")
		} else {
			helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		}
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", fmt.Sprintf("Package '%s' (ID:%d) updated", pkg.Name, pkg.ID))

	helper.SendSuccess(c, "Package updated successfully", normalizePackage(*pkg))
}

func (h *AdminHandler) DeletePackage(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		ID uint `json:"id" binding:"required"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	pkg, err := h.packageService.GetPackageByID(input.ID)
	if err != nil {
		helper.SendError(c, http.StatusNotFound, "Package not found", "")
		return
	}

	pkgName := pkg.Name
	if err := h.packageService.DeletePackage(input.ID); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete package", err.Error())
		return
	}

	logAction(adminID.(uint), "WARN", "Admin", fmt.Sprintf("Package '%s' (ID:%d) deleted", pkgName, input.ID))

	helper.SendSuccess(c, "Package deleted", nil)
}
