<?php
namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use Core\Request;
use App\Services\AuthService;
use App\Services\HelperService;
use Core\DB;

class SettingsController extends BaseController {

    public function index() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $stmt = DB::prepare("SELECT setting_key, setting_value FROM settings");
        $stmt->execute();
        $settings = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        
        return $this->success('Settings retrieved', $settings);
    }
    
    public function update() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        $input = Request::json();

        // Backward compatible: accept { settings: {...} } and legacy flat object payloads.
        $settingsPayload = [];
        if (isset($input['settings']) && is_array($input['settings'])) {
            $settingsPayload = $input['settings'];
        } elseif (is_array($input)) {
            $settingsPayload = $input;
            unset($settingsPayload['action'], $settingsPayload['id']);
        }

        if (empty($settingsPayload) || !is_array($settingsPayload)) {
            return $this->error('Invalid input format', [], 400);
        }
        
        $pdo = DB::getInstance();
        $pdo->beginTransaction();
        
        try {
            $numericRules = [
                'chunk_size' => ['min' => 10, 'max' => 50000, 'default' => 1000],
                'task_timeout' => ['min' => 1, 'max' => 1440, 'default' => 60],
                'max_emails_per_job' => ['min' => 10, 'max' => 1000000, 'default' => 100000],
                'max_active_jobs_per_user' => ['min' => 0, 'max' => 10000, 'default' => 0],
            ];

            $stmt = $pdo->prepare(
                "INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)"
            );
            
            foreach ($settingsPayload as $key => $value) {
                $key = trim((string)$key);
                if ($key === '') {
                    continue;
                }

                if (isset($numericRules[$key])) {
                    $rule = $numericRules[$key];
                    $number = is_numeric($value) ? (int)$value : (int)$rule['default'];
                    $number = max((int)$rule['min'], min((int)$rule['max'], $number));
                    $value = (string)$number;
                } else {
                    $value = (string)$value;
                }

                $stmt->execute([$key, $value]);
            }
            
            $pdo->commit();
            
            HelperService::logActivity('INFO', 'Admin', "System settings updated", $userId);
            \App\Services\CacheService::delete('public_settings');
            
            return $this->success('Settings updated successfully');
        } catch (\PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            \App\Services\Logger::error("Database Error in admin_settings: " . $e->getMessage());
            return $this->error('An internal server error occurred.', [], 500);
        }
    }
}
