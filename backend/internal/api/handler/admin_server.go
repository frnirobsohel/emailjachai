package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/logger"
	"ejp-backend/internal/helper"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/safe"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var workerNameRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$`)

var reservedWorkerNames = map[string]struct{}{
	"unknown":        {},
	"unknown_worker": {},
	"worker":         {},
	"worker-node":    {},
	"localhost":      {},
	"default":        {},
	"server":         {},
}

func isValidWorkerServerName(name string) bool {
	name = strings.TrimSpace(name)
	if len(name) < 3 || len(name) > 100 {
		return false
	}
	if !workerNameRe.MatchString(name) {
		return false
	}
	_, reserved := reservedWorkerNames[strings.ToLower(name)]
	return !reserved
}

func maskKey(workerKey string) string {
	if len(workerKey) <= 12 {
		return strings.Repeat("*", len(workerKey))
	}
	return workerKey[:8] + "..." + workerKey[len(workerKey)-4:]
}



func workerKeyHash(workerKey string) string {
	sum := sha256.Sum256([]byte("worker-key|" + workerKey))
	return hex.EncodeToString(sum[:])
}

func upsertSetting(tx *gorm.DB, key, value string) error {
	rec := model.Setting{SettingKey: key, SettingValue: value}
	return tx.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "setting_key"}},
		DoUpdates: clause.AssignmentColumns([]string{"setting_value", "updated_at"}),
	}).Create(&rec).Error
}

func ensureWorkerKeyProvisioned(tx *gorm.DB) (plainKey, maskedKey string, err error) {
	var encrypted model.Setting
	if err := tx.Where("setting_key = ?", "worker_api_key_encrypted").First(&encrypted).Error; err == nil {
		plain, decErr := helper.DecryptSecret(encrypted.SettingValue)
		if decErr == nil && plain != "" {
			return plain, maskKey(plain), nil
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", "", err
	}

	// Provision a new key
	plainKey = "wrk_live_" + helper.GenerateRandomHex(24)
	maskedKey = maskKey(plainKey)
	enc, err := helper.EncryptSecret(plainKey)
	if err != nil {
		return "", "", err
	}

	if err := upsertSetting(tx, "worker_api_key_encrypted", enc); err != nil {
		return "", "", err
	}
	if err := upsertSetting(tx, "worker_api_key_hash", workerKeyHash(plainKey)); err != nil {
		return "", "", err
	}

	return plainKey, maskedKey, nil
}

type serverNode struct {
	ID           uint   `json:"id"`
	Name         string `json:"name"`
	Address      string `json:"address"`
	Port         string `json:"port"`
	Status       string `json:"status"`
	Ping         string `json:"ping"`
	RunningTime  string `json:"runningTime"`
	EmailsVerified int  `json:"emailsVerified"`
	CurrentJob   string `json:"currentJob"`
	IPReputation string `json:"ipReputation"`
	WorkerCount  int    `json:"workerCount"`
	Config       struct {
		DailyLimit int  `json:"dailyLimit"`
		RateLimit  int  `json:"rateLimit"`
		ChunkSize  int  `json:"chunkSize"`
		Enabled    bool `json:"enabled"`
	} `json:"config"`
}

func (h *AdminHandler) getServerNodes() ([]serverNode, error) {
	servers, err := h.serverService.ListServers()
	if err != nil {
		return nil, err
	}

	procRows, err := h.serverService.GetActiveTasksCountByWorker()
	if err != nil {
		logger.Error("Failed to fetch active tasks count by worker", "error", err)
	}

	summary := make(map[string]repo.WorkerTaskSummary)
	for _, r := range procRows {
		key := strings.TrimSpace(r.WorkerServer)
		if key == "" {
			continue
		}
		if _, exists := summary[key]; !exists {
			summary[key] = r
		}
	}

	out := make([]serverNode, 0, len(servers))
	now := time.Now().UTC()

	for _, s := range servers {
		n := serverNode{
			ID:      s.ID,
			Name:    s.ServerName,
			Address: s.IPAddress,
			Port:    strconv.Itoa(s.Port),
		}

		lastPing := s.LastPing
		if lastPing != nil {
			diff := now.Sub(lastPing.UTC())
			if diff < 130*time.Second {
				n.Ping = strconv.Itoa(20+int(s.ID%31)) + "ms"
				n.RunningTime = "Online"
				n.Status = "active"
			} else {
				n.Ping = "--"
				n.Status = "offline"
				n.RunningTime = "Last seen: " + lastPing.UTC().Format("2006-01-02 15:04:05")
			}
		} else {
			n.Ping = "--"
			n.Status = "offline"
			n.RunningTime = "Last seen: Never"
		}

		if n.Status == "offline" {
			n.IPReputation = "None"
			n.WorkerCount = 0
		} else {
			n.IPReputation = s.IPReputation
			if n.IPReputation == "" {
				n.IPReputation = "Good"
			}
			n.WorkerCount = s.WorkerCount
		}

		n.EmailsVerified = s.EmailsVerified

		n.Config.DailyLimit = s.DailyLimit
		if n.Config.DailyLimit <= 0 {
			n.Config.DailyLimit = 50000
		}
		n.Config.RateLimit = s.RateLimit
		if n.Config.RateLimit <= 0 {
			n.Config.RateLimit = 100
		}
		n.Config.ChunkSize = 50
		n.Config.Enabled = s.Enabled
		if !s.Enabled {
			n.Status = "disabled"
		}

		n.CurrentJob = "Waiting for jobs..."
		if n.Status == "active" {
			if act, ok := summary[s.ServerName]; ok && act.JobID != "" && act.TaskCount > 0 {
				label := "tasks"
				if act.TaskCount == 1 {
					label = "task"
				}
				n.CurrentJob = "Job " + act.JobID + " (" + strconv.Itoa(act.TaskCount) + " " + label + ")"
			}
		}

		out = append(out, n)
	}

	return out, nil
}

// ListServers returns all worker servers (legacy-compatible UI shape)
func (h *AdminHandler) ListServers(c *gin.Context) {
	out, err := h.getServerNodes()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch servers", err.Error())
		return
	}

	helper.SendSuccess(c, "Servers retrieved", out)
}

