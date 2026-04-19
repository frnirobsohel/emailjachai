<?php
/**
 * Configuration for Frontend API
 */

// Load local env files when the web server has not injected environment variables.
(static function (): void{
    $setEnv = static function (string $key, string $value): void{
            $current = getenv($key);
            if ($current === false || $current === '') {
                putenv($key . '=' . $value);
            }

            if (!isset($_ENV[$key]) || $_ENV[$key] === '') {
                $_ENV[$key] = $value;
            }

            if (!isset($_SERVER[$key]) || $_SERVER[$key] === '') {
                $_SERVER[$key] = $value;
            }
        }
            ;

        $parseValue = static function (string $value): string{
            $value = trim($value);
            if ($value === '') {
                return '';
            }

            $firstChar = $value[0];
            $lastChar = substr($value, -1);
            if (($firstChar === '"' || $firstChar === "'") && $firstChar === $lastChar) {
                return substr($value, 1, -1);
            }

            $value = preg_split('/\s+#/', $value, 2)[0] ?? $value;
            return trim($value);
        }
            ;

        $loadEnvFile = static function (string $path) use ($setEnv, $parseValue): void{
            if (!is_file($path) || !is_readable($path)) {
                return;
            }

            foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $line = trim($line);
                if ($line === '' || str_starts_with($line, '#')) {
                    continue;
                }

                if (str_starts_with($line, 'export ')) {
                    $line = trim(substr($line, 7));
                }

                $parts = explode('=', $line, 2);
                if (count($parts) !== 2) {
                    continue;
                }

                $key = trim($parts[0]);
                if ($key === '') {
                    continue;
                }

                $setEnv($key, $parseValue($parts[1]));
            }
        }
            ;

        $candidates = [
            __DIR__ . '/.env.local',
            __DIR__ . '/.env',
        ];

        foreach ($candidates as $candidate) {
            $loadEnvFile($candidate);
        }})();

// Database and Environment Configuration
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') ?: (getenv('DB_PASSWORD') ?: ''));
define('DB_NAME', getenv('DB_NAME') ?: 'frontend');
define('ENVIRONMENT', getenv('ENVIRONMENT') ?: 'development');

// Fail-fast security checks
if (ENVIRONMENT === 'production') {
    $required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'JWT_SECRET'];
    foreach ($required as $var) {
        if (empty(getenv($var))) {
            die("Fatal Error: Missing critical environment variable ($var) for production.");
        }
    }
}

// API base path detection
$apiBasePath = getenv('API_BASE_PATH') ?: '';
if ($apiBasePath === '' && !empty($_SERVER['SCRIPT_NAME'])) {
    $scriptDir = str_replace('\\', '/', dirname((string)$_SERVER['SCRIPT_NAME']));
    $apiBasePath = trim($scriptDir, '/. ');
}
define('API_BASE_PATH', '/' . trim($apiBasePath ?: 'api', '/'));

// Paths
define('LOGS_PATH', __DIR__ . '/logs');
define('STORAGE_PATH', __DIR__ . '/storage');
define('JOBS_PATH', STORAGE_PATH . '/jobs');
define('BULK_JOBS_PATH', JOBS_PATH . '/bulk');
define('RESULTS_PATH', STORAGE_PATH . '/results');
define('SINGLE_RESULTS_PATH', RESULTS_PATH . '/single');
define('BULK_RESULTS_PATH', RESULTS_PATH . '/bulk');

// Permissions Check for Production/Development
(static function (): void{
    $paths = [
        STORAGE_PATH,
        JOBS_PATH,
        BULK_JOBS_PATH,
        RESULTS_PATH,
        SINGLE_RESULTS_PATH,
        BULK_RESULTS_PATH,
        __DIR__ . '/logs'
    ];

    foreach ($paths as $path) {
        if (!is_dir($path)) {
            if (!@mkdir($path, 0755, true) && !is_dir($path)) {
                error_log("Critical Error: Storage directory does not exist and cannot be created: $path");
            }
        }
        if (is_dir($path) && (!is_writable($path) || !is_readable($path))) {
            error_log("Warning: Directory is not writable/readable: $path");
            if (ENVIRONMENT === 'production') {
            // In local dev we might skip, but in production we want to know
            }
        }
    }
})();
