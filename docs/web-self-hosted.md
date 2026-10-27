# PromptHub Web Self-Hosted

`apps/web` is the lightweight self-hosted web edition of PromptHub.

It is intended for personal use, home lab deployments, or small single-instance setups where users want browser access to their local-first PromptHub workspace without relying on the official cloud product.

It is not the hosted commercial PromptHub Cloud stack. Keep the boundary clear:

- `apps/web`: self-hosted, simple auth, workspace files + SQLite index, user-managed deployment
- `prompthub-cloud`: official hosted SaaS, team/billing/multi-tenant/cloud operations

## Product Scope

This app provides browser-safe workspace capabilities:

- prompts, folders, prompt hierarchy, relations, and output-format sequences
- Skill records, versions, complete package upload, text-file editing and ZIP export
- MCP definitions and Plugin package libraries, metadata, favorites and deletion
- Plugin package backups, version history and rollback
- rules, media, settings, immutable desktop backup, and legacy sync compatibility

Prompt creation and content edits require non-whitespace text in at least one
of `systemPrompt` or `userPrompt`. A system-only Prompt keeps `userPrompt: ""`;
the API still requires a string for that field on creation. Partial updates use
the stored value for any omitted content field and cannot clear the last body.

MCP and Plugin management uses each authenticated user’s existing resource snapshot.
Concurrent library edits use revisions and reject stale writes. Skill package files
remain scoped to that user’s stored packages. Neither self-hosted Web nor Cloudflare
distributes to Agents, scans server directories, creates symlinks, installs over SSH
or executes native commands. Git import is hidden until complete package transport
is supported; local uploads preserve text and binary attachments.

It should not grow cloud-only features such as:

- billing
- team workspaces
- multi-tenant organization management
- hosted object storage orchestration
- cloud admin operations

## Desktop Backup Source

PromptHub Desktop can use this self-hosted web workspace as a personal backup and restore target.

In desktop `Settings -> Data`, configure:

- self-hosted PromptHub URL
- username
- password

Then the current desktop can:

- test the connection
- create a new immutable remote snapshot without changing the live Web workspace
- explicitly restore the latest verified snapshot after creating a local safety snapshot
- create an upload-only snapshot once on startup
- periodically create upload-only snapshots in the background

Current Desktop backups negotiate the server's workspace snapshot protocol before
capture. Compatible application versions may differ; the importer validates the
archive, database and layout versions and migrates older data before replacement.
Automatic tasks upload only and never pull, merge, or replace local data.

## Backup And Legacy Sync Contract

Live automatic sync selects one of `webdav` or `s3`. Self-hosted Web backup is
independent from that selection. The persisted provider type accepts
`self-hosted` for historical settings; current Desktop normalizes it to `manual`.

Authenticated full-backup transport uses `/api/backups/desktop/workspace/:name`.
The server stores opaque chunks and a checksummed manifest under
`DATA_ROOT/backups/workspace/<hashed-user>/`, retaining up to ten published
snapshots. It validates every referenced chunk before publishing the manifest.
Publication uses an ETag precondition; failed uploads cannot replace the previous
backup. Symlink paths are rejected. The live Web database/workspace is unchanged.
The 50 MiB request limit applies per request; Desktop sends 1 MiB chunks, so it
is not a limit on total backup size.

Local full exports and remote backups contain the same consistent SQLite image
and managed data tree, including all business tables, columns, histories and
complete resource packages. New managed data does not require provider-specific
field lists. Cache, logs, recovery copies and device credentials are excluded.
Restore preserves destination credentials and bindings, verifies all bytes,
migrates in a detached candidate, and publishes through a rollback journal.
Empty built-in Rule placeholders do not inflate the displayed saved-Rule count;
they are still preserved in the database image.

Historical desktop envelopes remain readable through the existing routes under
`/api/backups/desktop`; those old clients retain their exact-version checks.
The list includes old and current formats, and explicit restore selects the
latest backup. Older Desktop versions cannot read the new full-snapshot format;
keep an upgrade safety backup before downgrading the application.

Legacy live-sync routes (`PUT /sync/data`, `POST /sync/push`,
`POST /sync/pull`) remain available for older clients. Current self-hosted backup
UI and scheduler do not call them. Their per-domain JSON conversion and partial
import counts do not define the full-snapshot format.

## First-Run Bootstrap

When a new deployment starts with an empty database:

1. The first visit goes to `/setup`, not the login page.
2. The user creates the initial administrator account there.
3. Public registration stays disabled after that first account is created.

## Configuration

Copy the example environment file first:

```bash
cp apps/web/.env.example apps/web/.env
```

Install dependencies from the repository root:

```bash
pnpm install
```

Important variables:

- `JWT_SECRET`: required, at least 32 characters
- `AGENT_SECRET_KEY`: optional 32-byte hex or base64 key. It is required before
  the Web Agent workspace can store Provider credentials or edit native Agent
  config files. Generate one with `openssl rand -hex 32`, keep it stable, and
  back it up separately from `DATA_ROOT`; losing it makes existing encrypted
  credentials and config rollback backups unreadable.
