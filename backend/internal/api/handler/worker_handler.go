package handler

import (
	"ejp-backend/internal/helper"
	"ejp-backend/internal/service"

	"github.com/gin-gonic/gin"
)

type WorkerHandler struct {
	workerService service.WorkerService
}

func NewWorkerHandler(workerService service.WorkerService) *WorkerHandler {
	return &WorkerHandler{workerService: workerService}
}

func (h *WorkerHandler) ClaimTask(c *gin.Context) {
	// Worker logic
	helper.SendSuccess(c, "Task claimed", nil)
}

func (h *WorkerHandler) CompleteTask(c *gin.Context) {
	// Worker logic
	helper.SendSuccess(c, "Task completed", nil)
}
