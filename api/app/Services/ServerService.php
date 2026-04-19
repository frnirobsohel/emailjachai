<?php
namespace App\Services;

use Core\DB;

class ServerService {

    private const RESERVED_WORKER_NAMES = [
        'unknown', 'unknown_worker', 'worker', 'worker-node', 'localhost', 'default', 'server'
    ];

    private const REQUIRED_WORKER_SERVER_COLUMNS = [
        'server_name', 'ip_address', 'port', 'status', 'enabled', 'ip_reputation',
        'rate_limit', 'daily_limit', 'worker_count', 'emails_verified', 'last_ping'
    ];

    public static function getServerList(): array {
        $processingSummary = self::getProcessingTaskSummaryByServer();
        $servers = DB::query("SELECT id, server_name, ip_address, port, status, enabled, ip_reputation, rate_limit, daily_limit, worker_count, emails_verified, last_ping FROM worker_servers ORDER BY id DESC")->fetchAll(\PDO::FETCH_ASSOC);
        
        foreach ($servers as &$server) {
            $server['name'] = $server['server_name'] ?? 'Worker Node';
            $server['address'] = $server['ip_address'] ?? '0.0.0.0';
            $port = (int)($server['port'] ?? 80);
            $server['port'] = (string)($port > 0 && $port <= 65535 ? $port : 80);

            $lastPingStr = $server['last_ping'] ?? '';
            $lastPing = $lastPingStr ? strtotime($lastPingStr . ' UTC') : 0;
            
            if ($lastPing && (time() - $lastPing < 130)) {
                $server['ping'] = (rand(20, 50)) . 'ms';
                $server['runningTime'] = 'Online';
                $server['status'] = 'active';
            } else {
                $server['status'] = 'offline';
                $server['ping'] = '--';
                $server['runningTime'] = 'Last seen: ' . ($server['last_ping'] ?? 'Never');
            }

            $server['ipReputation'] = $server['status'] === 'offline' ? 'None' : ($server['ip_reputation'] ?? 'Good');
            $server['workerCount'] = $server['status'] === 'offline' ? 0 : (int)($server['worker_count'] ?? 0);
            $server['emailsVerified'] = (int)($server['emails_verified'] ?? 0);
            
            $isEnabled = ($server['enabled'] ?? 1) == 1;
            $server['config'] = [
                'dailyLimit' => (int)($server['daily_limit'] ?? 50000),
                'rateLimit' => (int)($server['rate_limit'] ?? 100),
                'chunkSize' => 50,
                'enabled' => $isEnabled
            ];
            
            if (!$isEnabled) $server['status'] = 'disabled';

            $serverKey = trim((string)($server['server_name'] ?? ''));
            $activity = ($serverKey !== '' && isset($processingSummary[$serverKey])) ? $processingSummary[$serverKey] : null;

            if ($activity && $server['status'] === 'active') {
                $taskLabel = ((int)$activity['task_count'] === 1) ? 'task' : 'tasks';
                $server['currentJob'] = sprintf('Job %s (%d %s)', (string)$activity['job_id'], (int)$activity['task_count'], $taskLabel);
            } else {
                $server['currentJob'] = 'Waiting for jobs...';
            }
        }
        return $servers;
    }

    public static function registerServer(string $name, string $ip, int $port, string $status = 'offline'): void {
        if (!self::isValidWorkerServerName($name)) throw new \Exception('Invalid server name', 400);
        
        $existsStmt = DB::prepare("SELECT id FROM worker_servers WHERE server_name = ? LIMIT 1");
        $existsStmt->execute([$name]);
        if ($existsStmt->fetchColumn()) throw new \Exception('server_name must be unique', 409);

        $stmt = DB::prepare("INSERT INTO worker_servers (server_name, ip_address, port, status) VALUES (?, ?, ?, ?)");
        $stmt->execute([$name, $ip, $port, $status]);
    }

