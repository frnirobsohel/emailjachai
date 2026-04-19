<?php
namespace App\Controllers;

use Core\Request;
use Core\DB;

class SettingsController extends BaseController {

    public function getPublicSettings() {
        $cacheKey = 'public_settings';
        $results = \App\Services\CacheService::get($cacheKey);

        if (!$results) {
            $publicKeys = [
                'site_title',
                'site_tagline',
                'logo_url',
                'primary_color',
                'nav_style',
                'support_email',
                'help_center_url',
                'twitter_url',
                'linkedin_url',
                'github_url',
                'cryptomus_enabled',
                'stripe_enabled',
                'paypal_enabled'
            ];

            $placeholders = implode(',', array_fill(0, count($publicKeys), '?'));
            $stmt = DB::prepare("SELECT setting_key, setting_value FROM settings WHERE setting_key IN ($placeholders)");
            $stmt->execute($publicKeys);
            $settings = $stmt->fetchAll();

            $results = [];
            foreach ($settings as $setting) {
                $results[$setting['setting_key']] = (string)$setting['setting_value'];
            }
            
            \App\Services\CacheService::set($cacheKey, $results, 3600);
        }

        return $this->success('Public settings retrieved', $results);
    }
}
