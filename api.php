<?php
declare(strict_types=1);

require_once __DIR__ . '/api/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$isHttps = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function requestBody(): array
{
    $raw = file_get_contents('php://input');
    $body = json_decode($raw === false ? '' : $raw, true);
    if (!is_array($body)) {
        respond(['error' => 'A valid JSON request body is required.'], 400);
    }
    return $body;
}

function requireMethod(string $expected): void
{
    if ($_SERVER['REQUEST_METHOD'] !== $expected) {
        header('Allow: ' . $expected);
        respond(['error' => 'Method not allowed.'], 405);
    }
}

function activeUser(PDO $db): ?array
{
    if (!isset($_SESSION['user_id'])) {
        return null;
    }

    $statement = $db->prepare('SELECT id, name, username, role FROM users WHERE id = ? AND is_active = 1');
    $statement->execute([$_SESSION['user_id']]);
    $user = $statement->fetch();
    if (!$user) {
        $_SESSION = [];
        return null;
    }
    return $user;
}

function requireUser(PDO $db): array
{
    $user = activeUser($db);
    if (!$user) {
        respond(['error' => 'Please sign in to continue.'], 401);
    }
    return $user;
}

function requireRole(array $user, array $roles): void
{
    if (!in_array($user['role'], $roles, true)) {
        respond(['error' => 'Your role is not permitted to perform this action.'], 403);
    }
}

function requireCsrf(): void
{
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf_token'] ?? '';
    if ($expected === '' || !is_string($provided) || !hash_equals($expected, $provided)) {
        respond(['error' => 'Your session token expired. Please sign in again.'], 403);
    }
}

