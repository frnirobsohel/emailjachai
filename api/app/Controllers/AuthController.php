<?php
namespace App\Controllers;

use App\Controllers\BaseController;
use App\Services\AuthService;
use App\Services\HelperService;
use App\Services\UserService;
use Core\DB;
use Core\Request;

class AuthController extends BaseController {

    public function login() {
        $data = Request::validate([
            'email' => 'required|email',
            'password' => 'required|min:6'
        ]);

        $ip = Request::ip();

        // Business logic execution through Service
        AuthService::checkLoginThrottle($data['email'], $ip);
        $result = AuthService::login($data['email'], $data['password']);
        
        return $this->success('Login successful', $result);
    }

    public function register() {
        $input = Request::validate([
            'firstName' => 'required',
            'lastName' => 'required',
            'email' => 'required|email',
            'password' => 'required|min:8'
        ]);
        
        $data = [
            'name' => $input['firstName'] . ' ' . $input['lastName'],
            'email' => $input['email'],
            'password' => $input['password']
        ];

        $result = UserService::register($data);
        return $this->success('Registration successful', $result);
    }

    public function me() {
        try {
            $userId = AuthService::checkAuth();
            $user = AuthService::getSessionUser($userId);
            return $this->success('User profile retrieved', $user);
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], 401);
        }
    }

    public function updateProfile() {
        try {
            $userId = AuthService::checkAuth();
            $data = Request::json();

            $updateData = [];
            
            // Handle name update
            if (!empty($data['name'])) {
                $updateData['name'] = trim((string)$data['name']);
            }

            // Handle password update
            if (!empty($data['new_password'])) {
                // Validate current password
                if (empty($data['current_password'])) {
                    return $this->error('Current password is required to set a new one', [], 400);
                }

                $stmt = DB::prepare("SELECT password FROM users WHERE id = ?");
                $stmt->execute([$userId]);
                $user = $stmt->fetch();

                if (!$user || !password_verify($data['current_password'], $user['password'])) {
                    return $this->error('The current password you entered is incorrect', [], 400);
                }

                if (strlen($data['new_password']) < 8) {
                    return $this->error('New password must be at least 8 characters long', [], 400);
                }

                $updateData['password'] = password_hash($data['new_password'], PASSWORD_ARGON2ID);
            }

            if (empty($updateData)) {
                return $this->error('No changes provided', [], 400);
            }

            $sets = [];
            $params = [];
            foreach ($updateData as $key => $value) {
                $sets[] = "{$key} = ?";
                $params[] = $value;
            }
            $params[] = $userId;

            $sql = "UPDATE users SET " . implode(', ', $sets) . ", updated_at = CURRENT_TIMESTAMP WHERE id = ?";
            $stmt = DB::prepare($sql);
            $stmt->execute($params);

            HelperService::logActivity('INFO', 'Auth', 'User updated profile/security settings', $userId, Request::ip());

            return $this->success('Profile updated successfully');
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }

    public function impersonate() {
        try {
            $adminId = AuthService::checkAuth();
            AuthService::requireAdmin($adminId);

            $input = Request::json();
            $targetUserId = (int)($input['user_id'] ?? 0);

            if ($targetUserId <= 0) {
                return $this->error('Target user ID is required', [], 400);
            }

            $user = UserService::getProfile($targetUserId);

            if (strtolower((string)$user['status']) === 'suspended') {
                return $this->error('Cannot impersonate a suspended user', [], 403);
            }

            // Log action
            HelperService::logActivity('WARN', 'Auth', "Admin impersonated user #{$targetUserId} ({$user['email']})", $adminId, Request::ip());

            // Get target user's active API key
            $apiKey = 'ak_live_' . bin2hex(random_bytes(24));
            $prefix = substr($apiKey, 0, 16);
            $hash = password_hash($apiKey, PASSWORD_ARGON2ID);

            $stmt = DB::prepare("SELECT id FROM api_keys WHERE user_id = ? AND name = 'Impersonation Key' LIMIT 1");
            $stmt->execute([$targetUserId]);
            $impKeyId = $stmt->fetchColumn();

            if ($impKeyId) {
                // Update existing Impersonation Key
                $stmt = DB::prepare("UPDATE api_keys SET api_key = ?, key_prefix = ?, status = 'active', created_at = CURRENT_TIMESTAMP, expires_at = DATE_ADD(NOW(), INTERVAL 20 MINUTE) WHERE id = ?");
                $stmt->execute([$hash, $prefix, $impKeyId]);
            } else {
                // Generate a new one if none exists
                $stmt = DB::prepare("INSERT INTO api_keys (user_id, api_key, key_prefix, name, expires_at) VALUES (?, ?, ?, 'Impersonation Key', DATE_ADD(NOW(), INTERVAL 20 MINUTE))");
                $stmt->execute([$targetUserId, $hash, $prefix]);
            }

            return $this->success("In-app impersonation logged", [
                'user' => [
                    'id' => (int)$user['id'],
                    'name' => $user['name'],
                    'email' => $user['email'],
                    'role' => $user['role']
                ],
                'api_key' => $apiKey
            ]);

        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }
}
