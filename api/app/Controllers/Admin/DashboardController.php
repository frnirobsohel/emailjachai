<?php
namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use App\Services\AuthService;
use Core\DB;

class DashboardController extends BaseController {
    public function stats() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $statsQuery = DB::query("
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM jobs WHERE status IN ('pending', 'processing')) as active_jobs,
                (SELECT SUM(credits_added) FROM transactions WHERE type = 'purchase' AND status = 'completed') as total_credits,
                (SELECT SUM(amount) FROM transactions WHERE type = 'purchase' AND status = 'completed') as total_revenue
        ")->fetch(\PDO::FETCH_ASSOC);

        $totalUsers = $statsQuery['total_users'] ?? 0;
        $activeJobs = $statsQuery['active_jobs'] ?? 0;
        $totalCredits = $statsQuery['total_credits'] ?? 0;
        $totalRev = $statsQuery['total_revenue'] ?? 0;

        $users = DB::query("SELECT name, email, 'Basic' as plan, created_at as date FROM users ORDER BY id DESC LIMIT 5")->fetchAll(\PDO::FETCH_ASSOC);
        
        // Fetch recent logs with proper mapping for frontend
        $rawLogs = DB::query("SELECT level, source as user, message as event, created_at as time FROM activity_logs ORDER BY created_at DESC LIMIT 5")->fetchAll(\PDO::FETCH_ASSOC);
        
        $logs = array_map(function($log) {
            $log['status'] = strtolower($log['level'] === 'info' ? 'success' : ($log['level'] === 'warn' ? 'warning' : strtolower($log['level'])));
            return $log;
        }, $rawLogs);

        return $this->success('Admin stats', [
            'total_users' => ['value' => (string)($totalUsers ?? 0), 'trend' => '+0%', 'status' => 'up'],
            'active_jobs' => ['value' => (string)($activeJobs ?? 0), 'trend' => 'Active', 'status' => 'up'],
            'total_credits' => ['value' => number_format((float)($totalCredits ?? 0)), 'trend' => '+0%', 'status' => 'up'],
            'total_revenue' => ['value' => '$'.number_format((float)($totalRev ?? 0), 2), 'trend' => '+0%', 'status' => 'up'],
            'recent_users' => $users ?: [],
            'recent_logs' => $logs ?: []
        ]);
    }
}
