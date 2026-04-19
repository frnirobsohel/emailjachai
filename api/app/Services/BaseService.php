<?php
namespace App\Services;

use Core\Container;
use Core\DB;

abstract class BaseService {
    /**
     * Get instance of this service via Container
     */
    public static function getInstance() {
        return Container::singleton(static::class);
    }

    /**
     * Helper for transactional database operations
     */
    protected function transaction(callable $callback) {
        return DB::transaction($callback);
    }
}