    public static function updateServer(int $id, array $data): void {
        $existing = DB::prepare("SELECT * FROM worker_servers WHERE id = ?");
        $existing->execute([$id]);
        $server = $existing->fetch(\PDO::FETCH_ASSOC);
        if (!$server) throw new \Exception('Server not found', 404);

        $name = trim((string)($data['server_name'] ?? $server['server_name']));
        $ip = trim((string)($data['ip_address'] ?? $server['ip_address']));
        $port = (int)($data['port'] ?? $server['port']);
        $status = trim((string)($data['status'] ?? $server['status']));
        $rateLimit = (int)($data['rate_limit'] ?? $server['rate_limit']);
        $dailyLimit = (int)($data['daily_limit'] ?? $server['daily_limit']);
        $ipReputation = $data['ip_reputation'] ?? $server['ip_reputation'] ?? 'Good';

        if (!self::isValidWorkerServerName($name)) throw new \Exception('Invalid server name', 400);

        $dupeStmt = DB::prepare("SELECT id FROM worker_servers WHERE server_name = ? AND id != ? LIMIT 1");
        $dupeStmt->execute([$name, $id]);
        if ($dupeStmt->fetchColumn()) throw new \Exception('server_name must be unique', 409);

        $stmt = DB::prepare("UPDATE worker_servers SET server_name = ?, ip_address = ?, port = ?, status = ?, rate_limit = ?, daily_limit = ?, ip_reputation = ? WHERE id = ?");
        $stmt->execute([$name, $ip, $port, $status, $rateLimit, $dailyLimit, $ipReputation, $id]);
    }

    public static function heartbeat(string $name, string $ip, ?int $port, int $workerCount): void {
        $stmt = DB::prepare("SELECT id, enabled, worker_count FROM worker_servers WHERE server_name = ? LIMIT 1");
        $stmt->execute([$name]);
        $server = $stmt->fetch(\PDO::FETCH_ASSOC);

        if (!$server) {
            if (defined('ENVIRONMENT') && ENVIRONMENT === 'production') throw new \Exception('Unknown worker server', 403);
            $port = $port ?? 80;
            $stmt = DB::prepare("INSERT INTO worker_servers (server_name, ip_address, port, status, last_ping) VALUES (?, ?, ?, 'online', UTC_TIMESTAMP())");
            $stmt->execute([$name, $ip, $port]);
            return;
        }

        if ((int)$server['enabled'] !== 1) throw new \Exception('Worker server is disabled', 403);

        $stmt = DB::prepare("UPDATE worker_servers SET ip_address = ?, port = COALESCE(?, port), last_ping = UTC_TIMESTAMP(), status = 'online', worker_count = ? WHERE id = ?");
        $stmt->execute([$ip, $port, $workerCount, $server['id']]);
    }

    public static function isValidWorkerServerName(string $name): bool {
        $name = trim($name);
        if (strlen($name) < 3 || strlen($name) > 100) return false;
        if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/', $name)) return false;
        return !in_array(strtolower($name), self::RESERVED_WORKER_NAMES, true);
    }

    public static function getProcessingTaskSummaryByServer(): array {
        $stmt = DB::query("
            SELECT worker_server, job_id, COUNT(*) AS task_count
            FROM job_tasks
            WHERE status = 'processing'
              AND worker_server IS NOT NULL
              AND worker_server != ''
            GROUP BY worker_server, job_id
            ORDER BY MAX(updated_at) DESC
        ");
        $summary = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $name = trim((string)$row['worker_server']);
            if ($name !== '' && !isset($summary[$name])) {
                $summary[$name] = ['job_id' => $row['job_id'], 'task_count' => (int)$row['task_count']];
            }
        }
        return $summary;
    }

