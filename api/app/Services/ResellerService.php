<?php
namespace App\Services;

use Core\DB;
use App\Services\HelperService;

class ResellerService {

    /**
     * Transfer credits from reseller to a user.
     */
    public static function transferCredits(int $resellerId, string $recipientEmail, int $amount): array {
        if ($amount <= 0) {
            throw new \Exception('Transfer amount must be greater than zero.', 400);
        }

        $pdo = DB::getInstance();
        $pdo->beginTransaction();

        try {
            // 1. Validate Reseller & Credits
            $stmt = $pdo->prepare("SELECT id, email, credits FROM users WHERE id = ? FOR UPDATE");
            $stmt->execute([$resellerId]);
            $reseller = $stmt->fetch();

            if (!$reseller) {
                throw new \Exception('Reseller not found.', 404);
            }

            if ($reseller['credits'] < $amount) {
                throw new \Exception('Insufficient credits.', 400);
            }

            // 2. Validate Recipient
            $stmt = $pdo->prepare("SELECT id, email FROM users WHERE email = ? FOR UPDATE");
            $stmt->execute([$recipientEmail]);
            $recipient = $stmt->fetch();

            if (!$recipient) {
                throw new \Exception('Recipient user not found.', 404);
            }

            if ($recipient['id'] === $resellerId) {
                throw new \Exception('You cannot transfer credits to yourself.', 400);
            }

            // 3. Subtract from Reseller
            $stmt = $pdo->prepare("UPDATE users SET credits = credits - ? WHERE id = ?");
            $stmt->execute([$amount, $resellerId]);

            // 4. Add to Recipient
            $stmt = $pdo->prepare("UPDATE users SET credits = credits + ? WHERE id = ?");
            $stmt->execute([$amount, $recipient['id']]);

            // 5. Log Transactions
            // To Reseller (Out)
            $stmt = $pdo->prepare("INSERT INTO transactions (user_id, amount, credits_added, type, status, description) VALUES (?, ?, ?, 'transfer_out', 'completed', ?)");
            $descOut = "Transferred $amount credits to {$recipient['email']}";
            $stmt->execute([$resellerId, 0, -$amount, $descOut]);

            // To Recipient (In)
            $stmt = $pdo->prepare("INSERT INTO transactions (user_id, amount, credits_added, type, status, description) VALUES (?, ?, ?, 'transfer_in', 'completed', ?)");
            $descIn = "Received $amount credits from {$reseller['email']}";
            $stmt->execute([$recipient['id'], 0, $amount, $descIn]);

            $pdo->commit();

            HelperService::logActivity('INFO', 'Reseller', "Transferred $amount credits from {$reseller['email']} to {$recipient['email']}", $resellerId);

            return [
                'success' => true,
                'message' => "Successfully transferred $amount credits to {$recipient['email']}.",
                'reseller_balance' => $reseller['credits'] - $amount
            ];

        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
