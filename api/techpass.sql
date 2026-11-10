CREATE DATABASE IF NOT EXISTS techpass
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE techpass;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'treasurer', 'auditor') NOT NULL,
    must_change_password TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS organization_settings (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    name VARCHAR(160) NOT NULL DEFAULT 'Organization Ledger',
    fiscal_year_start VARCHAR(80) NOT NULL DEFAULT 'January 1',
    currency CHAR(3) NOT NULL DEFAULT 'PHP',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transactions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    entry_date DATE NOT NULL,
    category VARCHAR(20) NOT NULL,
    sub_category VARCHAR(100) NOT NULL,
    description VARCHAR(255) NOT NULL,
    manual_details TEXT NULL,
    raw_ocr_text TEXT NULL,
    receipt_image MEDIUMBLOB NULL,
    receipt_image_type VARCHAR(32) NULL,
    amount DECIMAL(14, 2) NOT NULL,
    payment_method VARCHAR(80) NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    updated_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_transactions_entry_date (entry_date),
    INDEX idx_transactions_category (category),
    CONSTRAINT fk_transactions_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_transactions_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
) ENGINE=InnoDB;
