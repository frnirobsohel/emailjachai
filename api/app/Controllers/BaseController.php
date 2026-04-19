<?php
namespace App\Controllers;

use Core\Response;

class BaseController {
    // We can add shared controller logic here (like auth checks per controller if needed)
    
    protected function json($data, $status = 200) {
        Response::json($data, $status);
    }
    
    protected function success($message, $data = [], $status = 200) {
        Response::success($message, $data, $status);
    }
    
    protected function error($message, $data = [], $status = 400, $errorCode = 'ERR_BAD_REQUEST') {
        Response::error($message, $data, $status, $errorCode);
    }
}
