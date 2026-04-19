<?php
namespace App\Controllers;

use Core\Request;
use App\Services\AuthService;
use App\Services\DeletedJobStatsService;
use Core\DB;

class DashboardController extends BaseController {

    public function stats() {
        $userId = AuthService::checkAuth();
        
        $cacheKey = 'user_dashboard_stats_' . $userId;
        $cachedStats = \App\Services\CacheService::get($cacheKey);
        if ($cachedStats) {
            return $this->success('Dashboard stats retrieved', $cachedStats);
        }

        DeletedJobStatsService::ensureSchema();

        // Get User Credits and Transaction Totals in one pass if possible, 
        // but since they are in different tables correctly, we'll do 3 main blocks.
        
        // 1. User & Transaction Summary (Optimized: single pass through transactions)
        $stmt = DB::prepare("
            SELECT 
                u.credits,
                t.total_purchased,
                t.total_refunds
            FROM users u
            LEFT JOIN (
                SELECT 
                    user_id,
                    SUM(CASE WHEN type = 'purchase' AND status = 'completed' THEN credits_added ELSE 0 END) as total_purchased,
                    ABS(SUM(CASE WHEN type = 'refund' AND status = 'completed' THEN credits_added ELSE 0 END)) as total_refunds
                FROM transactions 
                WHERE user_id = ?
                GROUP BY user_id
            ) t ON u.id = t.user_id
            WHERE u.id = ?
        ");
        $stmt->execute([$userId, $userId]);
        $userSummary = $stmt->fetch(\PDO::FETCH_ASSOC);

        // 2. Job Statistics Summary (Consolidated)
        $stmt = DB::prepare("
            SELECT 
                SUM(processed_count) as total_verifications,
                COUNT(CASE WHEN job_type = 'bulk' THEN 1 END) as total_jobs,
                COUNT(CASE WHEN job_type = 'bulk' AND status IN ('pending', 'processing') THEN 1 END) as active_jobs,
                SUM(CASE WHEN DATE(created_at) = CURDATE() THEN processed_count ELSE 0 END) as today_verifications,
                SUM(deliverable) as deliverable, 
                SUM(risky) as risky, 
                SUM(undeliverable) as undeliverable, 
                SUM(catch_all) as catch_all,
                SUM(disposable) as disposable
            FROM jobs 
            WHERE user_id = ?
        ");
        $stmt->execute([$userId]);
        $jobStats = $stmt->fetch(\PDO::FETCH_ASSOC);

        $deletedTotals = DeletedJobStatsService::fetchTotals((int)$userId);
        $weekStartDate = date('Y-m-d', strtotime('-6 days'));
        $deletedActivityRows = DeletedJobStatsService::fetchDaily((int)$userId, $weekStartDate);

        $creditsRemaining = $userSummary['credits'] ?? 0;
        $totalPurchased = $userSummary['total_purchased'] ?? 0;
        $totalRefunds = $userSummary['total_refunds'] ?? 0;
        $totalVerifications = (int)($jobStats['total_verifications'] ?? 0) + (int)($deletedTotals['total_verifications'] ?? 0);
        $totalJobs = (int)($jobStats['total_jobs'] ?? 0) + (int)($deletedTotals['total_jobs'] ?? 0);
        $activeJobs = $jobStats['active_jobs'] ?? 0;
        $todayVerifications = (int)($jobStats['today_verifications'] ?? 0);
        $breakdown = [
            'deliverable' => (int)($jobStats['deliverable'] ?? 0) + (int)($deletedTotals['deliverable'] ?? 0),
            'risky' => (int)($jobStats['risky'] ?? 0) + (int)($deletedTotals['risky'] ?? 0),
            'undeliverable' => (int)($jobStats['undeliverable'] ?? 0) + (int)($deletedTotals['undeliverable'] ?? 0),
            'catch_all' => (int)($jobStats['catch_all'] ?? 0) + (int)($deletedTotals['catch_all'] ?? 0),
            'disposable' => (int)($jobStats['disposable'] ?? 0) + (int)($deletedTotals['disposable'] ?? 0),
        ];

        // Weekly Activity (For Bar Chart - Last 7 Days)
        $stmt = DB::prepare("
            SELECT DATE(created_at) as date, SUM(processed_count) as emails, COUNT(*) as jobs 
            FROM jobs 
            WHERE user_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC
        ");
        $stmt->execute([$userId]);
        $dbActivity = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $r) {
            $dbActivity[$r['date']] = $r;
        }

        $todayDate = date('Y-m-d');
        $todayDeletedVerifications = 0;
        foreach ($deletedActivityRows as $row) {
            $dateKey = (string)($row['date'] ?? '');
            if ($dateKey === '') {
                continue;
            }

            if (!isset($dbActivity[$dateKey])) {
                $dbActivity[$dateKey] = ['emails' => 0, 'jobs' => 0];
            }

            $dbActivity[$dateKey]['emails'] = (int)($dbActivity[$dateKey]['emails'] ?? 0) + (int)($row['emails'] ?? 0);
            $dbActivity[$dateKey]['jobs'] = (int)($dbActivity[$dateKey]['jobs'] ?? 0) + (int)($row['jobs'] ?? 0);

            if ($dateKey === $todayDate) {
                $todayDeletedVerifications += (int)($row['emails'] ?? 0);
            }
        }

        $todayVerifications += $todayDeletedVerifications;

        $weeklyActivity = [];
        for ($i = 6; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i days"));
            $dayName = date('D', strtotime($date));
            $row = $dbActivity[$date] ?? ['emails' => 0, 'jobs' => 0];
            
            $weeklyActivity[] = [
                'name' => $dayName,
                'emails' => (int)($row['emails'] ?? 0),
                'jobs' => (int)($row['jobs'] ?? 0)
            ];
        }

        $finalData = [
            'credits_remaining' => number_format((float)$creditsRemaining),
            'total_purchased' => number_format((float)$totalPurchased),
            'total_refunds' => number_format((float)$totalRefunds),
            'lifetime_verifications' => number_format((float)$totalVerifications),
            'total_jobs' => $totalJobs,
            'active_jobs' => $activeJobs,
            'today_verifications' => number_format((float)$todayVerifications),
            'usage_breakdown' => [
                ['name' => 'Valid', 'value' => (int)($breakdown['deliverable'] ?? 0), 'color' => '#22c55e'],
                ['name' => 'Unknown', 'value' => (int)($breakdown['risky'] ?? 0), 'color' => '#f59e0b'],
                ['name' => 'Invalid', 'value' => (int)($breakdown['undeliverable'] ?? 0), 'color' => '#ef4444'],
                ['name' => 'Catch-All', 'value' => (int)($breakdown['catch_all'] ?? 0), 'color' => '#cbd5e1'],
                ['name' => 'Disposable', 'value' => (int)($breakdown['disposable'] ?? 0), 'color' => '#3b82f6'],
            ],
            'weekly_activity' => $weeklyActivity
        ];

        \App\Services\CacheService::set($cacheKey, $finalData, 60);

        return $this->success('Dashboard stats retrieved', $finalData);
    }

    public function history() {
        $userId = AuthService::checkAuth();
        $limit = max(1, (int)Request::get('limit', 10));
        $offset = max(0, (int)Request::get('offset', 0));

        $stmt = DB::prepare("SELECT id, created_at, amount as cost, credits_added as amount, type, status, description FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT " . (int)$limit . " OFFSET " . (int)$offset);
        $stmt->execute([$userId]);
        $transactions = $stmt->fetchAll(\PDO::FETCH_ASSOC);

        foreach ($transactions as &$t) {
            $t['date'] = date('Y-m-d H:i:s', strtotime($t['created_at']));
            $t['type'] = ucfirst(str_replace('_', ' ', $t['type'])); // e.g., 'usage' -> 'Usage', 'purchase' -> 'Purchase'
            $t['status'] = ucfirst($t['status']); 
            
            // Format amounts
            $t['amount'] = ($t['amount'] > 0 ? '+' : '') . number_format($t['amount'], 0) . ' Credits';
            $t['cost'] = '$' . number_format($t['cost'], 2);
        }

        $stmt = DB::prepare("SELECT COUNT(*) FROM transactions WHERE user_id = ?");
        $stmt->execute([$userId]);
        $total = $stmt->fetchColumn();

        return $this->success('Transactions retrieved', [
            'transactions' => $transactions, 
            'total' => $total
        ]);
    }

    // Purchase method removed to prevent credit bypass.
    // All credit additions must be handled through verified payment webhooks.
}
