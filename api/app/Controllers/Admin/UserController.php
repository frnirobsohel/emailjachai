<?php
namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use Core\Request;
use App\Services\AuthService;
use App\Services\HelperService;
use Core\DB;

class UserController extends BaseController {

    public function index() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $stmt = DB::prepare("SELECT id, name, email, role, status, credits, created_at FROM users ORDER BY created_at DESC");
        $stmt->execute();
        $users = $stmt->fetchAll();
        
        return $this->success('Users retrieved', $users);
    }
    
    public function action() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        
        $input = Request::json();
        $action = $input['action'] ?? '';
        $targetUserId = (int)($input['user_id'] ?? 0);
        $allowedRoles = ['admin', 'manager', 'reseller', 'user', 'demo'];
        $allowedStatuses = ['Active', 'Suspended'];
        
        if (!$targetUserId || !$action) {
            return $this->error('User ID and action are required.', [], 400);
        }
        
        $pdo = DB::getInstance();
        $targetUserStmt = $pdo->prepare("SELECT id, role FROM users WHERE id = ?");
        $targetUserStmt->execute([$targetUserId]);
        $targetUser = $targetUserStmt->fetch(\PDO::FETCH_ASSOC);

        if (!$targetUser) {
            return $this->error('Target user not found.', [], 404);
        }
        
        if ($action === 'toggle_status') {
            $status = $input['status'] ?? 'Active';
            if (!in_array($status, $allowedStatuses, true)) {
                return $this->error('Invalid status value.', [], 400);
            }
            if ($targetUserId === $userId && $status === 'Suspended') {
                return $this->error('You cannot suspend your own admin account.', [], 400);
            }
            $stmt = $pdo->prepare("UPDATE users SET status = ? WHERE id = ?");
            $stmt->execute([$status, $targetUserId]);
            HelperService::logActivity('INFO', 'Admin', "Changed user #$targetUserId status to $status", $userId);
            return $this->success('User status updated');
        }
        
        if ($action === 'update_role') {
            $role = $input['role'] ?? 'user';
            if (!in_array($role, $allowedRoles, true)) {
                return $this->error('Invalid role value.', [], 400);
            }
            if ($targetUserId === $userId && $role !== 'admin') {
                return $this->error('You cannot remove your own admin role.', [], 400);
            }
            $stmt = $pdo->prepare("UPDATE users SET role = ? WHERE id = ?");
            $stmt->execute([$role, $targetUserId]);
            HelperService::logActivity('INFO', 'Admin', "Changed user #$targetUserId role to $role", $userId);
            return $this->success('User role updated');
        }
        
        if ($action === 'delete') {
            if ($targetUserId === $userId) {
                return $this->error('You cannot delete your own admin account.', [], 400);
            }
            try {
                $pdo->beginTransaction();
                $pdo->prepare("DELETE FROM api_keys WHERE user_id = ?")->execute([$targetUserId]);
                $pdo->prepare("DELETE FROM transactions WHERE user_id = ?")->execute([$targetUserId]);
                $pdo->prepare("DELETE FROM jobs WHERE user_id = ?")->execute([$targetUserId]);
                $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$targetUserId]);
                $pdo->commit();
                HelperService::logActivity('WARN', 'Admin', "Deleted user #$targetUserId", $userId);
                return $this->success('User and associated data deleted securely');
            } catch (\Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                error_log("Database Error deleting user: " . $e->getMessage());
                return $this->error('Failed to delete user.');
            }
        }
        
        if ($action === 'adjust_credits') {
            $amount = (int)($input['amount'] ?? 0);
            $amountPaid = (float)($input['amount_paid'] ?? 0);
            
            if ($amount === 0) return $this->error('Credit amount cannot be zero.', [], 400);
            if ($amountPaid > 0 && $amount < 0) return $this->error('Amount paid cannot be associated with deduction.', [], 400);
            
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare("UPDATE users SET credits = credits + ? WHERE id = ?");
                $stmt->execute([$amount, $targetUserId]);
                
                $type = $amount > 0 ? 'purchase' : 'usage';
                $desc = $amount > 0 ? 'Admin added credits' : 'Admin removed credits';
                
                $stmt = $pdo->prepare("INSERT INTO transactions (user_id, amount, credits_added, type, status, description) VALUES (?, ?, ?, ?, 'completed', ?)");
                $stmt->execute([$targetUserId, $amountPaid, $amount, $type, $desc]);
                
                $pdo->commit();
                HelperService::logActivity('INFO', 'Admin', "Adjusted $amount credits for user #$targetUserId", $userId);
                
                $stmt = $pdo->prepare("SELECT credits FROM users WHERE id = ?");
                $stmt->execute([$targetUserId]);
                return $this->success('Credits adjusted successfully', ['credits' => $stmt->fetchColumn()]);
            } catch (\Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                error_log("Database Error adjusting credits: " . $e->getMessage());
                return $this->error('Failed to adjust credits.');
            }
        }

        return $this->error('Invalid action specified', [], 400);
    }
}
