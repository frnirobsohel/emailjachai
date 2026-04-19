<?php
namespace Core;

class Container {
    private static $instances = [];
    private static $bindings = [];

    public static function bind(string $key, callable $resolver) {
        self::$bindings[$key] = $resolver;
    }

    public static function singleton(string $class) {
        if (!isset(self::$instances[$class])) {
            self::$instances[$class] = new $class();
        }
        return self::$instances[$class];
    }

    public static function make(string $class) {
        if (isset(self::$bindings[$class])) {
            return (self::$bindings[$class])();
        }
        
        if (isset(self::$instances[$class])) {
            return self::$instances[$class];
        }

        return new $class();
    }
}
