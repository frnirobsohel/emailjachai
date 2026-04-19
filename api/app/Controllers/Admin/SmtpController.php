<?php
namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Services\AuthService;
use Core\Request;
use Core\DB;
use App\Services\HelperService;

class SmtpController extends BaseController {
    
    public function getSettings() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        
        // Bug fix: must call execute() before fetch() on a prepared statement
        $stmt = DB::prepare("SELECT id, host, port, username, password, encryption, daily_limit FROM smtp_configs LIMIT 1");
        $stmt->execute();
        $config = $stmt->fetch(\PDO::FETCH_ASSOC);
        
        // Decrypt password if it exists
        $decryptedPass = '';
        if (!empty($config['password']) && strpos($config['password'], ':') !== false) {
            $key = getenv('JWT_SECRET');
            if (empty($key)) {
                \App\Services\Logger::error("JWT_SECRET missing. Cannot decrypt SMTP password securely.");
                return $this->error("Server security misconfiguration.");
            }
            $encryptionKey = hash('sha256', $key, true);
            $cipher = "AES-256-CTR";
            list($encryptedData, $iv) = explode(':', $config['password'], 2);
            $decryptedPass = openssl_decrypt($encryptedData, $cipher, $encryptionKey, 0, hex2bin($iv));
        }

        return $this->success('SMTP settings retrieved', [
            'host' => $config['host'] ?? 'smtp.example.com',
            'port' => $config['port'] ?? '587',
            'encryption' => $config['encryption'] ?? 'tls',
            'username' => $config['username'] ?? '',
            'password' => '',
            'has_password' => !empty($decryptedPass),
            'daily_limit' => $config['daily_limit'] ?? '5000'
        ]);
    }

    public function saveSettings() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        $input = Request::json();
        
        $host = $input['host'] ?? '';
        $port = (int)($input['port'] ?? 587);
        $user = $input['username'] ?? '';
        $pass = $input['password'] ?? '';
        $enc = $input['encryption'] ?? 'tls';
        $limit = (int)($input['daily_limit'] ?? 5000);

        $pdo = DB::getInstance();
        $configStmt = $pdo->prepare("SELECT id, password FROM smtp_configs LIMIT 1");
        $configStmt->execute();
        $existingConfig = $configStmt->fetch(\PDO::FETCH_ASSOC) ?: null;
        $exists = (int)($existingConfig['id'] ?? 0);

        $shouldPreservePassword = ($pass === '' || $pass === '********');
        $finalStorage = (string)($existingConfig['password'] ?? '');

        if (!$shouldPreservePassword) {
            // Secure encryption using random IV
            $key = getenv('JWT_SECRET');
            if (empty($key)) {
                \App\Services\Logger::error("JWT_SECRET missing. Cannot encrypt SMTP password securely.");
                return $this->error("Server security misconfiguration.");
            }

            $encryptionKey = hash('sha256', $key, true);
            $cipher = "AES-256-CTR";
            $iv_length = openssl_cipher_iv_length($cipher);
            $encryption_iv = openssl_random_pseudo_bytes($iv_length);
            $encryptedPass = openssl_encrypt($pass, $cipher, $encryptionKey, 0, $encryption_iv);
            $finalStorage = $encryptedPass . ':' . bin2hex($encryption_iv);
        }

        if ($exists > 0) {
            $stmt = $pdo->prepare("UPDATE smtp_configs SET host = ?, port = ?, username = ?, password = ?, encryption = ?, daily_limit = ? WHERE id = ?");
            $stmt->execute([$host, $port, $user, $finalStorage, $enc, $limit, $exists]);
        } else {
            $stmt = $pdo->prepare("INSERT INTO smtp_configs (host, port, username, password, encryption, daily_limit) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$host, $port, $user, $finalStorage, $enc, $limit]);
        }
        
        HelperService::logActivity('INFO', 'Admin', "SMTP settings updated", $userId);
        return $this->success('SMTP settings saved');
    }
    
    public function getTemplates() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        // Bug fix: must call execute() before fetchAll()
        $stmt = DB::prepare("SELECT id, template_name, subject, body FROM email_templates");
        $stmt->execute();
        $templates = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        return $this->success('Templates retrieved', $templates ?: []);
    }
    
    public function saveTemplate() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        $input = Request::json();
        
        // Schema fix: DB uses 'template_name' not 'template_key' — accept both for compatibility
        $key = $input['template_name'] ?? $input['template_key'] ?? '';
        $subject = $input['subject'] ?? '';
        $body = $input['body'] ?? '';

        if (!$key) return $this->error('Template name is required');

        $pdo = DB::getInstance();
        $stmt = $pdo->prepare("INSERT INTO email_templates (template_name, subject, body) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE subject = ?, body = ?");
        $stmt->execute([$key, $subject, $body, $subject, $body]);
        
        HelperService::logActivity('INFO', 'Admin', "Email template '$key' updated", $userId);
        return $this->success('Template saved');
    }
}
