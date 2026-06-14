package main

import (
	"fmt"
	"log"

	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/service"
	"ejp-backend/pkg/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	dsn := "postgres://postgres:Pass321@localhost:5432/emailjachaipro?sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	config.DB = db

	// Auto-migrate to be safe
	db.AutoMigrate(&model.User{}, &model.Transaction{})

	// Create a reseller user
	reseller := model.User{
		Email:    "reseller_test@example.com",
		Password: "password123",
		Name:     "Test Reseller",
		Role:     "reseller",
		Credits:  5000,
	}
	// Try to create or find
	if err := db.Where("email = ?", reseller.Email).FirstOrCreate(&reseller).Error; err != nil {
		log.Fatalf("Failed to create reseller: %v", err)
	}
	
	// Reset credits for consistent test
	db.Model(&reseller).Update("credits", 5000)

	// Create a normal user
	normalUser := model.User{
		Email:    "normal_test@example.com",
		Password: "password123",
		Name:     "Test User",
		Role:     "user",
		Credits:  100,
	}
	if err := db.Where("email = ?", normalUser.Email).FirstOrCreate(&normalUser).Error; err != nil {
		log.Fatalf("Failed to create normal user: %v", err)
	}
	
	db.Model(&normalUser).Update("credits", 100)

	// Setup service
	userRepo := repo.NewUserRepo()
	txRepo := repo.NewTransactionRepo()
	resellerService := service.NewResellerService(userRepo, txRepo)

	fmt.Println("Before Transfer:")
	fmt.Printf("Reseller Credits: %d\n", reseller.Credits)
	fmt.Printf("Normal User Credits: %d\n", normalUser.Credits)

	// Perform transfer of 500 credits
	amount := 500
	fmt.Printf("Transferring %d credits...\n", amount)
	err = resellerService.TransferCredits(reseller.ID, normalUser.Email, amount)
	if err != nil {
		log.Fatalf("Transfer failed: %v", err)
	}

	// Fetch updated users
	db.First(&reseller, reseller.ID)
	db.First(&normalUser, normalUser.ID)

	fmt.Println("After Transfer:")
	fmt.Printf("Reseller Credits: %d\n", reseller.Credits)
	fmt.Printf("Normal User Credits: %d\n", normalUser.Credits)

	if reseller.Credits == 4500 && normalUser.Credits == 600 {
		fmt.Println("SUCCESS: Transfer worked perfectly!")
	} else {
		fmt.Println("FAILED: Transfer amounts are incorrect.")
	}
}
