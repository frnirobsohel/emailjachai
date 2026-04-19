<?php
/**
 * Production Readiness Check Script
 */

require_once __DIR__ . '/../config.php';

echo "--- Production Readiness Check ---\n";

$errors = [];
$warnings = [];

// 1. Check Environment
if (ENVIRONMENT !== 'production') {
    $warnings[] = "Environment is set to '" . ENVIRONMENT . "', not 'production'.";
} else {
    echo "[OK] Environment is 'production'.\n";
}

// 2. Check Critical Env Vars
$criticalVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'JWT_SECRET', 'FRONTEND_URL'];
foreach ($criticalVars as $var) {
    if (empty(getenv($var))) {
        $errors[] = "Missing critical environment variable: $var";
    } else {
        echo "[OK] Environment variable '$var' is set.\n";
    }
}

// 3. Check DB Connectivity
try {
    $pdo = \Core\DB::getInstance();
    $pdo->query("SELECT 1");
    echo "[OK] Database connectivity verified.\n";
} catch (\Throwable $e) {
    $errors[] = "Database connectivity failed: " . $e->getMessage();
}

// 4. Check Storage Writable
$paths = [
    STORAGE_PATH,
    JOBS_PATH,
    RESULTS_PATH
];

foreach ($paths as $path) {
    if (!is_dir($path)) {
        $errors[] = "Storage path missing: $path";
    } elseif (!is_writable($path)) {
        $errors[] = "Storage path not writable: $path";
    } else {
        echo "[OK] Storage path writable: " . basename($path) . "\n";
    }
}

// 5. Check SSL (if it were possible here, but let's check config)
if (ENVIRONMENT === 'production' && !str_starts_with(getenv('FRONTEND_URL') ?: '', 'https://')) {
    $warnings[] = "FRONTEND_URL does not use HTTPS in production.";
}

echo "\n--- Summary ---\n";
if (empty($errors)) {
    echo "SUCCESS: System is ready for production.\n";
} else {
    echo "FAILED: System has " . count($errors) . " errors.\n";
    foreach ($errors as $err) {
        echo "  [ERROR] $err\n";
    }
}

if (!empty($warnings)) {
    echo "\nWarnings:\n";
    foreach ($warnings as $warn) {
        echo "  [WARN] $warn\n";
    }
}

exit(empty($errors) ? 0 : 1);
