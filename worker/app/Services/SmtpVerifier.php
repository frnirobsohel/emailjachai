<?php
namespace App\Services;

class SmtpVerifier {
    private $logger;
    private $domainCache;

    public function __construct(\App\Core\Logger $logger, DomainCache $domainCache) {
        $this->logger = $logger;
        $this->domainCache = $domainCache;
    }

    public function verifyEmailReal(string $email): array {
        try {
            $startTime = microtime(true);
            $syntax = $this->validateEmailBasics($email);

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
                'blacklist' => $syntax['is_blacklist'],
            ];

            if (!$syntax['syntax']) {
                return $this->formatVerificationResult($email, 'invalid', $this->scoreForStatus('invalid'), $startTime, $detailedChecks);
            }

            if ($syntax['is_blacklist'] || $syntax['is_spam_trap']) {
                return $this->formatVerificationResult($email, 'invalid', $this->scoreForStatus('invalid'), $startTime, $detailedChecks);
            }

            if ($syntax['is_disposable']) {
                return $this->formatVerificationResult($email, 'disposable', $this->scoreForStatus('disposable'), $startTime, $detailedChecks);
            }

            $domain = (string)$syntax['domain'];
            $mxHosts = [];
            $mxWeights = [];
            if (checkdnsrr($domain, 'MX')) {
                getmxrr($domain, $mxHosts, $mxWeights);
            }

            $mxCandidates = $this->prepareMxHosts($mxHosts, $mxWeights);
            if (empty($mxCandidates)) {
                if (checkdnsrr($domain, 'A') || checkdnsrr($domain, 'AAAA')) {
                    $mxCandidates = [$domain];
                } else {
                    return $this->formatVerificationResult($email, 'invalid', $this->scoreForStatus('invalid'), $startTime, $detailedChecks);
                }
            }

            $detailedChecks['mxRecords'] = true;
            $hostname = $this->buildVerifierHostname();

            foreach ($mxCandidates as $mxHost) {
                $probe = $this->probeSmtpMailbox($mxHost, $hostname, $email, $domain);

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
                    $detailedChecks['catchAll'] = (bool)$probe['catch_all'];

                    if ($probe['catch_all']) {
                        return $this->formatVerificationResult($email, 'catch_all', $this->scoreForStatus('catch_all'), $startTime, $detailedChecks);
                    }

                    $detailedChecks['safeToSend'] = true;
                    $detailedChecks['deliverable'] = true;
                    return $this->formatVerificationResult($email, 'valid', $this->scoreForStatus('valid'), $startTime, $detailedChecks);
                }

                if ($probe['hard_fail']) {
                    return $this->formatVerificationResult($email, 'invalid', $this->scoreForStatus('invalid'), $startTime, $detailedChecks);
                }

                if ($probe['temp_fail']) {
                    $detailedChecks['unknown'] = true;
                    return $this->formatVerificationResult($email, 'unknown', $this->scoreForStatus('unknown'), $startTime, $detailedChecks);
                }
            }

