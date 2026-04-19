<?php
namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use Core\Request;
use App\Services\AuthService;
use Core\DB;

class JobController extends BaseController {

    public function stats() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $pdo = DB::getInstance();
        
        // General stats
        $stmt = $pdo->prepare("
            SELECT 
                COUNT(*) as total_jobs,
                COALESCE(SUM(total_emails), 0) as total_emails,
                COALESCE(SUM(processed_count), 0) as processed_emails,
                COUNT(CASE WHEN created_at >= CURDATE() THEN 1 END) as jobs_today,
                COALESCE(SUM(CASE WHEN created_at >= CURDATE() THEN processed_count ELSE 0 END), 0) as processed_today,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as jobs_7d,
                COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN processed_count ELSE 0 END), 0) as processed_7d,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) THEN 1 END) as jobs_14d,
                COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) THEN processed_count ELSE 0 END), 0) as processed_14d,
                COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as jobs_30d,
                COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN processed_count ELSE 0 END), 0) as processed_30d
            FROM jobs
        ");
        $stmt->execute();
        $stats = $stmt->fetch(\PDO::FETCH_ASSOC);

        // breakdown by status (optional but nice)
        $statusBreakdown = $pdo->query("
            SELECT 
                COALESCE(SUM(deliverable), 0) as valid,
                COALESCE(SUM(risky), 0) as unknown,
                COALESCE(SUM(undeliverable), 0) as invalid,
                COALESCE(SUM(catch_all), 0) as catch_all,
                COALESCE(SUM(disposable), 0) as disposable
            FROM jobs
        ")->fetch(\PDO::FETCH_ASSOC);

        return $this->success('Job stats retrieved', [
            'overview' => $stats,
            'breakdown' => $statusBreakdown
        ]);
    }

    public function cleanup() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        
        // Prevent timeout for large cleanups
        set_time_limit(0);

        $input = Request::json();
        $days = (int)($input['days'] ?? 0);
        
        if ($days <= 0) {
            return $this->error('Invalid days parameter. Must be greater than 0.', [], 400);
        }

        $pdo = DB::getInstance();
        
        try {
            // Fetch job IDs to clean up
            $stmt = $pdo->prepare("SELECT job_id FROM jobs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)");
            $stmt->execute([$days]);
            $jobIds = $stmt->fetchAll(\PDO::FETCH_COLUMN);
            
            if (empty($jobIds)) {
                return $this->success('No jobs found for the specified period.', ['deleted_count' => 0]);
            }

            // Start transaction
            $pdo->beginTransaction();
            
            // Delete from jobs
            $deleteStmt = $pdo->prepare("DELETE FROM jobs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)");
            $deleteStmt->execute([$days]);
            $deletedCount = $deleteStmt->rowCount();

            // Efficiently delete from job_tasks using fetched job IDs
            // We use placeholders for safest execution
            $placeholders = implode(',', array_fill(0, count($jobIds), '?'));
            $deleteTasksStmt = $pdo->prepare("DELETE FROM job_tasks WHERE job_id IN ($placeholders)");
            $deleteTasksStmt->execute($jobIds);
            
            $pdo->commit();

            // Cleanup storage files in background/loop
            foreach ($jobIds as $jobId) {
                $this->cleanupFiles($jobId);
            }

            return $this->success("Successfully deleted $deletedCount jobs and their files.", [
                'deleted_count' => $deletedCount
            ]);
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            return $this->error('Failed to cleanup jobs: ' . $e->getMessage(), [], 500);
        }
    }

    public function downloadAll() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        
        $type = Request::get('type') ?: 'all';
        $pdo = DB::getInstance();
        
        $where = "1=1";
        if ($type === 'single') {
            $where = "job_type = 'single'";
        } elseif ($type === 'bulk') {
            $where = "job_type = 'bulk'";
        }

        header('Content-Type: text/csv');
        header('Content-Disposition: attachment; filename="verification-results-' . $type . '-' . date('Y-m-d') . '.csv"');
        
        $output = fopen('php://output', 'w');
        
        if ($type === 'bulk') {
            // Header for Bulk
            fputcsv($output, ['Email', 'Status', 'Reason', 'Catch-All', 'Score', 'Verified At', 'Job ID']);
            
            $stmt = $pdo->query("SELECT job_id FROM jobs WHERE job_type = 'bulk' ORDER BY created_at DESC");
            while ($job = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $jobId = $job['job_id'];
                // Use glob to find all result files for this job (including task-specific ones)
                $files = glob(BULK_RESULTS_PATH . '/' . $jobId . '*.ndjson');
                
                foreach ($files as $resultFile) {
                    if (is_file($resultFile)) {
                        $handle = fopen($resultFile, 'r');
                        if ($handle) {
                            while (($line = fgets($handle)) !== false) {
                                $data = json_decode(trim($line), true);
                                if ($data) {
                                    fputcsv($output, [
                                        $data['email'] ?? '',
                                        $data['status'] ?? '',
                                        $data['reason'] ?? '',
                                        ($data['catch_all'] ?? false) ? 'Yes' : 'No',
                                        $data['score'] ?? '',
                                        $data['verified_at'] ?? '',
                                        $jobId
                                    ]);
                                }
                            }
                            fclose($handle);
                        }
                    }
                }
            }
        } else {
            // Header for Single
            fputcsv($output, ['Email', 'Status', 'Reason', 'Catch-All', 'Score', 'Verified At', 'Job ID']);
            
            $stmt = $pdo->query("SELECT job_id, email, status, deliverable, risky, undeliverable, catch_all as is_catch_all, created_at FROM jobs WHERE $where AND email IS NOT NULL AND email != '' ORDER BY created_at DESC");
            while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                $status = 'unknown';
                if ($row['deliverable']) $status = 'deliverable';
                elseif ($row['undeliverable']) $status = 'undeliverable';
                elseif ($row['risky']) $status = 'risky';

                fputcsv($output, [
                    $row['email'] ?: 'N/A',
                    $status,
                    $row['status'], // Using job status as 'reason' for single
                    $row['is_catch_all'] ? 'Yes' : 'No',
                    $row['deliverable'] ? '100' : '0', // Basic score
                    $row['created_at'],
                    $row['job_id']
                ]);
            }
        }
        
        fclose($output);
        exit;
    }

    private function cleanupFiles($jobId) {
        $files = [
            BULK_JOBS_PATH . '/' . $jobId . '.emails.ndjson',
            BULK_JOBS_PATH . '/' . $jobId . '.offsets.json',
            SINGLE_RESULTS_PATH . '/' . $jobId . '.ndjson',
            BULK_RESULTS_PATH . '/' . $jobId . '.ndjson'
        ];
        
        foreach ($files as $f) {
            if (file_exists($f)) {
                @unlink($f);
            }
        }

        // Also cleanup task results for bulk
        $taskFiles = glob(BULK_RESULTS_PATH . '/' . $jobId . '.*.ndjson');
        if ($taskFiles) {
            foreach ($taskFiles as $file) @unlink($file);
        }
    }
}
