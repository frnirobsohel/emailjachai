<?php
namespace App\Services;

use Core\DB;

class DeletedJobStatsService {
    private static $schemaChecked = false;
    private static $schemaAvailable = false;

    public static function ensureSchema(?\PDO $pdo = null): bool {
        if (self::$schemaChecked) {
            return self::$schemaAvailable;
        }

        // Use a persistent flag file to avoid DB pings on every request in production/dev
        $flagFile = STORAGE_PATH . '/.deleted_job_stats_schema_ok';
        if (file_exists($flagFile)) {
            self::$schemaChecked = true;
            self::$schemaAvailable = true;
            return true;
        }

        $pdo = $pdo ?: DB::getInstance();

        try {
            self::verifySchema($pdo);
            self::$schemaAvailable = true;
            @file_put_contents($flagFile, date('Y-m-d H:i:s'));
        } catch (\Throwable $e) {
            try {
                self::migrateSchema($pdo);
                self::verifySchema($pdo);
                self::$schemaAvailable = true;
                @file_put_contents($flagFile, date('Y-m-d H:i:s'));
            } catch (\Throwable $e2) {
                self::$schemaAvailable = false;
            }
        }

        self::$schemaChecked = true;
        return self::$schemaAvailable;
    }

    private static function verifySchema(\PDO $pdo): void {
        $pdo->query("SELECT 1 FROM deleted_job_stats LIMIT 1");
        $pdo->query("SELECT 1 FROM deleted_job_daily_stats LIMIT 1");
    }

    private static function migrateSchema(\PDO $pdo): void {
        $pdo->exec("
            CREATE TABLE IF NOT EXISTS deleted_job_stats (
                user_id INT NOT NULL,
                total_verifications INT NOT NULL DEFAULT 0,
                total_jobs INT NOT NULL DEFAULT 0,
                deliverable INT NOT NULL DEFAULT 0,
                risky INT NOT NULL DEFAULT 0,
                undeliverable INT NOT NULL DEFAULT 0,
                catch_all INT NOT NULL DEFAULT 0,
                disposable INT NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id)
            )
        ");

        $pdo->exec("
            CREATE TABLE IF NOT EXISTS deleted_job_daily_stats (
                user_id INT NOT NULL,
                activity_date DATE NOT NULL,
                emails INT NOT NULL DEFAULT 0,
                jobs INT NOT NULL DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, activity_date)
            )
        ");
    }

    public static function recordDeletedJob(\PDO $pdo, int $userId, array $jobRow): void {
        if (!self::ensureSchema($pdo)) {
            return;
        }

        $processed = max(0, (int)($jobRow['processed_count'] ?? 0));
        $deliverable = max(0, (int)($jobRow['deliverable'] ?? 0));
        $risky = max(0, (int)($jobRow['risky'] ?? 0));
        $undeliverable = max(0, (int)($jobRow['undeliverable'] ?? 0));
        $catchAll = max(0, (int)($jobRow['catch_all'] ?? 0));
        $disposable = max(0, (int)($jobRow['disposable'] ?? 0));
        $jobType = (string)($jobRow['job_type'] ?? '');
        $bulkJobs = ($jobType === 'bulk') ? 1 : 0;
        $activityDate = trim((string)($jobRow['activity_date'] ?? ''));

        if ($activityDate === '') {
            $createdAt = (string)($jobRow['created_at'] ?? '');
            $createdTs = strtotime($createdAt);
            $activityDate = ($createdTs !== false) ? gmdate('Y-m-d', $createdTs) : gmdate('Y-m-d');
        }

        $summaryStmt = $pdo->prepare("
            INSERT INTO deleted_job_stats
                (user_id, total_verifications, total_jobs, deliverable, risky, undeliverable, catch_all, disposable)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                total_verifications = total_verifications + VALUES(total_verifications),
                total_jobs = total_jobs + VALUES(total_jobs),
                deliverable = deliverable + VALUES(deliverable),
                risky = risky + VALUES(risky),
                undeliverable = undeliverable + VALUES(undeliverable),
                catch_all = catch_all + VALUES(catch_all),
                disposable = disposable + VALUES(disposable)
        ");
        $summaryStmt->execute([
            $userId,
            $processed,
            $bulkJobs,
            $deliverable,
            $risky,
            $undeliverable,
            $catchAll,
            $disposable
        ]);

        $dailyStmt = $pdo->prepare("
            INSERT INTO deleted_job_daily_stats
                (user_id, activity_date, emails, jobs)
            VALUES
                (?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE
                emails = emails + VALUES(emails),
                jobs = jobs + VALUES(jobs)
        ");
        $dailyStmt->execute([$userId, $activityDate, $processed]);
    }

    public static function fetchTotals(int $userId): array {
        if (!self::ensureSchema()) {
            return [
                'total_verifications' => 0,
                'total_jobs' => 0,
                'deliverable' => 0,
                'risky' => 0,
                'undeliverable' => 0,
                'catch_all' => 0,
                'disposable' => 0,
            ];
        }

        $stmt = DB::prepare("
            SELECT
                total_verifications,
                total_jobs,
                deliverable,
                risky,
                undeliverable,
                catch_all,
                disposable
            FROM deleted_job_stats
            WHERE user_id = ?
            LIMIT 1
        ");
        $stmt->execute([$userId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];

        return [
            'total_verifications' => (int)($row['total_verifications'] ?? 0),
            'total_jobs' => (int)($row['total_jobs'] ?? 0),
            'deliverable' => (int)($row['deliverable'] ?? 0),
            'risky' => (int)($row['risky'] ?? 0),
            'undeliverable' => (int)($row['undeliverable'] ?? 0),
            'catch_all' => (int)($row['catch_all'] ?? 0),
            'disposable' => (int)($row['disposable'] ?? 0),
        ];
    }

    public static function fetchDaily(int $userId, string $fromDate): array {
        if (!self::ensureSchema()) {
            return [];
        }

        $stmt = DB::prepare("
            SELECT activity_date as date, emails, jobs
            FROM deleted_job_daily_stats
            WHERE user_id = ? AND activity_date >= ?
            ORDER BY activity_date ASC
        ");
        $stmt->execute([$userId, $fromDate]);
        $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        if (!is_array($rows)) {
            return [];
        }

        return array_map(function (array $row): array {
            return [
                'date' => (string)($row['date'] ?? ''),
                'emails' => (int)($row['emails'] ?? 0),
                'jobs' => (int)($row['jobs'] ?? 0),
            ];
        }, $rows);
    }
}
