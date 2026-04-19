<?php
namespace App\Services;

use Core\DB;
use App\Services\HelperService;
use App\Services\CacheService;

class PaymentService {

    public static function createStripeSession(int $userId, int $pkgId): array {
        $stmt = DB::prepare("SELECT id, name, price, credits_amount FROM packages WHERE id = ? AND status = 'active'");
        $stmt->execute([$pkgId]);
        $pkg = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$pkg) {
            throw new \Exception('Package not found', 404);
        }

        $creds = self::getStripeCredentials();
        if (!$creds) {
            throw new \Exception('Stripe not enabled', 503);
        }

        $orderId = 'st_' . $userId . '_' . $pkgId . '_' . time();
        $amountCents = (int)round(((float)$pkg['price']) * 100);
        $amountCents = max(0, $amountCents);
        $payload = [
            'payment_method_types' => ['card'],
            'line_items' => [[
                'price_data' => [
                    'currency' => 'usd',
                    'product_data' => ['name' => $pkg['name'] . ' Plan'],
                    'unit_amount' => $amountCents,
                ],
                'quantity' => 1,
            ]],
            'mode' => 'payment',
            'success_url' => self::getBaseUrl() . '/dashboard/credits?status=success&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url'  => self::getBaseUrl() . '/dashboard/credits?status=cancelled',
            'client_reference_id' => $orderId,
            'metadata' => [
                'user_id' => $userId,
                'pkg_id'  => $pkgId,
                'credits' => $pkg['credits_amount']
            ]
        ];

