package handler

import (
	"encoding/json"
	"fmt"
	"net/http"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"

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
	}
}

// GetActivePackages is for users to see available packages
func GetActivePackages(c *gin.Context) {
	var packages []model.Package
	if err := config.DB.Where("status = ?", "active").Order("price ASC").Find(&packages).Error; err != nil {
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
	var packages []model.Package
	if err := config.DB.Order("price ASC").Find(&packages).Error; err != nil {
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

	if input.Price == 0 {
		var count int64
		config.DB.Model(&model.Package{}).Where("price = 0").Count(&count)
		if count > 0 {
			helper.SendError(c, http.StatusBadRequest, "Only one Free Plan (price = 0) can exist.", "ERR_DUPLICATE_FREE_PLAN")
			return
		}
	}

	pkg := model.Package{
		Name:          input.Name,
		Tagline:       input.Tagline,
		CreditsAmount: input.CreditsAmount,
		Price:         input.Price,
		Features:      string(featuresJSON),
		Status:        status,
		Popular:       input.Popular,
	}

	if err := config.DB.Create(&pkg).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to create package", err.Error())
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", fmt.Sprintf("New package '%s' created ($%.2f, %d credits)", pkg.Name, pkg.Price, pkg.CreditsAmount))

	helper.SendSuccess(c, "Package added successfully", normalizePackage(pkg))
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

	var pkg model.Package
	if err := config.DB.First(&pkg, input.ID).Error; err != nil {
		helper.SendError(c, http.StatusNotFound, "Package not found", "")
		return
	}

	if input.Price == 0 {
		var count int64
		config.DB.Model(&model.Package{}).Where("price = 0 AND id != ?", input.ID).Count(&count)
		if count > 0 {
			helper.SendError(c, http.StatusBadRequest, "Only one Free Plan (price = 0) can exist.", "ERR_DUPLICATE_FREE_PLAN")
			return
		}
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

	if err := config.DB.Save(&pkg).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to update package", err.Error())
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", fmt.Sprintf("Package '%s' (ID:%d) updated", pkg.Name, pkg.ID))

	helper.SendSuccess(c, "Package updated successfully", normalizePackage(pkg))
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

	var pkg model.Package
	if err := config.DB.First(&pkg, input.ID).Error; err != nil {
		helper.SendError(c, http.StatusNotFound, "Package not found", "")
		return
	}

	pkgName := pkg.Name
	if err := config.DB.Delete(&pkg).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete package", err.Error())
		return
	}

	logAction(adminID.(uint), "WARN", "Admin", fmt.Sprintf("Package '%s' (ID:%d) deleted", pkgName, input.ID))

	helper.SendSuccess(c, "Package deleted", nil)
}



