<?php
namespace App\Controllers;

use Core\Request;
use App\Services\AuthService;
use App\Services\BillingService;
use App\Services\DeletedJobStatsService;
use App\Services\HelperService;
use App\Services\JobService;
use App\Services\CacheService;
use Core\DB;

class JobController extends BaseController {

    public function submit() {
        $userId = AuthService::checkAuth();
        $input = Request::json();

        if (!isset($input['emails']) || !is_array($input['emails'])) {
            return $this->error('Invalid input. Expected an array of emails.');
        }

        $sourceCount = count($input['emails']);
        $idempotencyKey = $input['idempotencyKey'] ?? null;

        $settings = JobService::getBulkJobSettings();
        $maxEmailsPerJob = $settings['max_emails_per_job'];

        $emails = [];
        $seen = [];
        foreach ($input['emails'] as $candidate) {
            $candidate = HelperService::robustTrim((string)$candidate);
            if ($candidate === '' || strpos($candidate, '@') === false) {
                continue;
            }

            $email = strtolower($candidate);
            if (isset($seen[$email])) {
                continue;
            }

            $seen[$email] = true;
            $emails[] = $email;

            if (count($emails) > $maxEmailsPerJob) {
                return $this->error("Maximum {$maxEmailsPerJob} emails allowed per job.");
            }
        }

        if (count($emails) === 0) {
            return $this->error('No valid emails provided.');
        }

        $limitMsg = JobService::checkActiveJobLimit($userId, $settings['max_active_jobs_per_user']);
        if ($limitMsg) {
            return $this->error($limitMsg, [], 429, 'ERR_ACTIVE_JOB_LIMIT');
        }

        try {
            $result = JobService::createBulkJob(
                $userId,
                array_values($emails),
                $idempotencyKey,
                $settings,
                null,
                $sourceCount
            );
            CacheService::delete('user_dashboard_stats_' . $userId);
            return $this->success('Job created and pre-processed', $result, 201);
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }

    public function submitFile() {
        $userId = AuthService::checkAuth();
        $settings = JobService::getBulkJobSettings();
        $maxEmailsPerJob = $settings['max_emails_per_job'];

        $limitMsg = JobService::checkActiveJobLimit($userId, $settings['max_active_jobs_per_user']);
        if ($limitMsg) {
            return $this->error($limitMsg, [], 429, 'ERR_ACTIVE_JOB_LIMIT');
        }

        if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
            return $this->error('File upload is required.', [], 400, 'ERR_FILE_REQUIRED');
        }

        $upload = $_FILES['file'];
        $uploadError = (int)($upload['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($uploadError !== UPLOAD_ERR_OK) {
            return $this->error($this->uploadErrorMessage($uploadError), [], 400, 'ERR_FILE_UPLOAD');
        }

        $tmpPath = (string)($upload['tmp_name'] ?? '');
        $originalName = (string)($upload['name'] ?? 'upload.txt');
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

        if ($tmpPath === '' || !is_file($tmpPath)) {
            return $this->error('Uploaded file is missing.', [], 400, 'ERR_FILE_MISSING');
        }
        if (!in_array($extension, ['csv', 'txt'], true)) {
            return $this->error('Only CSV or TXT files are allowed.', [], 400, 'ERR_FILE_TYPE');
        }

        $maxFileSize = 200 * 1024 * 1024;
        $size = (int)($upload['size'] ?? 0);
        if ($size <= 0 || $size > $maxFileSize) {
            return $this->error('File size must be between 1 byte and 200MB.', [], 400, 'ERR_FILE_SIZE');
        }

        $uniqueCount = 0;
        $sourceCount = 0;
        $isCsv = ($extension === 'csv');

        // Strong MIME validation
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $tmpPath);
        
        $allowedMimes = ['text/plain', 'text/csv', 'application/csv'];
        if (!in_array($mime, $allowedMimes, true)) {
            return $this->error('Invalid file type. Only CSV or TXT text files are allowed.', [], 400, 'ERR_FILE_TYPE');
        }

        $emails = (static function() use ($tmpPath, $isCsv, $maxEmailsPerJob, &$uniqueCount, &$sourceCount): \Generator {
            $seen = [];
            $file = new \SplFileObject($tmpPath, 'r');
            while (!$file->eof()) {
                $line = (string)$file->fgets();
                if ($line === '') continue;

                $candidates = JobService::extractEmailsFromLine($line, $isCsv);
                foreach ($candidates as $candidate) {
                    $candidate = HelperService::robustTrim((string)$candidate);
                    if ($candidate === '' || strpos($candidate, '@') === false) {
                        continue;
                    }

                    $sourceCount++;
                    $email = strtolower($candidate);
                    if (isset($seen[$email])) continue;

                    $seen[$email] = true;
                    $uniqueCount++;

                    if ($uniqueCount > $maxEmailsPerJob) {
                        throw new \Exception("Maximum {$maxEmailsPerJob} emails allowed per job.");
                    }

                    yield $email;
                }
            }
        })();

        $idempotencyKey = (string)($_POST['idempotencyKey'] ?? Request::header('X-Idempotency-Key') ?? '');
        if ($idempotencyKey === '') {
            $idempotencyKey = null;
        }

        try {
            $result = JobService::createBulkJob(
                $userId,
                $emails,
                $idempotencyKey,
                $settings,
                $originalName,
                $sourceCount
            );
            CacheService::delete('user_dashboard_stats_' . $userId);
            return $this->success('Job created and pre-processed', $result, 201);
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }

    public function singleVerify() {
        $userId = AuthService::checkAuth();
        $input = Request::json();
        
        $email = filter_var($input['email'] ?? '', FILTER_SANITIZE_EMAIL);

        if (empty($email)) return $this->error('Email address is required.');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return $this->error('Invalid email format provided.');
        if (strlen($email) > 254) return $this->error('Email address is too long.');

        $idempotencyKey = $input['idempotencyKey'] ?? null;
        $normalizedIdemKey = BillingService::normalizeKeyForUser($idempotencyKey, $userId);

        $pdo = DB::getInstance();
        try {
            $pdo->beginTransaction();

            $billingResult = BillingService::deductCreditsTransactional(
                $pdo,
                $userId,
                1,
                "Single Verify: $email",
                $normalizedIdemKey
            );

            if ($billingResult === false) {
                $pdo->rollBack();
                return $this->error('Insufficient credits for verification.', [], 402, 'ERR_INSUFFICIENT_CREDITS');
            }

            if ($billingResult === 'already_processed') {
                $pdo->rollBack();
                return $this->error('This single verification request was already processed.', [], 409, 'ERR_ALREADY_PROCESSED');
            }

            $jobId = 'single_' . dechex(time()) . bin2hex(random_bytes(4));

            // Perform instant verification
            $verificationResult = HelperService::verifySingleReal($email);
            $status = $verificationResult['status'] ?? 'unknown';
            $score = $verificationResult['score'] ?? 0;
            $details = $verificationResult['detailedChecks'] ?? [];
            
            // Map breakdown
            $deliverable = ($status === 'valid') ? 1 : 0;
            $risky = ($status === 'unknown') ? 1 : 0;
            $undeliverable = ($status === 'invalid') ? 1 : 0;
            $catchAll = ($details['catchAll'] ?? false) ? 1 : 0;
            $disposable = ($details['disposableEmail'] ?? false) ? 1 : 0;

            $stmt = $pdo->prepare("
                INSERT INTO jobs 
                    (user_id, job_id, email, filename, total_emails, processed_count, status, job_type, 
                     deliverable, risky, undeliverable, catch_all, disposable) 
                VALUES (?, ?, ?, 'Single Verification', 1, 1, 'completed', 'single', ?, ?, ?, ?, ?)
            ");
            $stmt->execute([$userId, $jobId, $email, $deliverable, $risky, $undeliverable, $catchAll, $disposable]);
            $jobDbId = $pdo->lastInsertId();

            $stmtTask = $pdo->prepare("
                INSERT INTO job_tasks (job_id, start_index, end_index, status, pushed_count, updated_at) 
                VALUES (?, 0, 0, 'completed', 1, NOW())
            ");
            $stmtTask->execute([$jobId]);

            // Save result to file system for consistency
            if (!is_dir(SINGLE_RESULTS_PATH)) {
                if (!mkdir(SINGLE_RESULTS_PATH, 0750, true) && !is_dir(SINGLE_RESULTS_PATH)) {
                    throw new \RuntimeException(sprintf('Directory "%s" was not created', SINGLE_RESULTS_PATH));
                }
            }
            $fileIndex = floor($jobDbId / 100000);
            $resultFile = SINGLE_RESULTS_PATH . '/single_verifications_' . $fileIndex . '.ndjson';
            $jsonLine = json_encode(array_merge($verificationResult, ['jobId' => $jobId])) . "\n";
            file_put_contents($resultFile, $jsonLine, FILE_APPEND | LOCK_EX);

            $pdo->commit();

            CacheService::delete('user_dashboard_stats_' . $userId);

            return $this->success('Verification completed', array_merge($verificationResult, [
                'job_id' => $jobId,
                'status' => $status
            ]));
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            return $this->error('Failed to perform verification: ' . $e->getMessage(), [], 500);
        }
    }

    public function list() {
        $userId = AuthService::checkAuth();
        $limit = min(200, max(1, Request::getInt('limit', 50)));
        $offset = max(0, Request::getInt('offset', 0));
        $fetchLimit = $limit + 1;

        $stmt = DB::prepare("
            SELECT
                job_id,
                filename,
                status,
                total_emails,
                processed_count,
                deliverable,
                risky,
                undeliverable,
                catch_all,
                invalid_syntax,
                role_accounts,
                disposable,
                created_at
            FROM jobs
            WHERE user_id = ? AND job_type = 'bulk'
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        ");
        $stmt->bindValue(1, $userId, \PDO::PARAM_INT);
        $stmt->bindValue(2, $fetchLimit, \PDO::PARAM_INT);
        $stmt->bindValue(3, $offset, \PDO::PARAM_INT);
        $stmt->execute();
        $jobs = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        $hasMore = count($jobs) > $limit;
        if ($hasMore) {
            array_pop($jobs);
        }

        $jobs = array_map(function (array $job): array {
            return JobService::attachCanonicalBreakdown($job);
        }, $jobs);

        return $this->success('Jobs retrieved successfully', [
            'jobs' => $jobs,
            'total' => count($jobs),
            'has_more' => $hasMore,
            'offset' => $offset,
            'limit' => $limit
        ]);
    }

    public function status() {
        $userId = AuthService::checkAuth();
        $jobId = Request::get('jobId');
        if (!$jobId) return $this->error('Job ID is required');

        $stmt = DB::prepare("SELECT * FROM jobs WHERE job_id = ? AND user_id = ?");
        $stmt->execute([$jobId, $userId]);
        $job = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$job) return $this->error('Job not found or access denied', [], 404);
        
        $data = JobService::attachCanonicalBreakdown($job);

        // If it's a single verification and it's completed, try to fetch the detailed result
        if ($job['job_type'] === 'single' && $job['status'] === 'completed') {
            $detailedResult = JobService::getSingleJobResult($jobId);
            if ($detailedResult) {
                $data = array_merge($data, $detailedResult);
            }
        }

        return $this->success('Job status retrieved', $data);
    }

    public function delete() {
        $userId = AuthService::checkAuth();
        $input = Request::json();
        $jobId = $input['job_id'] ?? null;

        if (!$jobId) return $this->error('Job ID is required');

        $pdo = DB::getInstance();
        DeletedJobStatsService::ensureSchema($pdo);

        try {
            $pdo->beginTransaction();

            $snapshotStmt = $pdo->prepare("
                SELECT
                    job_id,
                    job_type,
                    processed_count,
                    deliverable,
                    risky,
                    undeliverable,
                    catch_all,
                    disposable,
                    DATE(created_at) AS activity_date
                FROM jobs
                WHERE job_id = ? AND user_id = ?
                LIMIT 1
                FOR UPDATE
            ");
            $snapshotStmt->execute([$jobId, $userId]);
            $jobSnapshot = $snapshotStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$jobSnapshot) {
                $pdo->rollBack();
                return $this->error('Job not found or permission denied', [], 404);
            }

            DeletedJobStatsService::recordDeletedJob($pdo, (int)$userId, $jobSnapshot);

            $deleteStmt = $pdo->prepare("DELETE FROM jobs WHERE job_id = ? AND user_id = ? LIMIT 1");
            $deleteStmt->execute([$jobId, $userId]);
            if ($deleteStmt->rowCount() === 0) {
                $pdo->rollBack();
                return $this->error('Job not found or permission denied', [], 404);
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            return $this->error('Failed to delete job.', [], 500, 'ERR_JOB_DELETE_FAILED');
        }

        JobService::cleanupJobFiles($jobId);
        CacheService::delete('user_dashboard_stats_' . $userId);

        return $this->success('Job deleted successfully');
    }

    public function pushResult() {
        $idemKey = Request::header('X-Idempotency-Key');
        $data = Request::validate([
            'jobId' => 'required',
            'task_id' => 'required|integer',
            'email' => 'required|email',
            'status' => 'required',
            'server_name' => 'required'
        ]);

        $jobId = (string)$data['jobId'];
        $taskId = (int)$data['task_id'];
        $serverName = trim($data['server_name']);
        
        if ($taskId <= 0) {
            return $this->error('Invalid task ID', [], 400, 'ERR_INVALID_TASK_ID');
        }

        $row = JobService::normalizeResultRow($data);
        if (!$row) {
            return $this->error('Failed to normalize result row', [], 400, 'ERR_NORMALIZATION');
        }

        $result = JobService::applyResultBatch($jobId, [$row], $idemKey, $taskId, $serverName);
        $msg = isset($result['idempotent']) ? 'Already processed (Idempotent)' : (isset($result['completed']) ? 'Job already completed' : 'Result pushed successfully');
        return $this->success($msg, ['processed' => $result['processed']]);
    }

    public function pushResults() {
        $idemKey = Request::header('X-Idempotency-Key');
        $data = Request::validate([
            'jobId' => 'required',
            'task_id' => 'required|integer',
            'results' => 'required',
            'server_name' => 'required'
        ]);

        $jobId = (string)$data['jobId'];
        $taskId = (int)$data['task_id'];
        $serverName = trim($data['server_name']);
        
        if ($taskId <= 0) {
            return $this->error('Invalid task ID', [], 400, 'ERR_INVALID_TASK_ID');
        }

        $rows = [];
        foreach ($data['results'] as $item) {
            if (!is_array($item)) {
                continue;
            }
            $row = JobService::normalizeResultRow($item);
            if ($row) {
                $rows[] = $row;
            }
        }

        if (empty($rows)) {
            return $this->error('No valid results to process', [], 400, 'ERR_EMPTY_RESULTS');
        }

        if (count($rows) > 1000) {
            return $this->error('Batch too large (max 1000)', [], 400, 'ERR_BATCH_TOO_LARGE');
        }

        $result = JobService::applyResultBatch($jobId, $rows, $idemKey, $taskId, $serverName);
        $msg = isset($result['idempotent']) ? 'Already processed (Idempotent)' : (isset($result['completed']) ? 'Job already completed' : 'Batch results pushed successfully');
        return $this->success($msg, ['processed' => $result['processed']]);
    }

    private function uploadErrorMessage(int $errorCode): string {
        switch ($errorCode) {
            case UPLOAD_ERR_INI_SIZE:
            case UPLOAD_ERR_FORM_SIZE:
                return 'Uploaded file exceeds allowed size.';
            case UPLOAD_ERR_PARTIAL:
                return 'Uploaded file was only partially uploaded.';
            case UPLOAD_ERR_NO_FILE:
                return 'No file was uploaded.';
            case UPLOAD_ERR_NO_TMP_DIR:
                return 'Server missing temporary upload directory.';
            case UPLOAD_ERR_CANT_WRITE:
                return 'Failed to write uploaded file to disk.';
            case UPLOAD_ERR_EXTENSION:
                return 'A PHP extension stopped the file upload.';
            default:
                return 'File upload failed.';
        }
    }
}
