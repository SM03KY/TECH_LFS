<?php
declare(strict_types=1);

function database(): PDO
{
    if (getenv('APP_ENV') === 'production') {
        $required = [
            'TECHPASS_DB_DRIVER',
            'TECHPASS_DB_HOST',
            'TECHPASS_DB_PORT',
            'TECHPASS_DB_NAME',
            'TECHPASS_DB_USER',
            'TECHPASS_DB_PASSWORD',
        ];
        $missing = array_filter($required, static fn (string $key): bool => getenv($key) === false || getenv($key) === '');
        if ($missing !== []) {
            throw new RuntimeException('Missing required database environment variables: ' . implode(', ', $missing));
        }
    }

    $driver = getenv('TECHPASS_DB_DRIVER') ?: 'mysql';
    if (!in_array($driver, ['mysql', 'pgsql'], true)) {
        throw new RuntimeException('TECHPASS_DB_DRIVER must be either mysql or pgsql.');
    }

    $host = getenv('TECHPASS_DB_HOST') ?: '127.0.0.1';
    $port = getenv('TECHPASS_DB_PORT') ?: ($driver === 'pgsql' ? '5432' : '3306');
    $name = getenv('TECHPASS_DB_NAME') ?: 'techpass';
    $user = getenv('TECHPASS_DB_USER') ?: 'root';
    $password = (string) (getenv('TECHPASS_DB_PASSWORD') ?: '');

    $dsn = $driver === 'pgsql'
        ? "pgsql:host={$host};port={$port};dbname={$name}"
        : "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    return new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function isPostgres(PDO $db): bool
{
    return $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'pgsql';
}

function acquireInitialSetupLock(PDO $db): bool
{
    if (isPostgres($db)) {
        $db->beginTransaction();
        $db->query('SELECT pg_advisory_xact_lock(92648112)');
        return true;
    }

    $lockResult = (int) $db->query("SELECT GET_LOCK('techpass_initial_setup', 10)")->fetchColumn();
    if ($lockResult !== 1) {
        throw new RuntimeException('Could not lock initial setup. Please try again.');
    }
    return false;
}

function releaseInitialSetupLock(PDO $db, bool $transactionalLock): void
{
    if (!$transactionalLock) {
        $db->query("SELECT RELEASE_LOCK('techpass_initial_setup')");
    }
}
