# Proposal

## Why

PromptHub Web is often deployed on an internal network for personal use. In that deployment shape, the login/setup image captcha adds friction without adding much practical protection.

The current implementation always requires captcha on setup and login. Users who deploy in a trusted LAN should be able to explicitly disable captcha through an environment variable while public/default deployments keep the existing behavior.

## Scope

- In scope:
  - Add an environment variable to enable/disable Web auth captcha.
  - Apply the switch to `apps/web` server validation and client setup/login UI.
  - Apply the switch to `apps/web-cloudflare` worker auth flow.
  - Document the variable for self-hosted deployments.
- Out of scope:
  - Removing rate limits.
  - Changing password, JWT, cookie, or registration behavior.
  - Adding a settings-page toggle for captcha.

## Risks

- Disabling captcha reduces bot/credential-stuffing friction if the service is exposed publicly.
- Frontend and backend behavior can drift if only one side reads the setting.

## Rollback Thinking

Set `AUTH_CAPTCHA_ENABLED=true` or remove the environment variable to restore the current default behavior.
