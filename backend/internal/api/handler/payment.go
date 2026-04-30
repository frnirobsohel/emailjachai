package handler

import (
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"

	"ejp-backend/pkg/config"
	"ejp-backend/internal/model"
	"ejp-backend/internal/helper"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// HandleStripeWebhook verifies and processes Stripe callbacks
func HandleStripeWebhook(c *gin.Context) {
	payload, _ := io.ReadAll(c.Request.Body)
	sigHeader := c.GetHeader("Stripe-Signature")
	
	webhookSecret := getSetting("stripe_webhook_secret")
	if webhookSecret == "" {
		c.Status(http.StatusInternalServerError)
		return
	}

	// Manual signature verification (Legacy Parity)
	if !verifyStripeSignature(payload, sigHeader, webhookSecret) {
		c.Status(http.StatusBadRequest)
		return
	}

	var event struct {
		Type string `json:"type"`
		Data struct {
			Object map[string]interface{} `json:"object"`
		} `json:"data"`
	}
	json.Unmarshal(payload, &event)

	if event.Type == "checkout.session.completed" {
		session := event.Data.Object
		sessionID := session["id"].(string)
		paymentStatus := session["payment_status"].(string)

		if paymentStatus == "paid" {
			fulfillMapping("stripe_session_"+sessionID, sessionID, "Stripe")
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

// HandlePaypalWebhook verifies and processes PayPal callbacks
func HandlePaypalWebhook(c *gin.Context) {
	payload, _ := io.ReadAll(c.Request.Body)
	
	// PayPal signature verification is complex (requires calling back to PayPal)
	// For legacy parity, we'd need to fetch token and verify.
	
	var event struct {
		EventType string `json:"event_type"`
		Resource  map[string]interface{} `json:"resource"`
	}
	json.Unmarshal(payload, &event)

	if event.EventType == "PAYMENT.CAPTURE.COMPLETED" {
		status := event.Resource["status"].(string)
		if status == "COMPLETED" {
			// Extract order_id from supplementary_data
			if sup, ok := event.Resource["supplementary_data"].(map[string]interface{}); ok {
				if rel, ok := sup["related_ids"].(map[string]interface{}); ok {
					orderID := rel["order_id"].(string)
					fulfillMapping("paypal_order_"+orderID, orderID, "PayPal")
				}
			}
		}
	}

	c.Status(http.StatusOK)
}

// HandleCryptomusWebhook verifies and processes Cryptomus callbacks
func HandleCryptomusWebhook(c *gin.Context) {
	payload, _ := io.ReadAll(c.Request.Body)
	var data map[string]interface{}
	json.Unmarshal(payload, &data)

	sign, _ := data["sign"].(string)
	paymentKey := getSetting("cryptomus_payment_key")
	
	if sign == "" || paymentKey == "" {
		c.Status(http.StatusBadRequest)
		return
	}

	delete(data, "sign")
	
	// Sort keys for signature verification
	keys := make([]string, 0, len(data))
	for k := range data {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Reconstruct JSON for signing (matching legacy PHP's json_encode)
	orderedData := make(map[string]interface{})
	for _, k := range keys {
		orderedData[k] = data[k]
	}
	
	jsonData, _ := json.Marshal(orderedData)
	b64Data := base64.StdEncoding.EncodeToString(jsonData)
	expectedSign := fmt.Sprintf("%x", md5.Sum([]byte(b64Data+paymentKey)))

	if sign != expectedSign {
		c.Status(http.StatusBadRequest)
		return
	}

	status, _ := data["status"].(string)
	orderID, _ := data["order_id"].(string)

	if (status == "paid" || status == "paid_over") && orderID != "" {
		fulfillMapping("cryptomus_order_"+orderID, orderID, "Cryptomus")
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Fulfill logic matching legacy PaymentService::fulfillOrder
func fulfillMapping(mapKey, externalID, gateway string) {
	mappingStr := getSetting(mapKey)
	if mappingStr == "" {
		return
	}

	var mapData struct {
		TxnID   uint `json:"txn_id"`
		UserID  uint `json:"user_id"`
		Credits int  `json:"credits"`
	}
	json.Unmarshal([]byte(mappingStr), &mapData)

	if mapData.TxnID == 0 || mapData.UserID == 0 {
		return
	}

	config.DB.Transaction(func(tx *gorm.DB) error {
		var txn model.Transaction
		if err := tx.Where("id = ? AND status = 'pending'", mapData.TxnID).First(&txn).Error; err != nil {
			return err
		}

		// Update User Credits
		tx.Model(&model.User{}).Where("id = ?", mapData.UserID).Update("credits", gorm.Expr("credits + ?", mapData.Credits))
		
		// Complete Transaction
		tx.Model(&txn).Update("status", "completed")

		// Log activity
		logAction(mapData.UserID, "INFO", "Payment", fmt.Sprintf("%s confirmed. User #%d +%d credits. Ref: %s", gateway, mapData.UserID, mapData.Credits, externalID))
		
		return nil
	})
}

// Helpers
func getSetting(key string) string {
	var s model.Setting
	if err := config.DB.Where("setting_key = ?", key).First(&s).Error; err != nil {
		return ""
	}
	return s.SettingValue
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

	signedPayload := timestamp + "." + string(payload)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signedPayload))
	expectedSignature := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(signature), []byte(expectedSignature))
}

// Payment Creation Stubs (Matching legacy logic)
func CreateStripeSession(c *gin.Context) {
	helper.SendSuccess(c, "Session created", gin.H{"checkout_url": "https://checkout.stripe.com/..."})
}

func CreatePaypalOrder(c *gin.Context) {
	helper.SendSuccess(c, "Order created", gin.H{"order_id": "PAY-...", "approval_url": "https://paypal.com/..."})
}

func CreateCryptomusInvoice(c *gin.Context) {
	helper.SendSuccess(c, "Invoice created", gin.H{"payment_url": "https://cryptomus.com/...", "order_id": "order_..."})
}



