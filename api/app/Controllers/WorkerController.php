<?php
namespace App\Controllers;

use Core\Request;
use App\Services\AuthService;
use App\Services\WorkerService;
use Core\DB;

class WorkerController extends BaseController {

    public function claimTask() {
        $data = Request::validate([
            'server_name' => 'required'
        ]);

        $serverName = trim($data['server_name']);

        if (!WorkerService::isKnownEnabledWorker($serverName)) {
            return $this->error('Unknown or disabled worker server', [], 403, 'ERR_WORKER_SERVER_FORBIDDEN');
        }

        $task = WorkerService::claimTask($serverName);
        if (!$task) {
            return $this->error('No tasks available', [], 404, 'ERR_NO_TASKS');
        }

        return $this->success('Task claimed', $task);
    }

    public function completeTask() {
        $data = Request::validate([
            'server_name' => 'required',
            'task_id' => 'required'
        ]);

        $serverName = trim($data['server_name']);
        if (!WorkerService::isKnownEnabledWorker($serverName)) {
            return $this->error('Unknown or disabled worker server', [], 403, 'ERR_WORKER_SERVER_FORBIDDEN');
        }
        
        $taskId = (int)$data['task_id'];
        $status = Request::all()['status'] ?? 'completed';

        WorkerService::completeTask($taskId, $serverName, $status);
        return $this->success('Task marked as ' . $status);
    }

    public function getActiveDomains() {
        // Simple auth check via middleware is already done.
        // Workers need to know which domains are disposable, free, etc.
        try {
            $stmt = DB::prepare("SELECT domain, type FROM domains WHERE excluded = 0");
            $stmt->execute();
            $domains = $stmt->fetchAll(\PDO::FETCH_ASSOC);
            
            return $this->success('Active domains retrieved', [
                'domains' => $domains
            ]);
        } catch (\Exception $e) {
            return $this->error('Failed to retrieve domains', [], 500);
        }
    }

    public function resetTasks(): void {
        $serverName = trim((string)(Request::get('server_name') ?? ''));
        if ($serverName === '') {
            $this->error('server_name is required', [], 400);
            return;
        }

        $count = WorkerService::resetWorkerTasks($serverName);
        $this->json([
            'success' => true,
            'reset_count' => $count
        ]);
    }
}
