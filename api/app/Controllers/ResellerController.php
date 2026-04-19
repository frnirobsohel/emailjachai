<?php
namespace App\Controllers;

use Core\Request;
use App\Services\AuthService;
use App\Services\ResellerService;

class ResellerController extends BaseController {

    /**
     * Handle credit transfer request.
     */
    public function transferCredits() {
        $userId = AuthService::checkAuth();
        AuthService::requireReseller($userId);

        $data = Request::json();
        $email = trim($data['email'] ?? '');
        $amount = (int)($data['amount'] ?? 0);

        if ($email === '') return $this->error('Recipient email required', [], 400);
        if ($amount <= 0) return $this->error('Transfer amount must be greater than zero', [], 400);

        try {
            $result = ResellerService::transferCredits($userId, $email, $amount);
            return $this->success($result['message'], [
                'reseller_balance' => $result['reseller_balance']
            ]);
        } catch (\Exception $e) {
            return $this->error($e->getMessage(), [], $e->getCode() ?: 500);
        }
    }
}
