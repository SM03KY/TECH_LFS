# TechPass on XAMPP

## Setup

1. Copy the project into `C:\xampp\htdocs\Tech`.
2. Start **Apache** and **MySQL** in the XAMPP Control Panel.
3. Open `http://localhost/phpmyadmin`, import `api/schema.sql`, and confirm the `techpass` database and tables were created.
4. If your MySQL account is not the XAMPP default `root` account with a blank password, set `TECHPASS_DB_HOST`, `TECHPASS_DB_PORT`, `TECHPASS_DB_NAME`, `TECHPASS_DB_USER`, and `TECHPASS_DB_PASSWORD` in the Apache/PHP environment, or update the local defaults in `api/config.php`.
5. Open `http://localhost/Tech/`. The first visit prompts you to create the one-time Admin account. After that, sign in and use **Org Governance → User accounts** to create Treasurer and Auditor accounts.

Use the site through Apache (`http://localhost/Tech/`), not by opening `index.html` from the filesystem. PHP must be enabled and `pdo_mysql` must be available.

## Roles

| Role | Access |
|---|---|
| Admin | Manage user accounts and organization settings; create, edit, delete, export, and review financial records. |
| Treasurer | Create, edit, delete, export, and review financial records; use receipt scanning and prepare reports. |
| Auditor | Read-only access to the dashboard, ledger, financial statements, and CSV export. |

Authorization is checked by the PHP API as well as by the interface. Passwords are stored as PHP password hashes; sessions use HTTP-only, same-site cookies and state-changing requests require a CSRF token.

## Data and deployment notes

Organization settings, users, and transactions are stored in MySQL. Fund/project allocation is not required or stored. Existing browser-only data from earlier versions is not imported automatically; export any records you need to retain before switching to the database version.

This configuration is intended for local XAMPP development. Before exposing the app beyond the local machine, use a dedicated MySQL account with a strong password, HTTPS, and suitable web-server access controls. Do not expose phpMyAdmin or development defaults to the public internet.
