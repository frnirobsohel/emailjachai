<?php
namespace App\Services;

use Core\DB;

class BillingService {
    
    /**
     * Deduct credits from user balance and log it
     */
    public static function deductCredits($userId, $amount = 1, $description = 'Credit Usage', $idempotencyKey = null) {
        $amount = (int)$amount;
        if ($amount <= 0) {
            return true;
        }

        $normalizedIdemKey = self::normalizeIdempotencyKey($idempotencyKey, (int)$userId);
        $pdo = DB::getInstance();
        try {
            $pdo->beginTransaction();

            $result = self::deductCreditsTransactional($pdo, (int)$userId, $amount, (string)$description, $normalizedIdemKey);
            if ($result === false) {
                $creditStmt = $pdo->prepare("SELECT credits FROM users WHERE id = ? LIMIT 1");
                $creditStmt->execute([$userId]);
                $currentCredits = $creditStmt->fetchColumn();
                error_log("BillingService::deductCredits insufficient for user {$userId}. required={$amount}, current=" . (int)$currentCredits);
                $pdo->rollBack();
                return false;
            }

            $pdo->commit();
            return true;
        } catch (\Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('BillingService::deductCredits failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Deduct credits using an existing transaction.
     * Returns true when applied, 'already_processed' when the idempotency key already exists, and false on insufficient credits.
     */
    public static function deductCreditsTransactional(\PDO $pdo, int $userId, int $amount, string $description, ?string $normalizedIdempotencyKey = null) {
        if ($normalizedIdempotencyKey !== null) {
            $stmt = $pdo->prepare("INSERT IGNORE INTO processed_requests (idempotency_key, user_id) VALUES (?, ?)");
            $stmt->execute([$normalizedIdempotencyKey, $userId]);
            if ($stmt->rowCount() === 0) {
                return 'already_processed';
            }
        }

        if ($amount <= 0) {
            return true;
        }

        $stmt = $pdo->prepare("UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?");
        $stmt->execute([$amount, $userId, $amount]);

        if ($stmt->rowCount() === 0) {
            return false;
        }

        $stmt = $pdo->prepare("
            INSERT INTO transactions (user_id, amount, credits_added, type, status, description)
            VALUES (?, ?, ?, 'usage', 'completed', ?)
        ");
        $stmt->execute([$userId, 0.00, -$amount, $description]);

        return true;
    }

    public static function normalizeKeyForUser($idempotencyKey, int $userId): ?string {
        return self::normalizeIdempotencyKey($idempotencyKey, $userId);
    }

    private static function normalizeIdempotencyKey($idempotencyKey, int $userId): ?string {
        if ($idempotencyKey === null) {
            return null;
        }

        $raw = trim((string)$idempotencyKey);
        if ($raw === '') {
            return null;
        }

        // Keep storage safe and collision-resistant for VARCHAR(64).
        return hash('sha256', 'billing|' . $userId . '|' . $raw);
    }
}
