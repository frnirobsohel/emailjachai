<?php
/**
 * Verification Script for API Fixes
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../core/DB.php';
require_once __DIR__ . '/../core/Response.php';

echo "Verifying fixes...\n";

// 1. Check LOGS_PATH
if (defined('LOGS_PATH')) {
    echo "✓ LOGS_PATH is defined: " . LOGS_PATH . "\n";
} else {
    echo "✗ LOGS_PATH is NOT defined!\n";
}

// 2. Check Core\DB methods (via Reflection or simple test)
$dbClass = new ReflectionClass('Core\DB');
$docComment = $dbClass->getDocComment();
if ($docComment && strpos($docComment, '@method static \PDOStatement prepare') !== false) {
    echo "✓ Core\DB @method tags found.\n";
} else {
    echo "✗ Core\DB @method tags NOT found or incorrect!\n";
}

// 3. Syntax check modified files
$files = [
    __DIR__ . '/../config.php',
    __DIR__ . '/../core/DB.php',
    __DIR__ . '/../app/Controllers/HealthController.php',
    __DIR__ . '/../app/Controllers/JobController.php',
    __DIR__ . '/../app/Services/CacheService.php'
];

foreach ($files as $file) {
    $output = [];
    $returnVar = 0;
    exec("php -l " . escapeshellarg($file), $output, $returnVar);
    if ($returnVar === 0) {
        echo "✓ Syntax OK: " . basename($file) . "\n";
    } else {
        echo "✗ Syntax ERROR: " . basename($file) . " - " . implode("\n", $output) . "\n";
    }
}

echo "Verification complete.\n";
