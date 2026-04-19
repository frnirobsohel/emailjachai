<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../core/DB.php';

use Core\DB;

$tables = [
    'users', 'api_keys', 'jobs', 'job_tasks', 'smtp_configs', 
    'worker_servers', 'packages', 'transactions', 'settings', 
    'email_templates', 'domains', 'activity_logs', 'rate_limits', 
    'processed_requests', 'deleted_job_stats', 'deleted_job_daily_stats'
];

foreach ($tables as $table) {
    try {
        $stmt = DB::query("SHOW COLUMNS FROM `$table` ");
        $cols = $stmt->fetchAll(PDO::FETCH_COLUMN);
        echo "Table $table: " . implode(', ', $cols) . PHP_EOL;
    } catch (Exception $e) {
        echo "Table $table: ERROR - " . $e->getMessage() . PHP_EOL;
    }
}
