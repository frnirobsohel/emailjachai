package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"ejp-worker/verifier"

	"github.com/hibiken/asynq"
	"github.com/joho/godotenv"
)

type EmailTaskPayload struct {
	JobID  string `json:"job_id"`
	TaskID uint   `json:"task_id"`
	Email  string `json:"email"`
}

func main() {
	_ = godotenv.Load()

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379/0"
	}

	redisOpt, err := asynq.ParseRedisURI(redisURL)
	if err != nil {
		log.Fatalf("failed to parse redis url: %v", err)
	}

	concurrency := 10
	if raw := strings.TrimSpace(os.Getenv("CONCURRENCY")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			concurrency = parsed
		}
	}

	// Run Self-Healing: Reset previous tasks assigned to this worker server
	selfHeal()


	// Update domain cache initially and then every hour
	go updateDomainCache()

	// Start Background Heartbeat
	go startHeartbeat()

	srv := asynq.NewServer(
		redisOpt,
		asynq.Config{
			Concurrency: concurrency,
			Queues: map[string]int{
				"critical": 6,
				"default":  3,
				"low":      1,
			},
		},
	)

	mux := asynq.NewServeMux()
	mux.HandleFunc("email:verify", handleEmailVerifyTask)
	mux.HandleFunc("webhook:deliver", handleWebhookTask)

	fmt.Println("Starting Standalone Email Verification Worker...")
	if err := srv.Run(mux); err != nil {
		log.Fatalf("could not run server: %v", err)
	}

	// Graceful shutdown
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	<-sigs
	fmt.Println("Shutting down worker...")
	srv.Shutdown()
}

func handleEmailVerifyTask(ctx context.Context, t *asynq.Task) error {
	var p EmailTaskPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Processing Job %s: %s", p.JobID, p.Email)

	// Perform verification
	res := verifier.VerifyEmail(p.Email)

	// Report back to API
	if err := reportToAPI(p.JobID, p.TaskID, p.Email, res); err != nil {
		return err
	}

	return nil
}

func reportToAPI(jobID string, taskID uint, email string, res verifier.VerifyResult) error {
	// Use REST API to report results
	apiURL := os.Getenv("API_URL")
	workerKey := os.Getenv("WORKER_API_KEY")

	payload := map[string]interface{}{
		"job_id":          jobID,
		"task_id":         taskID,
		"email":           email,
		"status":          res.Status,
		"score":           res.Score,
		"is_deliverable":  res.Deliverable,
		"is_catch_all":   res.CatchAll,
		"is_disposable":  res.Status == "disposable",
		"is_free":        res.IsFree,
		"is_role":        res.IsRole,
		"is_blacklisted": res.IsBlacklisted,
		"reason":          res.Reason,
		"time_taken":      res.ProcessingTime,
		"worker_name":     "standalone-go-worker",
	}

	jsonData, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", apiURL, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Worker-Key", workerKey)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("report result for %s: %w", email, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("report result for %s returned status %d: %s", email, resp.StatusCode, strings.TrimSpace(string(body)))
	}

	return nil
}

func updateDomainCache() {
	for {
		log.Println("Updating domain cache from API...")
		
		apiBase := os.Getenv("API_URL") // This is currently the report-task URL, we need the base
		// Assuming API_URL is http://localhost:8000/api/v1/internal/report-task
		// We want http://localhost:8000/api/v1/internal/domains
		domainURL := strings.Replace(apiBase, "report-task", "domains", 1)
		workerKey := os.Getenv("WORKER_API_KEY")

		req, _ := http.NewRequest("GET", domainURL, nil)
		req.Header.Set("X-Worker-Key", workerKey)

		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err == nil && resp.StatusCode == http.StatusOK {
			var result struct {
				Data []map[string]interface{} `json:"data"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
				verifier.Cache.Update(result.Data)
				log.Printf("Domain cache updated with %d entries", len(result.Data))
			}
			resp.Body.Close()
		} else {
			log.Printf("Failed to update domain cache: %v", err)
		}

		time.Sleep(1 * time.Hour)
	}
}

func selfHeal() {
	serverName := os.Getenv("WORKER_SERVER_NAME")
	if serverName == "" {
		log.Println("Self-healing: WORKER_SERVER_NAME not set, skipping task recovery.")
		return
	}

	apiBase := os.Getenv("API_URL")
	// Expected API_URL: http://localhost:8000/api/v1/internal/report-task
	// We want: http://localhost:8000/api/v1/internal/reset-tasks
	resetURL := strings.Replace(apiBase, "report-task", "reset-tasks", 1)
	workerKey := os.Getenv("WORKER_API_KEY")

	log.Printf("Self-healing: Recovering zombie tasks for server: %s...", serverName)

	payload := map[string]string{"server_name": serverName}
	jsonData, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", resetURL, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Worker-Key", workerKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err == nil && resp.StatusCode == http.StatusOK {
		var result struct {
			Message string `json:"message"`
		}
		json.NewDecoder(resp.Body).Decode(&result)
		log.Printf("Self-healing success: %s", result.Message)
		resp.Body.Close()
	} else if err != nil {
		log.Printf("Self-healing failed: %v", err)
	} else {
		log.Printf("Self-healing failed with status: %d", resp.StatusCode)
	}
}

func startHeartbeat() {
	// Optimization: Use a persistent client with keep-alive
	client := &http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        10,
			IdleConnTimeout:     90 * time.Second,
			DisableKeepAlives:   false,
		},
	}

	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	log.Println("Starting Background Heartbeat Engine...")

	for {
		serverName := os.Getenv("WORKER_SERVER_NAME")
		if serverName == "" {
			hn, err := os.Hostname()
			if err == nil {
				serverName = hn
			} else {
				serverName = "unknown-go-worker"
			}
		}

		// Use REST API for Heartbeat
		apiBase := os.Getenv("API_URL")
		heartbeatURL := strings.Replace(apiBase, "report-task", "heartbeat", 1)
		workerKey := os.Getenv("WORKER_API_KEY")

		// Prepare payload with automatic detection
		payload := map[string]interface{}{
			"server_name":  serverName,
			"worker_count": 10, // Matching the server concurrency
			// IPAddress is left empty so the Backend detects it from the request
		}

		jsonData, _ := json.Marshal(payload)
		req, _ := http.NewRequest("POST", heartbeatURL, bytes.NewBuffer(jsonData))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Worker-Key", workerKey)

		resp, err := client.Do(req)
		if err == nil {
			if resp.StatusCode != http.StatusOK {
				log.Printf("Heartbeat warning: API returned status %d", resp.StatusCode)
			}
			resp.Body.Close()
		} else {
			log.Printf("Heartbeat error: %v", err)
		}

		<-ticker.C
	}
}
