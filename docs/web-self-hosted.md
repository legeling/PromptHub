# PromptHub Web Self-Hosted

`apps/web` is the lightweight self-hosted web edition of PromptHub.

It is intended for personal use, home lab deployments, or small single-instance setups where users want browser access to their local-first PromptHub workspace without relying on the official cloud product.

It is not the hosted commercial PromptHub Cloud stack. Keep the boundary clear:

- `apps/web`: self-hosted, simple auth, workspace files + SQLite index, user-managed deployment
- `prompthub-cloud`: official hosted SaaS, team/billing/multi-tenant/cloud operations

## Product Scope

This app should stay focused on desktop-equivalent core capabilities:

- prompt management
- folders
- skills
- import/export
- sync
- media
- settings

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

Then desktop can:

- test the connection
- upload its current local workspace to PromptHub Web
- download and restore from PromptHub Web
- automatically pull once on startup
- periodically push updates in the background

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
- `DATA_ROOT`: root directory for all PromptHub data (default: `./`). The app writes `data/`, `config/`, `logs/`, and `backups/` under this path.
- `ALLOW_REGISTRATION=false`: keep this disabled; the first admin is created only through `/setup`

## Local Development

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

When a release tag is built in CI, PromptHub also publishes a container image to GHCR:

- `ghcr.io/legeling/prompthub-web:<version-tag>`
- `ghcr.io/legeling/prompthub-web:latest`

### Quick Start with Docker Compose

```bash
cd apps/web
cp .env.example .env
```

Then edit `.env` and set at least:

```env
JWT_SECRET=replace-with-a-random-secret-at-least-32-chars
ALLOW_REGISTRATION=false
```

Start the service:

```bash
docker compose up -d --build
```

Default access URL:

- `http://localhost:3871`

The compose file mounts PromptHub-managed data roots so your database, workspace files, and uploaded media stay outside the container.

### Deploy from the Published GHCR Image

```bash
docker pull ghcr.io/legeling/prompthub-web:latest
docker run -d \
  --name prompthub-web \
  -p 3871:3000 \
  -e JWT_SECRET='replace-with-a-random-secret-at-least-32-chars' \
  -e ALLOW_REGISTRATION=false \
  -v "$(pwd)/apps/web/data:/app/data" \
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
- CI validates the web app with lint, typecheck, tests, production build, Docker image build, and compose validation.
