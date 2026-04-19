<?php
namespace App\Services;

use Core\DB;
use App\Services\HelperService;

class UserService {

    /**
     * Create a new user with default credits and an initial API key.
     */
    public static function register(array $data): array {
        $name = trim($data['name'] ?? '');
        $email = strtolower(trim($data['email'] ?? ''));
        $password = $data['password'] ?? '';

        if ($name === '' || $email === '' || $password === '') {
            throw new \Exception('Name, email, and password are required', 400);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \Exception('Invalid email format', 400);
        }

        $pdo = DB::getInstance();
        
        // Check if user exists
        $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            throw new \Exception('User already exists', 409);
        }

        $pdo->beginTransaction();
        try {
            // Fetch default credits (price = 0 package)
            $pkgStmt = $pdo->prepare("SELECT credits_amount FROM packages WHERE price = 0 AND status = 'active' LIMIT 1");
            $pkgStmt->execute();
            $startingCredits = (int)$pkgStmt->fetchColumn();

            // Hash password
            $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

            // Insert user
            $stmt = $pdo->prepare("INSERT INTO users (name, email, password, credits, status) VALUES (?, ?, ?, ?, 'Active')");
            $stmt->execute([$name, $email, $hashedPassword, $startingCredits]);
            $userId = $pdo->lastInsertId();

            // Generate initial API Key
            $apiKey = 'ak_live_' . bin2hex(random_bytes(24));
            $prefix = substr($apiKey, 0, 16);
            $hash = password_hash($apiKey, PASSWORD_ARGON2ID);
            $stmt = $pdo->prepare("INSERT INTO api_keys (user_id, key_prefix, api_key, name) VALUES (?, ?, ?, 'Main API Key')");
            $stmt->execute([$userId, $prefix, $hash]);

            $pdo->commit();

            HelperService::logActivity('INFO', 'User', "New user registered: $name ($email)", $userId);

            return [
                'user_id' => $userId,
                'api_key' => $apiKey
            ];
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Get user profile by ID
     */
    public static function getProfile(int $userId): array {
        $stmt = DB::prepare("SELECT id, name, email, role, credits, status, created_at FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();

        if (!$user) {
            throw new \Exception('User not found', 404);
        }

        return $user;
    }
}
