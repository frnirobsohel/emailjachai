package main

import (
	"ejp-backend/internal/model"
	"ejp-backend/pkg/config"
	"fmt"
	"log"
)

func main() {
	config.LoadConfig()
	config.ConnectDB()

	var txns []model.Transaction
	if err := config.DB.Order("id DESC").Limit(5).Find(&txns).Error; err != nil {
		log.Fatal(err)
	}

	for _, t := range txns {
		fmt.Printf("ID: %d, TxnID: '%s', Type: %s, Desc: '%s', Pkg: '%s', Credits: %d\n", t.ID, t.TransactionID, t.Type, t.Description, t.Package, t.CreditsAdded)
	}
}
