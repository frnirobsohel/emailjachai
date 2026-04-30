package helper

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type SuccessResponse struct {
	Status    string      `json:"status"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp int64       `json:"timestamp"`
}

type ErrorResponse struct {
	Status    string      `json:"status"`
	Code      string      `json:"code"`
	Message   string      `json:"message"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp int64       `json:"timestamp"`
}

func SendSuccess(c *gin.Context, message string, data interface{}) {
	c.JSON(http.StatusOK, SuccessResponse{
		Status:    "success",
		Message:   message,
		Data:      data,
		Timestamp: time.Now().Unix(),
	})
}

func SendError(c *gin.Context, code int, message string, errorCode string) {
	if errorCode == "" {
		errorCode = "ERR_BAD_REQUEST"
	}
	c.JSON(code, ErrorResponse{
		Status:    "error",
		Code:      errorCode,
		Message:   message,
		Timestamp: time.Now().Unix(),
	})
}



