package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"
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

// isValidServerHost accepts IPv4/IPv6 or a DNS hostname (valid_domain rules).
func isValidServerHost(host string) bool {
	host = strings.TrimSpace(host)
	if host == "" || len(host) > 253 {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return true
	}

	domain := strings.ToLower(host)
	if len(domain) < 3 {
		return false
	}
	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return false
	}
	for _, part := range parts {
		if len(part) == 0 || len(part) > 63 {
			return false
		}
		if part[0] == '-' || part[len(part)-1] == '-' {
			return false
		}
		for _, ch := range part {
			if !((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-') {
				return false
			}
		}
	}
	return true
}

func adminIDFromContext(c *gin.Context) (uint, bool) {
	raw, ok := c.Get("userID")
	if !ok {
		return 0, false
	}
	id, ok := raw.(uint)
	return id, ok
}

func getChunkSizeSetting() int {
	chunkSize := 1000
	var chunkSettings []model.Setting
	if err := config.DB.Where("setting_key = ?", "chunk_size").Find(&chunkSettings).Error; err == nil && len(chunkSettings) > 0 {
		if val, err := strconv.Atoi(chunkSettings[0].SettingValue); err == nil && val > 0 {
			chunkSize = val
		}
	}
	return chunkSize
}

func formatHeartbeatAge(diff time.Duration) string {
	secs := int(diff.Seconds())
	if secs < 5 {
		return "Just now"
	}
	if secs < 60 {
		return strconv.Itoa(secs) + "s ago"
	}
	mins := secs / 60
	if mins < 60 {
		return strconv.Itoa(mins) + "m ago"
	}
	return strconv.Itoa(mins/60) + "h ago"
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
				n.Ping = "live"
				n.RunningTime = formatHeartbeatAge(diff)
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
		n.Config.ChunkSize = getChunkSizeSetting()
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
		logger.Error("Failed to fetch servers", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to fetch servers", "ERR_SERVER_LIST")
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

// GetWorkerKey returns the masked worker API key (never plaintext).
func (h *AdminHandler) GetWorkerKey(c *gin.Context) {
	_, masked, err := h.serverService.GetOrProvisionWorkerKey()
	if err != nil {
		logger.Error("Unable to access worker key configuration", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Unable to access worker key configuration.", "ERR_SERVER_WORKER_KEY")
		return
	}

	helper.SendSuccess(c, "Worker key retrieved", gin.H{
		"masked_key": masked,
		"worker_key": nil,
	})
}

// RevealWorkerKey returns the plaintext worker key after admin password verification.
func (h *AdminHandler) RevealWorkerKey(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Password is required", "ERR_BAD_REQUEST")
		return
	}

	valid, err := h.serverService.CheckAdminPassword(adminID, input.Password)
	if err != nil || !valid {
		logAction(adminID, "WARN", "Admin", "Failed worker key reveal attempt")
		helper.SendError(c, http.StatusForbidden, "Invalid administrator password.", "ERR_SERVER_BAD_PASSWORD")
		return
	}

	plainKey, masked, err := h.serverService.GetOrProvisionWorkerKey()
	if err != nil {
		logger.Error("Unable to reveal worker key", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Unable to access worker key configuration.", "ERR_SERVER_WORKER_KEY")
		return
	}

	logAction(adminID, "WARN", "Admin", "Administrator revealed the dedicated worker API key")
	helper.SendSuccess(c, "Worker key revealed", gin.H{
		"worker_key": plainKey,
		"masked_key": masked,
	})
}

// AddServer registers a new worker server (Legacy: Admin\ServerController@store)
func (h *AdminHandler) AddServer(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		ServerName string `json:"server_name" binding:"required"`
		IPAddress  string `json:"ip_address" binding:"required"`
		Port       int    `json:"port"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid server payload", "ERR_BAD_REQUEST")
		return
	}

	input.ServerName = strings.TrimSpace(input.ServerName)
	input.IPAddress = strings.TrimSpace(input.IPAddress)
	if input.Port == 0 {
		input.Port = 8080
	} else if input.Port < 1 || input.Port > 65535 {
		helper.SendError(c, http.StatusBadRequest, "Port must be between 1 and 65535", "ERR_SERVER_PORT")
		return
	}

	if !isValidWorkerServerName(input.ServerName) {
		helper.SendError(c, http.StatusBadRequest, "Invalid server name", "ERR_SERVER_NAME")
		return
	}
	if !isValidServerHost(input.IPAddress) {
		helper.SendError(c, http.StatusBadRequest, "Invalid IP address or hostname", "ERR_SERVER_HOST")
		return
	}

	existing, _ := h.serverService.GetByName(input.ServerName)
	if existing != nil {
		helper.SendError(c, http.StatusConflict, "server_name must be unique", "ERR_SERVER_NAME_EXISTS")
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
		logger.Error("Failed to register server", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Failed to register server", "ERR_SERVER_CREATE")
		return
	}

	logAction(adminID, "INFO", "Admin", "New server '"+server.ServerName+"' ("+server.IPAddress+") registered")
	helper.SendSuccess(c, "Server registered", nil)
}

// UpdateServer updates a worker server (Legacy: Admin\ServerController@update)
func (h *AdminHandler) UpdateServer(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		ID           uint    `json:"id" binding:"required"`
		ServerName   *string `json:"server_name"`
		IPAddress    *string `json:"ip_address"`
		Port         *int    `json:"port"`
		Status       *string `json:"status"`
		RateLimit    *int    `json:"rate_limit"`
		DailyLimit   *int    `json:"daily_limit"`
		IPReputation *string `json:"ip_reputation"`
		Config       *struct {
			DailyLimit *int `json:"dailyLimit"`
			RateLimit  *int `json:"rateLimit"`
		} `json:"config"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid server payload", "ERR_BAD_REQUEST")
		return
	}

	server, err := h.serverService.GetByID(input.ID)
	if err != nil {
		helper.SendError(c, http.StatusNotFound, "Server not found", "ERR_SERVER_NOT_FOUND")
		return
	}

	updates := make(map[string]interface{})

	if input.ServerName != nil {
		name := strings.TrimSpace(*input.ServerName)
		if name != "" && name != server.ServerName {
			if !isValidWorkerServerName(name) {
				helper.SendError(c, http.StatusBadRequest, "Invalid server name", "ERR_SERVER_NAME")
				return
			}
			existing, _ := h.serverService.GetByName(name)
			if existing != nil && existing.ID != server.ID {
				helper.SendError(c, http.StatusConflict, "server_name must be unique", "ERR_SERVER_NAME_EXISTS")
				return
			}
			updates["server_name"] = name
		}
	}

	if input.IPAddress != nil {
		ip := strings.TrimSpace(*input.IPAddress)
		if ip != "" {
			if !isValidServerHost(ip) {
				helper.SendError(c, http.StatusBadRequest, "Invalid IP address or hostname", "ERR_SERVER_HOST")
				return
			}
			updates["ip_address"] = ip
		}
	}

	if input.Port != nil {
		if *input.Port < 1 || *input.Port > 65535 {
			helper.SendError(c, http.StatusBadRequest, "Port must be between 1 and 65535", "ERR_SERVER_PORT")
			return
		}
		updates["port"] = *input.Port
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
		logger.Error("Failed to update server", "error", err, "id", server.ID)
		helper.SendError(c, http.StatusInternalServerError, "Failed to update server", "ERR_SERVER_UPDATE")
		return
	}

	logAction(adminID, "INFO", "Admin", "Server ID #"+strconv.Itoa(int(server.ID))+" updated")
	helper.SendSuccess(c, "Server updated", nil)
}

// ToggleServer enables/disables a worker server (Legacy: Admin\ServerController@toggle)
func (h *AdminHandler) ToggleServer(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		ID      uint  `json:"id" binding:"required"`
		Enabled *bool `json:"enabled" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid toggle payload", "ERR_BAD_REQUEST")
		return
	}

	if err := h.serverService.ToggleServer(input.ID, *input.Enabled); err != nil {
		logger.Error("Failed to toggle server", "error", err, "id", input.ID)
		helper.SendError(c, http.StatusInternalServerError, "Failed to update server status", "ERR_SERVER_TOGGLE")
		return
	}

	label := "disabled"
	if *input.Enabled {
		label = "enabled"
	}
	logAction(adminID, "INFO", "Admin", "Server ID #"+strconv.Itoa(int(input.ID))+" "+label)
	helper.SendSuccess(c, "Server "+label+" successfully", nil)
}

// DeleteServer deletes a worker server (Legacy: Admin\ServerController@delete)
func (h *AdminHandler) DeleteServer(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		ID      uint   `json:"id" binding:"required"`
		Confirm string `json:"confirm" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Type DELETE to confirm", "ERR_BAD_REQUEST")
		return
	}
	if strings.ToUpper(strings.TrimSpace(input.Confirm)) != "DELETE" {
		helper.SendError(c, http.StatusBadRequest, "Type DELETE to confirm", "ERR_SERVER_CONFIRM")
		return
	}

	if err := h.serverService.DeleteServer(input.ID); err != nil {
		logger.Error("Failed to delete server", "error", err, "id", input.ID)
		helper.SendError(c, http.StatusInternalServerError, "Failed to delete server", "ERR_SERVER_DELETE")
		return
	}

	logAction(adminID, "WARN", "Admin", "Server ID #"+strconv.Itoa(int(input.ID))+" deleted")
	helper.SendSuccess(c, "Server deleted", nil)
}

// WorkerHeartbeat handles worker pings (Legacy: Admin\ServerController@heartbeat)
func WorkerHeartbeat(c *gin.Context) {
	var input struct {
		ServerName  string `json:"server_name" binding:"required"`
		IPAddress   string `json:"ip_address"`
		Port        *int   `json:"port"`
		WorkerCount int    `json:"worker_count"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Invalid heartbeat payload", "ERR_BAD_REQUEST")
		return
	}

	input.ServerName = strings.TrimSpace(input.ServerName)
	ip := strings.TrimSpace(input.IPAddress)
	if ip == "" {
		ip = strings.TrimSpace(c.ClientIP())
	}

	chunkSize := getChunkSizeSetting()

	now := time.Now().UTC()
	var server model.WorkerServer
	err := config.DB.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("server_name = ?", input.ServerName).
		First(&server).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			logger.Info("Auto-provisioning new worker server", "server_name", input.ServerName, "ip", ip)

			port := 8080
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
				logger.Error("Heartbeat auto-provision failed", "error", err)
				helper.SendError(c, http.StatusInternalServerError, "Heartbeat failed", "ERR_SERVER_HEARTBEAT")
				return
			}

			ws.GlobalHub.BroadcastToAdmins("worker_update", gin.H{
				"server_name":  server.ServerName,
				"ip_address":   ip,
				"status":       "online",
				"enabled":      true,
				"worker_count": input.WorkerCount,
				"last_ping":    now.Format(time.RFC3339),
			})

			helper.SendSuccess(c, "Heartbeat received", gin.H{
				"chunk_size": chunkSize,
			})
			return
		}

		logger.Error("Heartbeat lookup failed", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Heartbeat failed", "ERR_SERVER_HEARTBEAT")
		return
	}

	// Do NOT force enabled=true — admin Disable must survive heartbeats (H1).
	updates := map[string]interface{}{
		"ip_address":   ip,
		"last_ping":    &now,
		"status":       "online",
		"worker_count": input.WorkerCount,
	}
	if input.Port != nil && *input.Port > 0 && *input.Port <= 65535 {
		updates["port"] = *input.Port
	}

	if err := config.DB.Model(&server).Updates(updates).Error; err != nil {
		logger.Error("Heartbeat update failed", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Heartbeat failed", "ERR_SERVER_HEARTBEAT")
		return
	}

	statusLabel := "online"
	if !server.Enabled {
		statusLabel = "disabled"
	}

	ws.GlobalHub.BroadcastToAdmins("worker_update", gin.H{
		"server_name":  server.ServerName,
		"ip_address":   ip,
		"status":       statusLabel,
		"enabled":      server.Enabled,
		"worker_count": input.WorkerCount,
		"last_ping":    now.Format(time.RFC3339),
	})

	logger.Info("Worker heartbeat received", "server", server.ServerName, "ip", ip, "enabled", server.Enabled)

	helper.SendSuccess(c, "Heartbeat received", gin.H{
		"chunk_size": chunkSize,
		"enabled":    server.Enabled,
	})
}

// RotateWorkerKey generates a new worker API key
func (h *AdminHandler) RotateWorkerKey(c *gin.Context) {
	adminID, ok := adminIDFromContext(c)
	if !ok {
		helper.SendError(c, http.StatusUnauthorized, "Unauthorized", "ERR_UNAUTHORIZED")
		return
	}

	var input struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		helper.SendError(c, http.StatusBadRequest, "Password is required", "ERR_BAD_REQUEST")
		return
	}

	valid, err := h.serverService.CheckAdminPassword(adminID, input.Password)
	if err != nil || !valid {
		logAction(adminID, "WARN", "Admin", "Failed worker key rotation attempt")
		helper.SendError(c, http.StatusForbidden, "Invalid administrator password.", "ERR_SERVER_BAD_PASSWORD")
		return
	}

	newKey, masked, err := h.serverService.RotateWorkerKey()
	if err != nil {
		logger.Error("Unable to rotate worker key", "error", err)
		helper.SendError(c, http.StatusInternalServerError, "Unable to rotate worker key.", "ERR_SERVER_ROTATE_KEY")
		return
	}

	logAction(adminID, "WARN", "Admin", "Dedicated worker API key rotated")
	helper.SendSuccess(c, "Worker key rotated successfully", gin.H{
		"worker_key": newKey,
		"masked_key": masked,
	})
}