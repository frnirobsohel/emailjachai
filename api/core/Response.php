<?php
namespace Core;

class Response {
    public static function json($data, $status = 200) {
        if (ob_get_length()) ob_clean();
        
        $status = (is_numeric($status) && $status >= 100 && $status < 600) ? (int)$status : 500;
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRESERVE_ZERO_FRACTION);
        
        if ($json === false) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => 'JSON Encoding Error: ' . json_last_error_msg()]);
            exit;
        }

        echo $json;
        exit;
    }

    public static function success($message, $data = [], $status = 200) {
        self::json([
            'status' => 'success',
            'message' => (string)$message,
            'data' => $data,
            'timestamp' => time()
        ], $status);
    }

    public static function error($message, $data = [], $status = 400, $errorCode = 'ERR_BAD_REQUEST') {
        $requestId = class_exists('\\Core\\Request') ? \Core\Request::getRequestId() : 'unknown';
        self::json([
            'status' => 'error',
            'code' => (string)$errorCode,
            'message' => (string)$message,
            'data' => $data,
            'requestId' => $requestId,
            'timestamp' => time()
        ], $status);
    }
}
