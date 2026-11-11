<?php
declare(strict_types=1);

require_once __DIR__ . '/api/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$isHttps = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
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

    $statement = $db->prepare(
        'SELECT id, name, username, role, must_change_password
         FROM users WHERE id = ? AND is_active = 1'
    );
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

function executeStatement(PDOStatement $statement, array $parameters, array $binaryParameters = []): void
{
    foreach ($parameters as $index => $value) {
        $type = $value === null
            ? PDO::PARAM_NULL
            : (in_array($index, $binaryParameters, true)
                ? PDO::PARAM_LOB
                : (is_int($value) ? PDO::PARAM_INT : PDO::PARAM_STR));
        $statement->bindValue($index + 1, $value, $type);
    }
    $statement->execute();
}

function appData(PDO $db, array $user): array
{
    $settings = $db->query('SELECT name, fiscal_year_start AS "fiscalYear", currency FROM organization_settings WHERE id = 1')->fetch();
    $transactions = $db->query(
        'SELECT id, entry_date AS "date", category, sub_category AS "subCategory", description,
                manual_details AS "manualDetails", raw_ocr_text AS "rawOcrText",
                corrected_ocr_text AS "correctedOcrText", line_items_json AS "lineItems",
                CASE WHEN receipt_image IS NOT NULL THEN 1 ELSE 0 END AS "hasReceiptPhoto",
                CAST(amount AS DECIMAL(14, 2)) AS amount, payment_method AS method
         FROM transactions ORDER BY entry_date DESC, created_at DESC'
    )->fetchAll();

    foreach ($transactions as &$transaction) {
        $transaction['amount'] = (float) $transaction['amount'];
        $transaction['hasReceiptPhoto'] = (bool) $transaction['hasReceiptPhoto'];
        $transaction['lineItems'] = is_string($transaction['lineItems'])
            ? json_decode($transaction['lineItems'], true, 512, JSON_THROW_ON_ERROR)
            : ($transaction['lineItems'] ?? []);
    }
    unset($transaction);

    return [
        'authenticated' => true,
        'user' => [
            'id' => (int) $user['id'],
            'name' => $user['name'],
            'username' => $user['username'],
            'role' => $user['role'],
        ],
        'needsPasswordChange' => (bool) $user['must_change_password'],
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
    $statement = $db->prepare(
        'SELECT id, name, username, role, must_change_password
         FROM users WHERE id = ? AND is_active = 1'
    );
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
    $manualDetails = $input['manualDetails'] ?? '';
    $rawOcrText = $input['rawOcrText'] ?? '';
    $correctedOcrText = $input['correctedOcrText'] ?? '';
    $lineItems = $input['lineItems'] ?? [];
    $receiptImage = $input['receiptImage'] ?? '';
    $receiptImageBytes = null;
    $receiptImageType = null;

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
    if (!is_string($manualDetails) || strlen($manualDetails) > 40000) {
        respond(['error' => 'Manual details must be 10,000 characters or fewer.'], 422);
    }
    if (!is_string($rawOcrText) || strlen($rawOcrText) > 20000) {
        respond(['error' => 'Receipt text must be 20,000 bytes or fewer.'], 422);
    }
    if (!is_string($correctedOcrText) || strlen($correctedOcrText) > 20000) {
        respond(['error' => 'Corrected receipt text must be 20,000 bytes or fewer.'], 422);
    }
    if (!is_array($lineItems) || !array_is_list($lineItems) || count($lineItems) > 50) {
        respond(['error' => 'Receipt items must be a list of no more than 50 items.'], 422);
    }
    $normalizedItems = [];
    foreach ($lineItems as $item) {
        if (!is_array($item)) {
            respond(['error' => 'Each receipt item must be an object.'], 422);
        }
        $itemDescription = $item['description'] ?? null;
        $unit = $item['unit'] ?? '';
        $quantityInput = $item['quantity'] ?? null;
        $unitPriceInput = $item['unitPrice'] ?? null;
        $lineTotalInput = $item['lineTotal'] ?? null;
        if (!is_string($itemDescription) || !is_string($unit)
            || ($quantityInput !== null && $quantityInput !== '' && !is_numeric($quantityInput))
            || ($unitPriceInput !== null && $unitPriceInput !== '' && !is_numeric($unitPriceInput))
            || ($lineTotalInput !== null && $lineTotalInput !== '' && !is_numeric($lineTotalInput))) {
            respond(['error' => 'Receipt item descriptions, units, quantities, and prices have invalid values.'], 422);
        }
        $itemDescription = trim($itemDescription);
        $unit = trim($unit);
        $quantity = $quantityInput === null || $quantityInput === '' ? null : (float) $quantityInput;
        $unitPrice = $unitPriceInput === null || $unitPriceInput === '' ? null : (float) $unitPriceInput;
        $lineTotal = $lineTotalInput === null || $lineTotalInput === '' ? null : (float) $lineTotalInput;
        if ($itemDescription === '' || strlen($itemDescription) > 200
            || strlen($unit) > 32
            || ($quantity !== null && (!is_finite($quantity) || $quantity <= 0 || $quantity > 999999))
            || ($unitPrice !== null && (!is_finite($unitPrice) || $unitPrice < 0 || $unitPrice > 999999999999.99))
            || ($lineTotal !== null && (!is_finite($lineTotal) || $lineTotal < 0 || $lineTotal > 999999999999.99))) {
            respond(['error' => 'Receipt items need a description, positive quantity, and valid prices.'], 422);
        }
        $normalizedItems[] = [
            'description' => $itemDescription,
            'quantity' => $quantity === null ? null : round((float) $quantity, 3),
            'unit' => $unit,
            'unitPrice' => $unitPrice === null ? null : round((float) $unitPrice, 2),
            'lineTotal' => $lineTotal === null ? null : round((float) $lineTotal, 2),
        ];
    }
    $lineItemsJson = json_encode($normalizedItems, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    if ($receiptImage !== '' && $receiptImage !== null) {
        if (!is_string($receiptImage) || !preg_match('/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/]*={0,2})$/', $receiptImage, $matches)) {
            respond(['error' => 'The receipt image must be a valid JPEG, PNG, or WebP image.'], 422);
        }
        $receiptImageBytes = base64_decode($matches[2], true);
        if ($receiptImageBytes === false || strlen($receiptImageBytes) > 3 * 1024 * 1024) {
            respond(['error' => 'Receipt images must be 3 MB or smaller.'], 422);
        }
        $imageInfo = @getimagesizefromstring($receiptImageBytes);
        if (!$imageInfo || $imageInfo['mime'] !== $matches[1]) {
            respond(['error' => 'The receipt image data is invalid.'], 422);
        }
        $receiptImageType = $matches[1];
    }

    return [
        $id, $date, $category, $subCategory, $description, round((float) $amount, 2), $method, $manualDetails,
        $rawOcrText === '' ? null : $rawOcrText, $correctedOcrText === '' ? null : $correctedOcrText,
        $lineItemsJson, $receiptImageBytes, $receiptImageType,
    ];
}

function analyzeReceiptWithGemini(string $mimeType, string $imageBytes): array
{
    $apiKey = getenv('GEMINI_API_KEY');
    if ($apiKey === false || trim($apiKey) === '') {
        respond(['error' => 'Gemini is not configured on the server. Set GEMINI_API_KEY to enable AI receipt analysis.'], 503);
    }
    if (!function_exists('curl_init')) {
        respond(['error' => 'The server is missing PHP cURL support required for Gemini.'], 503);
    }

    $itemSchema = [
        'type' => 'OBJECT',
        'properties' => [
            'description' => ['type' => 'STRING'],
            'quantity' => ['type' => 'NUMBER'],
            'unit' => ['type' => 'STRING'],
            'unitPrice' => ['type' => 'NUMBER'],
            'lineTotal' => ['type' => 'NUMBER'],
        ],
        'required' => ['description', 'quantity', 'unit', 'unitPrice', 'lineTotal'],
    ];
    $request = [
        'contents' => [[
            'parts' => [
                ['text' => 'Read this receipt image and return only the requested JSON. Transcribe all readable receipt text in correctedText, fixing obvious OCR spelling errors without changing merchant or product names beyond clear corrections. Extract the printed merchant, transaction date (YYYY-MM-DD), final amount paid, and each purchased line item with its printed description, quantity, unit, unit price, and line total. Do not treat tax, subtotal, change, or tendered cash as the final paid total. Do not invent missing or unreadable values: use an empty string for unknown merchant/date/text, 0 for an unknown amount or item numeric value, and an empty item list if no items are legible. Choose the best-fitting subCategory only from Event Expenses, Program Expenses, Research & Lab Supplies, Office & Admin Expense, or Travel & Transportation; use Program Expenses if the purpose is unclear. Preserve the receipt language and currency; do not translate item names. The result is a draft that a person will review.'],
                ['inline_data' => [
                    'mime_type' => $mimeType,
                    'data' => base64_encode($imageBytes),
                ]],
            ],
        ]],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'responseSchema' => [
                'type' => 'OBJECT',
                'properties' => [
                    'merchantName' => ['type' => 'STRING'],
                    'receiptDate' => ['type' => 'STRING'],
                    'totalAmount' => ['type' => 'NUMBER'],
                    'subCategory' => [
                        'type' => 'STRING',
                        'enum' => [
                            'Event Expenses',
                            'Program Expenses',
                            'Research & Lab Supplies',
                            'Office & Admin Expense',
                            'Travel & Transportation',
                        ],
                    ],
                    'correctedText' => ['type' => 'STRING'],
                    'items' => ['type' => 'ARRAY', 'items' => $itemSchema],
                ],
                'required' => ['merchantName', 'receiptDate', 'totalAmount', 'subCategory', 'correctedText', 'items'],
            ],
        ],
    ];
    $encodedRequest = json_encode($request, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $curl = curl_init('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $encodedRequest,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-goog-api-key: ' . trim($apiKey),
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    ]);
    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $curlFailed = $response === false;
    curl_close($curl);
    if ($curlFailed) {
        error_log('TechPass Gemini request failed before receiving a response.');
        respond(['error' => 'Gemini could not be reached. Check the server connection or use local OCR.'], 502);
    }
    if ($status < 200 || $status >= 300) {
        error_log('TechPass Gemini request returned HTTP ' . $status . '.');
        respond([
            'error' => $status === 429
                ? 'Gemini quota is temporarily unavailable. Try again later or use local OCR.'
                : 'Gemini could not analyze this receipt. Check the server API configuration or use local OCR.',
        ], $status === 429 ? 503 : 502);
    }

    $decoded = json_decode($response, true);
    $text = $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
    $analysis = is_string($text) ? json_decode($text, true) : null;
    if (!is_array($analysis) || !is_array($analysis['items'] ?? null) || !array_is_list($analysis['items'])
        || !is_string($analysis['merchantName'] ?? null)
        || !is_string($analysis['receiptDate'] ?? null)
        || !is_numeric($analysis['totalAmount'] ?? null)
        || !is_string($analysis['subCategory'] ?? null)
        || !is_string($analysis['correctedText'] ?? null)) {
        error_log('TechPass Gemini response did not contain the expected receipt data.');
        respond(['error' => 'Gemini returned an unreadable receipt analysis. Try again or use local OCR.'], 502);
    }

    $merchant = trim((string) ($analysis['merchantName'] ?? ''));
    $date = trim((string) ($analysis['receiptDate'] ?? ''));
    $dateParts = explode('-', $date);
    if (count($dateParts) !== 3 || !checkdate((int) ($dateParts[1] ?? 0), (int) ($dateParts[2] ?? 0), (int) ($dateParts[0] ?? 0))) {
        $date = '';
    }
    $amount = is_numeric($analysis['totalAmount'] ?? null) ? (float) $analysis['totalAmount'] : 0;
    if (!is_finite($amount) || $amount <= 0 || $amount > 999999999999.99) {
        $amount = '';
    } else {
        $amount = round($amount, 2);
    }
    $allowedSubcategories = [
        'Event Expenses',
        'Program Expenses',
        'Research & Lab Supplies',
        'Office & Admin Expense',
        'Travel & Transportation',
    ];
    $subCategory = (string) ($analysis['subCategory'] ?? '');
    if (!in_array($subCategory, $allowedSubcategories, true)) {
        $subCategory = '';
    }
    $correctedText = (string) ($analysis['correctedText'] ?? '');
    if (strlen($merchant) > 160 || strlen($correctedText) > 20000 || count($analysis['items']) > 50) {
        respond(['error' => 'Gemini returned receipt data that exceeds the supported limits. Try a tighter crop.'], 502);
    }

    $items = [];
    foreach ($analysis['items'] as $item) {
        if (!is_array($item) || !is_string($item['description'] ?? null) || !is_string($item['unit'] ?? null)) {
            respond(['error' => 'Gemini returned an invalid itemized receipt. Try again or use local OCR.'], 502);
        }
        $description = trim((string) ($item['description'] ?? ''));
        if ($description === '') {
            continue;
        }
        $quantity = is_numeric($item['quantity'] ?? null) ? (float) $item['quantity'] : 0;
        $unitPrice = is_numeric($item['unitPrice'] ?? null) ? (float) $item['unitPrice'] : 0;
        $lineTotal = is_numeric($item['lineTotal'] ?? null) ? (float) $item['lineTotal'] : 0;
        if (strlen($description) > 200 || ($quantity !== 0 && (!is_finite($quantity) || $quantity < 0 || $quantity > 999999))
            || $unitPrice < 0 || $unitPrice > 999999999999.99
            || $lineTotal < 0 || $lineTotal > 999999999999.99) {
            respond(['error' => 'Gemini returned invalid item quantities or prices. Review the photo and try again.'], 502);
        }
        $unit = trim((string) ($item['unit'] ?? ''));
        if (strlen($unit) > 32) {
            respond(['error' => 'Gemini returned an invalid item unit. Review the photo and try again.'], 502);
        }
        $items[] = [
            'description' => $description,
            'quantity' => $quantity === 0 ? null : round($quantity, 3),
            'unit' => $unit,
            'unitPrice' => $unitPrice === 0 ? null : round($unitPrice, 2),
            'lineTotal' => $lineTotal === 0 ? null : round($lineTotal, 2),
        ];
    }

    return [
        'vendor' => $merchant,
        'date' => $date,
        'amount' => $amount,
        'subCategory' => $subCategory,
        'correctedText' => $correctedText,
        'lineItems' => $items,
    ];
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
        $transactionalLock = acquireInitialSetupLock($db);
        $existingUsers = (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
        if ($existingUsers > 0) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            releaseInitialSetupLock($db, $transactionalLock);
            respond(['error' => 'Initial setup has already been completed. Sign in instead.'], 409);
        }
        try {
            if (!$transactionalLock) {
                $db->beginTransaction();
            }
            $insertUserSql = "INSERT INTO users (name, username, password_hash, role, must_change_password)
                              VALUES (?, ?, ?, 'admin', 0)";
            $statement = $db->prepare(isPostgres($db) ? $insertUserSql . ' RETURNING id' : $insertUserSql);
            $statement->execute([$name, $username, password_hash($password, PASSWORD_DEFAULT)]);
            $userId = (int) (isPostgres($db) ? $statement->fetchColumn() : $db->lastInsertId());
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
            throw $error;
        } finally {
            releaseInitialSetupLock($db, $transactionalLock);
        }
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

    if ($user['must_change_password'] && !in_array($action, ['change_password', 'logout'], true)) {
        respond(['error' => 'Change the temporary password before continuing.'], 403);
    }

    if ($action === 'change_password') {
        requireMethod('POST');
        requireCsrf();
        $body = requestBody();
        $currentPassword = (string) ($body['currentPassword'] ?? '');
        $newPassword = (string) ($body['newPassword'] ?? '');
        if (strlen($newPassword) < 12 || strlen($newPassword) > 4096) {
            respond(['error' => 'New password must be at least 12 characters.'], 422);
        }
        if ($currentPassword === $newPassword) {
            respond(['error' => 'Choose a new password different from the temporary password.'], 422);
        }
        $statement = $db->prepare('SELECT password_hash FROM users WHERE id = ? AND is_active = 1');
        $statement->execute([$user['id']]);
        $account = $statement->fetch();
        if (!$account || !password_verify($currentPassword, $account['password_hash'])) {
            respond(['error' => 'The current password is incorrect.'], 401);
        }
        $statement = $db->prepare(
            'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?'
        );
        $statement->execute([password_hash($newPassword, PASSWORD_DEFAULT), $user['id']]);
        $updatedUser = activeUser($db);
        respond(appData($db, $updatedUser));
    }

    if ($action === 'receipt_ai') {
        requireMethod('POST');
        requireRole($user, ['admin', 'treasurer']);
        requireCsrf();
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 5 * 1024 * 1024) {
            respond(['error' => 'The image sent for AI analysis must be 3 MB or smaller.'], 413);
        }
        $body = requestBody();
        $image = $body['image'] ?? '';
        if (!is_string($image) || !preg_match('/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+\/]*={0,2})$/', $image, $matches)) {
            respond(['error' => 'Choose a valid JPEG, PNG, or WebP receipt photo.'], 422);
        }
        $imageBytes = base64_decode($matches[2], true);
        if ($imageBytes === false || strlen($imageBytes) > 3 * 1024 * 1024) {
            respond(['error' => 'The image sent for AI analysis must be 3 MB or smaller.'], 413);
        }
        $imageInfo = @getimagesizefromstring($imageBytes);
        if (!$imageInfo || $imageInfo['mime'] !== $matches[1]) {
            respond(['error' => 'The receipt image data is invalid.'], 422);
        }
        if ($imageInfo[0] > 6000 || $imageInfo[1] > 6000 || $imageInfo[0] * $imageInfo[1] > 24000000) {
            respond(['error' => 'The image dimensions are too large for receipt analysis. Crop or resize the photo.'], 422);
        }
        set_time_limit(75);
        respond(['analysis' => analyzeReceiptWithGemini($matches[1], $imageBytes)]);
    }

    if ($action === 'transaction_receipt') {
        requireMethod('GET');
        $id = (string) ($_GET['id'] ?? '');
        if (!preg_match('/^[a-f0-9-]{36}$/i', $id)) {
            respond(['error' => 'Invalid transaction identifier.'], 422);
        }
        $statement = $db->prepare('SELECT receipt_image, receipt_image_type FROM transactions WHERE id = ?');
        $statement->execute([$id]);
        $receipt = $statement->fetch();
        if (!$receipt || $receipt['receipt_image'] === null) {
            respond(['error' => 'No receipt photo is stored for this entry.'], 404);
        }
        if (is_resource($receipt['receipt_image'])) {
            $receipt['receipt_image'] = stream_get_contents($receipt['receipt_image']);
        }
        if (!is_string($receipt['receipt_image'])) {
            throw new RuntimeException('The stored receipt image could not be read.');
        }
        respond([
            'image' => 'data:' . $receipt['receipt_image_type'] . ';base64,' . base64_encode($receipt['receipt_image']),
        ]);
    }

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
        [$id, $date, $category, $subCategory, $description, $amount, $paymentMethod, $manualDetails, $rawOcrText, $correctedOcrText, $lineItemsJson, $receiptImage, $receiptImageType] = validateTransaction($body['transaction']);
        $lineItemsPlaceholder = isPostgres($db) ? 'CAST(? AS JSONB)' : '?';
        if ($id === '') {
            $id = sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
                random_int(0, 0xffff), random_int(0, 0xffff), random_int(0, 0xffff),
                random_int(0, 0x0fff) | 0x4000, random_int(0, 0x3fff) | 0x8000,
                random_int(0, 0xffff), random_int(0, 0xffff), random_int(0, 0xffff));
            $insert = $db->prepare(
                'INSERT INTO transactions (id, entry_date, category, sub_category, description, manual_details, raw_ocr_text, corrected_ocr_text, line_items_json, receipt_image, receipt_image_type, amount, payment_method, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ' . $lineItemsPlaceholder . ', ?, ?, ?, ?, ?, ?)'
            );
            executeStatement($insert, [
                $id, $date, $category, $subCategory, $description, $manualDetails, $rawOcrText, $correctedOcrText, $lineItemsJson, $receiptImage, $receiptImageType,
                $amount, $paymentMethod, $user['id'], $user['id'],
            ], [9]);
        } else {
            $exists = $db->prepare('SELECT id FROM transactions WHERE id = ?');
            $exists->execute([$id]);
            if (!$exists->fetch()) {
                respond(['error' => 'Ledger entry was not found.'], 404);
            }
            $update = $db->prepare(
                'UPDATE transactions
                 SET entry_date = ?, category = ?, sub_category = ?, description = ?, manual_details = ?, raw_ocr_text = COALESCE(?, raw_ocr_text),
                     corrected_ocr_text = COALESCE(?, corrected_ocr_text), line_items_json = ' . $lineItemsPlaceholder . ',
                     receipt_image = COALESCE(?, receipt_image), receipt_image_type = COALESCE(?, receipt_image_type),
                     amount = ?, payment_method = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?'
            );
            executeStatement($update, [
                $date, $category, $subCategory, $description, $manualDetails, $rawOcrText, $correctedOcrText, $lineItemsJson,
                $receiptImage, $receiptImageType,
                $amount, $paymentMethod, $user['id'], $id,
            ], [8]);
        }
        $statement = $db->prepare(
            'SELECT id, entry_date AS "date", category, sub_category AS "subCategory", description,
                    manual_details AS "manualDetails", raw_ocr_text AS "rawOcrText",
                    corrected_ocr_text AS "correctedOcrText", line_items_json AS "lineItems",
                    CASE WHEN receipt_image IS NOT NULL THEN 1 ELSE 0 END AS "hasReceiptPhoto",
                    amount, payment_method AS method
             FROM transactions WHERE id = ?'
        );
        $statement->execute([$id]);
        $transaction = $statement->fetch();
        $transaction['amount'] = (float) $transaction['amount'];
        $transaction['hasReceiptPhoto'] = (bool) $transaction['hasReceiptPhoto'];
        $transaction['lineItems'] = is_string($transaction['lineItems'])
            ? json_decode($transaction['lineItems'], true, 512, JSON_THROW_ON_ERROR)
            : ($transaction['lineItems'] ?? []);
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
        $statement = $db->prepare('UPDATE organization_settings SET name = ?, fiscal_year_start = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
        $statement->execute([$name, $fiscalYear]);
        $settings = $db->query('SELECT name, fiscal_year_start AS "fiscalYear", currency FROM organization_settings WHERE id = 1')->fetch();
        respond(['org' => $settings]);
    }

    if ($action === 'users') {
        if ($method === 'GET') {
            requireRole($user, ['admin']);
            $accounts = $db->query(
                'SELECT id, name, username, role, created_at AS "createdAt"
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
            if (in_array($error->getCode(), ['23000', '23505'], true)) {
                respond(['error' => 'That username is already in use.'], 409);
            }
            throw $error;
        }
        respond(['success' => true], 201);
    }

    respond(['error' => 'Unknown API action.'], 404);
} catch (PDOException $error) {
    error_log('TechPass database error: ' . $error->getMessage());
    respond(['error' => 'Database request failed. Check the database service and connection settings.'], 500);
} catch (Throwable $error) {
    error_log('TechPass API error: ' . $error->getMessage());
    respond(['error' => 'The server could not complete the request.'], 500);
}
