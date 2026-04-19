<?php
namespace App\Controllers;

use Core\DB;
use Core\Response;

class HealthController extends BaseController {
    public function index() {
        $checks = [
            'database' => $this->checkDatabase(),
            'storage' => $this->checkStorage(),
            'php_version' => PHP_VERSION,
            'environment' => defined('ENVIRONMENT') ? ENVIRONMENT : 'unknown',
        ];

        $allGood = true;
        foreach ($checks as $key => $check) {
            if (is_array($check) && isset($check['status']) && $check['status'] !== 'ok') {
                $allGood = false;
                break;
            }
        }

        if ($allGood) {
            return $this->success('System healthy', $checks);
        }

        return Response::error('System unhealthy', $checks, 503);
    }

    private function checkDatabase() {
        try {
            $pdo = DB::getInstance();
            $stmt = $pdo->query("SELECT 1");
            return ['status' => 'ok'];
        } catch (\Throwable $e) {
            return [
                'status' => 'error',
                'message' => (defined('ENVIRONMENT') && ENVIRONMENT === 'production') ? 'DB Connection Failed' : $e->getMessage()
            ];
        }
    }

    private function checkStorage() {
        $paths = [
            STORAGE_PATH,
            JOBS_PATH,
            RESULTS_PATH,
            LOGS_PATH
        ];

        $results = [];
        $allOk = true;

        foreach ($paths as $path) {
            $writable = is_dir($path) && is_writable($path);
            $results[basename($path)] = $writable ? 'writable' : 'not_writable';
            if (!$writable) $allOk = false;
        }

        return [
            'status' => $allOk ? 'ok' : 'error',
            'details' => $results
        ];
    }
}
