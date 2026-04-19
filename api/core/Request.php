<?php
namespace Core;

class Request {
    private static $jsonParsed = false;
    private static $jsonCache = [];
    private static $headersCache = null;

    public static function method() {
        return $_SERVER['REQUEST_METHOD'];
    }

    public static function uri() {
        return $_SERVER['REQUEST_URI'];
    }

    public static function json() {
        if (!self::$jsonParsed) {
            $input = file_get_contents('php://input');
            $decoded = json_decode((string)$input, true);
            self::$jsonCache = is_array($decoded) ? $decoded : [];
            self::$jsonParsed = true;
        }

        return self::$jsonCache;
    }

    public static function get($key, $default = null) {
        return $_GET[$key] ?? $default;
    }

    public static function getInt($key, $default = 0) {
        return isset($_GET[$key]) ? (int)$_GET[$key] : $default;
    }

    public static function getBool($key, $default = false) {
        if (!isset($_GET[$key])) return $default;
        $val = $_GET[$key];
        return $val === 'true' || $val === '1' || $val === true;
    }

    public static function validateEmail($key) {
        $email = self::get($key);
        return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }

    public static function header($key) {
        if (self::$headersCache === null) {
            self::$headersCache = function_exists('getallheaders') ? (getallheaders() ?: []) : [];
        }
        $headers = self::$headersCache;

        if (empty($headers)) {
            $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $key));
            return $_SERVER[$serverKey] ?? null;
        }
        
        // Case-insensitive header check
        $keyLower = strtolower($key);
        foreach ($headers as $k => $v) {
            if (strtolower($k) === $keyLower) return $v;
        }
        return null;
    }

    public static function bearerToken() {
        $authHeader = self::header('Authorization');
        if ($authHeader && preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
            return $matches[1];
        }
        return null;
    }

    public static function getRequestId() {
        static $requestId = null;
        if ($requestId === null) {
            $requestId = self::header('X-Request-ID') ?? uniqid('req_');
        }
        return $requestId;
    }

    public static function ip() {
        $remoteAddr = $_SERVER['REMOTE_ADDR'] ?? '';
        
        $trustedProxies = defined('TRUSTED_PROXIES') ? TRUSTED_PROXIES : getenv('TRUSTED_PROXIES');
        $isTrusted = false;
        
        if ($trustedProxies === '*' || $trustedProxies === 'any') {
            $isTrusted = true;
        } elseif (is_string($trustedProxies) && $trustedProxies !== '') {
            $proxies = explode(',', $trustedProxies);
            if (in_array($remoteAddr, array_map('trim', $proxies))) {
                $isTrusted = true;
            }
        }

        if (!$isTrusted) {
            return $remoteAddr ?: 'SYSTEM';
        }

        $candidates = [];
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $forwarded = explode(',', (string)$_SERVER['HTTP_X_FORWARDED_FOR']);
            foreach ($forwarded as $ip) {
                $ip = trim($ip);
                if ($ip !== '') $candidates[] = $ip;
            }
        }

        if (!empty($_SERVER['HTTP_X_REAL_IP'])) {
            $candidates[] = trim((string)$_SERVER['HTTP_X_REAL_IP']);
        }

        $candidates[] = $remoteAddr;

        foreach ($candidates as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                return $ip;
            }
        }

        foreach ($candidates as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
        return $remoteAddr ?: 'SYSTEM';
    }

    public static function all() {
        return array_merge($_GET, self::json());
    }

    /**
     * Standardized validation helper
     */
    public static function validate(array $rules): array {
        $data = self::all();
        $validated = [];
        $errors = [];

        foreach ($rules as $field => $fieldRules) {
            $value = $data[$field] ?? null;
            $rulesList = is_string($fieldRules) ? explode('|', $fieldRules) : $fieldRules;

            foreach ($rulesList as $rule) {
                if ($rule === 'required' && ($value === null || $value === '')) {
                    $errors[$field][] = "The {$field} field is required.";
                } elseif ($rule === 'email' && $value && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                    $errors[$field][] = "The {$field} must be a valid email address.";
                } elseif (str_starts_with($rule, 'min:')) {
                    $min = (int)substr($rule, 4);
                    if (strlen((string)$value) < $min) {
                        $errors[$field][] = "The {$field} must be at least {$min} characters.";
                    }
                }
                // Add more rules as needed...
            }

            if (!isset($errors[$field])) {
                $validated[$field] = $value;
            }
        }

        if (!empty($errors)) {
            Response::error('Validation failed', $errors, 422, 'ERR_VALIDATION_FAILED');
        }

        return $validated;
    }
}
