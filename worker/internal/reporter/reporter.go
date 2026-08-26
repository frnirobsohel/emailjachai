package reporter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"ejp-worker/internal/engine"
	"ejp-worker/pkg/config"
	"ejp-worker/pkg/logger"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var (
	httpClient   *http.Client
	batchMutex   sync.Mutex
	detectedIP   string
	detectIPOnce sync.Once
)

func init() {
	// Persistent client for optimal API communication
	httpClient = &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 100,
			IdleConnTimeout:     90 * time.Second,
		},
	}
}

// detectPublicIP tries to get the public IP from ipify.org.
// Falls back to first non-loopback local IP on failure.
func detectPublicIP() string {
	detectIPOnce.Do(func() {
		// Try public IP detection first
		client := &http.Client{Timeout: 5 * time.Second}
		for _, url := range []string{
			"https://api.ipify.org",
			"https://ifconfig.me/ip",
			"https://icanhazip.com",
		} {
			resp, err := client.Get(url)
			if err != nil {
				continue
			}
			body, err := io.ReadAll(io.LimitReader(resp.Body, 64))
			resp.Body.Close()
			if err != nil {
				continue
			}
			ip := strings.TrimSpace(string(body))
			if net.ParseIP(ip) != nil {
				detectedIP = ip
				logger.Info("Detected public IP", zap.String("ip", ip), zap.String("source", url))
				return
			}
		}

		// Fallback: first non-loopback LAN IP
		if ifaces, err := net.Interfaces(); err == nil {
			for _, iface := range ifaces {
				addrs, _ := iface.Addrs()
				for _, addr := range addrs {
					var ip net.IP
					switch v := addr.(type) {
					case *net.IPNet:
						ip = v.IP
					case *net.IPAddr:
						ip = v.IP
					}
					if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() {
						continue
					}
					if ip.To4() != nil {
						detectedIP = ip.String()
						logger.Warn("Public IP detection failed, using LAN IP", zap.String("ip", detectedIP))
						return
					}
				}
			}
		}

		logger.Warn("Could not detect any usable IP address for heartbeat")
	})
	return detectedIP
}

