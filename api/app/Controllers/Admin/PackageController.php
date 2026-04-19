<?php
namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use Core\Request;
use App\Services\AuthService;
use App\Services\HelperService;
use Core\DB;

class PackageController extends BaseController {
    private function normalizePackages(array $packages): array {
        foreach ($packages as &$pkg) {
            if (!empty($pkg['features'])) {
                $decoded = json_decode((string)$pkg['features'], true);
                $pkg['features'] = is_array($decoded) ? $decoded : [];
            } else {
                $pkg['features'] = [];
            }
            $pkg['popular'] = (bool)($pkg['popular'] ?? false);
        }
        return $packages;
    }

    public function index() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);
        
        $stmt = DB::prepare("SELECT id, name, tagline, credits_amount, price, features, status, popular FROM packages ORDER BY price ASC");
        $stmt->execute();
        $packages = $this->normalizePackages($stmt->fetchAll());
        
        return $this->success('Packages retrieved', $packages);
    }

    public function listActive() {
        // Authenticated users can browse purchasable plans.
        AuthService::checkAuth();

        $cacheKey = 'active_packages';
        $packages = \App\Services\CacheService::get($cacheKey);

        if (!$packages) {
            $stmt = DB::prepare("SELECT id, name, tagline, credits_amount, price, features, status, popular FROM packages WHERE status = 'active' ORDER BY price ASC");
            $stmt->execute();
            $packages = $this->normalizePackages($stmt->fetchAll());
            \App\Services\CacheService::set($cacheKey, $packages, 3600);
        }

        return $this->success('Active packages retrieved', $packages);
    }

    public function create() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $input = Request::json();
        
        if (!$input) return $this->error('Invalid JSON input.', [], 400);

        $name = $input['name'] ?? '';
        $tagline = $input['tagline'] ?? '';
        $credits = $input['credits_amount'] ?? 0;
        $price = $input['price'] ?? 0.00;
        $features = isset($input['features']) ? json_encode($input['features']) : '[]';
        $statusInput = $input['enabled'] ?? true;
        $status = $statusInput ? 'active' : 'inactive';
        $popular = ($input['popular'] ?? false) ? 1 : 0;

        if (empty($name) || $credits <= 0) {
            return $this->error('Valid name and credits are required.', [], 400);
        }

        if ($price == 0) {
            $stmt = DB::prepare("SELECT id FROM packages WHERE price = 0");
            $stmt->execute();
            if ($stmt->fetch()) {
                return $this->error('Only one Free Plan (price = 0) can exist.', [], 400);
            }
        }

        $stmt = DB::prepare("INSERT INTO packages (name, tagline, credits_amount, price, features, status, popular) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$name, $tagline, $credits, $price, $features, $status, $popular]);
        
        HelperService::logActivity('INFO', 'Admin', "New package '$name' created (\$$price, $credits credits)", $userId);
        \App\Services\CacheService::delete('active_packages');
        
        return $this->success('Package added successfully');
    }

    public function update() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $input = Request::json();
        $id = $input['id'] ?? null;
        
        if (!$id) return $this->error('Package ID is required for update.', [], 400);

        $name = $input['name'] ?? '';
        $tagline = $input['tagline'] ?? '';
        $credits = $input['credits_amount'] ?? 0;
        $price = $input['price'] ?? 0.00;
        $features = isset($input['features']) ? json_encode($input['features']) : '[]';
        $statusInput = $input['enabled'] ?? true;
        $status = $statusInput ? 'active' : 'inactive';
        $popular = ($input['popular'] ?? false) ? 1 : 0;

        if (empty($name) || $credits <= 0) {
            return $this->error('Valid name and credits are required.', [], 400);
        }

        if ($price == 0) {
            $stmt = DB::prepare("SELECT id FROM packages WHERE price = 0 AND id != ?");
            $stmt->execute([$id]);
            if ($stmt->fetch()) {
                return $this->error('Only one Free Plan (price = 0) can exist.', [], 400);
            }
        }

        $stmt = DB::prepare("UPDATE packages SET name = ?, tagline = ?, credits_amount = ?, price = ?, features = ?, status = ?, popular = ? WHERE id = ?");
        $stmt->execute([$name, $tagline, $credits, $price, $features, $status, $popular, $id]);
        
        HelperService::logActivity('INFO', 'Admin', "Package '$name' (ID:$id) updated", $userId);
        \App\Services\CacheService::delete('active_packages');
        
        return $this->success('Package updated successfully');
    }

    public function delete() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $input = Request::json();
        $id = $input['id'] ?? Request::get('id');

        if (!$id) return $this->error('Package ID is required.', [], 400);

        $stmt = DB::prepare("SELECT name FROM packages WHERE id = ?");
        $stmt->execute([$id]);
        $pkgName = $stmt->fetchColumn() ?? "#$id";

        $stmt = DB::prepare("DELETE FROM packages WHERE id = ?");
        $stmt->execute([$id]);
        
        HelperService::logActivity('WARN', 'Admin', "Package '$pkgName' (ID:$id) deleted", $userId);
        \App\Services\CacheService::delete('active_packages');
        
        return $this->success('Package deleted');
    }
}
