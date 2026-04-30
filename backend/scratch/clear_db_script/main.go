package main

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	_ = godotenv.Load("../.env")
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL not set")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("Dropping all tables in the public schema using GORM...")

	var tables []string
	db.Raw(`
		SELECT tablename 
		FROM pg_catalog.pg_tables 
		WHERE schemaname = 'public'
	`).Scan(&tables)

	for _, table := range tables {
		fmt.Printf("Dropping table: %s\n", table)
		db.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %s CASCADE", table))
	}

	fmt.Println("Database cleared successfully!")
}



