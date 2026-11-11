<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit("Run this setup file from the command line.\n");
}

require_once __DIR__ . '/api/config.php';

const INITIAL_ADMIN_USERNAME = 'admin';
const INITIAL_ADMIN_PASSWORD = 'admin@123';

function setupMessage(string $message): void
{
    fwrite(STDOUT, $message . PHP_EOL);
}   

try {
    $db = database();
    $transactionalLock = acquireInitialSetupLock($db);

    try {
        $existingUsers = (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
        if ($existingUsers > 0) {
            throw new RuntimeException('An account already exists. This setup can only be run on an empty users table.');
        }

        if (!$transactionalLock) {
            $db->beginTransaction();
        }
        $statement = $db->prepare(
            "INSERT INTO users (name, username, password_hash, role, must_change_password)
             VALUES ('Administrator', ?, ?, 'admin', 1)"
        );
        $statement->execute([
            INITIAL_ADMIN_USERNAME,
            password_hash(INITIAL_ADMIN_PASSWORD, PASSWORD_DEFAULT),
        ]);
        $settingsSql = isPostgres($db)
            ? "INSERT INTO organization_settings (id, name, fiscal_year_start, currency)
               VALUES (1, 'Organization Ledger', 'January 1', 'PHP')
               ON CONFLICT (id) DO NOTHING"
            : "INSERT INTO organization_settings (id, name, fiscal_year_start, currency)
               VALUES (1, 'Organization Ledger', 'January 1', 'PHP')
               ON DUPLICATE KEY UPDATE id = 1";
        $settings = $db->prepare($settingsSql);
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

    setupMessage('Administrator account created.');
    setupMessage('Username: ' . INITIAL_ADMIN_USERNAME);
    setupMessage('Temporary password: ' . INITIAL_ADMIN_PASSWORD);
    setupMessage('Sign in at http://localhost/Tech/ and change the temporary password before continuing.');
} catch (Throwable $error) {
    fwrite(STDERR, 'Admin setup failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
