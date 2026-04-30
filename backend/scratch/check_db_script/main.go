package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	db, err := sql.Open("sqlite3", "ejp.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT id, transaction_id, type, description, package, credits_added FROM transactions ORDER BY id DESC LIMIT 5")
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var txnID, typ, desc, pkg string
		var creditsAdded int
		err = rows.Scan(&id, &txnID, &typ, &desc, &pkg, &creditsAdded)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("ID: %d, TxnID: '%s', Type: %s, Desc: '%s', Pkg: '%s', Credits: %d\n", id, txnID, typ, desc, pkg, creditsAdded)
	}
}