function csrfToken(): string
{
    if (!isset($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf_token'];
}

function appData(PDO $db, array $user): array
{
    $settings = $db->query('SELECT name, fiscal_year_start AS fiscalYear, currency FROM organization_settings WHERE id = 1')->fetch();
    $transactions = $db->query(
        'SELECT id, entry_date AS date, category, sub_category AS subCategory, description,
                CAST(amount AS DECIMAL(14, 2)) AS amount, payment_method AS method
         FROM transactions ORDER BY entry_date DESC, created_at DESC'
    )->fetchAll();

    foreach ($transactions as &$transaction) {
        $transaction['amount'] = (float) $transaction['amount'];
    }
    unset($transaction);

    return [
        'authenticated' => true,
        'user' => $user,
        'csrfToken' => csrfToken(),
        'org' => $settings,
        'transactions' => $transactions,
    ];
}

function establishSession(PDO $db, int $userId): void
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    $statement = $db->prepare('SELECT id, name, username, role FROM users WHERE id = ? AND is_active = 1');
    $statement->execute([$userId]);
    $user = $statement->fetch();
    if (!$user) {
        respond(['error' => 'Unable to establish the user session.'], 500);
    }
    respond(appData($db, $user));
}

function validateCredentials(array $body, bool $includeName = false): array
{
    $name = trim((string) ($body['name'] ?? ''));
    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');

    if ($includeName && ($name === '' || strlen($name) > 120)) {
        respond(['error' => 'Enter a name no longer than 120 characters.'], 422);
    }
    if (!preg_match('/^[A-Za-z0-9._-]{3,64}$/', $username)) {
        respond(['error' => 'Username must be 3-64 characters using letters, numbers, dots, underscores, or hyphens.'], 422);
    }
    if (strlen($password) < 12 || strlen($password) > 4096) {
        respond(['error' => 'Password must be at least 12 characters.'], 422);
    }
    return [$name, $username, $password];
}

function validateTransaction(array $input): array
{
    $categories = [
        'Revenue' => ['Membership Dues', 'Grants & Sponsorships', 'Donations & Contributions', 'Event & Ticket Sales', 'Service Consulting Revenue'],
        'Expense' => ['Program Expenses', 'Event Expenses', 'Research & Lab Supplies', 'Salaries & Honorariums', 'Office & Admin Expense', 'Travel & Transportation', 'Utilities & Rent'],
        'Asset' => ['Cash / Operating Bank', 'Grant Dedicated Account', 'Accounts Receivable / Pledges', 'Equipment & Assets'],
        'Liability' => ['Accounts Payable', 'Accrued Vendor Bills', 'Short-term Credit Card'],
        'Equity' => ['Unrestricted Fund Balance', 'Restricted Grant Fund Balance'],
    ];
    $methods = ['Cash / Bank Transfer', 'Accounts Receivable', 'Accounts Payable', 'Grant Account'];
    $id = (string) ($input['id'] ?? '');
    $date = (string) ($input['date'] ?? '');
    $category = (string) ($input['category'] ?? '');
    $subCategory = (string) ($input['subCategory'] ?? '');
    $description = trim((string) ($input['description'] ?? ''));
    $method = (string) ($input['method'] ?? '');
    $amount = filter_var($input['amount'] ?? null, FILTER_VALIDATE_FLOAT);

    $dateParts = explode('-', $date);
    if (count($dateParts) !== 3 || !checkdate((int) $dateParts[1], (int) $dateParts[2], (int) $dateParts[0])) {
        respond(['error' => 'Enter a valid transaction date.'], 422);
    }
    if (!isset($categories[$category]) || !in_array($subCategory, $categories[$category], true)) {
        respond(['error' => 'Choose a valid financial category and subcategory.'], 422);
    }
    if ($description === '' || strlen($description) > 255) {
        respond(['error' => 'Description is required and must be 255 characters or fewer.'], 422);
    }
    if ($amount === false || $amount <= 0 || $amount > 999999999999.99) {
        respond(['error' => 'Amount must be greater than zero and within the supported range.'], 422);
    }
    if (!in_array($method, $methods, true)) {
        respond(['error' => 'Choose a valid payment method.'], 422);
    }
    if ($id !== '' && !preg_match('/^[a-f0-9-]{36}$/i', $id)) {
        respond(['error' => 'Invalid transaction identifier.'], 422);
    }

    return [$id, $date, $category, $subCategory, $description, round((float) $amount, 2), $method];
}

try {
    $db = database();
    $action = (string) ($_GET['action'] ?? '');
    $method = $_SERVER['REQUEST_METHOD'];

    if ($action === 'bootstrap' && $method === 'GET') {
        $user = activeUser($db);
        if ($user) {
            respond(appData($db, $user));
        }
        $userCount = (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
        respond(['authenticated' => false, 'setupRequired' => $userCount === 0]);
    }

    if ($action === 'setup') {
        requireMethod('POST');
        $body = requestBody();
        [$name, $username, $password] = validateCredentials($body, true);
        $lockResult = (int) $db->query("SELECT GET_LOCK('techpass_initial_setup', 10)")->fetchColumn();
        if ($lockResult !== 1) {
            respond(['error' => 'Initial setup is busy. Please try again.'], 503);
        }
        $existingUsers = (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
        if ($existingUsers > 0) {
            $db->query("SELECT RELEASE_LOCK('techpass_initial_setup')");
            respond(['error' => 'Initial setup has already been completed. Sign in instead.'], 409);
        }
        try {
            $db->beginTransaction();
            $statement = $db->prepare("INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, 'admin')");
            $statement->execute([$name, $username, password_hash($password, PASSWORD_DEFAULT)]);
            $userId = (int) $db->lastInsertId();
            $settings = $db->prepare(
                "INSERT INTO organization_settings (id, name, fiscal_year_start, currency)
                 VALUES (1, 'Organization Ledger', 'January 1', 'PHP')"
            );
            $settings->execute();
            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            $db->query("SELECT RELEASE_LOCK('techpass_initial_setup')");
            throw $error;
        }
        $db->query("SELECT RELEASE_LOCK('techpass_initial_setup')");
        establishSession($db, $userId);
    }

    if ($action === 'login') {
        requireMethod('POST');
        $body = requestBody();
        $username = trim((string) ($body['username'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $statement = $db->prepare('SELECT id, password_hash FROM users WHERE username = ? AND is_active = 1');
        $statement->execute([$username]);
        $account = $statement->fetch();
        if (!$account || !password_verify($password, $account['password_hash'])) {
            respond(['error' => 'Invalid username or password.'], 401);
        }
        establishSession($db, (int) $account['id']);
    }

    $user = requireUser($db);

    if ($action === 'logout') {
        requireMethod('POST');
        requireCsrf();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], '', $params['secure'], $params['httponly']);
        }
        session_destroy();
        respond(['success' => true]);
    }

    if ($action === 'transaction') {
        requireMethod('POST');
        requireRole($user, ['admin', 'treasurer']);
        requireCsrf();
        $body = requestBody();
        if (!isset($body['transaction']) || !is_array($body['transaction'])) {
            respond(['error' => 'Transaction details are required.'], 422);
        }
        [$id, $date, $category, $subCategory, $description, $amount, $paymentMethod] = validateTransaction($body['transaction']);
        if ($id === '') {
            $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                random_int(0, 0xffff), random_int(0, 0xffff), random_int(0, 0xffff),
                random_int(0, 0x0fff) | 0x4000, random_int(0, 0x3fff) | 0x8000,
                random_int(0, 0xffff), random_int(0, 0xffff), random_int(0, 0xffff));
            $insert = $db->prepare(
                'INSERT INTO transactions (id, entry_date, category, sub_category, description, amount, payment_method, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $insert->execute([$id, $date, $category, $subCategory, $description, $amount, $paymentMethod, $user['id'], $user['id']]);
        } else {
            $exists = $db->prepare('SELECT id FROM transactions WHERE id = ?');
            $exists->execute([$id]);
            if (!$exists->fetch()) {
                respond(['error' => 'Ledger entry was not found.'], 404);
            }
            $update = $db->prepare(
                'UPDATE transactions
                 SET entry_date = ?, category = ?, sub_category = ?, description = ?, amount = ?, payment_method = ?, updated_by = ?
                 WHERE id = ?'
            );
            $update->execute([$date, $category, $subCategory, $description, $amount, $paymentMethod, $user['id'], $id]);
        }
        $statement = $db->prepare(
            'SELECT id, entry_date AS date, category, sub_category AS subCategory, description, amount, payment_method AS method
             FROM transactions WHERE id = ?'
        );
        $statement->execute([$id]);
        $transaction = $statement->fetch();
        $transaction['amount'] = (float) $transaction['amount'];
        respond(['transaction' => $transaction]);
    }

    if ($action === 'delete_transaction') {
        requireMethod('POST');
        requireRole($user, ['admin', 'treasurer']);
        requireCsrf();
        $body = requestBody();
        $id = (string) ($body['id'] ?? '');
        if (!preg_match('/^[a-f0-9-]{36}$/i', $id)) {
            respond(['error' => 'Invalid transaction identifier.'], 422);
        }
        $statement = $db->prepare('DELETE FROM transactions WHERE id = ?');
        $statement->execute([$id]);
        if ($statement->rowCount() === 0) {
            respond(['error' => 'Ledger entry was not found.'], 404);
        }
        respond(['success' => true]);
    }

    if ($action === 'settings') {
        requireMethod('POST');
        requireRole($user, ['admin']);
        requireCsrf();
        $body = requestBody();
        $name = trim((string) ($body['name'] ?? ''));
        $fiscalYear = trim((string) ($body['fiscalYear'] ?? ''));
        if ($name === '' || strlen($name) > 160 || $fiscalYear === '' || strlen($fiscalYear) > 80) {
            respond(['error' => 'Organization name (160 characters) and fiscal year start (80 characters) are required.'], 422);
        }
        $statement = $db->prepare('UPDATE organization_settings SET name = ?, fiscal_year_start = ? WHERE id = 1');
        $statement->execute([$name, $fiscalYear]);
        $settings = $db->query('SELECT name, fiscal_year_start AS fiscalYear, currency FROM organization_settings WHERE id = 1')->fetch();
        respond(['org' => $settings]);
    }

    if ($action === 'users') {
        if ($method === 'GET') {
            requireRole($user, ['admin']);
            $accounts = $db->query(
                'SELECT id, name, username, role, created_at AS createdAt
                 FROM users WHERE is_active = 1 ORDER BY name, username'
            )->fetchAll();
            respond(['users' => $accounts]);
        }
        requireMethod('POST');
        requireRole($user, ['admin']);
        requireCsrf();
        $body = requestBody();
        [$name, $username, $password] = validateCredentials($body, true);
        $role = (string) ($body['role'] ?? '');
        if (!in_array($role, ['admin', 'treasurer', 'auditor'], true)) {
            respond(['error' => 'Choose Admin, Treasurer, or Auditor.'], 422);
        }
        try {
            $statement = $db->prepare('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)');
            $statement->execute([$name, $username, password_hash($password, PASSWORD_DEFAULT), $role]);
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                respond(['error' => 'That username is already in use.'], 409);
            }
            throw $error;
        }
        respond(['success' => true], 201);
    }

    respond(['error' => 'Unknown API action.'], 404);
} catch (PDOException $error) {
    error_log('TechPass database error: ' . $error->getMessage());
    respond(['error' => 'Database request failed. Check the XAMPP MySQL service and api/config.php settings.'], 500);
} catch (Throwable $error) {
    error_log('TechPass API error: ' . $error->getMessage());
    respond(['error' => 'The server could not complete the request.'], 500);
}
