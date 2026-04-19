<?php
namespace App\Controllers\Admin;

use App\Controllers\BaseController;
use Core\Request;
use App\Services\AuthService;
use App\Services\HelperService;
use Core\DB;

class DomainController extends BaseController {

    /**
     * GET /admin/domains
     * List domains with optional search, type filter, and pagination.
     */
    public function index() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $search   = trim((string)(Request::get('search') ?? ''));
        $type     = trim((string)(Request::get('type')   ?? ''));
        $page     = max(1, (int)(Request::get('page')   ?? 1));
        $perPage  = min(200, max(10, (int)(Request::get('per_page') ?? 100)));
        $offset   = ($page - 1) * $perPage;

        $where  = [];
        $params = [];

        if ($search !== '') {
            $where[] = 'domain LIKE ?';
            $params[] = '%' . $search . '%';
        }

        $allowedTypes = ['disposable', 'free', 'blacklist', 'spam-trap'];
        if ($type !== '' && in_array($type, $allowedTypes, true)) {
            $where[] = 'type = ?';
            $params[] = $type;
        }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        // Total count
        $countStmt = DB::prepare("SELECT COUNT(*) as total FROM domains $whereClause");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        // Paginated rows
        $stmt = DB::prepare(
            "SELECT id, domain, type, excluded, created_at
             FROM domains $whereClause
             ORDER BY id DESC
             LIMIT ? OFFSET ?"
        );

        $position = 1;

        // Bind WHERE params as string placeholders.
        foreach ($params as $val) {
            $stmt->bindValue($position++, $val, \PDO::PARAM_STR);
        }

        // Bind LIMIT/OFFSET explicitly as INT placeholders.
        $stmt->bindValue($position++, $perPage, \PDO::PARAM_INT);
        $stmt->bindValue($position, $offset, \PDO::PARAM_INT);

        $stmt->execute();
        $domains = $stmt->fetchAll();

        // Stats (always full dataset)
        $statsStmt = DB::prepare(
            "SELECT
                COUNT(*) as total,
                SUM(type = 'disposable') as disposable,
                SUM(type = 'free') as free,
                SUM(type = 'blacklist') as blacklist,
                SUM(type = 'spam-trap') as spam
             FROM domains"
        );
        $statsStmt->execute();
        $stats = $statsStmt->fetch();

