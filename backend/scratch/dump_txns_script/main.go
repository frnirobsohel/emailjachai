package main

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"
	"encoding/json"
	"fmt"
	"log"
)

func main() {
	config.LoadConfig()
	config.ConnectDB()

	var txns []model.Transaction
	if err := config.DB.Find(&txns).Error; err != nil {
		log.Fatal(err)
	}

	b, _ := json.MarshalIndent(txns, "", "  ")
	fmt.Println(string(b))
}
