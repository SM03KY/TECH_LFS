# READ ME 

## Setup

1. Copy the project into `C:\xampp\htdocs\Tech`.
2. Start **Apache** and **MySQL** in the XAMPP Control Panel.
3. Open `http://localhost/phpmyadmin`, import `api/techpass.sql`, and confirm the `techpass` database and empty tables were created. The schema inserts no users, organization settings, or sample transactions.
4. If your MySQL account is not the XAMPP default `root` account with a blank password, set `TECHPASS_DB_HOST`, `TECHPASS_DB_PORT`, `TECHPASS_DB_NAME`, `TECHPASS_DB_USER`, and `TECHPASS_DB_PASSWORD` in the Apache/PHP environment, or update the local defaults in `api/config.php`.
5. To create the initial Admin account from a command prompt, run `C:\xampp\php\php.exe C:\xampp\htdocs\Tech\setup-admin.php`. It creates the account only when the users table is empty. The account is `admin` with temporary password `ChangeMe123!`; the app requires changing it before access. Do not keep using the temporary password.
6. Alternatively, open `http://localhost/Tech/` and use the one-time Admin setup form to select your own credentials. This creates the Admin account and minimum organization settings; the ledger remains empty. After signing in, use **Org Governance → User accounts** to create Treasurer and Auditor accounts.

If upgrading an existing database, run the following in phpMyAdmin before using the app:

```sql
ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE transactions
    ADD COLUMN manual_details TEXT NULL,
    ADD COLUMN raw_ocr_text TEXT NULL,
    ADD COLUMN receipt_image MEDIUMBLOB NULL,
    ADD COLUMN receipt_image_type VARCHAR(32) NULL;
```

Skip any `ADD COLUMN` for a column that already exists. Manual item/purpose details and OCR text are stored with each transaction; uploaded receipt photos are resized and limited to 3 MB before saving.

The receipt scanner accepts a camera photo or image upload, enhances contrast for OCR, and lets you retake or clear the selected photo. If the receipt is small in the frame, use **Select receipt area** and drag around the printed text before scanning; OCR word highlights are mapped back to the original photo. Cropping cannot restore out-of-focus text, so retake blurry photos. For the best scan, keep the receipt flat, hold the camera steady, tap to focus, and avoid glare. Review flagged or inaccurate fields before posting.

Use the site through Apache (`http://localhost/Tech/`), not by opening `index.html` from the filesystem. PHP must be enabled and `pdo_mysql` must be available.

## Roles

| Role | Access |
|---|---|
| Admin | Manage user accounts and organization settings; create, edit, delete, export, and review financial records. |
| Treasurer | Create, edit, delete, export, and review financial records; use receipt scanning and prepare reports. |
| Auditor | Read-only access to the dashboard, ledger, financial statements, and CSV export. |

Authorization is checked by the PHP API as well as by the interface. Passwords are stored as PHP password hashes; sessions use HTTP-only, same-site cookies and state-changing requests require a CSRF token. The command-line setup account is forced to change its temporary password before other actions are permitted.

## Data and deployment notes

Organization settings, users, and transactions are stored in the configured database (MySQL for XAMPP or PostgreSQL for Render). Fund/project allocation is not required or stored. Existing browser-only data from earlier versions is not imported automatically; export any records you need to retain before switching to the database version.

This configuration is intended for local XAMPP development. Before exposing the app beyond the local machine, use a dedicated MySQL account with a strong password, HTTPS, and suitable web-server access controls. Do not expose phpMyAdmin or development defaults to the public internet.

## Render deployment (free web service and PostgreSQL)

The repository includes a Render Blueprint and Docker setup for deploying the PHP app with a free web service and PostgreSQL database. The container initializes the PostgreSQL schema at startup, and Render provides the database connection settings to the app.

In Render, create a Blueprint from this repository. The web service and database are configured for the Singapore region. Render free web services sleep after inactivity and have an ephemeral filesystem; Render's free PostgreSQL databases expire after 30 days. This is for testing only, not production financial records. Back up any data you want to keep before the database expires.

After the deploy is live, open the service URL and use the one-time setup form to create the first Admin account. The application still supports MySQL locally through XAMPP; the PostgreSQL schema is in `api/techpass-postgres.sql`.
