<?php
namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Services\AuthService;
use Core\Request;
use Core\DB;
use App\Services\HelperService;

class LogsController extends BaseController {
    
    public function list() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        $limit = max(1, (int)Request::get('limit', 20));
        $offset = max(0, (int)Request::get('offset', 0));

        $stmt = DB::prepare("SELECT l.*, l.created_at as time, u.name as user_name FROM activity_logs l LEFT JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC LIMIT " . (int)$limit . " OFFSET " . (int)$offset);
        $stmt->execute();
        $logs = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        $total = DB::query("SELECT COUNT(*) FROM activity_logs")->fetchColumn();

        return $this->success('Logs retrieved', [
            'logs' => $logs ?: [],
            'total' => (int)$total,
            'has_more' => ($offset + $limit) < $total
        ]);
    }

    public function clear() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        DB::prepare("TRUNCATE TABLE activity_logs")->execute();
        HelperService::logActivity('WARN', 'Admin', "Activity logs cleared", $userId);
        return $this->success('Logs cleared successfully');
    }
}
