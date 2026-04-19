<?php
namespace Core;

use Core\Response;
use Core\Container;

class Router {
    private $routes = [];
    private $groupStack = [];

    public function get($uri, $controller, $middlewares = []) {
        $this->addRoute('GET', $uri, $controller, $middlewares);
    }

    public function post($uri, $controller, $middlewares = []) {
        $this->addRoute('POST', $uri, $controller, $middlewares);
    }

    public function delete($uri, $controller, $middlewares = []) {
        $this->addRoute('DELETE', $uri, $controller, $middlewares);
    }

    public function group(string $prefix = '', array $middlewares = [], callable $callback): void {
        $parent = end($this->groupStack);
        $parentPrefix = is_array($parent) ? (string)($parent['prefix'] ?? '') : '';
        $parentMiddlewares = is_array($parent) ? (array)($parent['middlewares'] ?? []) : [];

        $normalizedPrefix = $this->normalizeUri($prefix);
        if ($normalizedPrefix === '/') {
            $normalizedPrefix = '';
        }

        $combinedPrefix = rtrim($parentPrefix, '/') . $normalizedPrefix;
        if ($combinedPrefix === '') {
            $combinedPrefix = '';
        }

        $combinedMiddlewares = array_values(array_unique(array_merge($parentMiddlewares, $this->normalizeMiddlewares($middlewares))));
        $this->groupStack[] = [
            'prefix' => $combinedPrefix,
            'middlewares' => $combinedMiddlewares,
        ];

        try {
            $callback($this);
        } finally {
            array_pop($this->groupStack);
        }
    }

    private function addRoute($method, $uri, $controller, $middlewares = []) {
        $group = end($this->groupStack);
        $groupPrefix = is_array($group) ? (string)($group['prefix'] ?? '') : '';
        $groupMiddlewares = is_array($group) ? (array)($group['middlewares'] ?? []) : [];

        $normalizedUri = $this->normalizeUri($uri);
        $fullUri = $this->normalizeUri(rtrim($groupPrefix, '/') . $normalizedUri);

        $routeMiddlewares = array_values(array_unique(array_merge(
            $groupMiddlewares,
            $this->normalizeMiddlewares($middlewares)
        )));

        $this->routes[] = [
            'method' => $method,
            'uri' => $fullUri,
            'controller' => $controller,
            'middlewares' => $routeMiddlewares,
        ];
    }

    private function normalizeMiddlewares($middlewares): array {
        if ($middlewares === null) {
            return [];
        }
        if (is_string($middlewares)) {
            $middlewares = [$middlewares];
        }
        if (!is_array($middlewares)) {
            return [];
        }
        return array_values(array_filter(array_map(static function ($middleware) {
            return is_string($middleware) ? trim($middleware) : '';
        }, $middlewares), static function (string $value): bool {
            return $value !== '';
        }));
    }

    private function normalizeUri(string $uri): string {
        $uri = trim($uri);
        if ($uri === '' || $uri === '/') {
            return '/';
        }
        return '/' . trim($uri, '/');
    }

    public function resolve($requestUri, $requestMethod) {
        $path = (string)parse_url($requestUri, PHP_URL_PATH);
        $path = $this->normalizePath($path);

        foreach ($this->routes as $route) {
            $routeRegex = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '([^/]+)', $route['uri']);
            $routeRegex = "#^" . $routeRegex . "$#";

            if ($route['method'] === $requestMethod && preg_match($routeRegex, $path, $matches)) {
                array_shift($matches); // Remove the full path match
                
                try {
                    $this->runMiddlewares($route['middlewares'] ?? []);
                    $this->executeController($route['controller'], $matches);
                } catch (\Throwable $e) {
                    // Pass to global exception handler
                    throw $e;
                }
                return;
            }
        }

        Response::error('Endpoint not found: ' . $path, [], 404, 'ERR_NOT_FOUND');
    }

    private function normalizePath(string $path): string {
        // Remove trailing slash except for root
        $path = $path !== '/' ? rtrim($path, '/') : $path;

        // Strip index.php if present
        $indexPhpPos = strpos($path, '/index.php');
        if ($indexPhpPos !== false) {
            $path = substr($path, $indexPhpPos + strlen('/index.php'));
            if ($path === '' || $path === false) $path = '/';
        }

        // Robust base path stripping
        $configuredBasePath = defined('API_BASE_PATH') ? (string)API_BASE_PATH : '/api';
        $baseCandidates = ['/api', $configuredBasePath];
        
        // Add script directory as a candidate if it contains 'api'
        if (isset($_SERVER['SCRIPT_NAME'])) {
            $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
            if ($scriptDir !== '/' && $scriptDir !== '.') {
                $baseCandidates[] = str_replace('\\', '/', $scriptDir);
            }
        }

        // Sort candidates by length (longest first) to match most specific one
        $baseCandidates = array_unique($baseCandidates);
        usort($baseCandidates, fn($a, $b) => strlen($b) <=> strlen($a));

        foreach ($baseCandidates as $base) {
            $base = rtrim($base, '/');
            if ($base !== '' && strpos($path, $base) === 0) {
                $path = substr($path, strlen($base));
                break;
            }
        }

        return $path === '' ? '/' : '/' . ltrim($path, '/');
    }

    private function executeController($controllerString, array $params = []) {
        if (!str_contains($controllerString, '@')) {
            throw new \RuntimeException("Invalid controller format: {$controllerString}");
        }

        list($class, $method) = explode('@', $controllerString);
        $fullClass = "App\\Controllers\\" . $class;
        
        if (!class_exists($fullClass)) {
            throw new \RuntimeException("Controller class {$fullClass} not found");
        }

        $controller = Container::make($fullClass);
        if (!method_exists($controller, $method)) {
            throw new \RuntimeException("Method {$method} not found in {$fullClass}");
        }

        call_user_func_array([$controller, $method], $params);
    }

    private function runMiddlewares(array $middlewares): void {
        $cachedUserId = null;
        foreach ($middlewares as $middleware) {
            $this->executeMiddleware($middleware, $cachedUserId);
        }
    }

    private function executeMiddleware(string $name, &$cachedUserId): void {
        switch ($name) {
            case 'auth':
                if ($cachedUserId === null) $cachedUserId = \App\Services\AuthService::checkAuth();
                break;
            case 'admin':
                if ($cachedUserId === null) $cachedUserId = \App\Services\AuthService::checkAuth();
                \App\Services\AuthService::requireAdmin($cachedUserId);
                break;
            case 'reseller':
                if ($cachedUserId === null) $cachedUserId = \App\Services\AuthService::checkAuth();
                \App\Services\AuthService::requireReseller($cachedUserId);
                break;
            case 'worker':
                \App\Services\AuthService::checkWorkerAuth();
                break;
            default:
                throw new \RuntimeException("Unknown middleware: {$name}");
        }
    }
}
