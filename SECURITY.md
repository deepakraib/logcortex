# Security Policy

## Reporting a Vulnerability

Please report security issues privately by opening a private advisory or contacting the maintainers through the repository owner profile.

Do not open a public issue for vulnerabilities involving:

- Cross-site scripting or unsafe rendering
- Secret exposure
- Data leakage from parsed logs
- Dependency vulnerabilities
- Unsafe archive or compressed file handling

## Data Handling

LogCortex runs entirely in the browser. Uploaded log files are parsed locally and are not sent to a hosted backend.

- No third-party analytics or font CDNs are loaded by the app (system fonts only).
- A Content-Security-Policy restricts scripts and connections to the app origin.
- HTML exports escape user-controlled fields before writing the report file.
- Optional PII masking redacts IPs, emails, hostnames, and connection strings in the UI and CLI.

## Sensitive Logs

MongoDB logs can contain hostnames, IP addresses, usernames, namespaces, connection strings, and query values. Before sharing screenshots or exports, enable PII masking and review the output.

Do not commit real log files, `.env` files, credentials, or generated reports containing customer data.

Pre-commit hooks (`scripts/check-privacy.sh`, `scripts/check-branding.sh`) block staged log files, home-directory npm prefixes, and private keys.

## Dependency Audits

Run `npm audit` before releases. The project targets zero known vulnerabilities in production dependencies.