// StartServerListBroadcaster polls server list and broadcasts via WebSocket
func (h *AdminHandler) StartServerListBroadcaster() {
	safe.Go(func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if ws.GlobalHub == nil || !ws.GlobalHub.HasAdminConnections() {
				continue
			}

			servers, err := h.getServerNodes()
			if err != nil {
				continue
			}

			ws.GlobalHub.BroadcastToAdmins("server_list_update", servers)
		}
	})
}

// GetWorkerKey returns the currently configured worker API key (masked or plain)
func (h *AdminHandler) GetWorkerKey(c *gin.Context) {
	adminID, _ := c.Get("userID")
	reveal := c.Query("reveal")
	revealBool := reveal == "1" || strings.EqualFold(reveal, "true") || strings.EqualFold(reveal, "yes")

	plainKey, masked, err := h.serverService.GetOrProvisionWorkerKey()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Unable to access worker key configuration.", err.Error())
		return
	}

	if revealBool {
		logAction(adminID.(uint), "WARN", "Admin", "Administrator revealed the dedicated worker API key")
	}

	resp := gin.H{
		"masked_key": masked,
		"worker_key": nil,
	}
	if revealBool {
		resp["worker_key"] = plainKey
	}

	helper.SendSuccess(c, "Worker key retrieved", resp)
}