            $detailedChecks['unknown'] = true;
            return $this->formatVerificationResult($email, 'unknown', $this->scoreForStatus('unknown'), $startTime, $detailedChecks);
        } catch (\Throwable $e) {
            return [
                'email' => $email,
                'status' => 'unknown',
                'score' => $this->scoreForStatus('unknown'),
                'processingTime' => '0.00',
                'detailedChecks' => [
                    'safeToSend' => false,
                    'deliverable' => false,
                    'invalidSyntax' => false,
                    'disposableEmail' => false,
                    'mxRecords' => false,
                    'smtpConnect' => false,
                    'userExist' => false,
                    'unknown' => true,
                    'mailboxFull' => false,
                    'catchAll' => false,
                    'roleAccount' => false,
                    'freeAccount' => false,
                    'spamTrap' => false,
                    'blacklist' => false,
                ],
            ];
        }
    }

    public function normalizeVerificationStatus(string $status): string {
        $normalized = strtolower(trim($status));
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
                return 'unknown';
        }
    }

    public function scoreForStatus(string $status): int {
        $normalized = $this->normalizeVerificationStatus($status);
        switch ($normalized) {
            case 'valid': return 100;
            case 'catch_all': return 55;
            case 'unknown': return 35;
            case 'disposable': return 10;
            default: return 0;
        }
    }

    private function validateEmailBasics(string $email): array {
        static $roleAccounts = [
            'admin' => true, 'webmaster' => true, 'support' => true, 'sales' => true,
            'info' => true, 'contact' => true, 'postmaster' => true, 'hostmaster' => true,
            'help' => true, 'billing' => true, 'jobs' => true, 'hr' => true,
        ];
        $result = [
            'syntax' => false, 'is_role' => false, 'is_disposable' => false,
            'is_free' => false, 'is_spam_trap' => false, 'is_blacklist' => false, 'domain' => '',
        ];

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return $result;

        $parts = explode('@', $email);
        $user = strtolower((string)($parts[0] ?? ''));
        $domain = strtolower((string)($parts[1] ?? ''));

        $result['syntax'] = true;
        $result['domain'] = $domain;
        $result['is_role'] = isset($roleAccounts[$user]);
        $result['is_disposable'] = $this->domainCache->is($domain, 'disposable');
        $result['is_free'] = $this->domainCache->is($domain, 'free');
        $result['is_blacklist'] = $this->domainCache->is($domain, 'blacklist');
        $result['is_spam_trap'] = $this->domainCache->is($domain, 'spam-trap');

        return $result;
    }

    private function prepareMxHosts(array $mxHosts, array $mxWeights): array {
        $mxRecords = [];
        foreach ($mxHosts as $idx => $host) {
            $host = strtolower(trim((string)$host));
            if ($host === '') continue;
            $mxRecords[] = ['host' => $host, 'weight' => (int)($mxWeights[$idx] ?? 0)];
        }

        usort($mxRecords, static function (array $a, array $b): int {
            if ($a['weight'] === $b['weight']) return strcmp($a['host'], $b['host']);
            return $a['weight'] <=> $b['weight'];
        });

        $ordered = [];
        foreach ($mxRecords as $record) {
            if (!in_array($record['host'], $ordered, true)) $ordered[] = $record['host'];
            if (count($ordered) >= 5) break;
        }
        return $ordered;
    }

    private function buildVerifierHostname(): string {
        $hostname = strtolower(trim((string)gethostname()));
        if (empty($hostname) || strpos($hostname, '.') === false) {
            return 'example.com';
        }
        return $hostname;
    }

    private function smtpCommand($connection, string $command): string {
        @fwrite($connection, $command . "\r\n");
        return $this->readSmtpResponse($connection);
    }

    private function readSmtpResponse($connection): string {
        $response = '';
        $lineCount = 0;
        while (!feof($connection) && $lineCount < 20) {
            $line = fgets($connection, 1024);
            if ($line === false) break;
            $response .= $line;
            $lineCount++;
            if (strlen($line) >= 4 && $line[3] === ' ') break;
        }
        return $response;
    }

    private function extractSmtpCode(string $response): int {
        if (preg_match('/^\s*(\d{3})/m', $response, $m)) return (int)$m[1];
        return 0;
    }

    private function probeSmtpMailbox(string $mxHost, string $hostname, string $email, string $domain): array {
        $result = [
            'connected' => false, 'reachable' => false, 'accepted' => false,
            'catch_all' => false, 'hard_fail' => false, 'temp_fail' => false,
            'mailbox_full' => false,
        ];

        $errno = 0;
        $errstr = '';
        $connection = @fsockopen($mxHost, 25, $errno, $errstr, 8);
        if (!$connection) return $result;

        $result['connected'] = true;
        stream_set_timeout($connection, 8);

        $bannerCode = $this->extractSmtpCode($this->readSmtpResponse($connection));
        if ($bannerCode !== 220) {
            fclose($connection);
            if (in_array($bannerCode, [421], true)) {
                $result['reachable'] = true;
                $result['temp_fail'] = true;
            }
            return $result;
        }

        $result['reachable'] = true;

        $ehloCode = $this->extractSmtpCode($this->smtpCommand($connection, 'EHLO ' . $hostname));
        if ($ehloCode < 200 || $ehloCode >= 400) {
            $this->smtpCommand($connection, 'HELO ' . $hostname);
        }

        $mailFromCode = $this->extractSmtpCode($this->smtpCommand($connection, 'MAIL FROM:<>'));
        if (in_array($mailFromCode, [421, 450, 451, 452, 454, 455], true)) {
            $result['temp_fail'] = true;
            $this->smtpCommand($connection, 'QUIT');
            fclose($connection);
            return $result;
        }

        $rcptCode = $this->extractSmtpCode($this->smtpCommand($connection, 'RCPT TO:<' . $email . '>'));
        if (in_array($rcptCode, [250, 251], true)) {
            $result['accepted'] = true;
            $randomLocal = bin2hex(random_bytes(4));
            $randomEmail = 'probe_' . $randomLocal . '@' . $domain;
            $rcptRandomCode = $this->extractSmtpCode($this->smtpCommand($connection, 'RCPT TO:<' . $randomEmail . '>'));
            $result['catch_all'] = in_array($rcptRandomCode, [250, 251], true);
        } elseif (in_array($rcptCode, [550, 551, 553], true)) {
            $result['hard_fail'] = true;
        } elseif ($rcptCode === 552) {
            $result['mailbox_full'] = true;
            $result['temp_fail'] = true;
        } else {
            $result['temp_fail'] = true;
        }

        $this->smtpCommand($connection, 'QUIT');
        fclose($connection);

        return $result;
    }

    private function formatVerificationResult(string $email, string $status, int $score, float $startTime, array $detailedChecks): array {
        return [
            'email' => $email,
            'status' => $this->normalizeVerificationStatus($status),
            'score' => $score,
            'processingTime' => number_format(microtime(true) - $startTime, 2),
            'detailedChecks' => $detailedChecks,
        ];
    }
}
