<?php
namespace App\Core;

class Container {
    private static $instances = [];

    public static function set(string $key, $instance) {
        self::$instances[$key] = $instance;
    }

    public static function get(string $key) {
        if (!isset(self::$instances[$key])) {
            throw new \RuntimeException("Service {$key} not found in container.");
        }
        return self::$instances[$key];
    }

    public static function make(string $class, ...$args) {
        if (!isset(self::$instances[$class])) {
            self::$instances[$class] = new $class(...$args);
        }
        return self::$instances[$class];
    }
}
