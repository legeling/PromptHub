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

This is intended as a simpler alternative to WebDAV for single-user setups where you want one browser-accessible backup workspace.

## First-Run Bootstrap

When a new deployment starts with an empty database:

1. The first visit goes to `/setup`, not the login page.
2. The user creates the initial administrator account there.
3. Public registration stays disabled after that first account is created.

This behavior is intentional. `apps/web` is for self-hosted personal use, not for running a public multi-user signup flow.

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

`apps/web` already includes a production [Dockerfile](./Dockerfile) and a ready-to-use [docker-compose.yml](./docker-compose.yml).

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

The compose file mounts:

- `./data -> /app/data` (prompt, skill, asset files)
- `./config -> /app/config` (per-user settings, device registry)
- `./logs -> /app/logs` (diagnostic logs)

That means your SQLite database, workspace files, and uploaded media stay on disk outside the container.

### Deploy from the Published GHCR Image

If you don't want to build locally, you can pull the published image directly:

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

You can also deploy directly from the published image with the included compose override:

```bash
cd apps/web
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.ghcr.yml up -d
```

### Quick Start with Plain Docker

```bash
docker build -f apps/web/Dockerfile -t prompthub-web .
docker run -d \
  --name prompthub-web \
  -p 3871:3000 \
  -e JWT_SECRET='replace-with-a-random-secret-at-least-32-chars' \
  -e ALLOW_REGISTRATION=false \
  -v "$(pwd)/apps/web/data:/app/data" \
  prompthub-web
```

## Upgrade

If you deploy with Docker Compose, upgrades are straightforward:

```bash
cd apps/web
docker compose down
docker compose up -d --build
```

Your data remains intact as long as you keep the same mounted `./data` directory.

What is stored there:

- `data/prompthub.db`
- `data/prompts/<folder>/...`  (prompt `.md` files + per-folder `_folder.json`)
- `data/prompts/.versions/<promptId>/...`  (version snapshots)
- `data/skills/<skill-slug>__<skillId>/`
- `data/assets/<userId>/images/...`
- `data/assets/<userId>/videos/...`
- `config/settings/<userId>.json`
- `backups/`  (pre-upgrade snapshots)

The database layer also creates a timestamped pre-migration backup before schema changes when possible.

## Backup

The safest backup strategy is to back up the entire `DATA_DIR`, not only the SQLite file.

For the compose example above, back up:

```bash
apps/web/data
```

That preserves:

- the SQLite index (`data/prompthub.db`)
- prompt and folder files (`data/prompts/`)
- skill files and versions (`data/skills/`)
- per-user settings (`config/settings/`)
- uploaded media (`data/assets/`)
- upgrade backups (`backups/`)

## Deployment Notes

- Back up `DATA_ROOT` (or the mounted `./data` + `./config` directories) regularly.
- Treat this app as a user-managed deployment artifact, not as a shared hosted service.
- If you expose it to the public internet, use HTTPS and a reverse proxy in front of it.
- CI validates the web app with lint, typecheck, tests, production build, Docker image build, and `docker compose config`.
- Release tags publish a ready-to-run image to GHCR and keep a Docker image archive as a workflow artifact.
