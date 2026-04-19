<?php
namespace App\Services;

use Core\DB;
use App\Services\HelperService;
use App\Services\BillingService;

class JobService extends BaseService {

    public static function getBulkJobSettings(): array {
        static $localCache = null;
        if ($localCache !== null) return $localCache;

        $cacheFile = STORAGE_PATH . '/.bulk_job_settings_cache';
        if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < 300)) {
            $cached = json_decode((string)file_get_contents($cacheFile), true);
            if (is_array($cached)) {
                $localCache = $cached;
                return $cached;
            }
        }

        $settings = [
            'chunk_size' => 1000,
            'max_emails_per_job' => 100000,
            'max_active_jobs_per_user' => 0
        ];

        $stmtSettings = DB::prepare("
            SELECT setting_key, setting_value
            FROM settings
            WHERE setting_key IN ('chunk_size', 'max_emails_per_job', 'max_active_jobs_per_user')
        ");
        $stmtSettings->execute();

        foreach ($stmtSettings->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $key = (string)($row['setting_key'] ?? '');
            if (!array_key_exists($key, $settings)) {
                continue;
            }

            $value = (int)($row['setting_value'] ?? 0);
            if ($value > 0) {
                $settings[$key] = $value;
            }
        }

        $settings['chunk_size'] = max(1, (int)$settings['chunk_size']);
        $settings['max_emails_per_job'] = max(1, (int)$settings['max_emails_per_job']);
        $settings['max_active_jobs_per_user'] = max(0, (int)$settings['max_active_jobs_per_user']);

        @file_put_contents($cacheFile, json_encode($settings));
        $localCache = $settings;
        return $settings;
    }

    public static function checkActiveJobLimit(int $userId, int $maxActiveJobsPerUser): ?string {
        if ($maxActiveJobsPerUser <= 0) {
            return null;
        }

        $activeJobsStmt = DB::prepare("
            SELECT COUNT(*)
            FROM jobs
            WHERE user_id = ?
              AND job_type = 'bulk'
              AND status IN ('pending', 'processing')
        ");
        $activeJobsStmt->execute([$userId]);
        $activeJobs = (int)$activeJobsStmt->fetchColumn();

        if ($activeJobs >= $maxActiveJobsPerUser) {
            return "You already have {$activeJobs} active jobs. Limit is {$maxActiveJobsPerUser}.";
        }

        return null;
    }

    public static function createBulkJob(
        int $userId,
        iterable $emails,
        ?string $idempotencyKey,
        array $settings,
        ?string $filename = null,
        ?int $sourceCount = null
    ): array {
        $chunkSize = max(1, (int)($settings['chunk_size'] ?? 1000));

        $jobId = 'job_' . dechex(time()) . bin2hex(random_bytes(8));

        $queueEmails = [];
        $initialResultLines = [];
        $invalidSyntax = 0;
        $roleAccounts = 0;
        $disposable = 0;
        $processedCount = 0;
        $totalEmails = 0;

        foreach ($emails as $email) {
            $totalEmails++;
            $validation = HelperService::validateEmailBasics($email);

            if (!$validation['syntax']) {
                $invalidSyntax++;
                $processedCount++;
                $initialResultLines[] = json_encode(['email' => $email, 'status' => 'invalid', 'reason' => 'syntax']) . "\n";
                continue;
            }

            if ($validation['is_disposable']) {
                $disposable++;
            }
            if ($validation['is_role']) {
                $roleAccounts++;
            }

            $queueEmails[] = $email;
        }

        $queuedCount = count($queueEmails);
        $totalBilled = $queuedCount;
        $initialStatus = ($totalBilled === 0) ? 'completed' : 'pending';

        if (!is_dir(RESULTS_PATH)) {
            if (!mkdir(RESULTS_PATH, 0750, true) && !is_dir(RESULTS_PATH)) {
                throw new \RuntimeException(sprintf('Directory "%s" was not created', RESULTS_PATH));
            }
        }
        if (!is_dir(BULK_RESULTS_PATH)) {
            if (!mkdir(BULK_RESULTS_PATH, 0750, true) && !is_dir(BULK_RESULTS_PATH)) {
                throw new \RuntimeException(sprintf('Directory "%s" was not created', BULK_RESULTS_PATH));
            }
        }
        $resultFile = BULK_RESULTS_PATH . '/' . $jobId . '.ndjson';
        if (!file_exists($resultFile)) {
            touch($resultFile);
        }
        chmod($resultFile, 0640);
        if (!is_dir(BULK_JOBS_PATH)) {
            if (!mkdir(BULK_JOBS_PATH, 0750, true) && !is_dir(BULK_JOBS_PATH)) {
                throw new \RuntimeException(sprintf('Directory "%s" was not created', BULK_JOBS_PATH));
            }
        }

        $normalizedIdemKey = BillingService::normalizeKeyForUser($idempotencyKey, $userId);
        $pdo = DB::getInstance();

        try {
            $pdo->beginTransaction();

            $billingResult = BillingService::deductCreditsTransactional(
                $pdo,
                $userId,
                $totalBilled,
                'Bulk Job: ' . $jobId,
                $normalizedIdemKey
            );

            if ($billingResult === false) {
                $pdo->rollBack();
                HelperService::logActivity('WARN', 'Worker', "Bulk job rejected – insufficient credits for User #$userId ($totalBilled emails requested)", $userId);
                throw new \Exception('Insufficient credits for this job.', 402);
            }

            if ($billingResult === 'already_processed') {
                $pdo->rollBack();
                throw new \Exception('This bulk job request was already processed.', 409);
            }

            $stmt = $pdo->prepare("
                INSERT INTO jobs
                    (user_id, job_id, filename, total_emails, processed_count, invalid_syntax, role_accounts, disposable, undeliverable, status, job_type)
                VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bulk')
            ");
            $stmt->execute([
                $userId,
                $jobId,
                $filename,
                $totalEmails,
                $processedCount,
                $invalidSyntax,
                $roleAccounts,
                $disposable,
                $invalidSyntax,
                $initialStatus
            ]);

            if (!self::persistQueueAndTasks($jobId, $queueEmails, $chunkSize)) {
                throw new \RuntimeException('Failed to store job queue data.');
            }

            if (!empty($initialResultLines)) {
                $serializedInitialResults = implode('', $initialResultLines);
                if (file_put_contents($resultFile, $serializedInitialResults, LOCK_EX) === false) {
                    throw new \RuntimeException('Failed to write initial result file.');
                }
            } elseif (!file_exists($resultFile) && touch($resultFile) === false) {
                throw new \RuntimeException('Failed to create result file.');
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            self::cleanupJobFiles($jobId);
            throw $e;
        }

        HelperService::logActivity('INFO', 'Worker', "Bulk job $jobId created by User #$userId ($totalEmails emails, queued: {$queuedCount})", $userId);

        $sourceTotal = $sourceCount ?? $totalEmails;
        $duplicatesRemoved = max(0, $sourceTotal - $totalEmails);

        return [
            'jobId' => $jobId,
            'total' => $totalEmails,
            'queued' => $queuedCount,
            'pre_filtered' => $totalEmails - $queuedCount,
            'duplicates_removed' => $duplicatesRemoved
        ];
    }

    public static function persistQueueAndTasks(string $jobId, array $queueEmails, int $chunkSize): bool {
        try {
            if (!is_dir(BULK_JOBS_PATH) && !mkdir(BULK_JOBS_PATH, 0750, true)) {
                return false;
            }

            $queueFile = BULK_JOBS_PATH . '/' . $jobId . '.emails.ndjson';
            $offsetFile = BULK_JOBS_PATH . '/' . $jobId . '.offsets.json';

            $handle = fopen($queueFile, 'wb');
            if ($handle === false) {
                return false;
            }

            $offsets = [];
            $offset = 0;
            foreach ($queueEmails as $index => $email) {
                if ($index % $chunkSize === 0) {
                    $offsets[(string)$index] = $offset;
                }

                $line = (string)$email . "\n";
                if (fwrite($handle, $line) === false) {
                    fclose($handle);
                    return false;
                }
                $offset += strlen($line);
            }
            fclose($handle);

            if (file_put_contents($offsetFile, json_encode($offsets), LOCK_EX) === false) {
                return false;
            }

            $totalQueue = count($queueEmails);
            if ($totalQueue > 0) {
                $values = [];
                $params = [];
                for ($i = 0; $i < $totalQueue; $i += $chunkSize) {
                    $endIndex = min($i + $chunkSize - 1, $totalQueue - 1);
                    $values[] = "(?, ?, ?, 'queued')";
                    $params[] = $jobId;
                    $params[] = $i;
                    $params[] = $endIndex;
                }
                
                if (!empty($values)) {
                    $sql = "INSERT INTO job_tasks (job_id, start_index, end_index, status) VALUES " . implode(', ', $values);
                    $taskStmt = DB::prepare($sql);
                    $taskStmt->execute($params);
                }
            }

            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function applyResultBatch(string $jobId, array $rows, ?string $idemKey, ?int $taskId = null, string $serverName = ''): array {
        $deliverable = 0;
        $risky = 0;
        $catchAll = 0;
        $disposable = 0;
        $undeliverable = 0;
        $processed = 0;
        $lines = [];
        $verifiedAt = date('c');

        foreach ($rows as $row) {
            $status = $row['status'];
            
            // Re-evaluate flags based on database policy (captured in normalizeResultRow)
            if (!empty($row['is_disposable'])) {
                $status = 'disposable';
                $disposable++;
            } elseif ($status === 'valid') {
                $deliverable++;
            } elseif ($status === 'unknown') {
                $risky++;
            } elseif ($status === 'catch_all') {
                $catchAll++;
            } else {
                $undeliverable++;
            }
            $processed++;

            $lines[] = json_encode([
                'email' => $row['email'],
                'status' => $status,
                'catch_all' => $row['catch_all'] ?? false,
                'score' => $row['score'] ?? 0,
                'is_free' => $row['is_free'] ?? false,
                'verified_at' => $verifiedAt
            ]) . "\n";
        }

        if ($processed === 0) {
            throw new \Exception('No valid results to process', 400);
        }

        $pdo = DB::getInstance();
        try {
            $pdo->beginTransaction();

            if ($taskId === null || $taskId <= 0) {
                HelperService::logActivity('ERROR', 'Worker', "Result push rejected: Missing or invalid Task ID for Job $jobId", null);
                throw new \Exception('Task ID is required for worker result pushes and must be greater than zero.', 400);
            }
            if ($serverName === '') {
                throw new \Exception('Worker server name is required', 400);
            }

            $jobLock = $pdo->prepare("
                SELECT user_id, status, processed_count, total_emails
                FROM jobs
                WHERE job_id = ?
                LIMIT 1
                FOR UPDATE
            ");
            $jobLock->execute([$jobId]);
            $jobRow = $jobLock->fetch(\PDO::FETCH_ASSOC);
            if (!$jobRow) {
                throw new \Exception('Job not found', 404);
            }

            $jobStatus = (string)($jobRow['status'] ?? '');
            $jobProcessed = (int)($jobRow['processed_count'] ?? 0);
            $jobTotal = (int)($jobRow['total_emails'] ?? 0);
            $jobOwnerId = (int)($jobRow['user_id'] ?? 0);

            $taskProbe = $pdo->prepare("
                SELECT id, status, worker_server, pushed_count
                FROM job_tasks
                WHERE id = ? AND job_id = ?
                LIMIT 1
                FOR UPDATE
            ");
            $taskProbe->execute([$taskId, $jobId]);
            $taskProbeRow = $taskProbe->fetch(\PDO::FETCH_ASSOC);
            if (!$taskProbeRow) {
                throw new \Exception('Invalid task or job reference', 400);
            }

            $taskStatus = (string)($taskProbeRow['status'] ?? '');
            if ($taskStatus !== 'processing') {
                throw new \Exception('Task is not currently claimable for result push', 409);
            }

            $assignedWorker = trim((string)($taskProbeRow['worker_server'] ?? ''));
            if ($assignedWorker !== '' && !hash_equals($assignedWorker, $serverName)) {
                throw new \Exception('Task belongs to another worker server', 403);
            }

            // Self-heal inconsistent states (e.g. status marked completed while counts are short).
            if ($jobStatus === 'completed' && $jobTotal > 0 && $jobProcessed < $jobTotal) {
                $healStmt = $pdo->prepare("UPDATE jobs SET status = 'processing' WHERE job_id = ?");
                $healStmt->execute([$jobId]);
                $jobStatus = 'processing';
            }

            if ($jobStatus === 'completed' && $jobTotal > 0 && $jobProcessed >= $jobTotal) {
                if ($idemKey) {
                    $pdo->prepare("INSERT IGNORE INTO processed_requests (idempotency_key, user_id) VALUES (?, ?)")
                        ->execute([$idemKey, $jobOwnerId]);
                }
                $pdo->commit();
                return ['completed' => true, 'processed' => 0];
            }

            if ($idemKey) {
                $idemInsert = $pdo->prepare("INSERT IGNORE INTO processed_requests (idempotency_key, user_id) VALUES (?, ?)");
                $idemInsert->execute([$idemKey, $jobOwnerId]);
                if ($idemInsert->rowCount() === 0) {
                    $recovered = false;

                    if ((int)($taskProbeRow['pushed_count'] ?? 0) < $processed) {
                        $deleteIdem = $pdo->prepare("DELETE FROM processed_requests WHERE idempotency_key = ? LIMIT 1");
                        $deleteIdem->execute([$idemKey]);
                        $idemInsert->execute([$idemKey, $jobOwnerId]);
                        $recovered = ($idemInsert->rowCount() === 1);
                    }

                    if (!$recovered) {
                        $pdo->commit();
                        return ['idempotent' => true, 'processed' => 0];
                    }
                }
            }

            $updateParams = [
                $processed,
                $deliverable,
                $risky,
                $catchAll,
                $disposable,
                $undeliverable,
                $processed,
                $jobId
            ];

            $updateSql = "
                UPDATE jobs
                SET
                    processed_count = processed_count + ?,
                    deliverable = deliverable + ?,
                    risky = risky + ?,
                    catch_all = catch_all + ?,
                    disposable = disposable + ?,
                    undeliverable = undeliverable + ?,
                    status = CASE
                        WHEN processed_count + ? >= total_emails THEN 'completed'
                        ELSE 'processing'
                    END
                WHERE job_id = ?
            ";

            $stmt = $pdo->prepare($updateSql);
            $stmt->execute($updateParams);

            if ($stmt->rowCount() === 0) {
                throw new \Exception('Failed to update job progress', 409);
            }

            $taskUpdate = $pdo->prepare("
                UPDATE job_tasks
                SET pushed_count = LEAST(pushed_count + ?, (end_index - start_index + 1)),
                    updated_at = NOW()
                WHERE id = ?
            ");
            $taskUpdate->execute([$processed, $taskId]);

            $serverUsageStmt = $pdo->prepare("
                UPDATE worker_servers
                SET emails_verified = COALESCE(emails_verified, 0) + ?
                WHERE server_name = ?
                ORDER BY id DESC
                LIMIT 1
            ");
            $serverUsageStmt->execute([$processed, $serverName]);

            $resultFile = BULK_RESULTS_PATH . '/' . $jobId . '.' . $taskId . '.ndjson';
            if (file_put_contents($resultFile, implode('', $lines), FILE_APPEND | LOCK_EX) === false) {
                throw new \Exception('Failed to write result file', 500);
            }

            $pdo->commit();
            return ['success' => true, 'processed' => $processed];
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function normalizeResultRow(array $input): ?array {
        $email = HelperService::robustTrim((string)($input['email'] ?? ''));
        if ($email === '') return null;

        $statusInput = HelperService::robustTrim((string)($input['status'] ?? ''));
        if ($statusInput === '' && isset($input['catch_all']) && (bool)$input['catch_all']) {
            $statusInput = 'catch_all';
        }

        if ($statusInput === '') return null;

        // 1. Initial normalization
        $status = HelperService::normalizeVerificationStatus($statusInput);

        // 2. Re-evaluate using Database-Driven Domain Policy
        // This ensures worker results respect the user's latest domain lists.
        $validation = HelperService::validateEmailBasics($email);
        
        if ($validation['is_blacklist'] || $validation['is_spam_trap']) {
            $status = 'invalid';
        } elseif ($validation['is_disposable']) {
            $status = 'disposable';
        }

        $score = isset($input['score']) ? (int)$input['score'] : HelperService::scoreForStatus($status);
        $score = max(0, min(100, $score));
        $catchAll = isset($input['catch_all']) ? (bool)$input['catch_all'] : ($status === 'catch_all');

        return [
            'email' => $email,
            'status' => $status,
            'score' => $score,
            'catch_all' => $catchAll,
            'is_free' => $validation['is_free'],
            'is_disposable' => $validation['is_disposable']
        ];
    }

    public static function cleanupJobFiles(string $jobId): void {
        if (is_file(JOBS_PATH . '/' . $jobId . '.queue.json')) unlink(JOBS_PATH . '/' . $jobId . '.queue.json');
        if (is_file(JOBS_PATH . '/' . $jobId . '.emails.json')) unlink(JOBS_PATH . '/' . $jobId . '.emails.json');
        if (is_file(BULK_JOBS_PATH . '/' . $jobId . '.emails.ndjson')) unlink(BULK_JOBS_PATH . '/' . $jobId . '.emails.ndjson');
        if (is_file(BULK_JOBS_PATH . '/' . $jobId . '.offsets.json')) unlink(BULK_JOBS_PATH . '/' . $jobId . '.offsets.json');
        if (is_file(SINGLE_RESULTS_PATH . '/' . $jobId . '.ndjson')) unlink(SINGLE_RESULTS_PATH . '/' . $jobId . '.ndjson');
        if (is_file(BULK_RESULTS_PATH . '/' . $jobId . '.ndjson')) unlink(BULK_RESULTS_PATH . '/' . $jobId . '.ndjson');
        
        // Also cleanup task results
        $files = glob(BULK_RESULTS_PATH . '/' . $jobId . '.*.ndjson');
        if ($files) {
            foreach ($files as $file) {
                if (is_file($file)) unlink($file);
            }
        }
    }

    private static function searchInConsolidatedFile(string $file, string $jobId): ?array {
        if (!is_file($file)) return null;
        $handle = @fopen($file, 'r');
        if (!$handle) return null;
        while (($line = fgets($handle)) !== false) {
            if (strpos($line, $jobId) !== false) {
                $parsed = json_decode($line, true);
                if ($parsed && ($parsed['jobId'] ?? '') === $jobId) {
                    fclose($handle);
                    return $parsed;
                }
            }
        }
        fclose($handle);
        return null;
    }

    public static function getSingleJobResult(string $jobId, ?int $jobDbId = null): ?array {
        $data = null;
        
        // Search in the chunked consolidated files
        if ($jobDbId !== null) {
            $fileIndex = floor($jobDbId / 100000);
            $resultFile = SINGLE_RESULTS_PATH . '/single_verifications_' . $fileIndex . '.ndjson';
            $data = self::searchInConsolidatedFile($resultFile, $jobId);
        }

        // If not found (or jobDbId wasn't provided), search all chunk files from newest to oldest
        if (!$data) {
            $files = glob(SINGLE_RESULTS_PATH . '/single_verifications_*.ndjson');
            if ($files) {
                usort($files, function($a, $b) {
                    preg_match('/_(\d+)\.ndjson/', $a, $ma);
                    preg_match('/_(\d+)\.ndjson/', $b, $mb);
                    return (int)($mb[1] ?? 0) <=> (int)($ma[1] ?? 0);
                });
                foreach ($files as $file) {
                    $data = self::searchInConsolidatedFile($file, $jobId);
                    if ($data) break;
                }
            }
        }

        // Search the old unfractioned consolidated file
        if (!$data) {
            $data = self::searchInConsolidatedFile(SINGLE_RESULTS_PATH . '/single_verifications.ndjson', $jobId);
        }

        // Fallback to old individual files if not found in consolidated file
        if (!$data) {
            $legacyFile = SINGLE_RESULTS_PATH . '/' . $jobId . '.ndjson';
            if (is_file($legacyFile)) {
                $content = file_get_contents($legacyFile);
                if ($content) {
                    $lines = explode("\n", trim($content));
                    if (!empty($lines)) {
                        $data = json_decode($lines[0], true);
                    }
                }
            } else {
                // Fallback to bulk if it was somehow stored there or if it's a bulk job being checked as single
                $bulkFile = BULK_RESULTS_PATH . '/' . $jobId . '.ndjson';
                if (!is_file($bulkFile)) {
                    $files = glob(BULK_RESULTS_PATH . '/' . $jobId . '.*.ndjson');
                    if ($files && is_file($files[0])) {
                        $bulkFile = $files[0];
                    } else {
                        return null;
                    }
                }
                
                if (is_file($bulkFile)) {
                    $content = file_get_contents($bulkFile);
                    if ($content) {
                        $lines = explode("\n", trim($content));
                        if (!empty($lines)) {
                            $data = json_decode($lines[0], true);
                        }
                    }
                }
            }
        }

        if (!$data) return null;

        // Reconstruct detailedChecks if they are flat in the JSON or missing
        // In applyResultBatch, we store: email, status, catch_all, score, is_free, verified_at
        // We need to map this back to what the frontend expects or at least provide a stable object
        
        $detailedChecks = $data['detailedChecks'] ?? [
            'safeToSend' => ($data['status'] === 'valid'),
            'deliverable' => ($data['status'] === 'valid'),
            'invalidSyntax' => ($data['status'] === 'invalid' && ($data['reason'] ?? '') === 'syntax'),
            'disposableEmail' => ($data['status'] === 'disposable'),
            'mxRecords' => ($data['status'] !== 'invalid'),
            'smtpConnect' => ($data['status'] !== 'invalid'),
            'userExist' => ($data['status'] === 'valid'),
            'unknown' => ($data['status'] === 'unknown'),
            'mailboxFull' => false,
            'catchAll' => ($data['catch_all'] ?? false),
            'roleAccount' => false,
            'freeAccount' => ($data['is_free'] ?? false),
            'spamTrap' => false,
            'blacklist' => false,
        ];

        return [
            'email' => $data['email'] ?? '',
            'status' => $data['status'] ?? 'unknown',
            'score' => $data['score'] ?? 0,
            'processingTime' => $data['processingTime'] ?? 0,
            'detailedChecks' => $detailedChecks,
            'rawJson' => $data
        ];
    }

    public static function attachCanonicalBreakdown(array $job): array {
        $job['valid'] = (int)($job['deliverable'] ?? 0);
        $job['unknown'] = (int)($job['risky'] ?? 0);
        $job['invalid'] = (int)($job['undeliverable'] ?? 0);
        $job['catch_all'] = (int)($job['catch_all'] ?? 0);
        $job['disposable'] = (int)($job['disposable'] ?? 0);
        return $job;
    }

    public static function extractEmailsFromLine(string $line, bool $isCsv): array {
        if ($isCsv) {
            $columns = str_getcsv($line);
            if (!is_array($columns) || empty($columns)) {
                return [];
            }
            return [HelperService::robustTrim((string)($columns[0] ?? ''))];
        }

        $parts = preg_split('/[\s,;]+/', $line) ?: [];
        return array_values(array_filter(array_map([HelperService::class, 'robustTrim'], $parts)));
    }
}
