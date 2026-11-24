# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's "Report a vulnerability" button on the Security tab of this repository. Do not open a public issue. You can expect an acknowledgement within a few days.

## Design notes

- Transcripts are parsed in the browser and are not sent anywhere unless the user runs the AI review.
- The AI review sends a summary, not the transcript. Detected secrets are replaced with `[REDACTED]` before sending, and the user can inspect the exact payload first.
- User API keys are kept in React state only, sent once to `/api/review` and on to Anthropic, and never stored or logged. Error responses never echo the key.
- `/api/review` rejects bodies over 64 KB, validates input with Zod, and rate limits the optional shared server key to 5 requests per hour per IP. The limiter is in memory and per instance; put a platform rate limit or WAF in front of it for production traffic.
- Transcript content is rendered as text only, with ANSI and control characters stripped.
- `next.config.ts` sets a Content Security Policy (`default-src 'self'`, `connect-src 'self'`, `frame-ancestors 'none'`), HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy`. `script-src` includes `'unsafe-inline'` because the pages are statically prerendered and Next.js inlines its bootstrap scripts; nonce-based CSP would require dynamic rendering.

## Supported versions

Only the latest release on the default branch receives fixes.
