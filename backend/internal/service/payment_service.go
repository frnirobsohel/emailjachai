package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"ejp-backend/internal/model"
	"ejp-backend/internal/repo"

	"gorm.io/gorm"
)

type PaymentService interface {
	ProcessWebhook(provider string, rawBody []byte, headers map[string]string) error
	CreatePaymentSession(userID uint, packageID uint, provider string) (string, error)
	VerifyPayment(transactionID string) (string, error)
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
				return s.fulfillPaymentMapping("stripe_session_"+sessionID, sessionID, "Stripe")
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

		if event.EventType == "PAYMENT.CAPTURE.COMPLETED" {
			status, _ := event.Resource["status"].(string)
			if status == "COMPLETED" {
				if sup, ok := event.Resource["supplementary_data"].(map[string]interface{}); ok {
					if rel, ok := sup["related_ids"].(map[string]interface{}); ok {
						orderID, _ := rel["order_id"].(string)
						if orderID != "" {
							return s.fulfillPaymentMapping("paypal_order_"+orderID, orderID, "PayPal")
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
			return s.fulfillPaymentMapping("cryptomus_order_"+orderID, orderID, "Cryptomus")
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
		return "", fmt.Errorf("package not found")
	}

	txnID := fmt.Sprintf("st_%d_%d_%d", userID, packageID, time.Now().Unix())
	transaction := &model.Transaction{
		UserID:        userID,
		TransactionID: txnID,
		Amount:        pkg.Price,
		CreditsAdded:  int(pkg.CreditsAmount),
		Type:          "purchase",
		Status:        "pending",
		Package:       pkg.Name,
		Description:   fmt.Sprintf("%s: %s (%s)", strings.Title(provider), pkg.Name, txnID),
		Provider:      provider,
	}

	if err := s.txRepo.Create(transaction); err != nil {
		return "", fmt.Errorf("failed to initialize transaction: %v", err)
	}

	switch provider {
	case "stripe":
		creds := s.getStripeCredentials()
		if creds == nil {
			return "", fmt.Errorf("Stripe is not enabled")
		}

		amountCents := int(pkg.Price * 100)
		if amountCents < 0 {
			amountCents = 0
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
			return "", err
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		req.SetBasicAuth(creds.SecretKey, "")

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()

		var result map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", err
		}

		if errMsg, ok := result["error"].(map[string]interface{}); ok {
			return "", fmt.Errorf("Stripe error: %v", errMsg["message"])
		}

		sessionID, ok := result["id"].(string)
		if !ok {
			return "", fmt.Errorf("Stripe returned invalid session ID")
		}

		checkoutURL, ok := result["url"].(string)
		if !ok {
			return "", fmt.Errorf("Stripe returned invalid checkout URL")
		}

		err = s.saveMapping("stripe_session_"+sessionID, map[string]interface{}{
			"txn_id":  transaction.ID,
			"user_id": userID,
			"credits": pkg.CreditsAmount,
		})
		if err != nil {
			return "", fmt.Errorf("failed to save payment mapping: %v", err)
		}

		return checkoutURL, nil

	case "paypal":
		creds := s.getPayPalCredentials()
		if creds == nil {
			return "", fmt.Errorf("PayPal is not enabled")
		}

		token, err := s.getPayPalToken(creds)
		if err != nil {
			return "", fmt.Errorf("PayPal auth failed: %v", err)
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
		}
		type PayPalPayload struct {
			Intent        string         `json:"intent"`
			PurchaseUnits []PurchaseUnit `json:"purchase_units"`
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
				},
			},
		}

		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			return "", err
		}

		req, err := http.NewRequest("POST", paypalURL, bytes.NewBuffer(bodyBytes))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()

		var result map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", err
		}

		paypalOrderID, ok := result["id"].(string)
		if !ok {
			return "", fmt.Errorf("PayPal order creation failed: %v", result)
		}

		err = s.saveMapping("paypal_order_"+paypalOrderID, map[string]interface{}{
			"txn_id":  transaction.ID,
			"user_id": userID,
			"credits": pkg.CreditsAmount,
		})
		if err != nil {
			return "", fmt.Errorf("failed to save payment mapping: %v", err)
		}

		var approvalURL string
		if links, ok := result["links"].([]interface{}); ok {
			for _, l := range links {
				if linkMap, ok := l.(map[string]interface{}); ok {
					if linkMap["rel"] == "approve" {
						approvalURL = linkMap["href"].(string)
						break
					}
				}
			}
		}

		if approvalURL == "" {
			return "", fmt.Errorf("PayPal returned no approval URL")
		}

		return approvalURL, nil

	case "cryptomus":
		creds := s.getCryptomusCredentials()
		if creds == nil {
			return "", fmt.Errorf("Cryptomus is not enabled")
		}

		orderID := fmt.Sprintf("order_%d_%d_%d", userID, packageID, time.Now().Unix())
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
			URLSuccess:        s.getBaseURL() + "/dashboard/credits",
			URLReturn:         s.getBaseURL() + "/dashboard/credits",
			IsPaymentMultiple: false,
			Lifetime:          3600,
			ToCurrency:        "USDT",
		}

		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			return "", err
		}

		b64Body := base64.StdEncoding.EncodeToString(bodyBytes)
		signStr := fmt.Sprintf("%x", md5.Sum([]byte(b64Body+creds.PaymentKey)))

		req, err := http.NewRequest("POST", "https://api.cryptomus.com/v1/payment", bytes.NewBuffer(bodyBytes))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("merchant", creds.MerchantID)
		req.Header.Set("sign", signStr)

		client := &http.Client{Timeout: 30 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()

		var result map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			return "", err
		}

		stateVal, _ := result["state"].(float64)
		if stateVal != 0 {
			msg, _ := result["message"].(string)
			return "", fmt.Errorf("Cryptomus error: %s", msg)
		}

		resData, _ := result["result"].(map[string]interface{})
		paymentURL, _ := resData["url"].(string)
		if paymentURL == "" {
			return "", fmt.Errorf("Cryptomus returned no payment URL")
		}

		err = s.saveMapping("cryptomus_order_"+orderID, map[string]interface{}{
			"txn_id":  transaction.ID,
			"user_id": userID,
			"credits": pkg.CreditsAmount,
		})
		if err != nil {
			return "", fmt.Errorf("failed to save payment mapping: %v", err)
		}

		transaction.TransactionID = orderID
		s.txRepo.Update(transaction)

		return paymentURL, nil

	case "manual":
		if os.Getenv("GO_ENV") == "production" {
			return "", fmt.Errorf("manual payment is disabled in production")
		}
		return fmt.Sprintf("/dashboard/billing/manual-success?package_id=%d&provider=manual&txid=%s", packageID, txnID), nil

	default:
		return "", fmt.Errorf("payment provider '%s' is not yet configured", provider)
	}
}

