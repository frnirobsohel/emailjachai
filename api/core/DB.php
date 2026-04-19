<?php
namespace Core;
use PDO;
use PDOException;

/**
 * Database abstraction layer providing a static interface to PDO.
 * 
 * @method static \PDOStatement prepare(string $query, array $options = [])
 * @method static \PDOStatement query(string $query, ...$fetchModeArgs)
 * @method static int exec(string $statement)
 * @method static bool beginTransaction()
 * @method static bool commit()
 * @method static bool rollBack()
 * @method static string lastInsertId(?string $name = null)
 * @method static bool inTransaction()
 */
class DB {
    private static $instance = null;
    private $pdo;

    private function __construct() {
        $host = defined('DB_HOST') ? DB_HOST : (getenv('DB_HOST') ?: 'localhost');
        $user = defined('DB_USER') ? DB_USER : (getenv('DB_USER') ?: 'root');
        $pass = defined('DB_PASS') ? DB_PASS : (getenv('DB_PASS') ?: '');
        $name = defined('DB_NAME') ? DB_NAME : (getenv('DB_NAME') ?: 'ejp');

        try {
            $isProduction = defined('ENVIRONMENT') && ENVIRONMENT === 'production';
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_PERSISTENT => $isProduction,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4, time_zone = '+00:00'"
            ];
            $this->pdo = new PDO("mysql:host={$host};dbname={$name};charset=utf8mb4", $user, $pass, $options);
        } catch (PDOException $e) {
            \App\Services\Logger::error("Database Connection Failed", [
                'error' => $e->getMessage(),
                'host' => $host,
                'db' => $name
            ]);
            Response::error('Service temporarily unavailable (DB Error)', [], 500, 'ERR_DB_CONNECTION');
        }
    }

    public static function getInstance(): PDO {
        if (self::$instance == null) {
            self::$instance = new DB();
        }
        return self::$instance->pdo;
    }

    /**
     * Helper to wrap logic in a transaction
     */
    public static function transaction(callable $callback) {
        $pdo = self::getInstance();
        $pdo->beginTransaction();
        try {
            $result = $callback($pdo);
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function prepare(string $query, array $options = []): \PDOStatement {
        return self::getInstance()->prepare($query, $options);
    }

    public static function query(string $query, ...$fetchModeArgs): \PDOStatement {
        return self::getInstance()->query($query, ...$fetchModeArgs);
    }

    public static function exec(string $statement): int {
        return self::getInstance()->exec($statement);
    }

    public static function beginTransaction(): bool {
        return self::getInstance()->beginTransaction();
    }

    public static function commit(): bool {
        return self::getInstance()->commit();
    }

    public static function rollBack(): bool {
        return self::getInstance()->rollBack();
    }

    public static function lastInsertId(?string $name = null): string {
        return self::getInstance()->lastInsertId($name);
    }

    public static function inTransaction(): bool {
        return self::getInstance()->inTransaction();
    }

    // Magic method fallback for any other PDO methods
    public static function __callStatic($method, $args) {
        return call_user_func_array([self::getInstance(), $method], $args);
    }
}
