<?php
/**
 * EmailJachai Pro - Console Worker Command
 */
namespace App\Console;

use App\Services\ApiClient;
use App\Services\SmtpVerifier;

class WorkerCommand {
    private $api;
    private $verifier;
    private $logger;
    private $domainCache;
    private $serverName;
    private $serverPort;
    private $workerCount;
    private $pushBatchSize;
    private $idleSleepSeconds;
    private $maxIdleSleepSeconds;

    public function __construct(
        ApiClient $api, 
        SmtpVerifier $verifier, 
        \App\Core\Logger $logger,
        \App\Services\DomainCache $domainCache,
        string $serverName, 
        int $serverPort, 
        int $workerCount, 
        int $pushBatchSize, 
        int $idleSleepSeconds, 
        int $maxIdleSleepSeconds
    ) {
        $this->api = $api;
        $this->verifier = $verifier;
        $this->logger = $logger;
        $this->domainCache = $domainCache;
        $this->serverName = $serverName;
        $this->serverPort = $serverPort;
        $this->workerCount = $workerCount;
        $this->pushBatchSize = $pushBatchSize;
        $this->idleSleepSeconds = $idleSleepSeconds;
        $this->maxIdleSleepSeconds = $maxIdleSleepSeconds;
    }

    public function run(): void {
        $this->logger->info("Worker started with name={$this->serverName}");

        $currentIdleSleep = $this->idleSleepSeconds;
        $lastDomainSync = 0;
        $lastHeartbeat = 0;

        // Self-Healing: Reset previous tasks assigned to this worker server
        try {
            $this->logger->info("Recovering previous zombie tasks for server: {$this->serverName}...");
            $resetResult = $this->api->resetTasks($this->serverName);
            if (!empty($resetResult['success'])) {
                $count = (int)($resetResult['reset_count'] ?? 0);
                if ($count > 0) {
                    $this->logger->info("Recovered {$count} tasks from previous session.");
                } else {
                    $this->logger->info("No zombie tasks found.");
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error("Self-healing task recovery failed: " . $e->getMessage());
        }

        while (true) {
            // Periodic domain list sync (every 30 minutes)
            if (time() - $lastDomainSync >= 1800) {
                $this->logger->info("Syncing active domain lists from API...");
                $domains = $this->api->fetchActiveDomains();
                $this->domainCache->setDomains($domains);
                $lastDomainSync = time();
            }

            // Throttled heartbeat: Send every 120 seconds
            if (time() - $lastHeartbeat >= 120) {
                $this->api->sendHeartbeat($this->serverName, $this->serverPort, $this->workerCount);
                $lastHeartbeat = time();
            }

            $task = null;
            $retryCount = 0;
            $maxRetries = 5;

            while ($retryCount < $maxRetries) {
                try {
                    $task = $this->api->claimTask($this->serverName);
                    break;
                } catch (\Throwable $e) {
                    $retryCount++;
                    $this->logger->error("API Failure (claim) [Attempt $retryCount/$maxRetries]: " . $e->getMessage());
                    if ($retryCount >= $maxRetries) {
                        $this->logger->critical("Persistent API failure. Shutting down worker to avoid zombie state.");
                        die("Fatal Error: Persistent API failure. Worker exiting.\n");
                    }
                    sleep(pow(2, $retryCount) + $this->idleSleepSeconds);
                }
            }

            if (!$task) {
                sleep($currentIdleSleep);
                if ($currentIdleSleep < $this->maxIdleSleepSeconds) {
                    $currentIdleSleep = min($this->maxIdleSleepSeconds, $currentIdleSleep * 2);
                }
                continue;
            }
            $currentIdleSleep = $this->idleSleepSeconds;

            $taskId = (int)($task['task_id'] ?? 0);
            $jobId = (string)($task['job_id'] ?? '');
            $emails = is_array($task['emails'] ?? null) ? $task['emails'] : [];
            
            if ($taskId <= 0 || $jobId === '') {
                $payloadSnippet = json_encode($task);
                $this->logger->warn("Received malformed task payload from API: " . substr($payloadSnippet, 0, 500));
                sleep($this->idleSleepSeconds);
                continue;
            }

            echo "[+] Processing Task $taskId for Job: $jobId (" . count($emails) . " emails)\n";
            $this->logger->info("Task {$taskId} started for {$jobId}");

            $batch = [];
            $pushFailed = false;

            foreach ($emails as $email) {
                $email = trim((string)$email);
                if ($email === '') {
                    continue;
                }

                echo "    [>] Verifying: $email... ";
                $verification = $this->verifier->verifyEmailReal($email);
                $status = $this->verifier->normalizeVerificationStatus((string)($verification['status'] ?? 'unknown'));

                $batch[] = [
                    'email' => $email,
                    'status' => $status,
                    'catch_all' => ($status === 'catch_all'),
                    'score' => (int)($verification['score'] ?? $this->verifier->scoreForStatus($status)),
                ];

                echo $status . "\n";

                if (count($batch) >= $this->pushBatchSize) {
                    if (!$this->api->pushResultsBatch($jobId, $taskId, $batch, $this->serverName)) {
                        $pushFailed = true;
                        break;
                    }
                    $batch = [];
                }
            }

            if (!$pushFailed && !empty($batch)) {
                if (!$this->api->pushResultsBatch($jobId, $taskId, $batch, $this->serverName)) {
                    $pushFailed = true;
                }
            }

            if ($pushFailed) {
                echo "[!] Pushes failed for Task $taskId. Marking as failed.\n";
                $this->logger->error("Task {$taskId} failed due to push errors.");
                $this->api->completeTask($this->serverName, $taskId, 'failed');
                continue;
            }

            if (!$this->api->completeTask($this->serverName, $taskId, 'completed')) {
                echo "[!] Task $taskId completion was rejected by API. Task may be requeued.\n";
                $this->logger->warn("Task {$taskId} completion rejected by API.");
                continue;
            }

            $count = count($emails);
            echo "[+] Task $taskId completed. ($count emails processed)\n";
            $this->logger->info("Task {$taskId} completed for {$jobId}");
        }
    }
}
