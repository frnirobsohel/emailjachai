<?php
namespace App\Services;

use Core\DB;
use Core\Request;
use Core\Response;

class AuthService {
    private static $cachedApiKey = null;
    private static $cachedUserId = null;
    private static $cachedWorkerKey = null;
    private static $cachedWorkerAuthOk = false;
    private static $cachedAdminChecks = [];
    
    /**
     * Check Authentication (Verifies API Key against Database)
     */
    public static function checkAuth() {
        $apiKey = Request::bearerToken();

        if (empty($apiKey)) {
            Response::error('Unauthorized access. API Key missing.', [], 401);
        }

        if (
            is_string(self::$cachedApiKey)
            && hash_equals(self::$cachedApiKey, (string)$apiKey)
            && is_int(self::$cachedUserId)
            && self::$cachedUserId > 0
        ) {
            return self::$cachedUserId;
        }

        $prefix = substr((string)$apiKey, 0, 16);

        $stmt = DB::prepare("
            SELECT
                ak.user_id,
                ak.api_key as hash,
                ak.status,
                ak.last_used_at,
                ak.expires_at,
                u.id as u_id,
                u.status as user_status,
                u.role as user_role
            FROM api_keys ak
            LEFT JOIN users u ON ak.user_id = u.id
            WHERE ak.key_prefix = ?
        ");
        $stmt->execute([$prefix]);
        $keysData = $stmt->fetchAll();

        $keyData = null;
        foreach ($keysData as $row) {
            if (password_verify((string)$apiKey, $row['hash'])) {
                $keyData = $row;
                break;
            }
        }

        if (!$keyData || $keyData['status'] !== 'active' || empty($keyData['u_id'])) {
            Response::error('Invalid or revoked API Key or user no longer exists.', [], 401, 'ERR_AUTH_INVALID_KEY');
        }

        if ($keyData['expires_at'] !== null) {
            $expiry = strtotime((string)$keyData['expires_at']);
            if ($expiry < time()) {
                // Auto-revoke expired keys if they are impersonation or single-use
                if (strpos((string)$apiKey, 'ak_live_') === 0) {
                     $stmt = DB::prepare("UPDATE api_keys SET status = 'expired' WHERE key_prefix = ? AND api_key = ?");
                     $stmt->execute([$prefix, $keyData['hash']]);
                }
                Response::error('API Key has expired.', [], 401, 'ERR_AUTH_EXPIRED_KEY');
            }
        }

        if (!empty($keyData['user_status']) && strtolower((string)$keyData['user_status']) === 'suspended') {
            Response::error('Account suspended. Access denied.', [], 403, 'ERR_AUTH_ACCOUNT_SUSPENDED');
        }

        // Track last-used with throttling to reduce write pressure on hot keys.
        $stmt = DB::prepare("
            UPDATE api_keys
            SET last_used_at = CURRENT_TIMESTAMP
            WHERE key_prefix = ?
              AND api_key = ?
              AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL 60 SECOND)
        ");
        $stmt->execute([$prefix, $keyData['hash']]);

        // Apply Rate Limiting (Bypass for Admins)
        $role = strtolower((string)($keyData['user_role'] ?? 'user'));

        if ($role !== 'admin') {
            self::enforceRateLimit($keyData['user_id'], 120, 60);
        }

        self::$cachedApiKey = (string)$apiKey;
        self::$cachedUserId = (int)$keyData['user_id'];
        return self::$cachedUserId;
    }

    /**
     * Check dedicated worker authentication.
     */
    public static function checkWorkerAuth(): bool {
        $workerKey = Request::bearerToken();

        if ($workerKey === null || trim($workerKey) === '') {
            Response::error('Unauthorized worker access. Worker API key missing.', [], 401, 'ERR_WORKER_KEY_MISSING');
        }

        if (
            is_string(self::$cachedWorkerKey)
            && hash_equals(self::$cachedWorkerKey, (string)$workerKey)
            && self::$cachedWorkerAuthOk === true
        ) {
            return true;
        }

        try {
            $plainConfiguredKey = WorkerKeyService::getPlaintextKey();
        } catch (\Throwable $e) {
            Response::error('Server security misconfiguration.', [], 500, 'ERR_WORKER_KEY_CONFIG');
        }

        if ($plainConfiguredKey === null || $plainConfiguredKey === '') {
            $message = (defined('ENVIRONMENT') && ENVIRONMENT === 'production') 
                ? 'Server security misconfiguration (Worker Key).' 
                : 'Worker API key is not configured.';
            Response::error($message, [], 503, 'ERR_WORKER_KEY_UNCONFIGURED');
        }

        if (!WorkerKeyService::verifyKey($workerKey)) {
            Response::error('Invalid worker API key.', [], 401, 'ERR_WORKER_KEY_INVALID');
        }

        self::$cachedWorkerKey = (string)$workerKey;
        self::$cachedWorkerAuthOk = true;
        return true;
    }

    /**
     * Check if user is Reseller
     */
    public static function requireReseller($userId) {
        $stmt = DB::prepare("SELECT role FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user || ($user['role'] !== 'reseller' && $user['role'] !== 'admin')) {
            Response::error('Unauthorized access. Reseller privileges required.', [], 403);
        }
        
        return $user;
    }

    /**
     * Check if user is Admin
     */
    public static function requireAdmin($userId) {
        $cacheKey = (int)$userId;
        if ($cacheKey > 0 && isset(self::$cachedAdminChecks[$cacheKey]) && self::$cachedAdminChecks[$cacheKey] === true) {
            return ['role' => 'admin'];
        }

        $stmt = DB::prepare("SELECT role FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user || $user['role'] !== 'admin') {
            Response::error('Unauthorized access. Admin privileges required.', [], 403);
        }

        if ($cacheKey > 0) {
            self::$cachedAdminChecks[$cacheKey] = true;
        }
        
        return $user;
    }

    /**
     * Verify a user's password hash using PHP's native verifier with a bcrypt fallback.
     */
    public static function verifyUserPassword(int $userId, string $plainPassword): bool {
        if ($userId <= 0 || $plainPassword === '') {
            return false;
        }

        $stmt = DB::prepare("SELECT password FROM users WHERE id = ? LIMIT 1");
        $stmt->execute([$userId]);
        $hash = (string)$stmt->fetchColumn();
        if ($hash === '') {
            return false;
        }

        if (password_verify($plainPassword, $hash)) {
            return true;
        }

        $cryptResult = crypt($plainPassword, $hash);
        return is_string($cryptResult) && hash_equals($hash, $cryptResult);
    }

    /**
     * Check if a login attempt should be throttled.
     */
    public static function checkLoginThrottle(string $email, string $ip): void {
        $stmt = DB::prepare("
            SELECT COUNT(*) 
            FROM activity_logs 
            WHERE level = 'WARN' 
              AND source = 'Auth' 
              AND created_at >= NOW() - INTERVAL 15 MINUTE 
              AND (ip = ? OR identifier = ?)
        ");
        $stmt->execute([$ip, $email]);
        $attempts = (int)$stmt->fetchColumn();

        if ($attempts >= 10) {
            throw new \Exception('Too many login attempts. Please try again in 15 minutes.', 429);
        }
    }

    /**
     * Record a failed login attempt.
     */
    public static function recordLoginAttempt(string $email, string $ip, string $reason): void {
        HelperService::logActivity('WARN', 'Auth', "Failed login attempt: $reason", null, $ip, $email);
    }

    /**
     * User Login (Verifies credentials and returns API Key)
     */
    public static function login(string $email, string $password): array {
        $email = strtolower(trim($email));
        if ($email === '' || $password === '') {
            throw new \Exception('Email and password required', 400);
        }

        $stmt = DB::prepare("SELECT id, name, email, password, role, status FROM users WHERE email = ? LIMIT 1");
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password'])) {
            HelperService::logActivity('WARN', 'Auth', "Failed login attempt: $email", null, Request::ip());
            throw new \Exception('Invalid credentials', 401);
        }

        if (strtolower((string)$user['status']) === 'suspended') {
            throw new \Exception('Account suspended', 403);
        }

        // Fetch or create an active API Key for the user
        $apiKey = 'ak_live_' . bin2hex(random_bytes(24));
        $prefix = substr($apiKey, 0, 16);
        $hash = password_hash($apiKey, PASSWORD_ARGON2ID);
        
        $stmt = DB::prepare("SELECT id FROM api_keys WHERE user_id = ? AND name = 'Login Key' LIMIT 1");
        $stmt->execute([$user['id']]);
        $loginKeyId = $stmt->fetchColumn();

        if ($loginKeyId) {
            $stmt = DB::prepare("UPDATE api_keys SET api_key = ?, key_prefix = ?, status = 'active', created_at = CURRENT_TIMESTAMP WHERE id = ?");
            $stmt->execute([$hash, $prefix, $loginKeyId]);
        } else {
            $stmt = DB::prepare("INSERT INTO api_keys (user_id, api_key, key_prefix, name) VALUES (?, ?, ?, 'Login Key')");
            $stmt->execute([$user['id'], $hash, $prefix]);
        }

        HelperService::logActivity('INFO', 'Auth', "User logged in: {$user['name']} ($email)", $user['id'], Request::ip());

        return [
            'user' => [
                'id' => (int)$user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $user['role']
            ],
            'api_key' => $apiKey
        ];
    }

    /**
     * Get user info by ID (authenticated)
     */
    public static function getSessionUser(int $userId): array {
        $user = UserService::getProfile($userId);
        return [
            'id' => (int)$user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'credits' => (int)$user['credits']
        ];
    }

    /**
     * High-speed Redis-backed Rate Limiter (with Database fallback)
     */
    public static function enforceRateLimit($userId, $limit = 60, $window = 60) {
        $endpoint = parse_url(Request::uri(), PHP_URL_PATH) ?: '/';
        $cacheKey = "rate_limit:u{$userId}:ep:" . md5((string)$endpoint);

        // Try Redis first (Phase 1 Optimization)
        $count = CacheService::increment($cacheKey, $window);
        if ($count !== -1) {
            if ($count > $limit) {
                Response::error('Rate limit exceeded. Please try again later.', [], 429);
            }
            return;
        }

        // Fallback to Database if Redis is unavailable
        $pdo = DB::getInstance();

        // Quick cleanup (0.1% probability to avoid lock pressure under high RPS)
        if (rand(1, 1000) === 1) {
            try {
                $pdo->query("DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL 1 HOUR");
            } catch (\Exception $e) {}
        }

        try {
            $stmt = $pdo->prepare("SELECT COUNT(*) as count FROM rate_limits WHERE user_id = ? AND created_at >= NOW() - INTERVAL ? SECOND");
            $stmt->execute([$userId, $window]);
            $result = $stmt->fetch();

            if ($result && (int)$result['count'] >= $limit) {
                Response::error('Rate limit exceeded. Please try again later.', [], 429);
            }

            $stmt = $pdo->prepare("INSERT INTO rate_limits (user_id, endpoint) VALUES (?, ?)");
            $stmt->execute([$userId, $endpoint]);

        } catch (\Exception $e) {
            error_log("Rate limiting error: " . $e->getMessage());
        }
    }
}
