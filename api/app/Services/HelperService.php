<?php
namespace App\Services;

use Core\DB;
use Core\Request;

class HelperService {
    
    /**
     * Log an activity event
     */
    public static function logActivity($level, $source, $message, $userId = null, $ip = null, $identifier = null) {
        try {
            if (!$ip && class_exists('Core\Request')) {
                $ip = Request::ip();
            }
            if (!$ip) $ip = '0.0.0.0';
            
            $stmt = DB::prepare("INSERT INTO activity_logs (user_id, level, source, message, ip, identifier) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->execute([$userId, $level, $source, $message, $ip, $identifier]);
        } catch (\Throwable $e) {
            error_log("Failed to log activity: " . $e->getMessage());
        }
    }

    /**
     * Trim standard and Unicode/multi-byte whitespace characters.
     */
    public static function robustTrim(?string $string): string {
        if ($string === null) return '';
        // Handles standard spaces, NBSP, and other Unicode whitespace
        return (string)preg_replace('/^\s+|\s+$/u', '', $string);
    }

    private static $roleAccounts = [
        'admin' => true,
        'webmaster' => true,
        'support' => true,
        'sales' => true,
        'info' => true,
        'contact' => true,
        'postmaster' => true,
        'hostmaster' => true,
        'help' => true,
        'billing' => true,
        'jobs' => true,
        'hr' => true
    ];
    private static $domainPolicyCache = null;
    private static $domainPolicyLoadedAt = 0;
    private const DOMAIN_POLICY_TTL_SECONDS = 300;

    /**
     * Canonicalize verifier statuses across API + worker flows.
     */
    public static function normalizeVerificationStatus($status): string {
        $normalized = strtolower(trim((string)$status));
        switch ($normalized) {
            case 'valid':
            case 'deliverable':
                return 'valid';
            case 'catch_all':
            case 'catch-all':
            case 'catchall':
                return 'catch_all';
            case 'unknown':
            case 'risky':
            case 'temp':
            case 'temporary':
            case 'mailbox_full':
            case 'mailbox-full':
                return 'unknown';
            case 'disposable':
                return 'disposable';
            case 'invalid':
            case 'undeliverable':
            case 'blacklist':
            case 'spam-trap':
            case 'spamtrap':
                return 'invalid';
            default:
                // Unknown/unmapped provider statuses should not be hard-classified as invalid.
                return 'unknown';
        }
    }

    public static function scoreForStatus($status): int {
        $normalized = self::normalizeVerificationStatus($status);
        switch ($normalized) {
            case 'valid':
                return 100;
            case 'catch_all':
                return 55;
            case 'unknown':
                return 35;
            case 'disposable':
                return 10;
            default:
                return 0;
        }
    }

    /**
     * Perform initial validations on email
     */
    public static function validateEmailBasics($email) {
        $result = [
            'syntax' => false,
            'is_role' => false,
            'is_disposable' => false,
            'is_free' => false,
            'is_spam_trap' => false,
            'is_blacklist' => false,
            'domain' => ''
        ];

        $email = self::robustTrim((string)$email);
        if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $result['syntax'] = true;
            $parts = explode('@', $email);
            $user = strtolower($parts[0]);
            $domain = strtolower($parts[1]);
            $result['domain'] = $domain;

            if (isset(self::$roleAccounts[$user])) $result['is_role'] = true;

            $policyType = self::resolveDomainPolicyType($domain);
            if ($policyType === 'free') {
                $result['is_free'] = true;
            } elseif ($policyType === 'disposable') {
                $result['is_disposable'] = true;
            } elseif ($policyType === 'spam-trap') {
                $result['is_spam_trap'] = true;
            } elseif ($policyType === 'blacklist') {
                $result['is_blacklist'] = true;
            }
        }

        return $result;
    }