func (s *paymentService) VerifyPayment(transactionID string) (string, error) {
	tx, err := s.txRepo.GetByTransactionOrExternalID(transactionID)
	if err != nil {
		return "not_found", nil
	}

	return tx.Status, nil
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
	res := make(map[string]string)
	for _, sDB := range settings {
		res[sDB.SettingKey] = sDB.SettingValue
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
	var settings []model.Setting
	s.settingsRepo.DB().Where("setting_key IN ?", []string{"cryptomus_enabled", "cryptomus_merchant_id", "cryptomus_payment_key"}).Find(&settings)

	creds := make(map[string]string)
	for _, s := range settings {
		creds[s.SettingKey] = s.SettingValue
	}

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

func (s *paymentService) saveMapping(key string, val interface{}) error {
	bytesVal, err := json.Marshal(val)
	if err != nil {
		return err
	}
	var setting model.Setting
	err = s.settingsRepo.DB().Where("setting_key = ?", key).First(&setting).Error
	if err == nil {
		setting.SettingValue = string(bytesVal)
		return s.settingsRepo.DB().Save(&setting).Error
	}
	setting = model.Setting{
		SettingKey:   key,
		SettingValue: string(bytesVal),
	}
	return s.settingsRepo.DB().Create(&setting).Error
}

func (s *paymentService) fulfillPaymentMapping(mapKey, externalID, gateway string) error {
	var setting model.Setting
	if err := s.settingsRepo.DB().Where("setting_key = ?", mapKey).First(&setting).Error; err != nil {
		return fmt.Errorf("mapping settings not found for key: %s", mapKey)
	}

	var mapData struct {
		TxnID   uint `json:"txn_id"`
		UserID  uint `json:"user_id"`
		Credits int  `json:"credits"`
	}
	if err := json.Unmarshal([]byte(setting.SettingValue), &mapData); err != nil {
		return fmt.Errorf("failed to unmarshal mapping data: %v", err)
	}

	if mapData.TxnID == 0 || mapData.UserID == 0 {
		return fmt.Errorf("invalid mapping data: %v", mapData)
	}

	return s.txRepo.DB().Transaction(func(tx *gorm.DB) error {
		var txn model.Transaction
		if err := tx.Where("id = ? AND status = 'pending'", mapData.TxnID).First(&txn).Error; err != nil {
			return err
		}

		if err := tx.Model(&model.User{}).Where("id = ?", mapData.UserID).Update("credits", gorm.Expr("credits + ?", mapData.Credits)).Error; err != nil {
			return err
		}

		if err := tx.Model(&txn).Update("status", "completed").Error; err != nil {
			return err
		}

		logEntry := &model.ActivityLog{
			UserID:     &mapData.UserID,
			Level:      "INFO",
			Source:     "Payment",
			Event:      fmt.Sprintf("%s Webhook Fulfillment", gateway),
			Message:    fmt.Sprintf("%s confirmed. User #%d +%d credits. Ref: %s", gateway, mapData.UserID, mapData.Credits, externalID),
			IP:         "0.0.0.0",
			Identifier: externalID,
		}
		if err := tx.Create(logEntry).Error; err != nil {
			return err
		}

		return nil
	})
}

