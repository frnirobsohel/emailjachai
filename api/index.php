<?php
/**
 * Application Entry Point (Front Controller)
 */
ob_start();

// Base Path
define('BASE_PATH', __DIR__);

// Load config first so ENVIRONMENT constants are available.
require_once BASE_PATH . '/config.php';

// ENVIRONMENT based Error Reporting
if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
    ini_set('display_errors', 0);
    ini_set('log_errors', 1);
    ini_set('error_log', BASE_PATH . '/logs/error.log');
    error_reporting(E_ALL & ~E_DEPRECATED & ~E_STRICT);
} else {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
}

// Robust Autoloader (PSR-4 compliant)
spl_autoload_register(function ($class) {
    // Current mapping: Core\ -> core/, App\ -> app/
    $prefixes = [
        'Core\\' => 'core/',
        'App\\' => 'app/',
    ];

    foreach ($prefixes as $prefix => $baseDir) {
        $len = strlen($prefix);
        if (strncmp($prefix, $class, $len) !== 0) {
            continue;
        }

        $relativeClass = substr($class, $len);
        $file = BASE_PATH . '/' . $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

        if (file_exists($file)) {
            require_once $file;
            return;
        }
    }
});

// Global Exception Handler - The safety net for the foundation
set_exception_handler(function (\Throwable $e) {
    $code = (is_numeric($e->getCode()) && $e->getCode() >= 400 && $e->getCode() < 600) ? $e->getCode() : 500;
    
    $message = (defined('ENVIRONMENT') && ENVIRONMENT === 'production') 
        ? 'A system error occurred. Please try again later.' 
        : $e->getMessage();
        
    $data = (defined('ENVIRONMENT') && ENVIRONMENT === 'production')
        ? []
        : [
            'type' => get_class($e),
            'file' => $e->getFile(),
            'line' => $e->getLine(),
            'trace' => explode("\n", $e->getTraceAsString())
        ];

    // Log the error
    \App\Services\Logger::error("Unhandled Exception: " . $e->getMessage(), [
        'exception' => get_class($e),
        'file' => $e->getFile(),
        'line' => $e->getLine()
    ]);

    if (class_exists('\\Core\\Response')) {
        \Core\Response::error($message, $data, $code, 'ERR_SYSTEM_CRASH');
    } else {
        http_response_code($code);
        header('Content-Type: application/json');
        echo json_encode(['status' => 'error', 'message' => $message, 'data' => $data]);
    }
    exit;
});

// Add Security Headers
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");
header("X-XSS-Protection: 1; mode=block");
header("Referrer-Policy: strict-origin-when-cross-origin");
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';");

// Setup CORS
$allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];
$envOrigins = getenv('FRONTEND_URL') ?: '';

if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
    if ($envOrigins === '') {
        // In production, FRONTEND_URL MUST be set. If not, only allow nothing or log a warning.
        $allowedOrigins = [];
    } else {
        $allowedOrigins = array_map('trim', explode(',', $envOrigins));
    }
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
} elseif (defined('ENVIRONMENT') && ENVIRONMENT === 'production' && $origin !== '') {
    // In production, log unauthorized origin attempts if needed
    error_log("Unauthorized CORS attempt from origin: " . $origin);
}

header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Key-Id, X-Request-ID, X-Idempotency-Key");
header("Access-Control-Allow-Methods: POST, GET, DELETE, OPTIONS, PUT");

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// CLI Commands handling
if (php_sapi_name() === 'cli' && isset($_SERVER['argv']) && in_array('--migrate', $_SERVER['argv'], true)) {
    echo "Running Granite Migration Engine...\n";
    try {
        \Core\Migration::run();
        echo "Migrations completed successfully.\n";
    } catch (\Throwable $e) {
        echo "Migration error: " . $e->getMessage() . "\n";
    }
    exit(0);
}

// Initialize Router
$router = new \Core\Router();

// Load Routes
require_once BASE_PATH . '/routes/api.php';

// Resolve incoming request
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$router->resolve($requestUri, $requestMethod);
