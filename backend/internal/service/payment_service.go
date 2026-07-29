package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/logger"
	"ejp-backend/pkg/safe"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type PaymentService interface {
	ProcessWebhook(provider string, rawBody []byte, headers map[string]string) error
	CreatePaymentSession(userID uint, packageID uint, provider string) (string, error)
	VerifyPayment(userID uint, transactionID string) (string, error)
	CapturePayPalOrder(userID uint, orderID string) error
	GetTransactionHistory(userID uint, limit, offset int) ([]model.Transaction, int64, error)
	GetTransactionSummary(userID uint) (int64, int64, error)
}

type paymentService struct {
	txRepo       repo.TransactionRepo
	packageRepo  repo.PackageRepo
	userRepo     repo.UserRepo
	emailService EmailService
	settingsRepo repo.SettingsRepo
}

func NewPaymentService(txRepo repo.TransactionRepo, packageRepo repo.PackageRepo, userRepo repo.UserRepo, emailService EmailService, settingsRepo repo.SettingsRepo) PaymentService {
	return &paymentService{
		txRepo:       txRepo,
		packageRepo:  packageRepo,
		userRepo:     userRepo,
		emailService: emailService,
		settingsRepo: settingsRepo,
	}
}

func (s *paymentService) ProcessWebhook(provider string, rawBody []byte, headers map[string]string) error {
	switch provider {
	case "stripe":
		creds := s.getStripeCredentials()
		if creds == nil {
			return fmt.Errorf("Stripe is not enabled")
		}
		sigHeader := headers["Stripe-Signature"]
		if sigHeader == "" {
			sigHeader = headers["stripe-signature"] // try lowercase
		}
		if sigHeader == "" {
			return fmt.Errorf("missing Stripe-Signature header")
		}

		if !verifyStripeSignature(rawBody, sigHeader, creds.WebhookSecret) {
			return fmt.Errorf("invalid stripe signature")
		}

		var event struct {
			Type string `json:"type"`
			Data struct {
				Object map[string]interface{} `json:"object"`
			} `json:"data"`
		}
		if err := json.Unmarshal(rawBody, &event); err != nil {
			return fmt.Errorf("failed to decode Stripe webhook JSON: %v", err)
		}

		if event.Type == "checkout.session.completed" {
			session := event.Data.Object
			sessionID, _ := session["id"].(string)
			paymentStatus, _ := session["payment_status"].(string)

			if sessionID != "" && paymentStatus == "paid" {
				return s.fulfillPaymentMapping("stripe_session_"+sessionID, "Stripe")
			}
		}
		return nil

	case "paypal":
		creds := s.getPayPalCredentials()
		if creds == nil {
			return fmt.Errorf("PayPal is not enabled")
		}

		token, err := s.getPayPalToken(creds)
		if err != nil {
			return fmt.Errorf("PayPal auth failed: %v", err)
		}

		type VerifyPayload struct {
			AuthAlgo         string      `json:"auth_algo"`
			CertURL          string      `json:"cert_url"`
			TransmissionID   string      `json:"transmission_id"`
			TransmissionSig  string      `json:"transmission_sig"`
			TransmissionTime string      `json:"transmission_time"`
			WebhookID        string      `json:"webhook_id"`
			WebhookEvent     interface{} `json:"webhook_event"`
		}

		var rawEvent interface{}
		if err := json.Unmarshal(rawBody, &rawEvent); err != nil {
			return fmt.Errorf("failed to parse raw paypal body: %v", err)
		}

		// Support both casing formats in HTTP headers
		getPayPalHeader := func(key string) string {
			if v, ok := headers[key]; ok {
				return v
			}
			return headers[strings.ToLower(key)]
		}

		verifyPayload := VerifyPayload{
			AuthAlgo:         getPayPalHeader("Paypal-Auth-Algo"),
			CertURL:          getPayPalHeader("Paypal-Cert-Url"),
			TransmissionID:   getPayPalHeader("Paypal-Transmission-Id"),
			TransmissionSig:  getPayPalHeader("Paypal-Transmission-Sig"),
			TransmissionTime: getPayPalHeader("Paypal-Transmission-Time"),
			WebhookID:        creds.WebhookID,
			WebhookEvent:     rawEvent,
		}

		verifyBytes, err := json.Marshal(verifyPayload)
		if err != nil {
			return err
		}

		verifyURL := "https://api-m.paypal.com/v1/notifications/verify-webhook-signature"
		if creds.TestMode {
			verifyURL = "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature"
		}

		req, err := http.NewRequest("POST", verifyURL, bytes.NewBuffer(verifyBytes))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)

		client := &http.Client{Timeout: 20 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()

		var verifyResult struct {
			VerificationStatus string `json:"verification_status"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&verifyResult); err != nil {
			return err
		}

		if verifyResult.VerificationStatus != "SUCCESS" {
			return fmt.Errorf("PayPal signature verification failed: status is %s", verifyResult.VerificationStatus)
		}

		var event struct {
			EventType string                 `json:"event_type"`
			Resource  map[string]interface{} `json:"resource"`
		}
		if err := json.Unmarshal(rawBody, &event); err != nil {
			return err
		}

		if event.EventType == "CHECKOUT.ORDER.APPROVED" {
			orderID, _ := event.Resource["id"].(string)
			if orderID == "" {
				return nil
			}
			if err := s.capturePayPalOrder(creds, orderID); err != nil {
				logger.Error("PayPal capture after APPROVED failed", "order_id", orderID, "error", err)
				return errors.New("PayPal capture failed")
			}
			return s.fulfillPaymentMapping("paypal_order_"+orderID, "PayPal")
		}

		if event.EventType == "PAYMENT.CAPTURE.COMPLETED" {
			status, _ := event.Resource["status"].(string)
			if status == "COMPLETED" {
				if sup, ok := event.Resource["supplementary_data"].(map[string]interface{}); ok {
					if rel, ok := sup["related_ids"].(map[string]interface{}); ok {
						orderID, _ := rel["order_id"].(string)
						if orderID != "" {
							return s.fulfillPaymentMapping("paypal_order_"+orderID, "PayPal")
						}
					}
				}
			}
		}
		return nil

	case "cryptomus":
		creds := s.getCryptomusCredentials()
		if creds == nil {
			return fmt.Errorf("Cryptomus is not enabled")
		}

		var data map[string]interface{}
		if err := json.Unmarshal(rawBody, &data); err != nil {
			return fmt.Errorf("failed to decode Cryptomus JSON: %v", err)
		}

		sign, _ := data["sign"].(string)
		if sign == "" {
			return fmt.Errorf("missing Cryptomus signature")
		}

		delete(data, "sign")

		keys := make([]string, 0, len(data))
		for k := range data {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		orderedData := make(map[string]interface{})
		for _, k := range keys {
			orderedData[k] = data[k]
		}

		jsonData, err := json.Marshal(orderedData)
		if err != nil {
			return err
		}

		b64Data := base64.StdEncoding.EncodeToString(jsonData)
		expectedSign := fmt.Sprintf("%x", md5.Sum([]byte(b64Data+creds.PaymentKey)))

		if sign != expectedSign {
			return fmt.Errorf("invalid Cryptomus signature")
		}

		status, _ := data["status"].(string)
		orderID, _ := data["order_id"].(string)

		if (status == "paid" || status == "paid_over") && orderID != "" {
			return s.fulfillPaymentMapping("cryptomus_order_"+orderID, "Cryptomus")
		}
		return nil

	case "manual":
		if os.Getenv("GO_ENV") == "production" {
			return fmt.Errorf("security alert: manual payment provider is disabled in production")
		}
		var payload interface{}
		if err := json.Unmarshal(rawBody, &payload); err != nil {
			return err
		}
		return s.completeManualPayment(payload)

	default:
		return fmt.Errorf("unsupported payment provider: %s", provider)
	}
}

func (s *paymentService) CreatePaymentSession(userID uint, packageID uint, provider string) (string, error) {
	pkg, err := s.packageRepo.GetByID(packageID)
	if err != nil || pkg == nil {
		return "", errors.New("package not found")
	}
	if pkg.Status != "active" || !pkg.IsPublic {
		return "", errors.New("package not available")
	}
	if pkg.Price <= 0 || pkg.CreditsAmount <= 0 {
		return "", errors.New("package not available for paid checkout")
	}

	// Expire abandoned pending purchase rows (24h+)
	_ = s.txRepo.DB().Model(&model.Transaction{}).
		Where("user_id = ? AND type = 'purchase' AND status = 'pending' AND created_at < ?", userID, time.Now().Add(-24*time.Hour)).
		Update("status", "expired").Error

	txnID := fmt.Sprintf("st_%d_%d_%d", userID, packageID, time.Now().UnixNano())
	transaction := &model.Transaction{
		UserID:        userID,
		TransactionID: txnID,
		Amount:        pkg.Price,
		CreditsAdded:  int(pkg.CreditsAmount),
		Type:          "purchase",
		Status:        "pending",
		Package:       pkg.Name,
		Description:   fmt.Sprintf("%s: %s (%s)", capitalize(provider), pkg.Name, txnID),
		Provider:      provider,
	}

	if err := s.txRepo.Create(transaction); err != nil {
		logger.Error("Failed to initialize payment transaction", "user_id", userID, "error", err)
		return "", errors.New("failed to initialize transaction")
	}

	switch provider {
	case "stripe":
		creds := s.getStripeCredentials()
		if creds == nil {
			return "", errors.New("Stripe is not enabled")
		}

		amountCents := int(pkg.Price * 100)
		if amountCents < 1 {
			return "", errors.New("package not available for paid checkout")
		}

		form := url.Values{}
		form.Add("payment_method_types[0]", "card")
		form.Add("line_items[0][price_data][currency]", "usd")
		form.Add("line_items[0][price_data][product_data][name]", pkg.Name+" Plan")
		form.Add("line_items[0][price_data][unit_amount]", fmt.Sprintf("%d", amountCents))
		form.Add("line_items[0][quantity]", "1")
		form.Add("mode", "payment")
		form.Add("success_url", s.getBaseURL()+"/dashboard/credits?status=success&session_id={CHECKOUT_SESSION_ID}")
		form.Add("cancel_url", s.getBaseURL()+"/dashboard/credits?status=cancelled")
		form.Add("client_reference_id", txnID)
		form.Add("metadata[user_id]", fmt.Sprintf("%d", userID))
		form.Add("metadata[pkg_id]", fmt.Sprintf("%d", packageID))
		form.Add("metadata[credits]", fmt.Sprintf("%d", pkg.CreditsAmount))

		req, err := http.NewRequest("POST", "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(form.Encode()))
		if err != nil {
			return "", errors.New("failed to create payment session")
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.SetBasicAuth(creds.SecretKey, "")

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			logger.Error("Stripe session request failed", "error", err)
			return "", errors.New("failed to create payment session")
		}
		defer resp.Body.Close()

		var result map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", errors.New("failed to create payment session")
		}

		if errMsg, ok := result["error"].(map[string]interface{}); ok {
			logger.Error("Stripe API error", "message", errMsg["message"])
			return "", errors.New("failed to create payment session")
		}

		sessionID, ok := result["id"].(string)
		if !ok {
			return "", errors.New("failed to create payment session")
		}

		checkoutURL, ok := result["url"].(string)
		if !ok {
			return "", errors.New("failed to create payment session")
		}

		transaction.ExternalID = "stripe_session_" + sessionID
		if err := s.txRepo.Update(transaction); err != nil {
			logger.Error("Failed to update stripe transaction", "error", err)
			return "", errors.New("failed to create payment session")
		}

		return checkoutURL, nil

	case "paypal":
		creds := s.getPayPalCredentials()
		if creds == nil {
			return "", errors.New("PayPal is not enabled")
		}

		token, err := s.getPayPalToken(creds)
		if err != nil {
			logger.Error("PayPal auth failed", "error", err)
			return "", errors.New("PayPal is temporarily unavailable")
		}

		paypalURL := "https://api-m.paypal.com/v2/checkout/orders"
		if creds.TestMode {
			paypalURL = "https://api-m.sandbox.paypal.com/v2/checkout/orders"
		}

		type AmountStruct struct {
			CurrencyCode string `json:"currency_code"`
			Value        string `json:"value"`
		}
		type PurchaseUnit struct {
			Amount      AmountStruct `json:"amount"`
			Description string       `json:"description"`
			CustomID    string       `json:"custom_id"`
		}
		type ApplicationContext struct {
			ReturnURL  string `json:"return_url"`
			CancelURL  string `json:"cancel_url"`
			UserAction string `json:"user_action"`
		}
		type PayPalPayload struct {
			Intent             string             `json:"intent"`
			PurchaseUnits      []PurchaseUnit     `json:"purchase_units"`
			ApplicationContext ApplicationContext `json:"application_context"`
		}

		payload := PayPalPayload{
			Intent: "CAPTURE",
			PurchaseUnits: []PurchaseUnit{
				{
					Amount: AmountStruct{
						CurrencyCode: "USD",
						Value:        fmt.Sprintf("%.2f", pkg.Price),
					},
					Description: pkg.Name + " Plan",
					CustomID:    txnID,
				},
			},
			ApplicationContext: ApplicationContext{
				ReturnURL:  s.getBaseURL() + "/dashboard/credits?status=success&provider=paypal",
				CancelURL:  s.getBaseURL() + "/dashboard/credits?status=cancelled",
				UserAction: "PAY_NOW",
			},
		}

		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			return "", errors.New("failed to create payment session")
		}

		req, err := http.NewRequest("POST", paypalURL, bytes.NewBuffer(bodyBytes))
		if err != nil {
			return "", errors.New("failed to create payment session")
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			logger.Error("PayPal order request failed", "error", err)
			return "", errors.New("failed to create payment session")
		}
		defer resp.Body.Close()

		var result map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", errors.New("failed to create payment session")
		}

		paypalOrderID, ok := result["id"].(string)
		if !ok {
			logger.Error("PayPal order creation failed", "result", result)
			return "", errors.New("failed to create payment session")
		}

		transaction.ExternalID = "paypal_order_" + paypalOrderID
		if err := s.txRepo.Update(transaction); err != nil {
			logger.Error("Failed to update paypal transaction", "error", err)
			return "", errors.New("failed to create payment session")
		}

		var approvalURL string
		if links, ok := result["links"].([]interface{}); ok {
			for _, l := range links {
				if linkMap, ok := l.(map[string]interface{}); ok {
					if linkMap["rel"] == "approve" {
						approvalURL, _ = linkMap["href"].(string)
						break
					}
				}
			}
		}

		if approvalURL == "" {
			return "", errors.New("failed to create payment session")
		}

		return approvalURL, nil

	case "cryptomus":
		creds := s.getCryptomusCredentials()
		if creds == nil {
			return "", errors.New("Cryptomus is not enabled")
		}

		orderID := fmt.Sprintf("order_%d_%d_%d", userID, packageID, time.Now().UnixNano())
		amountStr := fmt.Sprintf("%.2f", pkg.Price)

		type CryptomusPayload struct {
			Amount            string `json:"amount"`
			Currency          string `json:"currency"`
			OrderID           string `json:"order_id"`
			URLCallback       string `json:"url_callback"`
			URLSuccess        string `json:"url_success"`
			URLReturn         string `json:"url_return"`
			IsPaymentMultiple bool   `json:"is_payment_multiple"`
			Lifetime          int    `json:"lifetime"`
			ToCurrency        string `json:"to_currency"`
		}

		payload := CryptomusPayload{
			Amount:            amountStr,
			Currency:          "USD",
			OrderID:           orderID,
			URLCallback:       s.getBaseURL() + "/api/v1/payment/cryptomus/webhook",
			URLSuccess:        s.getBaseURL() + "/dashboard/credits?status=success&provider=cryptomus",
			URLReturn:         s.getBaseURL() + "/dashboard/credits?status=cancelled",
			IsPaymentMultiple: false,
			Lifetime:          3600,
			ToCurrency:        "USDT",
		}

		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			return "", errors.New("failed to create payment session")
		}

		b64Body := base64.StdEncoding.EncodeToString(bodyBytes)
		signStr := fmt.Sprintf("%x", md5.Sum([]byte(b64Body+creds.PaymentKey)))

		req, err := http.NewRequest("POST", "https://api.cryptomus.com/v1/payment", bytes.NewBuffer(bodyBytes))
		if err != nil {
			return "", errors.New("failed to create payment session")
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("merchant", creds.MerchantID)
		req.Header.Set("sign", signStr)

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			logger.Error("Cryptomus payment request failed", "error", err)
			return "", errors.New("failed to create payment session")
		}
		defer resp.Body.Close()

		var result map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", errors.New("failed to create payment session")
		}

		stateVal, _ := result["state"].(float64)
		if stateVal != 0 {
			msg, _ := result["message"].(string)
			logger.Error("Cryptomus API error", "message", msg)
			return "", errors.New("failed to create payment session")
		}

		resData, _ := result["result"].(map[string]interface{})
		paymentURL, _ := resData["url"].(string)
		if paymentURL == "" {
			return "", errors.New("failed to create payment session")
		}

		transaction.TransactionID = orderID
		transaction.ExternalID = "cryptomus_order_" + orderID
		if err := s.txRepo.Update(transaction); err != nil {
			logger.Error("Failed to update cryptomus transaction", "error", err)
			return "", errors.New("failed to create payment session")
		}

		return paymentURL, nil

	case "manual":
		if os.Getenv("GO_ENV") == "production" {
			return "", errors.New("manual payment is disabled in production")
		}
		return fmt.Sprintf("/dashboard/billing/manual-success?package_id=%d&provider=manual&txid=%s", packageID, txnID), nil

	default:
		return "", errors.New("payment provider is not configured")
	}
}

func (s *paymentService) VerifyPayment(userID uint, transactionID string) (string, error) {
	tx, err := s.txRepo.GetByTransactionOrExternalID(transactionID)
	if err != nil {
		return "not_found", nil
	}
	if tx.UserID != userID {
		return "not_found", nil
	}

	return tx.Status, nil
}

func (s *paymentService) CapturePayPalOrder(userID uint, orderID string) error {
	orderID = strings.TrimSpace(orderID)
	if orderID == "" {
		return errors.New("order id required")
	}

	mapKey := "paypal_order_" + orderID
	txn, err := s.txRepo.GetByExternalID(mapKey)
	if err != nil || txn == nil || txn.UserID != userID {
		return errors.New("payment not found")
	}
	if txn.Status == "completed" {
		return nil
	}
	if txn.Status != "pending" && txn.Status != "expired" {
		return errors.New("payment not found")
	}

	creds := s.getPayPalCredentials()
	if creds == nil {
		return errors.New("PayPal is not enabled")
	}

	if err := s.capturePayPalOrder(creds, orderID); err != nil {
		logger.Error("PayPal capture failed", "order_id", orderID, "user_id", userID, "error", err)
		return errors.New("PayPal capture failed")
	}

	return s.fulfillPaymentMapping(mapKey, "PayPal")
}

// capturePayPalOrder calls PayPal Orders Capture API.
func (s *paymentService) capturePayPalOrder(creds *PayPalCredentials, orderID string) error {
	token, err := s.getPayPalToken(creds)
	if err != nil {
		return err
	}

	captureURL := "https://api-m.paypal.com/v2/checkout/orders/" + orderID + "/capture"
	if creds.TestMode {
		captureURL = "https://api-m.sandbox.paypal.com/v2/checkout/orders/" + orderID + "/capture"
	}

	req, err := http.NewRequest("POST", captureURL, bytes.NewBuffer([]byte("{}")))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		// Idempotent: already captured is OK
		var parsed map[string]interface{}
		_ = json.Unmarshal(body, &parsed)
		if name, ok := parsed["name"].(string); ok && (name == "ORDER_ALREADY_CAPTURED" || name == "UNPROCESSABLE_ENTITY") {
			details, _ := parsed["details"].([]interface{})
			for _, d := range details {
				if dm, ok := d.(map[string]interface{}); ok {
					if issue, _ := dm["issue"].(string); issue == "ORDER_ALREADY_CAPTURED" {
						return nil
					}
				}
			}
			if name == "ORDER_ALREADY_CAPTURED" {
				return nil
			}
		}
		return fmt.Errorf("paypal capture status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

func (s *paymentService) completeManualPayment(payload interface{}) error {
	data, ok := payload.(map[string]interface{})
	if !ok {
		return fmt.Errorf("invalid payload format for manual provider")
	}

	var userID uint
	var packageID uint

	if val, ok := data["user_id"]; ok {
		if fv, ok := val.(float64); ok {
			userID = uint(fv)
		} else {
			return fmt.Errorf("invalid user_id type: expected float64")
		}
	} else {
		return fmt.Errorf("missing user_id in payload")
	}

	if val, ok := data["package_id"]; ok {
		if fv, ok := val.(float64); ok {
			packageID = uint(fv)
		} else {
			return fmt.Errorf("invalid package_id type: expected float64")
		}
	} else {
		return fmt.Errorf("missing package_id in payload")
	}

	if userID == 0 || packageID == 0 {
		return fmt.Errorf("user_id and package_id must be non-zero")
	}

	pkg, err := s.packageRepo.GetByID(packageID)
	if err != nil || pkg == nil {
		return fmt.Errorf("package not found for ID: %d", packageID)
	}

	err = s.userRepo.AddCredits(userID, int(pkg.CreditsAmount), "purchase", fmt.Sprintf("Payment: %s", pkg.Name), "manual")
	if err == nil {
		user, getErr := s.userRepo.GetByID(userID)
		if getErr == nil && user != nil {
			// Broadcast updated credits and stats in real-time
			ws.GlobalHub.BroadcastToUser(user.ID, "user_update", map[string]interface{}{
				"credits": user.Credits,
			})
			InvalidateAndRefreshDashboardStats(user.ID)

			go s.emailService.SendTemplateEmail(user.Email, "buy_credits", map[string]string{
				"name":     user.Name,
				"credits":  fmt.Sprintf("%d", pkg.CreditsAmount),
				"order_id": fmt.Sprintf("MANUAL_%d", time.Now().Unix()),
			})
			go s.emailService.SendTemplateEmail(user.Email, "transaction", map[string]string{
				"name":   user.Name,
				"txn_id": fmt.Sprintf("MANUAL_%d", time.Now().Unix()),
				"amount": fmt.Sprintf("%.2f", pkg.Price),
			})
		}
	}
	return err
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

// Private Helpers

func (s *paymentService) getBaseURL() string {
	var sDB model.Setting
	if err := s.settingsRepo.DB().Where("setting_key = 'api_base_url'").First(&sDB).Error; err == nil {
		url := strings.TrimSpace(sDB.SettingValue)
		if url != "" {
			return strings.TrimSuffix(url, "/")
		}
	}
	frontendURL := strings.TrimSpace(os.Getenv("FRONTEND_URL"))
	if frontendURL != "" {
		return strings.TrimSuffix(frontendURL, "/")
	}
	return "http://localhost:3000"
}

func (s *paymentService) getGatewaySettings(prefix string) map[string]string {
	var settings []model.Setting
	s.settingsRepo.DB().Where("setting_key LIKE ?", prefix+"_%").Find(&settings)
	
	sensitiveKeys := map[string]bool{
		"stripe_secret_key":        true,
		"stripe_webhook_secret":    true,
		"paypal_secret_key":        true,
		"paypal_webhook_id":        true,
		"cryptomus_payment_key":    true,
		"cryptomus_secret_key":     true,
		"cryptomus_webhook_secret": true,
	}

	res := make(map[string]string)
	for _, sDB := range settings {
		val := sDB.SettingValue
		if sensitiveKeys[sDB.SettingKey] && val != "" {
			dec, err := helper.DecryptSecret(val)
			if err == nil {
				val = dec
			}
		}
		res[sDB.SettingKey] = val
	}
	return res
}

func (s *paymentService) getStripeCredentials() *StripeCredentials {
	creds := s.getGatewaySettings("stripe")
	if creds["stripe_enabled"] != "1" {
		return nil
	}
	return &StripeCredentials{
		PublicKey:     creds["stripe_public_key"],
		SecretKey:     creds["stripe_secret_key"],
		WebhookSecret: creds["stripe_webhook_secret"],
		TestMode:      creds["stripe_test_mode"] == "1",
	}
}

type StripeCredentials struct {
	PublicKey     string
	SecretKey     string
	WebhookSecret string
	TestMode      bool
}

func (s *paymentService) getPayPalCredentials() *PayPalCredentials {
	creds := s.getGatewaySettings("paypal")
	if creds["paypal_enabled"] != "1" {
		return nil
	}
	return &PayPalCredentials{
		ClientID:  creds["paypal_public_key"],
		Secret:    creds["paypal_secret_key"],
		WebhookID: creds["paypal_webhook_id"],
		TestMode:  creds["paypal_test_mode"] == "1",
	}
}

type PayPalCredentials struct {
	ClientID  string
	Secret    string
	WebhookID string
	TestMode  bool
}

func (s *paymentService) getPayPalToken(creds *PayPalCredentials) (string, error) {
	urlVal := "https://api-m.paypal.com/v1/oauth2/token"
	if creds.TestMode {
		urlVal = "https://api-m.sandbox.paypal.com/v1/oauth2/token"
	}

	req, err := http.NewRequest("POST", urlVal, strings.NewReader("grant_type=client_credentials"))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Accept-Language", "en_US")
	req.SetBasicAuth(creds.ClientID, creds.Secret)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var res struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return "", err
	}
	return res.AccessToken, nil
}

func (s *paymentService) getCryptomusCredentials() *CryptomusCredentials {
	creds := s.getGatewaySettings("cryptomus")
	if creds["cryptomus_enabled"] != "1" {
		return nil
	}

	merchantID := strings.TrimSpace(creds["cryptomus_merchant_id"])
	paymentKey := strings.TrimSpace(creds["cryptomus_payment_key"])
	if merchantID == "" || paymentKey == "" {
		return nil
	}

	return &CryptomusCredentials{
		MerchantID: merchantID,
		PaymentKey: paymentKey,
	}
}

type CryptomusCredentials struct {
	MerchantID string
	PaymentKey string
}

func verifyStripeSignature(payload []byte, sigHeader, secret string) bool {
	if sigHeader == "" {
		return false
	}

	parts := strings.Split(sigHeader, ",")
	var timestamp, signature string
	for _, part := range parts {
		if strings.HasPrefix(part, "t=") {
			timestamp = part[2:]
		} else if strings.HasPrefix(part, "v1=") {
			signature = part[3:]
		}
	}

	if timestamp == "" || signature == "" {
		return false
	}

	var ts int64
	fmt.Sscanf(timestamp, "%d", &ts)
	now := time.Now().Unix()
	if now-ts > 300 || ts-now > 300 {
		return false
	}

	signedPayload := timestamp + "." + string(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signedPayload))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}

func (s *paymentService) fulfillPaymentMapping(mapKey, gateway string) error {
	var newlyFulfilled bool
	var fulfilledTxn model.Transaction

	err := s.txRepo.DB().Transaction(func(tx *gorm.DB) error {
		var txn model.Transaction
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("external_id = ? AND status IN ?", mapKey, []string{"pending", "expired"}).
			First(&txn).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				var done model.Transaction
				if e2 := tx.Where("external_id = ? AND status = 'completed'", mapKey).First(&done).Error; e2 == nil {
					return nil // already fulfilled — ack without side effects
				}
				logger.Warn("Payment fulfill: no pending/completed txn for external_id", "external_id", mapKey, "gateway", gateway)
				return nil
			}
			return err
		}

		if err := tx.Model(&model.User{}).Where("id = ?", txn.UserID).Update("credits", gorm.Expr("credits + ?", txn.CreditsAdded)).Error; err != nil {
			return err
		}

		if err := tx.Model(&txn).Update("status", "completed").Error; err != nil {
			return err
		}

		logEntry := &model.ActivityLog{
			UserID:     &txn.UserID,
			Level:      "INFO",
			Source:     "Payment",
			Event:      fmt.Sprintf("%s Webhook Fulfillment", gateway),
			Message:    fmt.Sprintf("%s confirmed. User #%d +%d credits. Ref: %s", gateway, txn.UserID, txn.CreditsAdded, mapKey),
			IP:         "0.0.0.0",
			Identifier: mapKey,
		}
		if err := tx.Create(logEntry).Error; err != nil {
			return err
		}

		newlyFulfilled = true
		fulfilledTxn = txn
		return nil
	})

	if err != nil || !newlyFulfilled {
		return err
	}

	userIDCopy := fulfilledTxn.UserID
	creditsCopy := fulfilledTxn.CreditsAdded
	amountCopy := fulfilledTxn.Amount
	txnRef := fulfilledTxn.TransactionID

	safe.Go(func() {
		if user, getErr := s.userRepo.GetByID(userIDCopy); getErr == nil && user != nil {
			ws.GlobalHub.BroadcastToUser(user.ID, "user_update", map[string]interface{}{
				"credits": user.Credits,
			})
			_ = s.emailService.SendTemplateEmail(user.Email, "buy_credits", map[string]string{
				"name":     user.Name,
				"credits":  fmt.Sprintf("%d", creditsCopy),
				"order_id": txnRef,
			})
			_ = s.emailService.SendTemplateEmail(user.Email, "transaction", map[string]string{
				"name":   user.Name,
				"txn_id": txnRef,
				"amount": fmt.Sprintf("%.2f", amountCopy),
			})
		}
		InvalidateAndRefreshDashboardStats(userIDCopy)
	})

	return nil
}

// capitalize returns the string with the first letter uppercased.
// Replaces the deprecated strings.Title() for single-word provider names.
func capitalize(s string) string {
	if s == "" {
		return ""
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
