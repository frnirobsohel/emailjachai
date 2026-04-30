package handler

import (
	"fmt"
	"net/http"
	"strconv"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// UpdateUserCredits allows admins to directly update a user's credit balance
func (h *AdminHandler) UpdateUserCredits(c *gin.Context) {
	adminID, _ := c.Get("userID")
	userIDStr := c.Param("id")
	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid user ID", "")
		return
	}

	var input struct {
		Amount int    `json:"amount" binding:"required"`
		Reason string `json:"reason"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	var user model.User
	if err := config.DB.First(&user, userID).Error; err != nil {
		helper.SendError(c, http.StatusNotFound, "User not found", "")
		return
	}

	newCredits := user.Credits + input.Amount
	if newCredits < 0 {
		newCredits = 0
	}

	if err := config.DB.Model(&user).Update("credits", newCredits).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to update credits", "")
		return
	}

	// Log activity
	logAction(adminID.(uint), "INFO", "Admin", fmt.Sprintf("Updated credits for user #%d: %+d (New total: %d). Reason: %s", user.ID, input.Amount, newCredits, input.Reason))

	helper.SendSuccess(c, "Credits updated successfully", gin.H{"credits": newCredits})
}



