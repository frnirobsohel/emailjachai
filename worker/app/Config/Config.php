<?php
namespace App\Config;

class Config {
    public static function getEnvVar(string $key, ?string $default = null): ?string {
        $val = getenv($key);
        if ($val !== false) return (string)$val;
        
        if (isset($_ENV[$key])) return (string)$_ENV[$key];
        if (isset($_SERVER[$key])) return (string)$_SERVER[$key];
        
        return $default;
    }

    public static function loadDotEnv(string $path): void {
        if (!is_file($path) || !is_readable($path)) {
            return;
        }

        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return;
        }

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || strpos($line, '#') === 0) {
                continue;
            }

            // Split by the first '='
            $parts = explode('=', $line, 2);
            if (count($parts) !== 2) {
                continue;
            }

            $key = trim($parts[0]);
            $value = trim($parts[1]);

            // Remove comments from the end of the line if not inside quotes
            if ($value !== '' && (strpos($value, '"') !== 0 && strpos($value, "'") !== 0)) {
                $value = preg_split('/\s+#/', $value, 2)[0] ?? $value;
                $value = trim($value);
            }

            // Strip quotes
            if (strlen($value) >= 2) {
                $first = $value[0];
                $last = substr($value, -1);
                if (($first === '"' || $first === "'") && $first === $last) {
                    $value = substr($value, 1, -1);
                }
            }

            putenv("$key=$value");
            $_ENV[$key] = $value;
            $_SERVER[$key] = $value;
        }
    }

    public static function resolveWorkerIpAddress(): string {
        $configured = trim((string)self::getEnvVar('WORKER_IP_ADDRESS', ''));
        if ($configured !== '' && filter_var($configured, FILTER_VALIDATE_IP)) {
            return $configured;
        }

        $hostname = gethostname();
        if ($hostname) {
            $resolved = gethostbyname($hostname);
            if (
                $resolved !== false
                && $resolved !== $hostname
                && filter_var($resolved, FILTER_VALIDATE_IP)
                && strpos($resolved, '127.') !== 0
            ) {
                return $resolved;
            }
        }

        return '127.0.0.1';
    }

    public static function sanitizeWorkerServerName(string $name): string {
        $name = preg_replace('/[^a-zA-Z0-9._-]+/', '-', trim($name)) ?? '';
        $name = trim($name, '-_.');
        if ($name === '') {
            return '';
        }
        if (strlen($name) > 100) {
            $name = substr($name, 0, 100);
            $name = rtrim($name, '-_.');
        }
        return $name;
    }

    public static function resolveWorkerServerName(int $serverPort): string {
        $configured = self::sanitizeWorkerServerName((string)self::getEnvVar('WORKER_SERVER_NAME', ''));
        if ($configured !== '') {
            return $configured;
        }

        $hostname = self::sanitizeWorkerServerName((string)(gethostname() ?: ''));
        if ($hostname !== '') {
            return $hostname;
        }

        return 'worker-' . $serverPort;
    }
}
