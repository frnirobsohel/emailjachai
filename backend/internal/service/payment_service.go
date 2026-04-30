package service

import (
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
)

type PaymentService interface {
	ProcessWebhook(provider string, payload interface{}) error
	CreatePaymentSession(userID uint, packageID uint, provider string) (string, error)
	GetTransactionHistory(userID uint, limit, offset int) ([]model.Transaction, int64, error)
	GetTransactionSummary(userID uint) (int64, int64, error)
}

type paymentService struct {
	txRepo      repo.TransactionRepo
	packageRepo repo.PackageRepo
	userRepo    repo.UserRepo
}

func NewPaymentService(txRepo repo.TransactionRepo, packageRepo repo.PackageRepo, userRepo repo.UserRepo) PaymentService {
	return &paymentService{
		txRepo:      txRepo,
		packageRepo: packageRepo,
		userRepo:    userRepo,
	}
}

func (s *paymentService) ProcessWebhook(provider string, payload interface{}) error {
	// Webhook processing logic
	return nil
}

func (s *paymentService) CreatePaymentSession(userID uint, packageID uint, provider string) (string, error) {
	// Session creation logic
	return "https://checkout.example.com", nil
}

func (s *paymentService) GetTransactionHistory(userID uint, limit, offset int) ([]model.Transaction, int64, error) {
	total, err := s.txRepo.Count(userID)
	if err != nil {
		return nil, 0, err
	}

	txs, err := s.txRepo.List(userID, limit, offset)
	if err != nil {
		return nil, 0, err
	}

	return txs, total, nil
}

func (s *paymentService) GetTransactionSummary(userID uint) (int64, int64, error) {
	return s.txRepo.GetUserSummary(userID)
}
