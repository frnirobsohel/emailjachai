<?php
namespace App\Controllers;

use Core\Request;
use App\Services\AuthService;
use App\Services\PaymentService;
use Core\DB;

class PaymentController extends BaseController {

    public function createStripeSession() {
        $userId = AuthService::checkAuth();
        $data   = Request::json();
        $pkgId  = $data['package_id'] ?? null;

        if (!$pkgId) return $this->error('Package ID required', [], 400);

        try {
            $result = PaymentService::createStripeSession($userId, (int)$pkgId);
            return $this->success('Session created', $result);
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }

    public function stripeWebhook() {
        $payload = file_get_contents('php://input');
        $sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';
        $creds = PaymentService::getStripeCredentials();

        if (!$creds || !$creds['webhook_secret']) {
             error_log("Stripe webhook: Missing secret");
             http_response_code(400);
             exit;
         }

        if (!$sigHeader) {
            error_log("Stripe webhook: Missing signature header");
            http_response_code(400);
            exit;
        }

        $parts = explode(',', $sigHeader);
        $timestamp = '';
        $signature = '';
        foreach ($parts as $part) {
            if (strpos($part, 't=') === 0) $timestamp = substr($part, 2);
            if (strpos($part, 'v1=') === 0) $signature = substr($part, 3);
        }

        if (!$timestamp || !$signature) {
            http_response_code(400);
            exit;
        }

        $signedPayload = $timestamp . '.' . $payload;
        $expectedSignature = hash_hmac('sha256', $signedPayload, $creds['webhook_secret']);

        if (!hash_equals($expectedSignature, $signature)) {
            error_log("Stripe webhook: Invalid signature");
            http_response_code(400);
            exit;
        }

        if (abs(time() - (int)$timestamp) > 300) {
            error_log("Stripe webhook: Timestamp too old");
            http_response_code(400);
            exit;
        }

        $event = json_decode($payload, true);
        if (!is_array($event)) {
            http_response_code(400);
            exit;
        }

        if (($event['type'] ?? '') === 'checkout.session.completed') {
            $session = is_array($event['data']['object'] ?? null) ? $event['data']['object'] : [];
            $sessionId = (string)($session['id'] ?? '');
            $paymentStatus = strtolower(trim((string)($session['payment_status'] ?? '')));

            if ($sessionId !== '' && $paymentStatus === 'paid') {
                $map = PaymentService::getMapping("stripe_session_" . $sessionId);
                if ($map) {
                    PaymentService::fulfillOrder($map, $sessionId, 'Stripe');
                }
            }
        }

        http_response_code(200);
        echo json_encode(['status' => 'success']);
        exit;
    }

    public function paypalWebhook() {
        $payload = file_get_contents('php://input');
        
        $headers = [
            'PAYPAL-AUTH-ALGO'         => Request::header('PAYPAL-AUTH-ALGO'),
            'PAYPAL-CERT-URL'          => Request::header('PAYPAL-CERT-URL'),
            'PAYPAL-TRANSMISSION-ID'   => Request::header('PAYPAL-TRANSMISSION-ID'),
            'PAYPAL-TRANSMISSION-SIG'  => Request::header('PAYPAL-TRANSMISSION-SIG'),
            'PAYPAL-TRANSMISSION-TIME' => Request::header('PAYPAL-TRANSMISSION-TIME'),
        ];
        
        $creds = PaymentService::getPaypalCredentials();
        if (!$creds) {
            error_log("PayPal webhook: Not enabled");
            http_response_code(400);
            exit;
        }

        $token = PaymentService::getPaypalToken($creds);
        if (!$token) {
            error_log("PayPal webhook: Auth failed");
            http_response_code(500);
            exit;
        }

        $verificationPayload = [
            'auth_algo'         => $headers['PAYPAL-AUTH-ALGO'] ?? '',
            'cert_url'          => $headers['PAYPAL-CERT-URL'] ?? '',
            'transmission_id'   => $headers['PAYPAL-TRANSMISSION-ID'] ?? '',
            'transmission_sig'  => $headers['PAYPAL-TRANSMISSION-SIG'] ?? '',
            'transmission_time' => $headers['PAYPAL-TRANSMISSION-TIME'] ?? '',
            'webhook_id'        => $creds['webhook_id'] ?? '',
            'webhook_event'     => json_decode($payload, true)
        ];

        $url = $creds['test_mode'] ? 'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature' : 'https://api-m.paypal.com/v1/notifications/verify-webhook-signature';
        
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($verificationPayload),
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $token
            ],
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 10
        ]);
        $response = curl_exec($ch);
        $result = json_decode($response, true);
        curl_close($ch);

        if (($result['verification_status'] ?? '') !== 'SUCCESS') {
            error_log("PayPal webhook: Signature verification failed");
            http_response_code(400);
            exit;
        }

        $event = json_decode($payload, true);
        if (!is_array($event)) {
            http_response_code(400);
            exit;
        }

        $eventType = (string)($event['event_type'] ?? '');
        if ($eventType === 'PAYMENT.CAPTURE.COMPLETED') {
            $resource = is_array($event['resource'] ?? null) ? $event['resource'] : [];
            $captureStatus = strtoupper(trim((string)($resource['status'] ?? '')));
            if ($captureStatus === 'COMPLETED') {
                $related = is_array($resource['supplementary_data']['related_ids'] ?? null)
                    ? $resource['supplementary_data']['related_ids']
                    : [];
                $orderId = trim((string)($related['order_id'] ?? ''));
                if ($orderId !== '') {
                    $map = PaymentService::getMapping("paypal_order_" . $orderId);
                    if ($map) {
                        PaymentService::fulfillOrder($map, $orderId, 'PayPal');
                    }
                }
            }
        }

        http_response_code(200);
        exit;
    }

    public function createPaypalOrder() {
        $userId = AuthService::checkAuth();
        $data   = Request::json();
        $pkgId  = $data['package_id'] ?? null;

        if (!$pkgId) return $this->error('Package ID required', [], 400);

        try {
            $result = PaymentService::createPaypalOrder($userId, (int)$pkgId);
            return $this->success('Order created', $result);
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }

    public function createCryptomusInvoice() {
        $userId = AuthService::checkAuth();
        $data   = Request::json();
        $pkgId  = $data['package_id'] ?? null;

        if (!$pkgId) {
            return $this->error('Package ID required', [], 400);
        }

        try {
            $result = PaymentService::createCryptomusInvoice($userId, (int)$pkgId);
            return $this->success('Invoice created', $result);
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }

    public function cryptomusWebhook() {
        $rawBody = file_get_contents('php://input');
        $data    = json_decode($rawBody, true);

        if (!$data) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid payload']);
            exit;
        }

        $creds = PaymentService::getCryptomusCredentials();
        if (!$creds) {
            error_log("Cryptomus webhook: credentials unavailable; rejecting callback");
            http_response_code(503);
            echo json_encode(['error' => 'Gateway not configured']);
            exit;
        }

        $sign = trim((string)($data['sign'] ?? ''));
        if ($sign === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Missing signature']);
            exit;
        }

        unset($data['sign']);
        ksort($data);
        $expectedSign = md5(base64_encode(json_encode($data)) . $creds['payment_key']);

        if (!hash_equals($expectedSign, $sign)) {
            error_log("Cryptomus webhook: invalid signature");
            http_response_code(400);
            echo json_encode(['error' => 'Invalid signature']);
            exit;
        }

        $status  = $data['status']   ?? '';
        $orderId = $data['order_id'] ?? '';

        if (in_array($status, ['paid', 'paid_over'], true) && $orderId) {
            $map = PaymentService::getMapping("cryptomus_order_$orderId");
            if ($map) {
                PaymentService::fulfillOrder($map, $orderId, 'Cryptomus');
            }
        }

        http_response_code(200);
        echo json_encode(['ok' => true]);
        exit;
    }
}
