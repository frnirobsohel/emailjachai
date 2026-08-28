package service

import (
	"time"

	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/pkg/config"
	"ejp-backend/pkg/logger"
)

// staleWorkerCutoff is how long a worker must be silent before we reclaim its tasks.
// 3 × heartbeat interval (60s) gives a safe buffer against transient network blips.
const staleWorkerCutoff = 3 * time.Minute

// staleWatchdogInterval controls how often the watchdog scans for crashed workers.
const staleWatchdogInterval = 2 * time.Minute

type ServerService interface {
	ListServers() ([]model.WorkerServer, error)
	GetActiveTasksCountByWorker() ([]repo.WorkerTaskSummary, error)
	GetOrProvisionWorkerKey() (plainKey, maskedKey string, err error)
	RotateWorkerKey() (newKey, maskedKey string, err error)
	CheckAdminPassword(adminID uint, password string) (bool, error)
	GetByName(name string) (*model.WorkerServer, error)
	CreateServer(server *model.WorkerServer) error
	GetByID(id uint) (*model.WorkerServer, error)
	UpdateFields(id uint, updates map[string]interface{}) error
	ToggleServer(id uint, enabled bool) error
	DeleteServer(id uint) error
	// StaleWorkerWatchdog runs as a long-lived background goroutine.
	// It periodically detects workers that have stopped heartbeating and
	// reclaims their in-flight job_tasks so healthy workers can take over.
	StaleWorkerWatchdog()
}

type serverService struct {
	repo    repo.ServerRepo
	jobRepo repo.JobRepository
}

func NewServerService(repo repo.ServerRepo, jobRepo repo.JobRepository) ServerService {
	return &serverService{repo: repo, jobRepo: jobRepo}
}

func (s *serverService) ListServers() ([]model.WorkerServer, error) {
	return s.repo.List()
}

func (s *serverService) GetActiveTasksCountByWorker() ([]repo.WorkerTaskSummary, error) {
	return s.repo.GetActiveTasksCountByWorker()
}

func (s *serverService) GetOrProvisionWorkerKey() (plainKey, maskedKey string, err error) {
	return s.repo.GetOrProvisionWorkerKey()
}

func (s *serverService) RotateWorkerKey() (newKey, maskedKey string, err error) {
	return s.repo.RotateWorkerKey()
}

func (s *serverService) CheckAdminPassword(adminID uint, password string) (bool, error) {
	return s.repo.CheckAdminPassword(adminID, password)
}

func (s *serverService) GetByName(name string) (*model.WorkerServer, error) {
	return s.repo.GetByName(name)
}

func (s *serverService) CreateServer(server *model.WorkerServer) error {
	return s.repo.Create(server)
}

func (s *serverService) GetByID(id uint) (*model.WorkerServer, error) {
	return s.repo.GetByID(id)
}

func (s *serverService) UpdateFields(id uint, updates map[string]interface{}) error {
	return s.repo.UpdateFields(id, updates)
}

func (s *serverService) ToggleServer(id uint, enabled bool) error {
	server, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}
	if err := s.repo.UpdateFields(id, map[string]interface{}{"enabled": enabled}); err != nil {
		return err
	}
	// Disable: release in-flight ownership so enabled peers can finish chunks.
	if !enabled {
		n, rerr := s.repo.ReclaimProcessingTasks(server.ServerName)
		if rerr != nil {
			logger.Error("Failed to reclaim tasks on worker disable", "server", server.ServerName, "error", rerr)
			return rerr
		}
		if n > 0 {
			logger.Info("Reclaimed processing tasks after disable", "server", server.ServerName, "tasks", n)
		}
	}
	return nil
}

func (s *serverService) DeleteServer(id uint) error {
	return s.repo.Delete(id)
}

// StaleWorkerWatchdog runs as a background goroutine (launched once at startup).
//
// Every staleWatchdogInterval it:
//  1. Queries for enabled worker servers whose last_ping is older than staleWorkerCutoff.
//  2. Reclaims their 'processing' job_tasks back to 'queued' in one DB transaction.
//  3. For each affected job, restores status to 'pending' so the UI and other workers
//     know work is available again.
//
// Safety properties:
//   - cutoff = 3 × heartbeat (60s) → transient network blips do not trigger reclaim.
//   - Only 'processing' tasks are touched; 'queued' and 'completed' tasks are untouched.
//   - Active Asynq tasks (chunks currently running on a live worker) survive — they will
//     finish and report normally. The DB task state catches up when the report arrives.
//   - All task updates happen in a single transaction → no partial reclaims.
func (s *serverService) StaleWorkerWatchdog() {
	logger.Info("StaleWorkerWatchdog: started")
	// Small initial delay so the rest of startup (DB migrations, routes) finishes first.
	time.Sleep(30 * time.Second)

	for {
		s.runStaleWorkerCycle()
		time.Sleep(staleWatchdogInterval)
	}
}

func (s *serverService) runStaleWorkerCycle() {
	cutoff := time.Now().UTC().Add(-staleWorkerCutoff)

	staleWorkers, err := s.repo.FindStaleWorkers(cutoff)
	if err != nil {
		logger.Error("StaleWorkerWatchdog: failed to query stale workers", "error", err)
		return
	}
	if len(staleWorkers) == 0 {
		return // nothing to do this cycle
	}

	staleNames := make([]string, 0, len(staleWorkers))
	for _, w := range staleWorkers {
		staleNames = append(staleNames, w.ServerName)
	}

	reclaimed, affectedJobIDs, err := s.repo.ReclaimStaleWorkerTasks(staleNames)
	if err != nil {
		logger.Error("StaleWorkerWatchdog: failed to reclaim tasks", "stale_workers", staleNames, "error", err)
		return
	}
	if reclaimed == 0 {
		return // stale workers had no in-flight tasks (already idle)
	}

	logger.Info("StaleWorkerWatchdog: reclaimed tasks from crashed workers",
		"stale_workers", staleNames,
		"tasks_reclaimed", reclaimed,
		"affected_jobs", len(affectedJobIDs),
	)

	// Restore affected job statuses to 'pending' so workers pick up the queued tasks.
	db := config.DB
	if db == nil && s.jobRepo != nil {
		db = s.jobRepo.DB()
	}
	if db != nil {
		for _, jobID := range affectedJobIDs {
			res := db.Model(&model.Job{}).
				Where("job_id = ? AND status = 'processing'", jobID).
				Update("status", "pending")
			if res.Error != nil {
				logger.Error("StaleWorkerWatchdog: failed to reset job status",
					"job_id", jobID, "error", res.Error)
			} else if res.RowsAffected > 0 {
				logger.Info("StaleWorkerWatchdog: job restored to pending",
					"job_id", jobID)
			}
		}
	}
}
