package reporter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"ejp-worker/internal/engine"
	"ejp-worker/pkg/config"
	"ejp-worker/pkg/logger"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

var (
	httpClient *http.Client
	batchMutex sync.Mutex
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

// ReportBatchToAPI sends task results to the backend API
func ReportBatchToAPI(jobID string, taskID uint, results []map[string]interface{}) error {
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

// StartHeartbeat sends heartbeat to API periodically
func StartHeartbeat() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	logger.Info("Starting Background Heartbeat Engine...")

	for {
		heartbeatURL := config.Cfg.APIBaseURL + "/heartbeat"

		payload := map[string]interface{}{
			"server_name":  config.Cfg.WorkerServerName,
			"worker_count": config.GetEffectiveWorkerConcurrency(),
		}

		jsonData, _ := json.Marshal(payload)
		req, err := http.NewRequest("POST", heartbeatURL, bytes.NewBuffer(jsonData))
		if err != nil {
			logger.Error("Heartbeat: failed to create request", zap.Error(err))
			<-ticker.C
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Worker-Key", config.Cfg.WorkerAPIKey)

		resp, err := httpClient.Do(req)
		if err == nil {
			if resp.StatusCode != http.StatusOK {
				logger.Warn("Heartbeat warning", zap.Int("status", resp.StatusCode))
			} else {
				var result struct {
					Data struct {
						ChunkSize          int `json:"chunk_size"`
						WorkerConcurrency  int `json:"worker_concurrency"`
						PrepareConcurrency int `json:"prepare_concurrency"`
					} `json:"data"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
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
				}
			}
			resp.Body.Close()
		} else {
			logger.Error("Heartbeat error", zap.Error(err))
		}

		<-ticker.C
	}
}

// SelfHeal resets abandoned tasks that were assigned to this worker
func SelfHeal() {
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
func UpdateDomainCache() {
	var refreshMu sync.Mutex
	refresh := func() {
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
