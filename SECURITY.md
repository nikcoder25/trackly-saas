# Security Policy

## Supported Versions

Only the current `main` branch (the version deployed to production) is
supported with security fixes. Older commits and forks are not maintained.

| Version            | Supported |
| ------------------ | --------- |
| `main` (current)   | Yes       |
| Anything else      | No        |

## Reporting a Vulnerability

Please **do not** open a public issue for security reports.

Instead, open a private security advisory on GitHub:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** to start a private advisory.
3. Include reproduction steps, affected endpoints/files, and the impact you
   observed.

We aim to acknowledge new reports within 72 hours and to ship a fix or
mitigation as soon as we have validated the issue.

## Secret Rotation Runbook

Run this procedure after any suspected leak (committed secret, compromised
laptop, third-party breach, departing contributor with prod access, etc.).

### General procedure

For every secret below, follow the same four steps:

1. **Rotate in the provider** - generate a new value in the upstream
   dashboard and revoke or schedule revocation of the old one.
2. **Update the DigitalOcean App Platform env var** - set the new value on
   the production app (and any preview/staging apps that use it).
3. **Redeploy** - trigger a new deploy so running instances pick up the
   rotated value.
4. **Invalidate the old secret** - once the new deploy is healthy, fully
   revoke / delete the previous value upstream so it can no longer be used.

### Secrets we rotate post-incident

| Env var                | Provider / where to rotate                              |
| ---------------------- | ------------------------------------------------------- |
| `DODO_WEBHOOK_SECRET`  | DodoPayments dashboard → Webhooks → rotate signing key  |
| `RESEND_API_KEY`       | Resend dashboard → API Keys → create new, delete old    |
| `NEXTAUTH_SECRET`      | Generate locally (`openssl rand -base64 32`), set in DO |
| `ADMIN_API_TOKEN`      | Generate locally (`openssl rand -hex 32`), set in DO    |
| `SENTRY_AUTH_TOKEN`    | Sentry → Settings → Auth Tokens → revoke + create new   |

Notes:

- Rotating `NEXTAUTH_SECRET` invalidates all existing sessions; users will
  need to sign in again. That is the intended behavior post-incident.
- Rotating `DODO_WEBHOOK_SECRET` requires updating the webhook signing
  secret in the DodoPayments dashboard so future deliveries verify against
  the new value.
- Never commit any of these values. They live only in the provider and in
  the DigitalOcean App Platform env var settings.
