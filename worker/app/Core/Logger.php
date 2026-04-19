<?php
namespace App\Core;

class Logger {
    private $logFile;

    public function __construct(string $logFile) {
        $this->logFile = $logFile;
        $this->ensureLogsDirectory();
    }

    public function info(string $message) {
        $this->log('INFO', $message);
    }

    public function warn(string $message) {
        $this->log('WARN', $message);
    }

    public function error(string $message) {
        $this->log('ERROR', $message);
    }

    public function critical(string $message) {
        $this->log('CRITICAL', $message);
    }

    private function log(string $level, string $message) {
        $timestamp = gmdate('Y-m-d H:i:s');
        $formattedMessage = sprintf("[%s] [%s] %s\n", $timestamp, $level, $message);
        
        // Output to console
        echo $formattedMessage;

        // Save to file
        @file_put_contents($this->logFile, $formattedMessage, FILE_APPEND | LOCK_EX);
    }

    private function ensureLogsDirectory() {
        $dir = dirname($this->logFile);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
    }
}
