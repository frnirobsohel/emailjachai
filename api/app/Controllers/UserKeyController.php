<?php
namespace App\Controllers;

use Core\Request;
use App\Services\AuthService;
use App\Services\HelperService;
use Core\DB;

class UserKeyController extends BaseController {

    public function index() {
        $userId = AuthService::checkAuth();
        
        $stmt = DB::prepare("SELECT id, name, key_prefix, status, created_at, last_used_at FROM api_keys WHERE user_id = ? AND status != 'revoked' AND name NOT IN ('Login Key', 'Impersonation Key') ORDER BY created_at DESC");
        $stmt->execute([$userId]);
        $keys = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        
        $formattedKeys = array_map(function($k) {
            return [
                'id' => (int)$k['id'],
                'name' => $k['name'],
                'key_masked' => $k['key_prefix'] . str_repeat('*', 20),
                'created' => date('Y-m-d', strtotime($k['created_at'])),
                'last_used' => $k['last_used_at'] ? date('Y-m-d H:i', strtotime($k['last_used_at'])) : 'Never',
                'status' => $k['status']
            ];
        }, $keys);
        
        return $this->success('API keys retrieved', $formattedKeys);
    }
    
    public function create() {
        $userId = AuthService::checkAuth();
        $input = Request::json();
        
        $name = strip_tags(trim($input['name'] ?? 'New Key'));
        if (strlen($name) > 50) $name = substr($name, 0, 50);
        
        $stmt = DB::prepare("SELECT COUNT(*) FROM api_keys WHERE user_id = ? AND status = 'active'");
        $stmt->execute([$userId]);
        if ($stmt->fetchColumn() >= 5) {
            return $this->error('Maximum 5 active API keys allowed per user.', [], 400);
        }
        
        $newKey = 'ak_live_' . bin2hex(random_bytes(16));
        $prefix = substr($newKey, 0, 16);
        $hash = password_hash($newKey, PASSWORD_ARGON2ID);
        
        $stmt = DB::prepare("INSERT INTO api_keys (user_id, api_key, key_prefix, name) VALUES (?, ?, ?, ?)");
        $stmt->execute([$userId, $hash, $prefix, $name]);
        
        HelperService::logActivity('INFO', 'API', "New API Key created: $name", $userId);
        
        return $this->success('API key created successfully', [
            'id' => DB::lastInsertId(),
            'api_key' => $newKey,
            'name' => $name,
            'status' => 'active'
        ], 201);
    }
    
    public function revoke() {
        $userId = AuthService::checkAuth();
        $input = Request::json();
        $keyId = (int)($input['id'] ?? 0);
        
        if (!$keyId) return $this->error('Key ID is required');
        
        $stmt = DB::prepare("SELECT id, name FROM api_keys WHERE id = ? AND user_id = ?");
        $stmt->execute([$keyId, $userId]);
        $key = $stmt->fetch();
        
        if (!$key) return $this->error('API Key not found or belongs to another user', [], 404);
        
        $stmt = DB::prepare("UPDATE api_keys SET status = 'revoked' WHERE id = ?");
        $stmt->execute([$keyId]);
        
        HelperService::logActivity('WARN', 'API', "API Key revoked: " . $key['name'], $userId);
        return $this->success('API key has been revoked');
    }

    public function rotate() {
        $userId = AuthService::checkAuth();
        $input = Request::json();
        $keyId = (int)($input['id'] ?? 0);

        if (!$keyId) return $this->error('Key ID is required');

        $stmt = DB::prepare("SELECT id, name FROM api_keys WHERE id = ? AND user_id = ?");
        $stmt->execute([$keyId, $userId]);
        $key = $stmt->fetch();

        if (!$key) return $this->error('API Key not found', [], 404, 'ERR_NOT_FOUND');

        $newKey = 'ak_live_' . bin2hex(random_bytes(16));
        $prefix = substr($newKey, 0, 16);
        $hash = password_hash($newKey, PASSWORD_ARGON2ID);
        $stmt = DB::prepare("UPDATE api_keys SET api_key = ?, key_prefix = ? WHERE id = ?");
        $stmt->execute([$hash, $prefix, $keyId]);

        HelperService::logActivity('WARN', 'API', "API Key rotated: " . $key['name'], $userId);

        return $this->success('API key rotated successfully', ['api_key' => $newKey]);
    }

    /**
     * Reveal a full API key for the current user
     */
    public function show() {
        return $this->error('Full API keys cannot be revealed for security reasons.', [], 403);
    }
}