    public static function ensureWorkerServerSchema(): bool {
        try {
            if (self::isWorkerServerSchemaValid()) return true;
            self::attemptWorkerServerSchemaMigration();
            return self::isWorkerServerSchemaValid();
        } catch (\Throwable $e) {
            error_log('Worker server schema failed: ' . $e->getMessage());
            return false;
        }
    }

    private static function isWorkerServerSchemaValid(): bool {
        $stmt = DB::prepare("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'worker_servers'");
        $stmt->execute();
        if ((int)$stmt->fetchColumn() === 0) return false;

        $cols = DB::query("SHOW COLUMNS FROM worker_servers")->fetchAll(\PDO::FETCH_COLUMN);
        foreach (self::REQUIRED_WORKER_SERVER_COLUMNS as $column) {
            if (!in_array($column, $cols, true)) return false;
        }

        $stmt = DB::prepare("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'worker_servers' AND index_name = 'uq_worker_servers_name'");
        $stmt->execute();
        return (int)$stmt->fetchColumn() > 0;
    }

    private static function attemptWorkerServerSchemaMigration(): void {
        DB::exec("
            CREATE TABLE IF NOT EXISTS worker_servers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                server_name VARCHAR(100) NOT NULL,
                ip_address VARCHAR(45) NOT NULL,
                port SMALLINT UNSIGNED NOT NULL DEFAULT 80,
                status ENUM('online', 'offline', 'maintenance') DEFAULT 'offline',
                enabled TINYINT(1) NOT NULL DEFAULT 1,
                last_ping TIMESTAMP NULL,
                ip_reputation VARCHAR(20) DEFAULT 'Good',
                rate_limit INT DEFAULT 100,
                daily_limit INT DEFAULT 50000,
                worker_count INT DEFAULT 0,
                emails_verified INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ");
        
        $cols = DB::query("SHOW COLUMNS FROM worker_servers")->fetchAll(\PDO::FETCH_COLUMN);
        $toAdd = [
            'port' => "ADD COLUMN port SMALLINT UNSIGNED NOT NULL DEFAULT 80 AFTER ip_address",
            'enabled' => "ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1",
            'ip_reputation' => "ADD COLUMN ip_reputation VARCHAR(20) DEFAULT 'Good'",
            'rate_limit' => "ADD COLUMN rate_limit INT DEFAULT 100",
            'daily_limit' => "ADD COLUMN daily_limit INT DEFAULT 50000",
            'worker_count' => "ADD COLUMN worker_count INT DEFAULT 0",
            'emails_verified' => "ADD COLUMN emails_verified INT DEFAULT 0",
            'last_ping' => "ADD COLUMN last_ping TIMESTAMP NULL"
        ];
        foreach ($toAdd as $col => $ddl) {
            if (!in_array($col, $cols, true)) DB::exec("ALTER TABLE worker_servers $ddl");
        }

        self::resolveDuplicateWorkerServerNames();

        $stmt = DB::prepare("SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'worker_servers' AND index_name = 'uq_worker_servers_name'");
        $stmt->execute();
        if ((int)$stmt->fetchColumn() === 0) DB::exec("CREATE UNIQUE INDEX uq_worker_servers_name ON worker_servers(server_name)");
    }

    private static function resolveDuplicateWorkerServerNames(): void {
        $dupStmt = DB::query("SELECT server_name FROM worker_servers GROUP BY server_name HAVING COUNT(*) > 1");
        foreach ($dupStmt->fetchAll(\PDO::FETCH_COLUMN) as $name) {
            $rowsStmt = DB::prepare("SELECT id FROM worker_servers WHERE server_name = ? ORDER BY id ASC");
            $rowsStmt->execute([$name]);
            $rows = $rowsStmt->fetchAll(\PDO::FETCH_ASSOC);
            for ($i = 1; $i < count($rows); $i++) {
                $id = $rows[$i]['id'];
                $new = $name . '-' . $id;
                DB::prepare("UPDATE worker_servers SET server_name = ? WHERE id = ?")->execute([$new, $id]);
            }
        }
    }
}