        return $this->success('Domains retrieved', [
            'domains'  => $domains,
            'stats'    => $stats,
            'total'    => $total,
            'page'     => $page,
            'per_page' => $perPage,
        ]);
    }

    /**
     * POST /admin/domains/store
     * Add a single domain.
     */
    public function store() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $input  = Request::json();
        $domain = strtolower(HelperService::robustTrim((string)($input['domain'] ?? '')));
        $type   = (string)($input['type'] ?? 'disposable');

        $allowedTypes = ['disposable', 'free', 'blacklist', 'spam-trap'];
        if ($domain === '') {
            return $this->error('Domain is required.', [], 400);
        }
        if (!in_array($type, $allowedTypes, true)) {
            return $this->error('Invalid domain type.', [], 400);
        }

        // Basic domain format check
        if (!preg_match('/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/', $domain)) {
            return $this->error('Invalid domain format.', [], 400);
        }

        try {
            $stmt = DB::prepare("INSERT INTO domains (domain, type, added_by) VALUES (?, ?, ?)");
            $stmt->execute([$domain, $type, $userId]);
            $id = DB::lastInsertId();
            HelperService::logActivity('INFO', 'Admin', "Added domain: $domain ($type)", $userId);
            return $this->success('Domain added successfully', [
                'id'         => $id,
                'domain'     => $domain,
                'type'       => $type,
                'excluded'   => 0,
                'created_at' => date('Y-m-d H:i:s'),
            ], 201);
        } catch (\Exception $e) {
            if (str_contains($e->getMessage(), 'Duplicate')) {
                return $this->error('Domain already exists.', [], 409);
            }
            error_log('DomainController::store error: ' . $e->getMessage());
            return $this->error('Failed to add domain.', [], 500);
        }
    }

    /**
     * POST /admin/domains/toggle
     * Toggle the excluded status of a domain.
     */
    public function toggle() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $input = Request::json();
        $id    = (int)($input['id'] ?? 0);

        if (!$id) {
            return $this->error('Domain ID is required.', [], 400);
        }

        try {
            $stmt = DB::prepare("UPDATE domains SET excluded = NOT excluded WHERE id = ?");
            $stmt->execute([$id]);

            if ($stmt->rowCount() === 0) {
                return $this->error('Domain not found.', [], 404);
            }

            $row = DB::prepare("SELECT excluded FROM domains WHERE id = ?");
            $row->execute([$id]);
            $newValue = (int)$row->fetchColumn();

            HelperService::logActivity('INFO', 'Admin', "Toggled domain #$id excluded=" . $newValue, $userId);
            return $this->success('Domain status toggled', ['excluded' => $newValue]);
        } catch (\Exception $e) {
            error_log('DomainController::toggle error: ' . $e->getMessage());
            return $this->error('Failed to toggle domain.', [], 500);
        }
    }

    /**
     * POST /admin/domains/delete
     * Delete a domain by ID.
     */
    public function destroy() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        $input = Request::json();
        $id    = (int)($input['id'] ?? 0);

        if (!$id) {
            return $this->error('Domain ID is required.', [], 400);
        }

        try {
            $stmt = DB::prepare("DELETE FROM domains WHERE id = ?");
            $stmt->execute([$id]);

            if ($stmt->rowCount() === 0) {
                return $this->error('Domain not found.', [], 404);
            }

            HelperService::logActivity('WARN', 'Admin', "Deleted domain #$id", $userId);
            return $this->success('Domain deleted successfully');
        } catch (\Exception $e) {
            error_log('DomainController::destroy error: ' . $e->getMessage());
            return $this->error('Failed to delete domain.', [], 500);
        }
    }

    /**
     * POST /admin/domains/upload
     * Bulk upload domains from CSV/TXT content (one domain per line).
     */
    public function upload() {
        $userId = AuthService::checkAuth();
        AuthService::requireAdmin($userId);

        // Allow long-running bulk uploads.
        set_time_limit(0);

        $isFileUpload = isset($_FILES['file']) && is_array($_FILES['file']);
        $input = $isFileUpload ? [] : Request::json();
        $type = (string)($input['type'] ?? ($_POST['type'] ?? 'disposable'));

        $allowedTypes = ['disposable', 'free', 'blacklist', 'spam-trap'];
        if (!in_array($type, $allowedTypes, true)) {
            return $this->error('Invalid domain type.', [], 400);
        }

        $added = 0;
        $duplicates = 0;
        $invalid = 0;
        $stmt = DB::prepare("INSERT INTO domains (domain, type, added_by) VALUES (?, ?, ?)");

        $processLine = function (string $line) use (&$added, &$duplicates, &$invalid, $stmt, $type, $userId): void {
            $line = HelperService::robustTrim($line);
            if ($line === '') return;

            // Handle CSV or single column
            $columns = str_getcsv($line);
            $domain = strtolower(HelperService::robustTrim((string)($columns[0] ?? '')));
            if ($domain === '') return;

            if (!preg_match('/^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/', $domain)) {
                $invalid++;
                return;
            }

            try {
                $stmt->execute([$domain, $type, $userId]);
                if ($stmt->rowCount() > 0) {
                    $added++;
                } else {
                    $duplicates++;
                }
            } catch (\Exception $e) {
                $duplicates++;
            }
        };

        if ($isFileUpload) {
            $upload = $_FILES['file'];
            $uploadError = (int)($upload['error'] ?? UPLOAD_ERR_NO_FILE);
            if ($uploadError !== UPLOAD_ERR_OK) {
                return $this->error('File upload failed.', [], 400, 'ERR_FILE_UPLOAD');
            }

            $tmpPath = (string)($upload['tmp_name'] ?? '');
            $originalName = (string)($upload['name'] ?? 'domains.txt');
            $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

            if ($tmpPath === '' || !is_file($tmpPath)) {
                return $this->error('Uploaded file is missing.', [], 400, 'ERR_FILE_MISSING');
            }

            if (!in_array($extension, ['csv', 'txt'], true)) {
                return $this->error('Only CSV or TXT files are allowed.', [], 400, 'ERR_FILE_TYPE');
            }

            $maxFileSize = 200 * 1024 * 1024;
            $size = (int)($upload['size'] ?? 0);
            if ($size <= 0 || $size > $maxFileSize) {
                return $this->error('File size must be between 1 byte and 200MB.', [], 400, 'ERR_FILE_SIZE');
            }

            // MIME validation
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = $finfo ? finfo_file($finfo, $tmpPath) : '';

            $allowedMimes = ['text/plain', 'text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/comma-separated-values'];
            if ($mime && !in_array($mime, $allowedMimes, true)) {
                return $this->error('Invalid file type. Only CSV or TXT text files are allowed.', [], 400, 'ERR_FILE_TYPE');
            }

            $file = new \SplFileObject($tmpPath, 'r');
            while (!$file->eof()) {
                $line = (string)$file->fgets();
                if ($line === '') {
                    continue;
                }
                $processLine($line);
            }
        } else {
            $content = (string)($input['content'] ?? '');
            if (trim($content) === '') {
                return $this->error('File content is empty.', [], 400);
            }

            $maxJsonBytes = 5 * 1024 * 1024;
            if (strlen($content) > $maxJsonBytes) {
                return $this->error('Content too large. Please upload a CSV/TXT file instead.', [], 413, 'ERR_CONTENT_TOO_LARGE');
            }

            // Process line by line to save memory
            $contentLength = strlen($content);
            $ptr = 0;
            while ($ptr < $contentLength) {
                $end = strpos($content, "\n", $ptr);
                if ($end === false) $end = $contentLength;
                
                $line = substr($content, $ptr, $end - $ptr);
                $ptr = $end + 1;
                $processLine($line);
            }
        }

        HelperService::logActivity('INFO', 'Admin', "Bulk uploaded domains: added=$added duplicates=$duplicates invalid=$invalid", $userId);

        return $this->success("Upload complete: $added added, $duplicates duplicates skipped, $invalid invalid.", [
            'added'      => $added,
            'duplicates' => $duplicates,
            'invalid'    => $invalid,
        ]);
    }
}