        $ch = curl_init('https://api.stripe.com/v1/checkout/sessions');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => http_build_query($payload),
            CURLOPT_USERPWD        => $creds['secret_key'] . ':',
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10
        ]);

        $response = curl_exec($ch);
        $result = json_decode($response, true);


        if (!$result || isset($result['error'])) {
            throw new \Exception($result['error']['message'] ?? 'Stripe error', 502);
        }

        $stmt = DB::prepare("INSERT INTO transactions (user_id, amount, credits_added, type, status, package, description) VALUES (?, ?, ?, 'purchase', 'pending', ?, ?)");
        $stmt->execute([$userId, $pkg['price'], $pkg['credits_amount'], $pkg['name'], "Stripe: " . $pkg['name'] . " ($orderId)"]);
        $txnId = DB::getInstance()->lastInsertId();

        self::saveMapping("stripe_session_" . $result['id'], [
            'txn_id' => $txnId,
            'user_id' => $userId, 
            'credits' => $pkg['credits_amount']
        ]);

        return ['checkout_url' => $result['url']];
    }

    public static function createPaypalOrder(int $userId, int $pkgId): array {
        $stmt = DB::prepare("SELECT id, name, price, credits_amount FROM packages WHERE id = ? AND status = 'active'");
        $stmt->execute([$pkgId]);
        $pkg = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$pkg) {
            throw new \Exception('Package not found', 404);
        }

        $creds = self::getPaypalCredentials();
        if (!$creds) {
            throw new \Exception('PayPal not enabled', 503);
        }

        $token = self::getPaypalToken($creds);
        if (!$token) {
            throw new \Exception('PayPal auth failed', 500);
        }

        $payload = [
            'intent' => 'CAPTURE',
            'purchase_units' => [[
                'amount' => [
                    'currency_code' => 'USD',
                    'value' => number_format((float)$pkg['price'], 2, '.', '')
                ],
                'description' => $pkg['name'] . ' Plan'
            ]]
        ];

        $url = $creds['test_mode'] ? 'https://api-m.sandbox.paypal.com/v2/checkout/orders' : 'https://api-m.paypal.com/v2/checkout/orders';
        
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $token
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_CONNECTTIMEOUT => 10
        ]);

        $response = curl_exec($ch);
        $result = json_decode($response, true);


        if (!$result || !isset($result['id'])) {
            throw new \Exception('Payments: PayPal Order Creation Failed', 502);
        }

        $stmt = DB::prepare("INSERT INTO transactions (user_id, amount, credits_added, type, status, package, description) VALUES (?, ?, ?, 'purchase', 'pending', ?, ?)");
        $desc = "PayPal: " . $pkg['name'] . " (" . $result['id'] . ")";
        $stmt->execute([$userId, $pkg['price'], $pkg['credits_amount'], $pkg['name'], $desc]);
        $txnId = DB::getInstance()->lastInsertId();

        self::saveMapping("paypal_order_" . $result['id'], [
            'txn_id' => $txnId,
            'user_id' => $userId,
            'credits' => $pkg['credits_amount']
        ]);

        $approvalUrl = null;
        if (isset($result['links'])) {
            foreach ($result['links'] as $link) {
                if ($link['rel'] === 'approve') {
                    $approvalUrl = $link['href'];
                    break;
                }
            }
        }

        return [
            'order_id' => $result['id'],
            'approval_url' => $approvalUrl
        ];
    }

    public static function createCryptomusInvoice(int $userId, int $pkgId): array {
        $stmt = DB::prepare("SELECT id, name, price, credits_amount FROM packages WHERE id = ? AND status = 'active'");
        $stmt->execute([$pkgId]);
        $pkg = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$pkg) {
            throw new \Exception('Package not found or inactive', 404);
        }

        $creds = self::getCryptomusCredentials();
        if (!$creds) {
            throw new \Exception('Cryptomus is not configured or not enabled.', 503);
        }

        $orderId = 'order_' . $userId . '_' . $pkgId . '_' . time();
        $amount  = number_format((float)$pkg['price'], 2, '.', '');

        $payload = [
            'amount'        => $amount,
            'currency'      => 'USD',
            'order_id'      => $orderId,
            'url_callback'  => self::getBaseUrl() . '/payment/cryptomus/webhook',
            'url_success'   => self::getBaseUrl() . '/dashboard/credits',
            'url_return'    => self::getBaseUrl() . '/dashboard/credits',
            'is_payment_multiple' => false,
            'lifetime'      => 3600,
            'to_currency'   => 'USDT',
        ];

        $result = self::callCryptomusApi('/v1/payment', $payload, $creds['merchant_id'], $creds['payment_key']);

        if (!$result || !isset($result['state']) || $result['state'] !== 0) {
            $errMsg = $result['message'] ?? 'Failed to create Cryptomus invoice';
            throw new \Exception($errMsg, 502);
        }

        $invoiceData = $result['result'] ?? [];
        $paymentUrl  = $invoiceData['url'] ?? null;

        if (!$paymentUrl) {
            throw new \Exception('Cryptomus returned no payment URL', 502);
        }

        $stmt = DB::prepare(
            "INSERT INTO transactions (user_id, amount, credits_added, type, status, package, description)
             VALUES (?, ?, ?, 'purchase', 'pending', ?, ?)"
        );
        $desc = "Cryptomus payment for " . $pkg['name'] . " Plan (Order: $orderId)";
        $stmt->execute([$userId, $pkg['price'], $pkg['credits_amount'], $pkg['name'], $desc]);
        $txnId = DB::getInstance()->lastInsertId();

        self::saveMapping("cryptomus_order_$orderId", [
            'txn_id'       => $txnId,
            'user_id'      => $userId,
            'credits'      => $pkg['credits_amount'],
        ]);

        HelperService::logActivity('INFO', 'Payment', "Cryptomus invoice created for user $userId, order $orderId", $userId);

        return [
            'payment_url' => $paymentUrl,
            'order_id'    => $orderId,
        ];
    }

    public static function fulfillOrder($map, $externalId, $gatewayName): bool {
        $txnId = (int)($map['txn_id'] ?? 0);
        $userId = (int)($map['user_id'] ?? 0);
        $credits = (int)($map['credits'] ?? 0);

        if ($txnId <= 0 || $userId <= 0 || $credits < 0) {
            return false;
        }

        $pdo = DB::getInstance();
        $pdo->beginTransaction();
        try {
            $txnStmt = $pdo->prepare("
                SELECT status
                FROM transactions
                WHERE id = ? AND user_id = ?
                LIMIT 1
                FOR UPDATE
            ");
            $txnStmt->execute([$txnId, $userId]);
            $status = $txnStmt->fetchColumn();

            if ($status !== 'pending') {
                $pdo->commit();
                return false;
            }

            $pdo->prepare("UPDATE users SET credits = credits + ? WHERE id = ?")->execute([$credits, $userId]);
            $pdo->prepare("UPDATE transactions SET status = 'completed' WHERE id = ?")->execute([$txnId]);
            $pdo->commit();
            CacheService::delete('user_dashboard_stats_' . $userId);
            HelperService::logActivity('INFO', 'Payment', "$gatewayName confirmed. User $userId +$credits. Ref: $externalId", $userId);
            return true;
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            \App\Services\Logger::error("$gatewayName Fulfill error: " . $e->getMessage());
            return false;
        }
    }

    public static function getStripeCredentials(): ?array {
        $creds = self::getGatewaySettings('stripe');
        if (($creds['stripe_enabled'] ?? '0') !== '1') return null;
        return [
            'public_key' => $creds['stripe_public_key'] ?? '', 
            'secret_key' => $creds['stripe_secret_key'] ?? '', 
            'webhook_secret' => $creds['stripe_webhook_secret'] ?? '', 
            'test_mode' => ($creds['stripe_test_mode'] ?? '1') === '1'
        ];
    }

    public static function getPaypalCredentials(): ?array {
        $creds = self::getGatewaySettings('paypal');
        if (($creds['paypal_enabled'] ?? '0') !== '1') return null;
        return [
            'client_id' => $creds['paypal_public_key'] ?? '',
            'secret'    => $creds['paypal_secret_key'] ?? '',
            'webhook_id'=> $creds['paypal_webhook_id'] ?? '',
            'test_mode' => ($creds['paypal_test_mode'] ?? '1') === '1'
        ];
    }

    public static function getPaypalToken($creds): ?string {
        $url = $creds['test_mode'] ? 'https://api-m.sandbox.paypal.com/v1/oauth2/token' : 'https://api-m.paypal.com/v1/oauth2/token';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => "grant_type=client_credentials",
            CURLOPT_USERPWD        => $creds['client_id'] . ":" . $creds['secret'],
            CURLOPT_HTTPHEADER     => ['Accept: application/json', 'Accept-Language: en_US'],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 7
        ]);
        $response = curl_exec($ch);
        $result = json_decode($response, true);

        return $result['access_token'] ?? null;
    }

    public static function getCryptomusCredentials(): ?array {
        $stmt = DB::prepare(
            "SELECT setting_key, setting_value FROM settings
             WHERE setting_key IN ('cryptomus_enabled', 'cryptomus_merchant_id', 'cryptomus_payment_key')"
        );
        $stmt->execute();
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $map = [];
        foreach ($rows as $row) {
            $map[$row['setting_key']] = $row['setting_value'];
        }

        if (($map['cryptomus_enabled'] ?? '0') !== '1') return null;

        $merchantId  = trim($map['cryptomus_merchant_id']  ?? '');
        $paymentKey  = trim($map['cryptomus_payment_key']  ?? '');

        if (!$merchantId || !$paymentKey) return null;

        return ['merchant_id' => $merchantId, 'payment_key' => $paymentKey];
    }

    public static function callCryptomusApi(string $endpoint, array $payload, string $merchantId, string $paymentKey): ?array {
        $body = json_encode($payload);
        $sign = md5(base64_encode($body) . $paymentKey);

        $ch = curl_init('https://api.cryptomus.com' . $endpoint);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'merchant: ' . $merchantId,
                'sign: '     . $sign,
            ],
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);


        if ($response === false) {
            \App\Services\Logger::error("Cryptomus API curl error");
            return null;
        }

        $decoded = json_decode($response, true);
        if ($httpCode >= 400 || !is_array($decoded)) {
            \App\Services\Logger::error("Cryptomus API error ($httpCode): $response");
        }

        return $decoded;
    }

    public static function getGatewaySettings($prefix): array {
        $stmt = DB::prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE ?");
        $stmt->execute([$prefix . '_%']);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $map = [];
        foreach ($rows as $row) $map[$row['setting_key']] = $row['setting_value'];
        return $map;
    }

    public static function getBaseUrl(): string {
        $stmt = DB::prepare("SELECT setting_value FROM settings WHERE setting_key = 'api_base_url'");
        $stmt->execute();
        $url = trim((string)$stmt->fetchColumn());
        if ($url !== '' && filter_var($url, FILTER_VALIDATE_URL)) {
            return rtrim($url, '/');
        }

        $envUrl = trim((string)(getenv('FRONTEND_URL') ?: ''));
        if ($envUrl !== '' && filter_var($envUrl, FILTER_VALIDATE_URL)) {
            return rtrim($envUrl, '/');
        }

        $https = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
            || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);
        $host = preg_replace('/[^a-z0-9\.\-]/i', '', (string)($_SERVER['SERVER_NAME'] ?? 'localhost')) ?: 'localhost';
        return ($https ? 'https' : 'http') . '://' . $host;
    }

    public static function saveMapping($key, $data) {
        $stmt = DB::prepare("INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)");
        $stmt->execute([$key, json_encode($data)]);
    }

    public static function getMapping($key) {
        $stmt = DB::prepare("SELECT setting_value FROM settings WHERE setting_key = ?");
        $stmt->execute([$key]);
        $val = $stmt->fetchColumn();
        return $val ? json_decode($val, true) : null;
    }
}
