<?php
// Define all application routes here

/** @var \Core\Router $router */

// Public / General Routes
$router->get('/', 'FallbackController@index');
$router->get('/settings/public', 'SettingsController@getPublicSettings');
$router->get('/health', 'HealthController@index');
$router->get('/fallback/test', 'FallbackController@test');

// Public Auth Routes
$router->post('/auth/login', 'AuthController@login');
$router->post('/auth/register', 'AuthController@register');

// Worker specific queue API
$router->post('/worker/claim-task', 'WorkerController@claimTask', ['worker']);
$router->post('/worker/complete-task', 'WorkerController@completeTask', ['worker']);
$router->get('/worker/domains', 'WorkerController@getActiveDomains', ['worker']);
$router->post('/jobs/push-result', 'JobController@pushResult', ['worker']);
$router->post('/jobs/push-results', 'JobController@pushResults', ['worker']);
$router->post('/worker/reset-tasks', 'WorkerController@resetTasks', ['worker']);
$router->post('/admin/server/heartbeat', 'Admin\ServerController@heartbeat', ['worker']);

// Public payment webhooks (provider callbacks)
$router->post('/payment/cryptomus/webhook', 'PaymentController@cryptomusWebhook');
$router->post('/payment/stripe/webhook', 'PaymentController@stripeWebhook');
$router->post('/payment/paypal/webhook', 'PaymentController@paypalWebhook');

// Authenticated user routes
$router->group('', ['auth'], function (\Core\Router $router): void {
    // Jobs & Verification
    $router->post('/jobs/submit', 'JobController@submit');
    $router->post('/jobs/submit-file', 'JobController@submitFile');
    $router->post('/jobs/verify-single', 'JobController@singleVerify');
    $router->get('/jobs/download', 'DownloadController@download');
    $router->get('/jobs/list', 'JobController@list');
    $router->get('/jobs/status', 'JobController@status');
    $router->post('/jobs/delete', 'JobController@delete');

    // User API Keys
    $router->get('/user/keys', 'UserKeyController@index');
    $router->post('/user/keys/create', 'UserKeyController@create');
    $router->post('/user/keys/revoke', 'UserKeyController@revoke');
    $router->post('/user/keys/rotate', 'UserKeyController@rotate');
    $router->get('/user/keys/show', 'UserKeyController@show');

    // Dashboard Routes
    $router->get('/dashboard/stats', 'DashboardController@stats');
    $router->get('/dashboard/history', 'DashboardController@history');
    $router->get('/packages/list', 'Admin\PackageController@listActive');

    // Payment session/order creation
    $router->post('/payment/cryptomus/create', 'PaymentController@createCryptomusInvoice');
    $router->post('/payment/stripe/create', 'PaymentController@createStripeSession');
    $router->post('/payment/paypal/create', 'PaymentController@createPaypalOrder');

    // Auth Profile
    $router->get('/auth/me', 'AuthController@me');
    $router->post('/auth/profile/update', 'AuthController@updateProfile');

    // Reseller Routes
    $router->post('/reseller/transfer', 'ResellerController@transferCredits', ['reseller']);
});

// Admin Routes (automatic auth + admin middleware)
$router->group('/admin', ['auth', 'admin'], function (\Core\Router $router): void {
    $router->get('/users', 'Admin\UserController@index');
    $router->post('/users/action', 'Admin\UserController@action');
    $router->post('/impersonate', 'AuthController@impersonate');
    $router->get('/settings', 'Admin\SettingsController@index');
    $router->post('/settings/update', 'Admin\SettingsController@update');
    $router->get('/packages', 'Admin\PackageController@index');
    $router->post('/packages/create', 'Admin\PackageController@create');
    $router->post('/packages/update', 'Admin\PackageController@update');
    $router->post('/packages/delete', 'Admin\PackageController@delete');

    // Job Control & Stats
    $router->get('/jobs/stats', 'Admin\JobController@stats');
    $router->post('/jobs/cleanup', 'Admin\JobController@cleanup');
    $router->get('/jobs/download-all', 'Admin\JobController@downloadAll');

    // Domain Management
    $router->get('/domains', 'Admin\DomainController@index');
    $router->post('/domains/store', 'Admin\DomainController@store');
    $router->post('/domains/toggle', 'Admin\DomainController@toggle');
    $router->post('/domains/delete', 'Admin\DomainController@destroy');
    $router->post('/domains/upload', 'Admin\DomainController@upload');

    // Dashboard, Logs, Servers, SMTP
    $router->get('/dashboard/stats', 'Admin\DashboardController@stats');
    $router->get('/logs/list', 'Admin\LogsController@list');
    $router->delete('/logs/clear', 'Admin\LogsController@clear');

    $router->get('/server/list', 'Admin\ServerController@list');
    $router->get('/server/worker-key', 'Admin\ServerController@workerKey');
    $router->post('/server/add', 'Admin\ServerController@store');
    $router->post('/server/update', 'Admin\ServerController@update');
    $router->post('/server/toggle', 'Admin\ServerController@toggle');
    $router->post('/server/delete', 'Admin\ServerController@delete');
    $router->post('/server/worker-key/rotate', 'Admin\ServerController@rotateWorkerKey');

    $router->get('/smtp/settings', 'Admin\SmtpController@getSettings');
    $router->post('/smtp/settings', 'Admin\SmtpController@saveSettings');
    $router->get('/smtp/templates', 'Admin\SmtpController@getTemplates');
    $router->post('/smtp/templates', 'Admin\SmtpController@saveTemplate');
});
