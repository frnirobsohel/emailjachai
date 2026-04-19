<?php
namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Services\AuthService;
use App\Services\HelperService;
use App\Services\WorkerKeyService;
use App\Services\ServerService;
use Core\Request;
use Core\DB;

class ServerController extends BaseController {
    
    public function list() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        try {
            $servers = ServerService::getServerList();
            return $this->success('Servers retrieved', $servers);
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }

    public function workerKey() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        try {
            $keyData = WorkerKeyService::ensureProvisioned();
            $reveal = Request::getBool('reveal', false);
            if ($reveal) {
                HelperService::logActivity('WARN', 'Admin', 'Administrator revealed the dedicated worker API key', $userId);
            }
            return $this->success('Worker key retrieved', [
                'masked_key' => $keyData['masked_key'],
                'worker_key' => $reveal ? $keyData['worker_key'] : null,
            ]);
        } catch (\Throwable $e) {
            return $this->error('Unable to access worker key configuration.', [], 500);
        }
    }

    public function rotateWorkerKey() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        $input = Request::json();
        $password = trim((string)($input['password'] ?? ''));

        if ($password === '') return $this->error('Administrator password is required.', [], 400);

        if (!AuthService::verifyUserPassword((int)$userId, $password)) {
            HelperService::logActivity('WARN', 'Admin', 'Failed worker key rotation attempt', $userId);
            return $this->error('Invalid administrator password.', [], 403);
        }

        try {
            $keyData = WorkerKeyService::rotate();
            HelperService::logActivity('WARN', 'Admin', 'Dedicated worker API key rotated', $userId);
            return $this->success('Worker key rotated successfully', $keyData);
        } catch (\Throwable $e) {
            return $this->error('Unable to rotate worker key.', [], 500);
        }
    }

    public function store() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        $input = Request::json();
        
        $name = trim((string)($input['server_name'] ?? ''));
        $ip = trim((string)($input['ip_address'] ?? ''));
        $port = (int)($input['port'] ?? 80);

        try {
            ServerService::registerServer($name, $ip, $port);
            HelperService::logActivity('INFO', 'Admin', "New server '$name' ($ip) registered", $userId);
            return $this->success('Server registered');
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }

    public function update() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        $input = Request::json();
        $id = (int)($input['id'] ?? 0);

        if (!$id) return $this->error('ID is required');

        try {
            ServerService::updateServer($id, $input);
            HelperService::logActivity('INFO', 'Admin', "Server ID #$id updated", $userId);
            return $this->success('Server updated');
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }
    
    public function delete() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        $id = Request::get('id') ?? Request::json()['id'] ?? null;

        if (!$id) return $this->error('ID is required');

        $stmt = DB::prepare("DELETE FROM worker_servers WHERE id = ? LIMIT 1");
        $stmt->execute([$id]);
        
        HelperService::logActivity('WARN', 'Admin', "Server ID #$id deleted", $userId);
        return $this->success('Server deleted');
    }

    public function heartbeat() {
        AuthService::checkWorkerAuth();
        $input = Request::json();
        $ip = trim((string)($input['ip_address'] ?? Request::ip()));
        $name = trim((string)($input['server_name'] ?? ''));
        $port = isset($input['port']) ? (int)$input['port'] : null;
        $workerCount = (int)($input['worker_count'] ?? 0);

        try {
            ServerService::heartbeat($name, $ip, $port, $workerCount);
            return $this->success('Heartbeat received');
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }

    public function toggle() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        $input = Request::json();
        $id = $input['id'] ?? null;
        $enabled = isset($input['enabled']) ? (int)(bool)$input['enabled'] : null;

        if (!$id || $enabled === null) return $this->error('ID and enabled are required');

        DB::prepare("UPDATE worker_servers SET enabled = ? WHERE id = ?")->execute([$enabled, $id]);
        $label = $enabled ? 'enabled' : 'disabled';
        HelperService::logActivity('INFO', 'Admin', "Server ID #$id $label", $userId);
        return $this->success("Server $label successfully");
    }
}
