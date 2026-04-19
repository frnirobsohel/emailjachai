<?php
/**
 * EmailJachai Pro - Smoke Test Runner
 *
 * @author     Sohel Akter
 * @license    Proprietary
 */

declare(strict_types=1);

require_once __DIR__ . '/../app/Services/HelperService.php';
require_once __DIR__ . '/../app/Services/BillingService.php';

use App\Services\BillingService;
use App\Services\HelperService;

$failures = [];

$assertSame = static function ($expected, $actual, string $label) use (&$failures): void {
    if ($expected !== $actual) {
        $failures[] = $label . ' expected=' . var_export($expected, true) . ' actual=' . var_export($actual, true);
    }
};

$assertTrue = static function (bool $condition, string $label) use (&$failures): void {
    if (!$condition) {
        $failures[] = $label;
    }
};

$assertSame('valid', HelperService::normalizeVerificationStatus('deliverable'), 'normalize deliverable');
$assertSame('unknown', HelperService::normalizeVerificationStatus('temporary'), 'normalize temporary');
$assertSame('invalid', HelperService::normalizeVerificationStatus('blacklist'), 'normalize blacklist');
$assertSame('disposable', HelperService::normalizeVerificationStatus('disposable'), 'normalize disposable');

$assertSame(100, HelperService::scoreForStatus('valid'), 'score valid');
$assertSame(55, HelperService::scoreForStatus('catch_all'), 'score catch_all');
$assertSame(35, HelperService::scoreForStatus('unknown'), 'score unknown');
$assertSame(0, HelperService::scoreForStatus('invalid'), 'score invalid');

$keyA = BillingService::normalizeKeyForUser('abc', 1);
$keyB = BillingService::normalizeKeyForUser('abc', 2);
$assertTrue(is_string($keyA) && strlen($keyA) === 64, 'billing key shape');
$assertTrue($keyA !== $keyB, 'billing key user scoping');
$assertSame(null, BillingService::normalizeKeyForUser('', 1), 'billing empty key');

if (!empty($failures)) {
    fwrite(STDERR, "Smoke tests failed:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "Smoke tests passed.\n";
