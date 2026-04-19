<?php

namespace App\Services;

class Logger
{
    private static $sensitiveKeys = [
        'password', 'apiKey', 'token', 'secret', 
        'cvv', 'credit_card', 'authorization', 'api_key'
    ];

    /**
     * Redact sensitive data from an array.
     */
    public static function redact(array $data)
    {
        foreach ($data as $key => $value) {
            if (is_array($value)) {
                $data[$key] = self::redact($value);
            } else {
                foreach (self::$sensitiveKeys as $sensitive) {
                    if (stripos($key, $sensitive) !== false) {
                        $data[$key] = '[REDACTED]';
                        break;
                    }
                }
            }
        }
        return $data;
    }

    /**
     * Log a message with context.
     */
    public static function log($level, $message, array $context = [])
    {
        $redactedContext = self::redact($context);
        $logEntry = [
            'timestamp' => date('Y-m-d H:i:s'),
            'level' => strtoupper($level),
            'message' => $message,
            'context' => $redactedContext,
            'request_id' => \Core\Request::getRequestId()
        ];

        $logFile = __DIR__ . '/../../logs/app.log';
        if (!is_dir(dirname($logFile))) {
            @mkdir(dirname($logFile), 0750, true);
        }

        // Basic Log Rotation (10MB)
        if (file_exists($logFile) && filesize($logFile) > 10 * 1024 * 1024) {
            @rename($logFile, $logFile . '.old');
        }

        file_put_contents($logFile, json_encode($logEntry) . PHP_EOL, FILE_APPEND | LOCK_EX);
    }

    public static function info($message, array $context = []) { self::log('info', $message, $context); }
    public static function warn($message, array $context = []) { self::log('warn', $message, $context); }
    public static function error($message, array $context = []) { self::log('error', $message, $context); }
}