// AddServer registers a new worker server (Legacy: Admin\ServerController@store)
func (h *AdminHandler) AddServer(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		ServerName string `json:"server_name" binding:"required"`
		IPAddress  string `json:"ip_address" binding:"required"`
		Port       int    `json:"port"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	input.ServerName = strings.TrimSpace(input.ServerName)
	input.IPAddress = strings.TrimSpace(input.IPAddress)
	if input.Port <= 0 || input.Port > 65535 {
		input.Port = 80
	}

	if !isValidWorkerServerName(input.ServerName) {
		helper.SendError(c, http.StatusBadRequest, "Invalid server name", "")
		return
	}

	existing, _ := h.serverService.GetByName(input.ServerName)
	if existing != nil {
		helper.SendError(c, http.StatusConflict, "server_name must be unique", "")
		return
	}

	server := model.WorkerServer{
		ServerName:   input.ServerName,
		IPAddress:    input.IPAddress,
		Port:         input.Port,
		Status:       "offline",
		Enabled:      true,
		IPReputation: "Good",
		RateLimit:    100,
		DailyLimit:   50000,
	}

	if err := h.serverService.CreateServer(&server); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to register server", err.Error())
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", "New server '"+server.ServerName+"' ("+server.IPAddress+") registered")
	helper.SendSuccess(c, "Server registered", nil)
}

// UpdateServer updates a worker server (Legacy: Admin\ServerController@update)
func (h *AdminHandler) UpdateServer(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		ID         uint    `json:"id" binding:"required"`
		ServerName *string `json:"server_name"`
		IPAddress  *string `json:"ip_address"`
		Port       *int    `json:"port"`
		Status     *string `json:"status"`
		RateLimit  *int    `json:"rate_limit"`
		DailyLimit *int    `json:"daily_limit"`
		IPReputation *string `json:"ip_reputation"`
		Config     *struct {
			DailyLimit *int `json:"dailyLimit"`
			RateLimit  *int `json:"rateLimit"`
		} `json:"config"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	server, err := h.serverService.GetByID(input.ID)
	if err != nil {
		helper.SendError(c, http.StatusNotFound, "Server not found", "")
		return
	}

	updates := make(map[string]interface{})

	if input.ServerName != nil {
		name := strings.TrimSpace(*input.ServerName)
		if name != "" && name != server.ServerName {
			if !isValidWorkerServerName(name) {
				helper.SendError(c, http.StatusBadRequest, "Invalid server name", "")
				return
			}
			existing, _ := h.serverService.GetByName(name)
			if existing != nil && existing.ID != server.ID {
				helper.SendError(c, http.StatusConflict, "server_name must be unique", "")
				return
			}
			updates["server_name"] = name
		}
	}

	if input.IPAddress != nil {
		ip := strings.TrimSpace(*input.IPAddress)
		if ip != "" {
			updates["ip_address"] = ip
		}
	}

	if input.Port != nil {
		if *input.Port > 0 && *input.Port <= 65535 {
			updates["port"] = *input.Port
		}
	}

	if input.Status != nil && strings.TrimSpace(*input.Status) != "" {
		updates["status"] = strings.TrimSpace(*input.Status)
	}

	// Config payload from UI takes precedence
	if input.Config != nil {
		if input.Config.DailyLimit != nil && *input.Config.DailyLimit >= 1 {
			updates["daily_limit"] = *input.Config.DailyLimit
		}
		if input.Config.RateLimit != nil && *input.Config.RateLimit >= 1 {
			updates["rate_limit"] = *input.Config.RateLimit
		}
	}
	if input.DailyLimit != nil && *input.DailyLimit >= 1 {
		updates["daily_limit"] = *input.DailyLimit
	}
	if input.RateLimit != nil && *input.RateLimit >= 1 {
		updates["rate_limit"] = *input.RateLimit
	}
	if input.IPReputation != nil && strings.TrimSpace(*input.IPReputation) != "" {
		updates["ip_reputation"] = strings.TrimSpace(*input.IPReputation)
	}

	if len(updates) == 0 {
		helper.SendSuccess(c, "Server updated", nil)
		return
	}

	if err := h.serverService.UpdateFields(server.ID, updates); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to update server", err.Error())
		return
	}

	logAction(adminID.(uint), "INFO", "Admin", "Server ID #"+strconv.Itoa(int(server.ID))+" updated")
	helper.SendSuccess(c, "Server updated", nil)
}

// ToggleServer enables/disables a worker server (Legacy: Admin\ServerController@toggle)
func (h *AdminHandler) ToggleServer(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		ID      uint  `json:"id" binding:"required"`
		Enabled *bool `json:"enabled" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	if err := h.serverService.ToggleServer(input.ID, *input.Enabled); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to update server status", err.Error())
		return
	}

	label := "disabled"
	if *input.Enabled {
		label = "enabled"
	}
	logAction(adminID.(uint), "INFO", "Admin", "Server ID #"+strconv.Itoa(int(input.ID))+" "+label)
	helper.SendSuccess(c, "Server "+label+" successfully", nil)
}

// DeleteServer deletes a worker server (Legacy: Admin\ServerController@delete)
func (h *AdminHandler) DeleteServer(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		ID uint `json:"id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	if err := h.serverService.DeleteServer(input.ID); err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete server", err.Error())
		return
	}

	logAction(adminID.(uint), "WARN", "Admin", "Server ID #"+strconv.Itoa(int(input.ID))+" deleted")
	helper.SendSuccess(c, "Server deleted", nil)
}

