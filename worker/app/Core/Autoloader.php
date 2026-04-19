<?php
namespace App\Core;

class Autoloader {
    public static function register(string $basePath) {
        spl_autoload_register(function ($class) use ($basePath) {
            $prefix = 'App\\';
            $baseDir = $basePath . '/app/';

            $len = strlen($prefix);
            if (strncmp($prefix, $class, $len) !== 0) {
                return;
            }

            $relativeClass = substr($class, $len);
            $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

            if (file_exists($file)) {
                require $file;
            }
        });
    }
}
