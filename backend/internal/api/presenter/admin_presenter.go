package presenter

import "ejp-backend/internal/model"

type LogListResponse struct {
	Logs    []model.ActivityLog `json:"logs"`
	Total   int64               `json:"total"`
	HasMore bool                `json:"has_more"`
}

type DomainListResponse struct {
	Domains []model.Domain         `json:"domains"`
	Stats   map[string]interface{} `json:"stats"`
	Total   int64                  `json:"total"`
	HasMore bool                   `json:"has_more"`
}
