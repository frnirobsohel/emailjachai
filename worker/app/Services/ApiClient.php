<?php
namespace App\Services;

use App\Config\Config;

class ApiClient {
    private $url;
    private $key;
    private $logger;

    public function __construct(string $url, string $key, \App\Core\Logger $logger) {
        $this->url = $url;
        $this->key = $key;
        $this->logger = $logger;
    }

    public function claimTask(string $serverName): ?array {
        $ch = curl_init($this->url . '/worker/claim-task');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['server_name' => $serverName]));
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->key,
        ]);
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode === 200 && is_string($response) && $response !== '') {
            $res = json_decode($response, true);
            return is_array($res) ? ($res['data'] ?? null) : null;
        }

        return null;
    }

    public function completeTask(string $serverName, int $taskId, string $status = 'completed'): bool {
        $ch = curl_init($this->url . '/worker/complete-task');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
            'task_id' => $taskId,
            'status' => $status,
            'server_name' => $serverName,
        ]));
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->key,
        ]);
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode !== 200) {
            $this->logger->warn("Complete task failed for task {$taskId} (HTTP {$httpCode}). Response: " . substr((string)$response, 0, 200));
            return false;
        }

        return true;
    }

    public function pushResultsBatch(string $jobId, int $taskId, array $results, string $serverName, int $attempt = 1): bool {
        if (empty($results)) {
            return true;
        }

        $payload = json_encode([
            'jobId' => $jobId,
            'task_id' => $taskId,
            'server_name' => $serverName,
            'results' => $results,
        ]);

        $emails = [];
        foreach ($results as $result) {
            $emails[] = strtolower(trim((string)($result['email'] ?? '')));
        }
        $idemKey = hash('sha256', 'task_batch|' . $jobId . '|' . (string)$taskId . '|' . implode(',', $emails));

        $ch = curl_init($this->url . '/jobs/push-results');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->key,
            'X-Idempotency-Key: ' . $idemKey,
        ]);
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode !== 200) {
            if ($attempt < 3 && ($httpCode >= 500 || $httpCode === 0)) {
                $sleep = pow(2, $attempt);
                $this->logger->warn("Batch push failed (HTTP $httpCode). Retrying in {$sleep}s... (Attempt $attempt)");
                sleep($sleep);
                return $this->pushResultsBatch($jobId, $taskId, $results, $serverName, $attempt + 1);
            }
            $this->logger->error("Batch push failed for task {$taskId} (HTTP {$httpCode}). Response: " . substr((string)$response, 0, 200));
            return false;
        }

        $this->logger->info("Batch pushed (" . count($results) . " results) for task {$taskId}");
        return true;
    }

    public function sendHeartbeat(string $serverName, int $serverPort = 80, int $workerCount = 1): void {
        static $lastHeartbeat = 0;
        if (time() - $lastHeartbeat < 60) {
            return;
        }

        $workerIp = Config::resolveWorkerIpAddress();

        $payload = json_encode([
            'server_name' => $serverName,
            'ip_address' => $workerIp,
            'port' => max(1, min(65535, $serverPort)),
            'worker_count' => max(1, $workerCount),
        ]);

        $ch = curl_init($this->url . '/admin/server/heartbeat');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->key,
        ]);

        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode === 200) {
            $this->logger->info("Heartbeat sent to server.");
            $lastHeartbeat = time();
            return;
        }

        $this->logger->warn("Heartbeat failed (HTTP {$httpCode}). Response: " . substr((string)$response, 0, 200));
    }

    public function fetchActiveDomains(): array {
        $ch = curl_init($this->url . '/worker/domains');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPGET, true);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Authorization: Bearer ' . $this->key,
        ]);
        
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode === 200 && is_string($response) && $response !== '') {
            $res = json_decode($response, true);
            if (is_array($res) && isset($res['data']['domains'])) {
                return $res['data']['domains'];
            }
        }

        $this->logger->error("Failed to fetch active domains (HTTP {$httpCode}).");
        return [];
    }

    public function resetTasks(string $serverName): ?array {
        $ch = curl_init($this->url . '/worker/reset-tasks');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['server_name' => $serverName]));
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 3);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $this->key,
        ]);
        $response = curl_exec($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode === 200 && is_string($response) && $response !== '') {
            $res = json_decode($response, true);
            return is_array($res) ? ($res['data'] ?? []) : [];
        }

        $this->logger->warn("Reset tasks failed (HTTP {$httpCode}).");
        return [];
    }
}