// ReportBatchToAPI sends task results to the backend API
func ReportBatchToAPI(jobID string, taskID uint, results []map[string]interface{}) error {
	if !config.IsWorkerEnabled() {
		return fmt.Errorf("worker disabled by administrator")
	}

	apiURL := config.Cfg.APIBaseURL + "/report-tasks"

	batchPayload := map[string]interface{}{
		"job_id":      jobID,
		"task_id":     taskID,
		"server_name": config.Cfg.WorkerServerName,
		"worker_name": "standalone-go-worker",
		"results":     results,
	}

	jsonData, err := json.Marshal(batchPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal batch: %v", err)
	}

	req, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Worker-Key", config.Cfg.WorkerAPIKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to report batch: %v", err)
	}
	defer resp.Body.Close()

	// Drain remainder of body to enable connection reuse
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("batch report returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// HeartbeatOnce pings the API and applies Job Control + enabled flag.
// Safe to call at startup before Asynq so a disabled node never starts consumers.
func HeartbeatOnce() {
	heartbeatURL := config.Cfg.APIBaseURL + "/heartbeat"

	payload := map[string]interface{}{
		"server_name":  config.Cfg.WorkerServerName,
		"worker_count": config.GetEffectiveWorkerConcurrency(),
		"ip_address":   detectPublicIP(),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		logger.Error("Heartbeat: failed to marshal payload", zap.Error(err))
		return
	}

	req, err := http.NewRequest("POST", heartbeatURL, bytes.NewBuffer(jsonData))
	if err != nil {
		logger.Error("Heartbeat: failed to create request", zap.Error(err))
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Worker-Key", config.Cfg.WorkerAPIKey)

	resp, err := httpClient.Do(req)
	if err != nil {
		logger.Error("Heartbeat error", zap.Error(err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		logger.Warn("Heartbeat warning", zap.Int("status", resp.StatusCode))
		_, _ = io.Copy(io.Discard, resp.Body)
		return
	}

	var result struct {
		Data struct {
			ChunkSize          int   `json:"chunk_size"`
			WorkerConcurrency  int   `json:"worker_concurrency"`
			PrepareConcurrency int   `json:"prepare_concurrency"`
			RateLimit          *int  `json:"rate_limit"` // nil = field absent (old API); 0 = unlimited
			Enabled            *bool `json:"enabled"`    // nil = old API; do not flip local flag
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		logger.Warn("Heartbeat: failed to decode response", zap.Error(err))
		return
	}

	if result.Data.ChunkSize > 0 {
		batchMutex.Lock()
		prevChunk := config.Cfg.ChunkSizeLimit
		config.Cfg.ChunkSizeLimit = result.Data.ChunkSize
		batchMutex.Unlock()
		if prevChunk != result.Data.ChunkSize {
			logger.Info("Chunk size updated from Job Control",
				zap.Int("from", prevChunk),
				zap.Int("to", result.Data.ChunkSize),
			)
		}
	}
	if result.Data.WorkerConcurrency > 0 {
		prev := config.GetEffectiveWorkerConcurrency()
		config.SetEffectiveWorkerConcurrency(result.Data.WorkerConcurrency)
		if prev != result.Data.WorkerConcurrency {
			logger.Info("Worker concurrency updated from Job Control",
				zap.Int("from", prev),
				zap.Int("to", result.Data.WorkerConcurrency),
			)
		}
	}
	// Only apply when API includes rate_limit (avoids "missing = unlimited" during deploy skew).
	if result.Data.RateLimit != nil {
		rpm := *result.Data.RateLimit
		prevRPM := config.GetEffectiveWorkerRateLimitRPM()
		config.SetEffectiveWorkerRateLimitRPM(rpm)
		if prevRPM != rpm {
			logger.Info("Worker rate limit updated from Server settings",
				zap.Int("from_rpm", prevRPM),
				zap.Int("to_rpm", rpm),
			)
		}
	}
	if result.Data.Enabled != nil {
		prev := config.IsWorkerEnabled()
		next := *result.Data.Enabled
		config.SetWorkerEnabled(next)
		if prev != next {
			if next {
				logger.Info("Worker enabled by admin — queue processing will resume")
			} else {
				logger.Warn("Worker disabled by admin — heartbeat only until re-enabled")
			}
		}
	}
}

// StartHeartbeat sends heartbeat to API periodically (immediate first ping).
func StartHeartbeat() {
	logger.Info("Starting Background Heartbeat Engine...")
	HeartbeatOnce()

	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		HeartbeatOnce()
	}
}

// SelfHeal resets abandoned tasks that were assigned to this worker
func SelfHeal() {
	if !config.IsWorkerEnabled() {
		logger.Info("Self-healing skipped: worker is disabled")
		return
	}
	if config.Cfg.WorkerServerName == "unknown-go-worker" || config.Cfg.WorkerServerName == "" {
		logger.Info("Self-healing: Server name unknown or not set, skipping task recovery.")
		return
	}

	resetURL := config.Cfg.APIBaseURL + "/reset-tasks"
	logger.Info("Self-healing: Recovering zombie tasks", zap.String("server", config.Cfg.WorkerServerName))

	payload := map[string]string{"server_name": config.Cfg.WorkerServerName}
	jsonData, _ := json.Marshal(payload)

	req, err := http.NewRequest("POST", resetURL, bytes.NewBuffer(jsonData))
	if err != nil {
		logger.Error("Self-healing: failed to create request", zap.Error(err))
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Worker-Key", config.Cfg.WorkerAPIKey)

	resp, err := httpClient.Do(req)
	if err == nil {
		defer resp.Body.Close()
		var result struct {
			Message string `json:"message"`
		}
		json.NewDecoder(resp.Body).Decode(&result)
		// Drain remainder of body to enable connection reuse
		_, _ = io.Copy(io.Discard, resp.Body)
		logger.Info("Self-healing success", zap.String("message", result.Message))
	} else {
		logger.Error("Self-healing failed", zap.Error(err))
	}
}

// UpdateDomainCache keeps the in-memory domain policy cache fresh.
// Workers poll every 2 minutes and also refresh immediately on Redis pub/sub invalidation.
// Skips API calls while the node is admin-disabled (heartbeat-only mode).
func UpdateDomainCache() {
	var refreshMu sync.Mutex
	refresh := func() {
		if !config.IsWorkerEnabled() {
			return
		}
		refreshMu.Lock()
		defer refreshMu.Unlock()

		logger.Info("Updating domain cache from API...")

		domainURL := config.Cfg.APIBaseURL + "/domains"
		req, err := http.NewRequest("GET", domainURL, nil)
		if err != nil {
			logger.Error("Failed to create domain cache request", zap.Error(err))
			return
		}
		req.Header.Set("X-Worker-Key", config.Cfg.WorkerAPIKey)

		resp, err := httpClient.Do(req)
		if err != nil {
			logger.Error("Failed to update domain cache", zap.Error(err))
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			var result struct {
				Data []map[string]interface{} `json:"data"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
				engine.Cache.Update(result.Data)
				logger.Info("Domain cache updated",
					zap.Int("entries", len(result.Data)),
					zap.String("revision", resp.Header.Get("X-Domain-Revision")),
				)
			} else {
				logger.Error("Failed to decode domain cache response", zap.Error(err))
			}
		} else {
			logger.Error("Failed to update domain cache with status", zap.Int("status", resp.StatusCode))
		}
		_, _ = io.Copy(io.Discard, resp.Body)
	}

	refresh()

	go subscribeDomainCacheInvalidation(refresh)

	for {
		time.Sleep(2 * time.Minute)
		refresh()
	}
}

func subscribeDomainCacheInvalidation(refresh func()) {
	opt, err := redis.ParseURL(config.Cfg.RedisURL)
	if err != nil {
		logger.Error("Domain cache pub/sub: failed to parse REDIS_URL", zap.Error(err))
		return
	}
	rdb := redis.NewClient(opt)
	defer rdb.Close()

	ctx := context.Background()
	if err := rdb.Ping(ctx).Err(); err != nil {
		logger.Error("Domain cache pub/sub: redis ping failed", zap.Error(err))
		return
	}

	sub := rdb.Subscribe(ctx, "ejp_domains_changed")
	defer sub.Close()

	logger.Info("Listening for domain cache invalidation", zap.String("channel", "ejp_domains_changed"))
	ch := sub.Channel()
	for range ch {
		logger.Info("Domain cache invalidation received")
		refresh()
	}
}
