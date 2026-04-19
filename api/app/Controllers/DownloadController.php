<?php
namespace App\Controllers;

use Core\Request;
use App\Services\AuthService;
use Core\DB;
use App\Services\JobService;

class DownloadController extends BaseController {

    public function download() {
        $userId = AuthService::checkAuth();
        $jobId = Request::get('jobId');
        $format = strtolower((string)Request::get('format', 'ndjson'));

        if (!$jobId || !preg_match('/^[a-zA-Z0-9_]+$/', $jobId)) {
            return $this->error('Valid Job ID required.', [], 400);
        }
        if (!in_array($format, ['ndjson', 'csv'], true)) {
            return $this->error('Invalid download format. Use ndjson or csv.', [], 400);
        }

        $stmt = DB::prepare("SELECT id, job_type FROM jobs WHERE job_id = ? AND user_id = ?");
        $stmt->execute([$jobId, $userId]);
        $job = $stmt->fetch(\PDO::FETCH_ASSOC);
        if (!$job) {
            return $this->error('Forbidden. This job does not belong to you.', [], 403);
        }

        $files = [];
        $singleData = null;

        if ($job['job_type'] === 'single') {
            $result = JobService::getSingleJobResult($jobId, (int)$job['id']);
            if ($result && isset($result['rawJson'])) {
                $singleData = $result['rawJson'];
            }
        } else {
            // Bulk job - check for any and all result files
            $files = glob(BULK_RESULTS_PATH . '/' . $jobId . '*.ndjson');
        }

        if (empty($files) && !$singleData) {
            return $this->error('Result data not found or not ready yet.', [], 404);
        }

        if ($format === 'csv') {
            return $this->streamCsv($jobId, $files, $singleData);
        }

        return $this->streamNdjson($jobId, $files, $singleData);
    }

    private function streamNdjson(string $jobId, array $files, ?array $singleData = null): void {
        header('Content-Description: File Transfer');
        header('Content-Type: application/x-ndjson');
        header('Content-Disposition: attachment; filename="results_' . $jobId . '.ndjson"');
        header('Expires: 0');
        header('Cache-Control: must-revalidate');
        header('Pragma: public');

        if (ob_get_level()) {
            ob_end_clean();
        }
        flush();

        if ($singleData) {
            echo json_encode($singleData) . "\n";
        }

        foreach ($files as $f) {
            $fp = fopen($f, 'rb');
            if ($fp) {
                fpassthru($fp);
                fclose($fp);
            }
        }
        exit;
    }

    private function streamCsv(string $jobId, array $files, ?array $singleData = null): void {
        header('Content-Description: File Transfer');
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="results_' . $jobId . '.csv"');
        header('Expires: 0');
        header('Cache-Control: must-revalidate');
        header('Pragma: public');

        ob_clean();
        flush();

        $out = fopen('php://output', 'wb');
        if ($out === false) {
            $this->error('Failed to start CSV output.', [], 500, 'ERR_CSV_STREAM_START');
            return;
        }

        // UTF-8 BOM for spreadsheet compatibility.
        fwrite($out, "\xEF\xBB\xBF");
        fputcsv($out, ['email', 'status', 'score', 'catch_all', 'reason', 'verified_at']);

        if ($singleData) {
            $catchAll = '';
            if (array_key_exists('catch_all', $singleData)) {
                $catchAll = (bool)$singleData['catch_all'] ? '1' : '0';
            }
            fputcsv($out, [
                (string)($singleData['email'] ?? ''),
                (string)($singleData['status'] ?? ''),
                array_key_exists('score', $singleData) ? (string)$singleData['score'] : '',
                $catchAll,
                (string)($singleData['reason'] ?? ''),
                (string)($singleData['verified_at'] ?? '')
            ]);
        }

        foreach ($files as $f) {
            $fp = fopen($f, 'rb');
            if (!$fp) continue;
            while (($line = fgets($fp)) !== false) {
                $line = trim($line);
                if ($line === '') {
                    continue;
                }

                $row = json_decode($line, true);
                if (!is_array($row)) {
                    continue;
                }

                $catchAll = '';
                if (array_key_exists('catch_all', $row)) {
                    $catchAll = (bool)$row['catch_all'] ? '1' : '0';
                }

                fputcsv($out, [
                    (string)($row['email'] ?? ''),
                    (string)($row['status'] ?? ''),
                    array_key_exists('score', $row) ? (string)$row['score'] : '',
                    $catchAll,
                    (string)($row['reason'] ?? ''),
                    (string)($row['verified_at'] ?? '')
                ]);
            }
            fclose($fp);
        }

        fclose($out);
        exit;
    }
}
