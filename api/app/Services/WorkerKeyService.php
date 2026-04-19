<?php
namespace App\Services;

use Core\DB;

class WorkerKeyService {
    private const SETTING_ENCRYPTED = 'worker_api_key_encrypted';
    private const SETTING_HASH = 'worker_api_key_hash';
    private const CIPHER = 'AES-256-CTR';

    public static function ensureProvisioned(): array {
        $existing = self::getPlaintextKey();
        if ($existing !== null && $existing !== '') {
            return [
                'worker_key' => $existing,
                'masked_key' => self::maskKey($existing),
            ];
        }

        return self::rotate();
    }

    public static function rotate(): array {
        $workerKey = self::generateKey();
        self::storeKey($workerKey);

        return [
            'worker_key' => $workerKey,
            'masked_key' => self::maskKey($workerKey),
        ];
    }

    public static function verifyKey(?string $candidate): bool {
        $candidate = trim((string)$candidate);
        if ($candidate === '') {
            return false;
        }

        $settings = self::loadSettings();
        $storedHash = trim((string)($settings[self::SETTING_HASH] ?? ''));
        if ($storedHash !== '') {
            return hash_equals($storedHash, self::hashKey($candidate));
        }

        $storedPlaintext = self::getPlaintextKey();
        return $storedPlaintext !== null && hash_equals($storedPlaintext, $candidate);
    }

    public static function getMaskedKey(): ?string {
        $plain = self::getPlaintextKey();
        if ($plain === null || $plain === '') {
            return null;
        }

        return self::maskKey($plain);
    }

    public static function getPlaintextKey(): ?string {
        $settings = self::loadSettings();
        $encrypted = trim((string)($settings[self::SETTING_ENCRYPTED] ?? ''));
        if ($encrypted === '') {
            return null;
        }

        return self::decryptSecret($encrypted);
    }

    private static function storeKey(string $workerKey): void {
        $pdo = DB::getInstance();
        $stmt = $pdo->prepare("
            INSERT INTO settings (setting_key, setting_value)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        ");

        $stmt->execute([self::SETTING_ENCRYPTED, self::encryptSecret($workerKey)]);
        $stmt->execute([self::SETTING_HASH, self::hashKey($workerKey)]);
    }

    private static function loadSettings(): array {
        $stmt = DB::prepare("
            SELECT setting_key, setting_value
            FROM settings
            WHERE setting_key IN (?, ?)
        ");
        $stmt->execute([self::SETTING_ENCRYPTED, self::SETTING_HASH]);

        $settings = [];
        foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
            $settings[(string)$row['setting_key']] = (string)($row['setting_value'] ?? '');
        }

        return $settings;
    }

    private static function generateKey(): string {
        return 'wrk_live_' . bin2hex(random_bytes(24));
    }

    private static function hashKey(string $workerKey): string {
        return hash('sha256', 'worker-key|' . $workerKey);
    }

    private static function maskKey(string $workerKey): string {
        if (strlen($workerKey) <= 12) {
            return str_repeat('*', strlen($workerKey));
        }

        return substr($workerKey, 0, 8) . '...' . substr($workerKey, -4);
    }

    private static function encryptSecret(string $plainText): string {
        $rawSecret = self::getAppSecret();
        $key = hash('sha256', $rawSecret, true);
        $ivLength = openssl_cipher_iv_length(self::CIPHER);
        $iv = random_bytes($ivLength);
        $cipherText = openssl_encrypt($plainText, self::CIPHER, $key, OPENSSL_RAW_DATA, $iv);

        if ($cipherText === false) {
            throw new \RuntimeException('Failed to encrypt worker key.');
        }

        return base64_encode($cipherText) . ':' . bin2hex($iv);
    }

    private static function decryptSecret(string $stored): ?string {
        if (strpos($stored, ':') === false) {
            return null;
        }

        [$encodedCipherText, $ivHex] = explode(':', $stored, 2);
        $cipherText = base64_decode($encodedCipherText, true);
        $iv = hex2bin($ivHex);

        if ($cipherText === false || $iv === false) {
            return null;
        }

        $rawSecret = self::getAppSecret();
        $key = hash('sha256', $rawSecret, true);
        $plainText = openssl_decrypt($cipherText, self::CIPHER, $key, OPENSSL_RAW_DATA, $iv);

        return ($plainText === false || $plainText === '') ? null : $plainText;
    }

    private static function getAppSecret(): string {
        $secret = trim((string)getenv('JWT_SECRET'));
        if ($secret === '') {
            throw new \RuntimeException('JWT_SECRET is required for worker key management.');
        }

        return $secret;
    }
}