    /**
     * Detailed Real Email Verification
     */
    public static function verifySingleReal($email) {
        $startTime = microtime(true);
        $syntax = self::validateEmailBasics($email);
        
        $detailedChecks = [
            'safeToSend' => false,
            'deliverable' => false,
            'invalidSyntax' => !$syntax['syntax'],
            'disposableEmail' => $syntax['is_disposable'],
            'mxRecords' => false,
            'smtpConnect' => false,
            'userExist' => false,
            'unknown' => false,
            'mailboxFull' => false,
            'catchAll' => false,
            'roleAccount' => $syntax['is_role'],
            'freeAccount' => $syntax['is_free'],
            'spamTrap' => $syntax['is_spam_trap'],
            'blacklist' => $syntax['is_blacklist']
        ];

        if (!$syntax['syntax']) {
            return self::formatResult($email, 'invalid', self::scoreForStatus('invalid'), $startTime, $detailedChecks);
        }

        if ($syntax['is_blacklist'] || $syntax['is_spam_trap']) {
            return self::formatResult($email, 'invalid', self::scoreForStatus('invalid'), $startTime, $detailedChecks);
        }

        if ($syntax['is_disposable']) {
            return self::formatResult($email, 'disposable', self::scoreForStatus('disposable'), $startTime, $detailedChecks);
        }

        $domain = $syntax['domain'];

        $mxHosts = [];
        $mxWeights = [];
        if (checkdnsrr($domain, "MX")) {
            getmxrr($domain, $mxHosts, $mxWeights);
        }

        $mxCandidates = self::prepareMxHosts($mxHosts, $mxWeights);
        if (empty($mxCandidates)) {
            // RFC-compatible fallback: if MX is absent, delivery may still target A/AAAA.
            if (checkdnsrr($domain, "A") || checkdnsrr($domain, "AAAA")) {
                $mxCandidates = [$domain];
            } else {
                return self::formatResult($email, 'invalid', self::scoreForStatus('invalid'), $startTime, $detailedChecks);
            }
        }

        $detailedChecks['mxRecords'] = true;
        $hostname = self::buildVerifierHostname();

        foreach ($mxCandidates as $mxHost) {
            $probe = self::probeSmtpMailbox($mxHost, $hostname, $email, $domain);

            if ($probe['connected']) {
                $detailedChecks['smtpConnect'] = true;
            }

            if (!$probe['reachable']) {
                continue;
            }

            if ($probe['mailbox_full']) {
                $detailedChecks['mailboxFull'] = true;
            }

            if ($probe['accepted']) {
                $detailedChecks['userExist'] = true;
                $detailedChecks['catchAll'] = $probe['catch_all'];

                if ($probe['catch_all']) {
                    return self::formatResult($email, 'catch_all', self::scoreForStatus('catch_all'), $startTime, $detailedChecks);
                }

                $detailedChecks['safeToSend'] = true;
                $detailedChecks['deliverable'] = true;
                return self::formatResult($email, 'valid', self::scoreForStatus('valid'), $startTime, $detailedChecks);
            }

            if ($probe['hard_fail']) {
                return self::formatResult($email, 'invalid', self::scoreForStatus('invalid'), $startTime, $detailedChecks);
            }

            if ($probe['temp_fail']) {
                $detailedChecks['unknown'] = true;
                return self::formatResult($email, 'unknown', self::scoreForStatus('unknown'), $startTime, $detailedChecks);
            }
        }

        $detailedChecks['unknown'] = true;
        return self::formatResult($email, 'unknown', self::scoreForStatus('unknown'), $startTime, $detailedChecks);
    }

    private static function formatResult($email, $status, $score, $startTime, $detailedChecks) {
        $processingTime = number_format(microtime(true) - $startTime, 2);
        return [
            'email' => $email,
            'status' => self::normalizeVerificationStatus($status),
            'score' => $score,
            'processingTime' => $processingTime,
            'detailedChecks' => $detailedChecks
        ];
    }

    private static function resolveDomainPolicyType(string $domain): ?string {
        $domain = strtolower(trim($domain));
        if ($domain === '') {
            return null;
        }

        $policyMap = self::getDomainPolicyMap();
        if (empty($policyMap)) {
            return null;
        }

        $parts = explode('.', $domain);
        if (count($parts) < 2) {
            return null;
        }

        for ($i = 0; $i <= count($parts) - 2; $i++) {
            $candidate = implode('.', array_slice($parts, $i));
            if (isset($policyMap[$candidate])) {
                return $policyMap[$candidate];
            }
        }

        return null;
    }

    private static function getDomainPolicyMap(): array {
        $now = time();
        if (
            is_array(self::$domainPolicyCache)
            && ($now - self::$domainPolicyLoadedAt) < self::DOMAIN_POLICY_TTL_SECONDS
        ) {
            return self::$domainPolicyCache;
        }

        $map = [];
        try {
            $stmt = DB::prepare("SELECT domain, type FROM domains WHERE excluded = 0");
            $stmt->execute();
            foreach ($stmt->fetchAll(\PDO::FETCH_ASSOC) as $row) {
                $domain = strtolower(trim((string)($row['domain'] ?? '')));
                $type = strtolower(trim((string)($row['type'] ?? '')));
                if ($domain === '' || $type === '') {
                    continue;
                }
                $map[$domain] = $type;
            }
        } catch (\Throwable $e) {
            $map = [];
        }

        self::$domainPolicyCache = $map;
        self::$domainPolicyLoadedAt = $now;
        return $map;
    }

    private static function prepareMxHosts(array $mxHosts, array $mxWeights): array {
        $mxRecords = [];
        foreach ($mxHosts as $idx => $host) {
            $host = strtolower(trim((string)$host));
            if ($host === '') {
                continue;
            }
            $mxRecords[] = [
                'host' => $host,
                'weight' => (int)($mxWeights[$idx] ?? 0),
            ];
        }

        usort($mxRecords, function (array $a, array $b): int {
            if ($a['weight'] === $b['weight']) {
                return strcmp($a['host'], $b['host']);
            }
            return $a['weight'] <=> $b['weight'];
        });

        $ordered = [];
        foreach ($mxRecords as $record) {
            if (!in_array($record['host'], $ordered, true)) {
                $ordered[] = $record['host'];
            }
            if (count($ordered) >= 5) {
                break;
            }
        }

        return $ordered;
    }

