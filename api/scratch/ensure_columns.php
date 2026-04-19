<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../core/DB.php';

use Core\DB;

$tables_to_ensure = [
    'users',
    'api_keys',
    'smtp_configs',
    'worker_servers',
    'packages',
    'transactions',
    'activity_logs',
    'rate_limits',
    'processed_requests'
];

echo "Starting database schema update..." . PHP_EOL;

foreach ($tables_to_ensure as $table) {
    try {
        // Check if column exists
        $stmt = DB::query("SHOW COLUMNS FROM `$table` ");
        $cols = $stmt->fetchAll(PDO::FETCH_COLUMN);
        
        if (!in_array('updated_at', $cols, true)) {
            echo "Table $table: Adding updated_at column..." . PHP_EOL;
            DB::exec("ALTER TABLE `$table` ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
            echo "Table $table: updated_at added." . PHP_EOL;
        } else {
            echo "Table $table: updated_at already exists." . PHP_EOL;
        }
    } catch (Exception $e) {
        echo "Table $table: ERROR - " . $e->getMessage() . PHP_EOL;
    }
}

echo "Database schema update complete." . PHP_EOL;
