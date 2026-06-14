package main

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
)

func main() {
	// 1. Generate 500 random emails
	var content bytes.Buffer
	for i := 1; i <= 500; i++ {
		content.WriteString(fmt.Sprintf("testuser%d@gmail.com\n", i))
	}

	// 2. Prepare multipart form
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, _ := writer.CreateFormFile("file", "test_500_emails.txt")
	part.Write(content.Bytes())
	writer.Close()

	// 3. Send request to API
	// Note: Replace with your actual API key and URL
	req, _ := http.NewRequest("POST", "http://localhost:8000/api/v1/jobs/submit-file", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	
	// Use the test key we just created
	req.Header.Set("Authorization", "Bearer ak_live_test_key_1234567890abcdef") 

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("Error submitting job: %v\n", err)
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	fmt.Printf("Status: %d\nResponse: %s\n", resp.StatusCode, string(respBody))
}



