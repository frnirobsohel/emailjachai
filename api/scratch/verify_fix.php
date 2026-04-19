<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../core/DB.php';
require_once __DIR__ . '/../app/Services/BaseService.php';
require_once __DIR__ . '/../app/Services/HelperService.php';
require_once __DIR__ . '/../app/Services/JobService.php';

use App\Services\JobService;

echo "Verification Script Started\n";

$jobId = 'test_verified_job_' . time();
$taskId = 0; // This should trigger the new error handling
$serverName = 'DESKTOP-52AO2OK';
$results = [
    [
        'email' => 'test@example.com',
        'status' => 'valid',
        'score' => 100,
        'catch_all' => false
    ]
];

try {
    echo "Attempting to apply results with invalid Task ID (0)...\n";
    JobService::applyResultBatch($jobId, $results, 'idem_test', $taskId, $serverName);
    echo "FAIL: Expected exception was not thrown.\n";
} catch (\Exception $e) {
    echo "SUCCESS: Caught expected exception: " . $e->getMessage() . "\n";
    if (strpos($e->getMessage(), 'must be greater than zero') !== false) {
        echo "VERIFIED: Custom error message is present.\n";
    }
}

echo "Verification Script Finished\n";
