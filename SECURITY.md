# Security Policy

## Supported Versions
- Only the latest version is actively supported and receives security updates.

## Reporting a Vulnerability
If you discover a security vulnerability, please follow these steps:

1. **Do not disclose publicly.**
2. Contact the maintainer directly via [t.me/Iowcode](https://t.me/Iowcode) or open a private issue (if supported).
3. Provide a detailed description and, if possible, steps to reproduce.
4. Wait for confirmation and coordinated disclosure.

## Security Best Practices
- API Key is required for all sensitive endpoints.
- Timing-safe API key comparison to prevent timing attacks.
- Rate limiting on all endpoints to mitigate brute-force and abuse.
- Input validation and request size limits.
- Helmet and HTTP headers for basic hardening.
- No sensitive data is logged.

## Responsible Disclosure
We appreciate responsible disclosure and will respond promptly to all reports. Thank you for helping keep this project secure.
