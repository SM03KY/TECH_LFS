<?php
declare(strict_types=1);

function database(): PDO
{
    $host = getenv('TECHPASS_DB_HOST') ?: '127.0.0.1';
    $port = getenv('TECHPASS_DB_PORT') ?: '3306';
    $name = getenv('TECHPASS_DB_NAME') ?: 'techpass';
    $user = getenv('TECHPASS_DB_USER') ?: 'root';
    $password = (string) (getenv('TECHPASS_DB_PASSWORD') ?: '');

    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    return new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}
