<?php
namespace App\Controllers;

use Core\Response;

class FallbackController extends BaseController {
    public function test() {
        if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') {
            return $this->error('Access denied', [], 403);
        }
        return $this->success('Email Verification API — Running', [
            'version' => '1.1.0',
            'status' => 'active'
        ]);
    }

    public function index() {
        return $this->success('Email Verification API');
    }
}
