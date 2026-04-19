<?php
/**
 * EmailJachai Pro - Domain Cache Service
 * Handles local storage and rapid lookup of domain properties (disposable, blacklist, etc.)
 */
namespace App\Services;

class DomainCache {
    private static $domains = [];
    private static $lastUpdated = 0;
    private $logger;

    public function __construct(\App\Core\Logger $logger) {
        $this->logger = $logger;
    }

    /**
     * Updates the local cache with domains from the API
     */
    public function setDomains(array $rawDomains): void {
        $processed = [
            'disposable' => [],
            'free' => [],
            'blacklist' => [],
            'spam-trap' => []
        ];

        foreach ($rawDomains as $row) {
            $domain = strtolower(trim((string)($row['domain'] ?? '')));
            $type = (string)($row['type'] ?? '');
            
            if ($domain !== '' && isset($processed[$type])) {
                $processed[$type][$domain] = true;
            }
        }

        self::$domains = $processed;
        self::$lastUpdated = time();
        $this->logger->info("Domain cache updated. Counts: Disposable=" . count($processed['disposable']) . ", Blacklist=" . count($processed['blacklist']));
    }

    /**
     * Check if a domain has a specific property
     */
    public function is(string $domain, string $type): bool {
        $domain = strtolower(trim($domain));
        return isset(self::$domains[$type][$domain]);
    }

    public function getLastUpdated(): int {
        return self::$lastUpdated;
    }

    public function isLoaded(): bool {
        return !empty(self::$domains);
    }
}