    private static function buildVerifierHostname(): string {
        $hostname = strtolower(trim((string)gethostname()));
        if ($hostname === '') {
            return 'verifier.local';
        }

        if (strpos($hostname, '.') === false) {
            return $hostname . '.local';
        }

        return $hostname;
    }

    private static function probeSmtpMailbox(string $mxHost, string $hostname, string $email, string $domain): array {
        $result = [
            'connected' => false,
            'reachable' => false,
            'accepted' => false,
            'catch_all' => false,
            'hard_fail' => false,
            'temp_fail' => false,
            'mailbox_full' => false,
        ];

        $errno = 0;
        $errstr = '';
        $connection = fsockopen($mxHost, 25, $errno, $errstr, 8);
        if (!$connection) {
            return $result;
        }

        $result['connected'] = true;
        stream_set_timeout($connection, 8);

        $bannerCode = self::extractSmtpCode(self::readSmtpResponse($connection));
        if ($bannerCode !== 220) {
            fclose($connection);
            if (in_array($bannerCode, [421], true)) {
                $result['reachable'] = true;
                $result['temp_fail'] = true;
            }
            return $result;
        }

        $result['reachable'] = true;

        $ehloCode = self::extractSmtpCode(self::smtpCommand($connection, 'EHLO ' . $hostname));
        if ($ehloCode < 200 || $ehloCode >= 400) {
            self::smtpCommand($connection, 'HELO ' . $hostname);
        }

        $mailFromCode = self::extractSmtpCode(self::smtpCommand($connection, 'MAIL FROM:<verify@' . $hostname . '>'));
        if (in_array($mailFromCode, [421, 450, 451, 452, 454, 455], true)) {
            $result['temp_fail'] = true;
            self::smtpCommand($connection, 'QUIT');
            fclose($connection);
            return $result;
        }

        $rcptCode = self::extractSmtpCode(self::smtpCommand($connection, 'RCPT TO:<' . $email . '>'));
        if (in_array($rcptCode, [250, 251], true)) {
            $result['accepted'] = true;
            $randomEmail = 'probe_' . bin2hex(random_bytes(4)) . '@' . $domain;
            $rcptRandomCode = self::extractSmtpCode(self::smtpCommand($connection, 'RCPT TO:<' . $randomEmail . '>'));
            $result['catch_all'] = in_array($rcptRandomCode, [250, 251], true);
        } elseif (in_array($rcptCode, [550, 551, 553], true)) {
            $result['hard_fail'] = true;
        } elseif ($rcptCode === 552) {
            $result['mailbox_full'] = true;
            $result['temp_fail'] = true;
        } elseif (in_array($rcptCode, [421, 450, 451, 452, 454, 455], true)) {
            $result['temp_fail'] = true;
        } else {
            $result['temp_fail'] = true;
        }

        self::smtpCommand($connection, 'QUIT');
        fclose($connection);

        return $result;
    }

    private static function smtpCommand($connection, string $command): string {
        fwrite($connection, $command . "\r\n");
        return self::readSmtpResponse($connection);
    }

    private static function readSmtpResponse($connection): string {
        $response = '';
        $lineCount = 0;
        while (!feof($connection) && $lineCount < 20) {
            $line = fgets($connection, 1024);
            if ($line === false) {
                break;
            }
            $response .= $line;
            $lineCount++;
            if (strlen($line) >= 4 && $line[3] === ' ') {
                break;
            }
        }
        return $response;
    }

    private static function extractSmtpCode(string $response): int {
        if (preg_match('/^\s*(\d{3})/m', $response, $m)) {
            return (int)$m[1];
        }
        return 0;
    }

    /**
     * Detailed Verification Simulation
     */
    public static function simulateVerificationLong($email) {
        $syntax = self::validateEmailBasics($email);
        
        $status = 'valid';
        if (!$syntax['syntax']) $status = 'invalid';
        elseif ($syntax['is_role']) $status = 'unknown';
        elseif ($syntax['is_disposable']) $status = 'disposable';
        
        $rand = rand(0, 100);
        if ($status === 'valid') {
            if ($rand > 95) $status = 'invalid';
            elseif ($rand > 85) $status = 'unknown';
        }

        return [
            'email' => $email,
            'status' => $status,
            'score' => self::scoreForStatus($status),
            'processingTime' => number_format(rand(10, 80) / 100, 2),
            'detailedChecks' => [
                'safeToSend' => $status === 'valid',
                'deliverable' => $status === 'valid',
                'invalidSyntax' => !$syntax['syntax'],
                'disposableEmail' => $syntax['is_disposable'],
                'mxRecords' => $syntax['syntax'],
                'smtpConnect' => $syntax['syntax'] && $status !== 'invalid',
                'userExist' => $status === 'valid',
                'unknown' => $status === 'unknown',
                'mailboxFull' => false,
                'catchAll' => $status === 'catch_all',
                'roleAccount' => $syntax['is_role'],
                'freeAccount' => $syntax['is_free'],
                'spamTrap' => $syntax['is_spam_trap'],
                'blacklist' => $syntax['is_blacklist']
            ]
        ];
    }
}
