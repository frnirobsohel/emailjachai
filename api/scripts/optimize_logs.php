<?php
require_once dirname(__DIR__) . '/config.php';
require_once dirname(__DIR__) . '/core/DB.php';

use Core\DB;

try {
    echo "Starting activity_logs optimization...\n";

    // Add identifier column if not exists
    $cols = DB::query("SHOW COLUMNS FROM activity_logs")->fetchAll(PDO::FETCH_COLUMN);
    if (!in_array('identifier', $cols)) {
        DB::exec("ALTER TABLE activity_logs ADD COLUMN identifier VARCHAR(255) NULL AFTER ip");
        echo "Added 'identifier' column.\n";
    }

    // Create indexes for faster throttling
    DB::exec("CREATE INDEX IF NOT EXISTS idx_logs_identifier_created ON activity_logs(identifier, created_at)");
    DB::exec("CREATE INDEX IF NOT EXISTS idx_logs_ip_created ON activity_logs(ip, created_at)");
    echo "Created performance indexes.\n";

    // Backfill identifier from message for "Failed login attempt" logs
    echo "Backfilling identifiers...\n";
    $stmt = DB::prepare("
        UPDATE activity_logs 
        SET identifier = SUBSTRING_INDEX(SUBSTRING_INDEX(message, 'for: ', -1), ' ', 1)
        WHERE identifier IS NULL AND message LIKE 'Failed login attempt%for: %'
    ");
    $stmt->execute();
    
    $stmt = DB::prepare("
        UPDATE activity_logs 
        SET identifier = SUBSTRING_INDEX(SUBSTRING_INDEX(message, 'email not found: ', -1), ' ', 1)
        WHERE identifier IS NULL AND message LIKE 'Failed login attempt%email not found: %'
    ");
    $stmt->execute();

    // Prune logs older than 30 days
    echo "Pruning activity_logs (older than 30 days)...\n";
    $pruneStmt = DB::prepare("DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL 30 DAY");
    $pruneStmt->execute();
    $deletedLogs = $pruneStmt->rowCount();
    echo "Deleted $deletedLogs rows from activity_logs.\n";

    // Prune rate_limits older than 24 hours (Redis should handle new ones)
    echo "Pruning rate_limits (older than 24 hours)...\n";
    $pruneRateStmt = DB::prepare("DELETE FROM rate_limits WHERE created_at < NOW() - INTERVAL 24 HOUR");
    $pruneRateStmt->execute();
    $deletedRate = $pruneRateStmt->rowCount();
    echo "Deleted $deletedRate rows from rate_limits.\n";

    // Optimize tables
    echo "Optimizing tables...\n";
    DB::exec("OPTIMIZE TABLE activity_logs, rate_limits");

    echo "Optimization and pruning complete.\n";
} catch (\Throwable $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
