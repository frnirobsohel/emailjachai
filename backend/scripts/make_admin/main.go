package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
)

func main() {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		connStr = "postgres://postgres:Pass321@localhost:5432/emailjachaipro?sslmode=disable"
	}
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Give credits to the test user created by test_runner.js
	// We'll update any user with email starting with 'test' to have 1000 credits and role 'admin'
	// so we can test both bulk upload and admin APIs with the same account.
	result, err := db.Exec("UPDATE users SET credits = 1000, role = 'admin' WHERE email LIKE 'test%'")
	if err != nil {
		log.Fatal(err)
	}

	rowsAffected, _ := result.RowsAffected()
	fmt.Printf("Updated %d users to admin with 1000 credits.\n", rowsAffected)
}
