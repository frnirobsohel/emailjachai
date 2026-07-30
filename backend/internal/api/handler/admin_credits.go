package handler

import (
	"net/http"
	"strconv"

	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
)

// UpdateUserCredits allows admins to directly update a user's credit balance
func (h *AdminHandler) UpdateUserCredits(c *gin.Context) {
	adminID, _ := c.Get("userID")
	userIDStr := c.Param("id")
	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid user ID.", "ERR_INVALID_USER_ID")
		return
	}

	var input struct {
		Amount int    `json:"amount" binding:"required"`
		Reason string `json:"reason"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "A non-zero credit amount is required.", "ERR_INVALID_REQUEST")
		return
	}

	err = h.adminService.UserAction("adjust_credits", uint(userID), adminID.(uint), "", "", input.Amount, 0)
	if err != nil {
		mapAdminUserError(c, err)
		return
	}

	helper.SendSuccess(c, "Credits updated successfully", nil)
}