// WorkerHeartbeat handles worker pings (Legacy: Admin\ServerController@heartbeat)
func WorkerHeartbeat(c *gin.Context) {
	var input struct {
		ServerName string `json:"server_name" binding:"required"`
		IPAddress  string `json:"ip_address"`
		Port       *int   `json:"port"`
		WorkerCount int   `json:"worker_count"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	input.ServerName = strings.TrimSpace(input.ServerName)
	ip := strings.TrimSpace(input.IPAddress)
	if ip == "" {
		ip = strings.TrimSpace(c.ClientIP())
	}

	var chunkSettings []model.Setting
	chunkSize := 1000 // default
	if err := config.DB.Where("setting_key = ?", "chunk_size").Find(&chunkSettings).Error; err == nil && len(chunkSettings) > 0 {
		if val, err := strconv.Atoi(chunkSettings[0].SettingValue); err == nil && val > 0 {
			chunkSize = val
		}
	}

	now := time.Now().UTC()
	var server model.WorkerServer
	err := config.DB.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("server_name = ?", input.ServerName).
		First(&server).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			logger.Info("Auto-provisioning new worker server", "server_name", input.ServerName, "ip", ip)

			port := 80
			if input.Port != nil && *input.Port > 0 && *input.Port <= 65535 {
				port = *input.Port
			}

			server = model.WorkerServer{
				ServerName:   input.ServerName,
				IPAddress:    ip,
				Port:         port,
				Status:       "online",
				LastPing:     &now,
				Enabled:      true,
				WorkerCount:  input.WorkerCount,
				IPReputation: "Good",
				RateLimit:    100,
				DailyLimit:   50000,
			}

			if err := config.DB.Create(&server).Error; err != nil {
				helper.SendError(c, http.StatusInternalServerError, "Heartbeat failed", err.Error())
				return
			}

			// Real-time Update for Admins
			ws.GlobalHub.BroadcastToAdmins("worker_update", gin.H{
				"server_name":  server.ServerName,
				"ip_address":   ip,
				"status":       "online",
				"worker_count": input.WorkerCount,
				"last_ping":    now.Format(time.RFC3339),
			})

			helper.SendSuccess(c, "Heartbeat received", gin.H{
				"chunk_size": chunkSize,
			})
			return
		}

		helper.SendError(c, http.StatusInternalServerError, "Heartbeat failed", err.Error())
		return
	}

	updates := map[string]interface{}{
		"ip_address":   ip,
		"last_ping":    &now,
		"status":       "online",
		"enabled":      true,
		"worker_count": input.WorkerCount,
	}
	if input.Port != nil && *input.Port > 0 && *input.Port <= 65535 {
		updates["port"] = *input.Port
	}

	if err := config.DB.Model(&server).Updates(updates).Error; err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Heartbeat failed", err.Error())
		return
	}

	// Real-time Update for Admins
	ws.GlobalHub.BroadcastToAdmins("worker_update", gin.H{
		"server_name":  server.ServerName,
		"ip_address":   ip,
		"status":       "online",
		"worker_count": input.WorkerCount,
		"last_ping":    now.Format(time.RFC3339),
	})

	logger.Info("Worker heartbeat received", "server", server.ServerName, "ip", ip)

	helper.SendSuccess(c, "Heartbeat received", gin.H{
		"chunk_size": chunkSize,
	})
}

// RotateWorkerKey generates a new worker API key
func (h *AdminHandler) RotateWorkerKey(c *gin.Context) {
	adminID, _ := c.Get("userID")
	var input struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, err.Error(), "")
		return
	}

	valid, err := h.serverService.CheckAdminPassword(adminID.(uint), input.Password)
	if err != nil || !valid {
		logAction(adminID.(uint), "WARN", "Admin", "Failed worker key rotation attempt")
		helper.SendError(c, http.StatusForbidden, "Invalid administrator password.", "")
		return
	}

	newKey, masked, err := h.serverService.RotateWorkerKey()
	if err != nil {
		helper.SendError(c, http.StatusInternalServerError, "Unable to rotate worker key.", err.Error())
		return
	}

	logAction(adminID.(uint), "WARN", "Admin", "Dedicated worker API key rotated")
	helper.SendSuccess(c, "Worker key rotated successfully", gin.H{
		"worker_key": newKey,
		"masked_key": masked,
	})
}



