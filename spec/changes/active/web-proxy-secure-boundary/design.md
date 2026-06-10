# Design

## Approach

- Add a shared secure-request helper that checks:
  - direct request URL protocol
  - trusted proxy mode plus first `x-forwarded-proto` value
- Use the helper from auth cookie options and security headers.
- Keep cookie deletion behavior unchanged.

## Verification

- Middleware tests cover HSTS behavior with trusted and untrusted forwarded
  proto headers.
- Auth route tests cover `Secure` auth cookies behind trusted proxy HTTPS.
