<?php
namespace Core;

use Core\DB;
use Exception;

class Migration {
    public static function run() {
        self::ensureMigrationTable();
        
        $files = glob(BASE_PATH . '/migrations/*.sql');
        sort($files);

        foreach ($files as $file) {
            $name = basename($file);
            if (!self::isMigrated($name)) {
                self::execute($file, $name);
                echo "Migrated: $name\n";
            }
        }
    }

    private static function ensureMigrationTable() {
        DB::exec("
            CREATE TABLE IF NOT EXISTS migrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                migration VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        ");
    }

    private static function isMigrated($name) {
        $stmt = DB::prepare("SELECT id FROM migrations WHERE migration = ?");
        $stmt->execute([$name]);
        return (bool)$stmt->fetch();
    }

    private static function execute($file, $name) {
        $sql = file_get_contents($file);
        if ($sql === false) throw new Exception("Could not read migration file: $name");

        DB::transaction(function($pdo) use ($sql, $name) {
            // Split SQL by semicolon, but be careful with procedures/triggers if they exist
            // For now, simple semicolon split is enough for standard migrations
            $queries = array_filter(array_map('trim', explode(';', $sql)));
            foreach ($queries as $query) {
                if ($query !== '') {
                    $pdo->exec($query);
                }
            }
            
            $stmt = $pdo->prepare("INSERT INTO migrations (migration) VALUES (?)");
            $stmt->execute([$name]);
        });
    }
}
