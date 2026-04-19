<?php
namespace App\Services;

use Core\DB;

class WorkerService extends BaseService {

    public static function claimTask(string $serverName): ?array {
        return DB::transaction(function(\PDO $pdo) use ($serverName) {
            $timeout = self::getTaskTimeoutMinutes($pdo);

            // Automated Watchdog: Reset zombie tasks, but only run this check every 5 minutes
            $watchdogFlag = STORAGE_PATH . '/.worker_watchdog_last_run';
            $lastRun = file_exists($watchdogFlag) ? (int)file_get_contents($watchdogFlag) : 0;
            if (time() - $lastRun > 300) {
                $pdo->prepare("
                    UPDATE job_tasks 
                    SET status = 'queued', worker_server = NULL, updated_at = NOW() 
                    WHERE status = 'processing' 
                      AND updated_at < DATE_SUB(NOW(), INTERVAL (? * 2) MINUTE)
                ")->execute([$timeout]);
                @file_put_contents($watchdogFlag, time());
            }

            $stmt = $pdo->prepare("
                SELECT id, job_id, start_index, end_index 
                FROM job_tasks 
                WHERE status = 'queued'
                ORDER BY updated_at ASC, id ASC
                LIMIT 1 FOR UPDATE
            ");
            $stmt->execute();
            $task = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$task) {
                $stmt = $pdo->prepare("
                    SELECT id, job_id, start_index, end_index
                    FROM job_tasks
                    WHERE status = 'processing'
                      AND updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
                    ORDER BY updated_at ASC, id ASC
                    LIMIT 1 FOR UPDATE
                ");
                $stmt->execute([$timeout]);
                $task = $stmt->fetch(\PDO::FETCH_ASSOC);
            }

            if (!$task) {
                return null;
            }

            $updateStmt = $pdo->prepare("
                UPDATE job_tasks
                SET status = 'processing', worker_server = ?, updated_at = NOW()
                WHERE id = ?
                  AND (
                        status = 'queued'
                        OR (status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE))
                  )
            ");
            $updateStmt->execute([$serverName, $task['id'], $timeout]);

            if ($updateStmt->rowCount() === 0) {
                return null;
            }

            $jobStateStmt = $pdo->prepare("
                UPDATE jobs
                SET status = 'processing'
                WHERE job_id = ?
                  AND status IN ('pending', 'failed', 'completed')
                  AND processed_count < total_emails
            ");
            $jobStateStmt->execute([$task['job_id']]);


            $jobId = (string)$task['job_id'];
            $startIndex = (int)$task['start_index'];
            $endIndex = (int)$task['end_index'];

            $chunkEmails = [];
            $ndjsonFile = BULK_JOBS_PATH . '/' . $jobId . '.emails.ndjson';
            $offsetFile = BULK_JOBS_PATH . '/' . $jobId . '.offsets.json';

            if (file_exists($ndjsonFile)) {
                $chunkEmails = self::readChunkFromNdjson($ndjsonFile, $offsetFile, $startIndex, $endIndex);
            } else {
                $queueFile = BULK_JOBS_PATH . '/' . $jobId . '.emails.json';
                if (!file_exists($queueFile)) {
                    $legacyFile = BULK_JOBS_PATH . '/' . $jobId . '.queue.json';
                    if (file_exists($legacyFile)) {
                        $queueFile = $legacyFile;
                    } else {
                        $pdo->prepare("UPDATE job_tasks SET status = 'failed' WHERE id = ?")->execute([$task['id']]);
                        self::reconcileJobStatus($jobId);
                        throw new \Exception('Job file not found', 500);
                    }
                }

                $data = json_decode((string)file_get_contents($queueFile), true);
                $allEmails = (is_array($data) && isset($data['emails']) && is_array($data['emails'])) ? $data['emails'] : [];
                $length = max(0, $endIndex - $startIndex + 1);
                $chunkEmails = array_slice($allEmails, $startIndex, $length);
            }

            if (count($chunkEmails) === 0 && (max(0, $endIndex - $startIndex + 1)) > 0) {
                $pdo->prepare("UPDATE job_tasks SET status = 'failed' WHERE id = ?")->execute([$task['id']]);
                self::reconcileJobStatus($jobId);
                throw new \Exception('Task email chunk could not be loaded', 500);
            }

            return [
                'task_id' => $task['id'],
                'job_id' => $jobId,
                'emails' => array_values($chunkEmails)
            ];

        });
    }

    /**
     * Resets any 'processing' tasks assigned to this worker back to 'queued'.
     * Used on worker startup to recover from unclean shutdowns.
     */
    public static function resetWorkerTasks(string $serverName): int {
        $stmt = DB::prepare("
            UPDATE job_tasks 
            SET status = 'queued', worker_server = NULL, updated_at = NOW()
            WHERE worker_server = ? AND status = 'processing'
        ");
        $stmt->execute([$serverName]);
        $count = $stmt->rowCount();
        
        return $count;
    }

    public static function completeTask(int $taskId, string $serverName, string $status = 'completed'): bool {
        $jobLookup = DB::prepare("
            SELECT job_id, start_index, end_index, pushed_count, worker_server
            FROM job_tasks
            WHERE id = ?
            LIMIT 1
        ");
        $jobLookup->execute([$taskId]);
        $task = $jobLookup->fetch(\PDO::FETCH_ASSOC);
        if (!$task) {
            throw new \Exception('Task not found', 404);
        }

        $jobId = (string)$task['job_id'];
        $assignedServer = trim((string)($task['worker_server'] ?? ''));
        if ($assignedServer !== '' && !hash_equals($assignedServer, $serverName)) {
            throw new \Exception('Task belongs to another worker server', 403);
        }

        $expectedCount = max(0, ((int)$task['end_index'] - (int)$task['start_index'] + 1));
        $pushedCount = max(0, (int)($task['pushed_count'] ?? 0));
        
        $jobProgressStmt = DB::prepare("SELECT processed_count, total_emails FROM jobs WHERE job_id = ? LIMIT 1");
        $jobProgressStmt->execute([$jobId]);
        $jobProgress = $jobProgressStmt->fetch(\PDO::FETCH_ASSOC) ?: [];
        $jobProcessed = (int)($jobProgress['processed_count'] ?? 0);
        $jobTotal = (int)($jobProgress['total_emails'] ?? 0);
        $legacyFullyProcessed = ($jobTotal > 0 && $jobProcessed >= $jobTotal);

        if ($status === 'completed' && $pushedCount < $expectedCount && !$legacyFullyProcessed) {
            $requeueStmt = DB::prepare("
                UPDATE job_tasks
                SET status = 'queued', worker_server = NULL, updated_at = NOW()
                WHERE id = ? AND status = 'processing'
            ");
            $requeueStmt->execute([$taskId]);
            throw new \Exception('Task results incomplete; task requeued', 409);
        }

        if ($status === 'completed' && $pushedCount < $expectedCount && $legacyFullyProcessed) {
            $backfillStmt = DB::prepare("UPDATE job_tasks SET pushed_count = ? WHERE id = ?");
            $backfillStmt->execute([$expectedCount, $taskId]);
        }

        $stmt = DB::prepare("UPDATE job_tasks SET status = ?, updated_at = NOW() WHERE id = ? AND status = 'processing'");
        $stmt->execute([$status, $taskId]);

        if ($stmt->rowCount() === 0) {
            throw new \Exception('Task is not in processing state', 409);
        }

        self::reconcileJobStatus($jobId);
        return true;
    }

    public static function readChunkFromNdjson(string $queueFile, string $offsetFile, int $startIndex, int $endIndex): array {
        $targetLength = max(0, $endIndex - $startIndex + 1);
        if ($targetLength === 0) {
            return [];
        }

        $startOffset = null;
        if (file_exists($offsetFile)) {
            $offsetMap = json_decode((string)file_get_contents($offsetFile), true);
            if (is_array($offsetMap) && isset($offsetMap[(string)$startIndex])) {
                $startOffset = (int)$offsetMap[(string)$startIndex];
            }
        }

        $handle = @fopen($queueFile, 'rb');
        if ($handle === false) {
            return [];
        }

        if ($startOffset !== null) {
            fseek($handle, $startOffset);
        } else {
            for ($i = 0; $i < $startIndex; $i++) {
                if (fgets($handle) === false) {
                    fclose($handle);
                    return [];
                }
            }
        }

        $emails = [];
        while (count($emails) < $targetLength) {
            $line = fgets($handle);
            if ($line === false) {
                break;
            }
            $email = trim((string)$line);
            if ($email !== '') {
                $emails[] = $email;
            }
        }

        fclose($handle);
        return $emails;
    }

    public static function getTaskTimeoutMinutes(\PDO $pdo): int {
        static $localCache = null;
        if ($localCache !== null) return $localCache;

        $cacheKey = 'worker_task_timeout_minutes_v1';
        $success = false;

        if (function_exists('apcu_fetch')) {
            $cachedValue = apcu_fetch($cacheKey, $success);
            if ($success) {
                $timeout = (int)$cachedValue;
                if ($timeout > 0) {
                    $localCache = $timeout;
                    return $timeout;
                }
            }
        }

        // File-based cache fallback for XAMPP environments
        $cacheFile = STORAGE_PATH . '/.task_timeout_cache';
        if (!$success && file_exists($cacheFile) && (time() - filemtime($cacheFile) < 300)) {
            $timeout = (int)file_get_contents($cacheFile);
            if ($timeout > 0) {
                $localCache = $timeout;
                return $timeout;
            }
        }

        $stmt = $pdo->prepare("SELECT setting_value FROM settings WHERE setting_key = 'task_timeout'");
        $stmt->execute();
        $timeout = (int)$stmt->fetchColumn();
        if ($timeout <= 0) {
            $timeout = 60;
        }

        if (function_exists('apcu_store')) {
            apcu_store($cacheKey, $timeout, 30);
        }
        @file_put_contents($cacheFile, $timeout);

        $localCache = $timeout;
        return $timeout;
    }

    public static function isKnownEnabledWorker(string $serverName): bool {
        $stmt = DB::prepare("
            SELECT enabled
            FROM worker_servers
            WHERE server_name = ?
            LIMIT 2
        ");
        $stmt->execute([$serverName]);
        $rows = $stmt->fetchAll(\PDO::FETCH_COLUMN);
        if (!is_array($rows) || count($rows) !== 1) {
            return false;
        }

        return (int)$rows[0] === 1;
    }

    public static function reconcileJobStatus(string $jobId): void {
        $stmt = DB::prepare("
            SELECT
                SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
                SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
            FROM job_tasks
            WHERE job_id = ?
        ");
        $stmt->execute([$jobId]);
        $counts = $stmt->fetch(\PDO::FETCH_ASSOC) ?: [];

        $queued = (int)($counts['queued_count'] ?? 0);
        $processing = (int)($counts['processing_count'] ?? 0);
        $failed = (int)($counts['failed_count'] ?? 0);

        if (($queued + $processing) > 0) {
            return;
        }

        if ($failed === 0) {
            $jobProgressStmt = DB::prepare("SELECT processed_count, total_emails FROM jobs WHERE job_id = ? LIMIT 1");
            $jobProgressStmt->execute([$jobId]);
            $jobProgress = $jobProgressStmt->fetch(\PDO::FETCH_ASSOC) ?: [];
            $jobProcessed = (int)($jobProgress['processed_count'] ?? 0);
            $jobTotal = (int)($jobProgress['total_emails'] ?? 0);

            if ($jobTotal > 0 && $jobProcessed < $jobTotal) {
                $requeueStmt = DB::prepare("
                    UPDATE job_tasks
                    SET status = 'queued', worker_server = NULL, updated_at = NOW()
                    WHERE job_id = ?
                      AND status = 'completed'
                      AND pushed_count < (end_index - start_index + 1)
                ");
                $requeueStmt->execute([$jobId]);
                if ($requeueStmt->rowCount() > 0) {
                    $jobStatusStmt = DB::prepare("UPDATE jobs SET status = 'processing' WHERE job_id = ?");
                    $jobStatusStmt->execute([$jobId]);
                    return;
                }
            }
        }

        $statusStmt = DB::prepare("
            UPDATE jobs
            SET status = CASE
                WHEN ? > 0 THEN 'failed'
                WHEN processed_count >= total_emails THEN 'completed'
                ELSE 'failed'
            END
            WHERE job_id = ? AND status != 'completed'
        ");
        $statusStmt->execute([$failed, $jobId]);
    }
}