- `DATA_ROOT`: root directory for all PromptHub data (default: `./`). The app writes `data/`, `config/`, `logs/`, and `backups/` under this path.
- `ALLOW_REGISTRATION=false`: keep this disabled; the first admin is created only through `/setup`
- `AUTH_CAPTCHA_ENABLED=true`: keep image captcha enabled by default. For trusted private/LAN personal deployments, set `AUTH_CAPTCHA_ENABLED=false` to remove setup/login captcha.
- `TRUST_PROXY_HEADERS=false`: keep this disabled unless your reverse proxy strips client-supplied forwarding headers and writes trusted `X-Forwarded-For` / `X-Real-IP` values.

### Auth Captcha

PromptHub Web requires an image captcha on setup and login by default. This is the recommended setting for any public or internet-reachable deployment:

```env
AUTH_CAPTCHA_ENABLED=true
```

For trusted private/LAN personal deployments, you can explicitly disable the setup/login captcha:

```env
AUTH_CAPTCHA_ENABLED=false
```

When disabled, `/api/auth/bootstrap` reports `captchaEnabled: false`, the setup/login pages hide the captcha field, and the server accepts register/login requests without `captchaId` or `captchaAnswer`. This switch does not change passwords, JWT cookies, registration policy, or auth rate limits.

## Local Development

When testing Desktop against this server with a live Vite renderer, set
`DESKTOP_DEV_ORIGIN` on the Web server to the exact renderer origin, for example
`http://127.0.0.1:5173`, and restart the server. Only that loopback origin and
port can read API and health/version responses; bearer authentication remains required, and cookie
credentials are not enabled. Leave the variable empty to disable this development
access. Packaged Desktop does not need this setting.

```bash
pnpm dev:web
```

Default ports:

- client: `http://localhost:5174`
- server: `http://localhost:3000`

## Build

```bash
pnpm build:web
pnpm --filter @prompthub/web start
```

Useful root-level commands:

- `pnpm lint:web`
- `pnpm typecheck:web`
- `pnpm test:web -- --run`
- `pnpm verify:web`
- `pnpm docker:web:build`

## Docker

`apps/web` already includes a production `Dockerfile` and ready-to-use compose files.

When the GitHub Release for `v<version>` is published, PromptHub also publishes a
container image to GHCR. Creating a tag or Draft Release does not publish images:

- `ghcr.io/legeling/prompthub-web:<version>`
- `ghcr.io/legeling/prompthub-web:v<version>`
- `ghcr.io/legeling/prompthub-web:latest` for stable tags only

Prerelease tags such as `v0.6.0-beta.1` publish their explicit versioned image
without moving `latest`. Use the explicit prerelease tag for manual beta
testing; production deployments that track `latest` remain on the latest
stable image.

### Quick Start with Docker Compose

```bash
cd apps/web
cp .env.example .env
```

Then edit `.env` and set at least:

```env
JWT_SECRET=replace-with-a-random-secret-at-least-32-chars
AGENT_SECRET_KEY=replace-with-the-output-of-openssl-rand-hex-32
ALLOW_REGISTRATION=false
AUTH_CAPTCHA_ENABLED=true
TRUST_PROXY_HEADERS=false
```

Start the service:

```bash
docker compose up -d --build
```

Default access URL:

- `http://localhost:3871`

The compose file mounts PromptHub-managed data roots so your database, workspace files, and uploaded media stay outside the container.

Each mounted `DATA_ROOT` must be used by one Web server process at a time. The
self-hosted entry point can recover a legacy SQLite lock left by a crashed or
pre-release process, but this is not multi-replica SQLite support; do not scale
multiple containers against the same data volume.

### Deploy from the Published GHCR Image

The `latest` alias below tracks stable releases only.

```bash
docker pull ghcr.io/legeling/prompthub-web:latest
docker run -d \
  --name prompthub-web \
  -p 3871:3000 \
  -e JWT_SECRET='replace-with-a-random-secret-at-least-32-chars' \
  -e AGENT_SECRET_KEY='replace-with-the-output-of-openssl-rand-hex-32' \
  -e ALLOW_REGISTRATION=false \
  -e AUTH_CAPTCHA_ENABLED=true \
  -e TRUST_PROXY_HEADERS=false \
  -v "$(pwd)/apps/web/data:/app/data" \
  -v "$(pwd)/apps/web/config:/app/config" \
  -v "$(pwd)/apps/web/backups:/app/backups" \
  ghcr.io/legeling/prompthub-web:latest
```

You can also deploy directly from the published image with the compose override in `apps/web`.

## Upgrade

If you deploy with Docker Compose:

```bash
cd apps/web
docker compose down
docker compose up -d --build
```

Your data remains intact as long as you keep the same mounted directories.

## Backup

The safest backup strategy is to back up the entire `DATA_ROOT`, not only the SQLite file.

Typical persisted paths include:

- `data/prompthub.db`
- `data/prompts/...`
- `data/skills/...`
- `data/assets/...`
- `config/settings/...`
- `backups/...`
- `logs/...`

## Deployment Notes

- Back up `DATA_ROOT` regularly.
- Treat this app as a user-managed deployment artifact, not as a shared hosted service.
- If you expose it to the public internet, use HTTPS and a reverse proxy in front of it.
- Only set `TRUST_PROXY_HEADERS=true` when that reverse proxy removes untrusted incoming forwarding headers; otherwise auth rate limits intentionally use a coarse fallback client bucket.
- CI selects the self-hosted Web checks from the root verification registry,
  covering lint, typecheck, tests, production build, built-artifact smoke,
  Docker image build, and compose validation.
