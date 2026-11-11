<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit("Run this migration from the command line.\n");
}

require_once __DIR__ . '/config.php';

try {
    $db = null;
    for ($attempt = 1; $attempt <= 12; $attempt++) {
        try {
            $db = database();
            break;
        } catch (PDOException $error) {
            if ($attempt === 12) {
                throw $error;
            }
            fwrite(STDERR, "Database is not ready (attempt {$attempt}/12); retrying in 5 seconds.\n");
            sleep(5);
        }
    }

    if (!$db || !isPostgres($db)) {
        throw new RuntimeException('Automatic schema setup is only available for PostgreSQL.');
    }

    $schema = file_get_contents(__DIR__ . '/techpass-postgres.sql');
    if ($schema === false) {
        throw new RuntimeException('Could not read the PostgreSQL schema file.');
    }

    $db->beginTransaction();
    try {
        foreach (array_filter(array_map('trim', explode(';', $schema))) as $statement) {
            $db->exec($statement);
        }
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $error;
    }
    fwrite(STDOUT, "PostgreSQL schema is ready.\n");
} catch (Throwable $error) {
    fwrite(STDERR, 'Database schema setup failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
