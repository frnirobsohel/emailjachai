package security

import (
	"context"
	"fmt"
	"time"

	"ejp-backend/internal/helper"
	"ejp-backend/internal/model"
	"ejp-backend/internal/ws"
	"ejp-backend/pkg/config"
)

type FraudAction string

const (
	ActionAllow     FraudAction = "allow"
	ActionWarning   FraudAction = "warning"
	ActionSoftBlock FraudAction = "soft_block"
	ActionHardBlock FraudAction = "hard_block"
)

// FraudGuard handles advanced IP & Cookie tracking and daily limits.
type FraudGuard struct{}

func NewFraudGuard() *FraudGuard {
	return &FraudGuard{}
}

// CheckRequest evaluates the request against daily limits and fraud rules.
func (g *FraudGuard) CheckRequest(ip, cookie string) (FraudAction, string) {
	ctx := context.Background()

	// 1. Check DB for existing Blocks
	var block model.BlockedClient
	if err := config.DB.Where("value IN ?", []string{ip, cookie}).First(&block).Error; err == nil {
		if block.BlockType == "hard" {
			return ActionHardBlock, "Access permanently blocked due to policy violations."
		}
		if block.BlockType == "soft" {
			return ActionSoftBlock, "Access temporarily suspended. Please register an account."
		}
	}

	// 2. Get Daily Limit
	limit := int64(10)
	var setting model.Setting
	if err := config.DB.Where("setting_key = 'daily_free_limit'").First(&setting).Error; err == nil {
		if val, err := helper.SafeAtoi(setting.SettingValue); err == nil && val > 0 {
			limit = int64(val)
		}
	}

	today := time.Now().Format("2006-01-02")
	ipUsageKey := fmt.Sprintf("pub_use:ip:%s:%s", ip, today)
	cookieUsageKey := fmt.Sprintf("pub_use:cookie:%s:%s", cookie, today)

	ipUsage, _ := config.Redis.Get(ctx, ipUsageKey).Int64()
	cookieUsage, _ := config.Redis.Get(ctx, cookieUsageKey).Int64()

	// Normal usage
	if ipUsage < limit && cookieUsage < limit {
		// Increment usage
		config.Redis.Incr(ctx, ipUsageKey)
		config.Redis.Expire(ctx, ipUsageKey, 24*time.Hour)
		config.Redis.Incr(ctx, cookieUsageKey)
		config.Redis.Expire(ctx, cookieUsageKey, 24*time.Hour)

		// Save orig association if not exists
		origIpKey := fmt.Sprintf("pub_orig:cookie:%s", cookie)
		origCookieKey := fmt.Sprintf("pub_orig:ip:%s", ip)
		config.Redis.SetNX(ctx, origIpKey, ip, 7*24*time.Hour)
		config.Redis.SetNX(ctx, origCookieKey, cookie, 7*24*time.Hour)

		return ActionAllow, ""
	}

	// Quota exhausted. We are now in Fraud Detection territory.
	// Someone is trying to verify beyond the limit.
	var fraudKey string
	var fraudTarget string
	var fraudType string

	// Detect if they rotated IP or Cookie
	if cookieUsage >= limit && ipUsage < limit {
		// Cookie is exhausted, but IP is new (Rotated IP)
		fraudKey = fmt.Sprintf("pub_fraud:cookie:%s", cookie)
		fraudTarget = cookie
		fraudType = "cookie"
	} else if ipUsage >= limit && cookieUsage < limit {
		// IP is exhausted, but Cookie is new (Cleared Cookies)
		fraudKey = fmt.Sprintf("pub_fraud:ip:%s", ip)
		fraudTarget = ip
		fraudType = "ip"
	} else {
		// Just standard limit reached, no obvious rotation yet. Give a standard warning.
		return ActionWarning, "Daily free verification quota reached."
	}

	// Increment fraud points
	fraudPoints, _ := config.Redis.Incr(ctx, fraudKey).Result()
	config.Redis.Expire(ctx, fraudKey, 24*time.Hour)

	if fraudPoints == 1 {
		return ActionWarning, "Quota exhausted. Changing IP or clearing cookies is not permitted."
	}

	if fraudPoints == 2 {
		// Apply Soft Block to original, Hard block to current
		g.applySoftBlock(ctx, fraudTarget, fraudType)
		g.hardBlock(ip, "ip", "Secondary IP used for bypassing limits")
		return ActionSoftBlock, "Suspicious activity detected. This IP has been blocked."
	}

	if fraudPoints >= 3 {
		// Hard block everything
		g.hardBlock(ip, "ip", "Repeated limit bypassing (Hard Block)")
		g.hardBlock(cookie, "cookie", "Repeated limit bypassing (Hard Block)")
		return ActionHardBlock, "Fraudulent activity detected. Access permanently blocked."
	}

	return ActionWarning, "Daily free verification quota reached."
}

func (g *FraudGuard) applySoftBlock(ctx context.Context, target string, targetType string) {
	// Find original mapping
	origKey := fmt.Sprintf("pub_orig:%s:%s", targetType, target)
	original, err := config.Redis.Get(ctx, origKey).Result()
	if err == nil && original != "" {
		if targetType == "cookie" {
			g.softBlock(original, "ip", "Original IP associated with abusive cookie")
		} else {
			g.softBlock(original, "cookie", "Original Cookie associated with abusive IP")
		}
	}
}

func (g *FraudGuard) softBlock(value, typ, reason string) {
	block := model.BlockedClient{
		Value:     value,
		Type:      typ,
		BlockType: "soft",
		Reason:    reason,
	}
	// Ignore errors for duplicates
	if err := config.DB.Where("value = ?", value).FirstOrCreate(&block).Error; err == nil {
		ws.GlobalHub.BroadcastToAdmins("blocklist_update", block)
	}
}

func (g *FraudGuard) hardBlock(value, typ, reason string) {
	block := model.BlockedClient{
		Value:     value,
		Type:      typ,
		BlockType: "hard",
		Reason:    reason,
	}
	if err := config.DB.Where("value = ?", value).Assign(model.BlockedClient{BlockType: "hard", Reason: reason}).FirstOrCreate(&block).Error; err == nil {
		ws.GlobalHub.BroadcastToAdmins("blocklist_update", block)
	}
}

// GetUsage returns the total daily limit and the remaining usages for the given IP and Cookie combo.
func (g *FraudGuard) GetUsage(ip, cookie string) (limit int64, remaining int64) {
	ctx := context.Background()

	limit = int64(10)
	var setting model.Setting
	if err := config.DB.Where("setting_key = 'daily_free_limit'").First(&setting).Error; err == nil {
		if val, err := helper.SafeAtoi(setting.SettingValue); err == nil && val > 0 {
			limit = int64(val)
		}
	}

	today := time.Now().Format("2006-01-02")
	ipUsageKey := fmt.Sprintf("pub_use:ip:%s:%s", ip, today)
	cookieUsageKey := fmt.Sprintf("pub_use:cookie:%s:%s", cookie, today)

	ipUsage, _ := config.Redis.Get(ctx, ipUsageKey).Int64()
	cookieUsage, _ := config.Redis.Get(ctx, cookieUsageKey).Int64()

	// Remaining is based on the maximum usage among IP or Cookie
	maxUsage := ipUsage
	if cookieUsage > ipUsage {
		maxUsage = cookieUsage
	}

	remaining = limit - maxUsage
	if remaining < 0 {
		remaining = 0
	}

	return limit, remaining
}
