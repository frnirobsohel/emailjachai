<?php
namespace App\Services;

use Core\Logger;

class CacheService {
    /** @var object|false|null Redis instance when available, false when unavailable, null when not yet initialized */
    private static $redis = null;
    private static $connected = false;
    private static $lastFailureTime = 0;
    private const COOLING_PERIOD = 10; // 10 seconds

    /**
     * Get Redis instance
     */
    private static function getRedis() {
        if (self::$redis !== null) {
            return self::$connected ? self::$redis : null;
        }

        // Cooling period: don't retry immediately if it failed recently
        if (time() - self::$lastFailureTime < self::COOLING_PERIOD) {
            return null;
        }

        if (!class_exists('\Redis')) {
            self::$redis = false;
            return null;
        }

        try {
            /** @noinspection PhpUndefinedClassInspection */
            $redisClass = 'Redis';
            self::$redis = new $redisClass();
            if (@self::$redis->connect('127.0.0.1', 6379, 0.5)) {
                self::$connected = true;
                return self::$redis;
            }
        } catch (\Exception $e) {
            error_log("Redis connection failed: " . $e->getMessage());
        }

        self::$lastFailureTime = time();
        self::$redis = false;
        return null;
    }

    /**
     * Increment a key with a TTL
     */
    public static function increment(string $key, int $ttl = 60): int {
        $redis = self::getRedis();
        if (!$redis) return -1;

        try {
            $count = $redis->incr($key);
            if ($count === 1) {
                $redis->expire($key, $ttl);
            }
            return (int)$count;
        } catch (\Exception $e) {
            return -1;
        }
    }

    /**
     * Set a value with TTL
     */
    public static function set(string $key, $value, int $ttl = 3600): bool {
        $redis = self::getRedis();
        if (!$redis) return false;

        try {
            return $redis->set($key, json_encode($value), $ttl);
        } catch (\Exception $e) {
            return false;
        }
    }

    /**
     * Get a value
     */
    public static function get(string $key) {
        $redis = self::getRedis();
        if (!$redis) return null;

        try {
            $value = $redis->get($key);
            return $value ? json_decode($value, true) : null;
        } catch (\Exception $e) {
            return null;
        }
    }

    /**
     * Delete a key
     */
    public static function delete(string $key): bool {
        $redis = self::getRedis();
        if (!$redis) return false;

        try {
            return (bool)$redis->del($key);
        } catch (\Exception $e) {
            return false;
        }
    }
}
