package service

import (
	"errors"
	"fmt"
	"time"
	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/verifier"
)

type JobService interface {
	GetJobs(userID uint, jobType string, limit, offset int) ([]model.Job, error)
	GetJobStatus(userID uint, jobID string) (*model.Job, *model.JobResult, error)
	DeleteJob(userID uint, jobID string) error
	VerifySingle(userID uint, email string) (*model.Job, *model.JobResult, error)
}

type jobService struct {
	jobRepo       repo.JobRepository
	jobResultRepo repo.JobResultRepo
	userRepo      repo.UserRepo
	txRepo        repo.TransactionRepo
}

func NewJobService(jobRepo repo.JobRepository, jobResultRepo repo.JobResultRepo, userRepo repo.UserRepo, txRepo repo.TransactionRepo) JobService {
	return &jobService{
		jobRepo:       jobRepo,
		jobResultRepo: jobResultRepo,
		userRepo:      userRepo,
		txRepo:        txRepo,
	}
}

func (s *jobService) GetJobs(userID uint, jobType string, limit, offset int) ([]model.Job, error) {
	return s.jobRepo.List(userID, jobType, limit, offset)
}

func (s *jobService) GetJobStatus(userID uint, jobID string) (*model.Job, *model.JobResult, error) {
	job, err := s.jobRepo.GetByID(jobID)
	if err != nil {
		return nil, nil, err
	}

	if job.UserID != userID {
		return nil, nil, errors.New("unauthorized")
	}

	var result *model.JobResult
	if job.JobType == "single" {
		results, err := s.jobResultRepo.GetByJobID(job.ID)
		if err == nil && len(results) > 0 {
			result = &results[0]
		}
	}

	return job, result, nil
}

func (s *jobService) DeleteJob(userID uint, jobID string) error {
	job, err := s.jobRepo.GetByID(jobID)
	if err != nil {
		return err
	}

	if job.UserID != userID {
		return errors.New("unauthorized")
	}

	err = s.jobResultRepo.DeleteByJobID(job.ID)
	if err != nil {
		return err
	}

	return s.jobRepo.Delete(jobID, userID)
}


func (s *jobService) VerifySingle(userID uint, email string) (*model.Job, *model.JobResult, error) {
	// 1. Get user
	user, err := s.userRepo.GetByID(userID)
	if err != nil {
		return nil, nil, err
	}

	// 2. Check credits
	if user.Credits <= 0 {
		return nil, nil, errors.New("insufficient credits")
	}

	// 3. Verify email
	res := verifier.VerifyEmail(email)

	// 4. Deduct credit (1 for single verify)
	err = s.userRepo.Update(user, map[string]interface{}{
		"credits": user.Credits - 1,
	})
	if err != nil {
		return nil, nil, err
	}

	// 4b. Log transaction
	txnID := fmt.Sprintf("TXN_%x%s", time.Now().Unix(), helper.GenerateRandomHex(4))
	transaction := &model.Transaction{
		UserID:        userID,
		TransactionID: txnID,
		Amount:        0,
		CreditsAdded:  -1,
		Type:          "usage",
		Status:        "completed",
		Description:   "Single Verify: " + email,
		Provider:      "system",
	}
	s.txRepo.Create(transaction)

	// 5. Create a Job for tracking (type: single)
	jobID := "single_" + helper.GenerateRandomHex(5)
	job := &model.Job{
		UserID:         userID,
		JobID:          jobID,
		Email:          email,
		Filename:       "Single Verification",
		Status:         "completed",
		JobType:        "single",
		TotalEmails:    1,
		ProcessedCount: 1,
	}

	// Map status to job results for dashboard counts
	switch res.Status {
	case "valid":
		job.Deliverable = 1
	case "invalid":
		job.Undeliverable = 1
	case "catch_all":
		job.CatchAll = 1
	case "disposable":
		job.Disposable = 1
	}

	if err := s.jobRepo.Create(job); err != nil {
		return nil, nil, err
	}

	// 6. Create JobResult
	result := &model.JobResult{
		JobInternalID: job.ID,
		Email:         email,
		Status:        res.Status,
		Score:         res.Score,
		IsDeliverable: res.Deliverable,
		IsCatchAll:    res.CatchAll,
		MailboxFull:   res.MailboxFull,
		IsSyntaxValid: res.SyntaxValid,
		SmtpConnect:   res.SMTPConnect,
		HasMx:         res.HasMX,
		IsFree:        res.IsFree,
		IsRole:        res.IsRole,
		IsSpamTrap:    res.IsSpamTrap,
		IsBlacklisted: res.IsBlacklisted,
		ProcessingTime: res.ProcessingTime,
		Reason:        res.Reason,
	}

	if err := s.jobResultRepo.Create(result); err != nil {
		return nil, nil, err
	}

	return job, result, nil
}
