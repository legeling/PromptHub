# PromptHub Web — REST API Design

> **Status**: Draft v1
> **Target**: `apps/web` (Hono + SQLite)
> **Auth**: Username + Password, JWT (access + refresh tokens)

---

## 1. Design Principles

1. **IPC parity**: Every desktop IPC channel that makes sense on the web gets a REST endpoint.
2. **Desktop-only channels are skipped**: Window management, native file dialogs, local platform install, data recovery, master password (replaced by JWT auth).
3. **Standard REST conventions**: `POST` = create, `GET` = read, `PUT` = full/partial update, `DELETE` = remove.
4. **JSON everywhere**: Request/response bodies are `application/json` unless noted (multipart for media upload, SSE for streaming).
5. **Consistent envelope**: All responses follow `{ data, error?, pagination? }`.
6. **Auth required**: All `/api/*` routes require `Authorization: Bearer <token>` except `/api/auth/*`.

---

## 2. Authentication

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `POST` | `/api/auth/register` | Create account (first-run only or if registration enabled) | No |
| `POST` | `/api/auth/login` | Login, returns access + refresh tokens | No |
| `POST` | `/api/auth/refresh` | Refresh access token | Refresh token |
| `POST` | `/api/auth/logout` | Invalidate refresh token | Yes |
| `GET`  | `/api/auth/me` | Get current user info | Yes |
| `PUT`  | `/api/auth/password` | Change password | Yes |

### Token schema

```
Access token:  JWT, 15min TTL, payload { sub: userId, iat, exp }
Refresh token: JWT, 7d TTL, stored in DB for revocation
```

### User table (new)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## 3. Prompts

| Method | Path | Description | IPC Channel |
|--------|------|-------------|-------------|
| `POST`   | `/api/prompts` | Create prompt | `prompt:create` |
| `GET`    | `/api/prompts` | List all prompts (with query params for search/filter) | `prompt:getAll` + `prompt:search` |
| `GET`    | `/api/prompts/:id` | Get prompt by ID | `prompt:get` |
| `PUT`    | `/api/prompts/:id` | Update prompt | `prompt:update` |
| `DELETE`  | `/api/prompts/:id` | Delete prompt | `prompt:delete` |
| `POST`   | `/api/prompts/:id/copy` | Duplicate prompt | `prompt:copy` |

### Query parameters for `GET /api/prompts`

| Param | Type | Description |
|-------|------|-------------|
| `keyword` | string | FTS search keyword |
| `tags` | string (comma-separated) | Filter by tags |
| `folderId` | string | Filter by folder |
| `isFavorite` | boolean | Filter favorites |
| `sortBy` | `title \| createdAt \| updatedAt \| usageCount` | Sort field |
| `sortOrder` | `asc \| desc` | Sort direction |
| `limit` | number | Page size (default 50) |
| `offset` | number | Pagination offset |

### Request/Response bodies

**POST /api/prompts** — Body: `CreatePromptDTO`
```typescript
{
  title: string;           // required
  description?: string;
  promptType?: "text" | "image" | "video";
  systemPrompt?: string;
  systemPromptEn?: string;
  userPrompt: string;      // required
  userPromptEn?: string;
  variables?: Variable[];
  tags?: string[];
  folderId?: string;
  images?: string[];       // filenames referencing uploaded media
  videos?: string[];
  source?: string;
  notes?: string;
}
```

**Response**: `{ data: Prompt }`

**PUT /api/prompts/:id** — Body: `UpdatePromptDTO` (all fields optional)

---

## 4. Prompt Versions

| Method | Path | Description | IPC Channel |
|--------|------|-------------|-------------|
| `GET`    | `/api/prompts/:id/versions` | List all versions | `version:getAll` |
| `POST`   | `/api/prompts/:id/versions` | Create version snapshot | `version:create` |
| `POST`   | `/api/prompts/:id/versions/:versionId/rollback` | Rollback to version | `version:rollback` |
| `GET`    | `/api/prompts/:id/versions/diff` | Diff two versions | `version:diff` |

### Query parameters for diff

| Param | Type | Description |
|-------|------|-------------|
| `from` | number | From version number |
| `to` | number | To version number |

---

## 5. Folders

| Method | Path | Description | IPC Channel |
|--------|------|-------------|-------------|
| `POST`   | `/api/folders` | Create folder | `folder:create` |
| `GET`    | `/api/folders` | List all folders (flat, client builds tree) | `folder:getAll` |
| `PUT`    | `/api/folders/:id` | Update folder | `folder:update` |
| `DELETE`  | `/api/folders/:id` | Delete folder (cascade prompts) | `folder:delete` |
| `PUT`    | `/api/folders/reorder` | Reorder folders | `folder:reorder` |

### Request bodies

**POST /api/folders** — Body: `CreateFolderDTO`
```typescript
{
  name: string;         // required
  icon?: string;        // emoji
  parentId?: string;
  isPrivate?: boolean;
}
```

**PUT /api/folders/reorder** — Body:
```typescript
{
  orders: Array<{ id: string; order: number; parentId?: string }>;
}
```

---

## 6. Skills

| Method | Path | Description | IPC Channel |
|--------|------|-------------|-------------|
| `POST`   | `/api/skills` | Create skill | `skill:create` |
| `GET`    | `/api/skills` | List all skills | `skill:getAll` |
| `GET`    | `/api/skills/:id` | Get skill by ID | `skill:get` |
| `PUT`    | `/api/skills/:id` | Update skill | `skill:update` |
| `DELETE`  | `/api/skills/:id` | Delete skill | `skill:delete` |
| `DELETE`  | `/api/skills` | Delete all skills (with confirmation param) | `skill:deleteAll` |
| `GET`    | `/api/skills/search` | Search skills | `skill:search` |
| `POST`   | `/api/skills/:id/export` | Export skill as SKILL.md | `skill:export` |
| `POST`   | `/api/skills/import` | Import skill from SKILL.md content | `skill:import` |
| `POST`   | `/api/skills/:id/safety-scan` | Run safety scan on skill | `skill:scanSafety` |
| `PUT`    | `/api/skills/:id/safety-report` | Save safety report | `skill:saveSafetyReport` |
| `POST`   | `/api/skills/fetch-remote` | Fetch remote SKILL.md content | `skill:fetchRemoteContent` |

### Excluded (desktop-only)

- `skill:installToPlatform` / `skill:uninstallFromPlatform` — Local IDE installation
- `skill:installMd` / `skill:uninstallMd` / `skill:installMdSymlink` — Local file system
- `skill:scanLocal` / `skill:scanLocalPreview` — Local FS scanning
- `skill:listLocalFiles` / `skill:readLocalFile` / etc. — Local repo FS ops
- `skill:getSupportedPlatforms` / `skill:detectPlatforms` — Native platform detection
- `skill:getRepoPath` / `skill:saveToRepo` / `skill:syncFromRepo` — Local repo sync

---

## 7. Skill Versions

| Method | Path | Description | IPC Channel |
|--------|------|-------------|-------------|
| `GET`    | `/api/skills/:id/versions` | List all versions | `skill:version:getAll` |
| `POST`   | `/api/skills/:id/versions` | Create version snapshot | `skill:version:create` |
| `POST`   | `/api/skills/:id/versions/:versionId/rollback` | Rollback to version | `skill:version:rollback` |
| `DELETE`  | `/api/skills/:id/versions/:versionId` | Delete version | `skill:version:delete` |

---

## 8. Settings

| Method | Path | Description | IPC Channel |
|--------|------|-------------|-------------|
| `GET`  | `/api/settings` | Get all settings | `settings:get` |
| `PUT`  | `/api/settings` | Update settings | `settings:set` |

### Settings shape (server-specific)

Server settings are per-user. The `Settings` interface is reused but some fields are irrelevant:
- **Kept**: `theme`, `language`, `autoSave`, `defaultFolderId`
- **Removed**: `security` (handled by JWT auth), `customSkillPlatformPaths` (desktop-only)

---

## 9. AI Proxy

The server acts as a CORS-free proxy to AI providers, same role as the desktop main process.

| Method | Path | Description | IPC Channel |
|--------|------|-------------|-------------|
| `POST` | `/api/ai/request` | Forward HTTP request to AI provider | `ai:httpRequest` |
| `POST` | `/api/ai/stream` | Forward streaming request (SSE response) | `ai:httpStream` |

### POST /api/ai/request — Body: `AITransportRequest`
```typescript
{
  method: "GET" | "POST";
  url: string;              // AI provider URL
  headers?: Record<string, string>;
  body?: string;
}
```

**Response**: `AITransportResponse`
```typescript
{
  ok: boolean;
  status: number;
  statusText: string;
  body: string;
  headers: Record<string, string>;
  error?: string;
}
```

### POST /api/ai/stream — Body: `AITransportRequest`

**Response**: `text/event-stream` (SSE)
```
data: {"chunk": "Hello"}
data: {"chunk": " world"}
data: [DONE]
```

Error during stream:
```
event: error
data: {"error": "Connection refused"}
```

---

## 10. Media (Images & Videos)

Server stores media as files on disk (in a configurable data directory).

| Method | Path | Description | IPC Channel |
|--------|------|-------------|-------------|
| `POST`   | `/api/media/images` | Upload image (multipart/form-data) | `image:save` |
| `GET`    | `/api/media/images` | List image filenames | `image:list` |
| `GET`    | `/api/media/images/:filename` | Get image file | `image:open` |
| `DELETE`  | `/api/media/images/:filename` | Delete image | — |
| `GET`    | `/api/media/images/:filename/exists` | Check if exists | `image:exists` |
| `GET`    | `/api/media/images/:filename/size` | Get file size | `image:getSize` |
| `POST`   | `/api/media/images/download` | Download from URL (with SSRF protection) | `image:download` |
| `DELETE`  | `/api/media/images` | Clear all images | `image:clear` |
| `POST`   | `/api/media/videos` | Upload video (multipart/form-data) | `video:save` |
| `GET`    | `/api/media/videos` | List video filenames | `video:list` |
| `GET`    | `/api/media/videos/:filename` | Get video file | `video:open` |
| `DELETE`  | `/api/media/videos/:filename` | Delete video | — |
| `GET`    | `/api/media/videos/:filename/exists` | Check if exists | `video:exists` |
| `GET`    | `/api/media/videos/:filename/size` | Get file size | `video:getSize` |
| `DELETE`  | `/api/media/videos` | Clear all videos | `video:clear` |

### Upload format

`POST /api/media/images` — `multipart/form-data` with field `file`.
Returns: `{ data: { filename: string, size: number } }`

### Base64 endpoints (for sync compatibility)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/media/images/:filename/base64` | Read as base64 |
| `POST` | `/api/media/images/base64` | Save from base64 body |
| `GET`  | `/api/media/videos/:filename/base64` | Read as base64 |
| `POST` | `/api/media/videos/base64` | Save from base64 body |

---

## 11. Import / Export

| Method | Path | Description | IPC Channel |
|--------|------|-------------|-------------|
| `GET`  | `/api/export` | Export all data as JSON (`.phub.gz` format) | `export:prompts` |
| `POST` | `/api/import` | Import data from JSON | `import:prompts` |

### Export response

`Content-Type: application/gzip`, `Content-Disposition: attachment; filename="prompthub-backup-{date}.phub.gz"`

### Import body

`multipart/form-data` with field `file` (`.phub.gz` or `.json`).
Returns: `{ data: { prompts: number, folders: number, skills: number } }`

---

## 12. Sync (WebDAV-Compatible)

The server can act as a sync target for the desktop app. It implements the same data format
but exposed as REST endpoints instead of raw WebDAV.

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/sync/manifest` | Get current manifest (file hashes) |
| `GET`  | `/api/sync/data` | Download full backup data (`BackupData` JSON) |
| `PUT`  | `/api/sync/data` | Upload full backup data |
| `GET`  | `/api/sync/status` | Get sync status (last sync time, data hash) |

### Sync flow (desktop → server)

1. Desktop calls `GET /api/sync/manifest` to get server's current file hashes.
2. Desktop compares with local manifest; identifies changed files.
3. Desktop calls `PUT /api/sync/data` with the full `BackupData` payload.
4. Server updates DB + media files, recalculates manifest.

### Sync flow (server → desktop)

1. Desktop calls `GET /api/sync/manifest` to check for changes.
2. If server manifest differs, desktop calls `GET /api/sync/data`.
3. Desktop merges data locally (newer wins by `lastModified`).

### BackupData shape (from existing WebDAV protocol)

```typescript
interface BackupData {
  prompts: Prompt[];
  folders: Folder[];
  versions: PromptVersion[];
  images: Record<string, string>;   // filename → base64
  videos: Record<string, string>;   // filename → base64
  aiConfig: unknown;                // AI model configuration
  settings: Settings;
  skills: Skill[];
  skillVersions: SkillVersion[];
  skillFiles: Record<string, string>; // path → content
}
```

### Manifest shape

```typescript
interface SyncManifest {
  version: 2;
  lastModified: string;  // ISO 8601
  files: Record<string, { hash: string; size: number }>;
}
```

---

## 13. Response Envelope

All responses follow this format:

### Success

```json
{
  "data": { ... },
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0
  }
}
```

### Error

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Prompt not found"
  }
}
```

### Standard error codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `BAD_REQUEST` | Invalid input / validation error |
| 401 | `UNAUTHORIZED` | Missing or invalid token |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Duplicate resource (e.g., username taken) |
| 422 | `VALIDATION_ERROR` | Semantic validation failure |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Server error |

---

## 14. IPC → REST Mapping Summary

### Mapped (42 endpoints)

| Domain | Endpoints | Notes |
|--------|-----------|-------|
| Auth | 6 | New (no IPC equivalent) |
| Prompts | 6 | Direct mapping |
| Prompt Versions | 4 | Nested under prompts |
| Folders | 5 | Direct mapping |
| Skills | 12 | Filtered (no local FS ops) |
| Skill Versions | 4 | Nested under skills |
| Settings | 2 | Simplified (no security/platform paths) |
| AI Proxy | 2 | HTTP + SSE streaming |
| Media | 16 | Images + Videos (file + base64) |
| Import/Export | 2 | Compressed backup format |
| Sync | 4 | WebDAV-compatible protocol |

**Total: ~63 endpoints**

### Skipped (desktop-only, ~20 IPC channels)

- Window management (minimize/maximize/close/fullscreen)
- Native file dialogs (`dialog:selectImage`, `dialog:selectVideo`)
- Platform install/uninstall (`skill:installToPlatform`, `skill:installMd`, etc.)
- Local FS operations (`skill:listLocalFiles`, `skill:readLocalFile`, etc.)
- Local scanning (`skill:scanLocal`, `skill:scanLocalPreview`)
- Data recovery (`data:checkRecovery`, `data:performRecovery`, `data:dismissRecovery`)
- Security master password (replaced by JWT auth)

---

## 15. Server Directory Structure (Planned)

```
apps/web/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point (Hono app + listen)
│   ├── app.ts                # Hono app factory (for testing)
│   ├── config.ts             # Environment config (port, JWT secret, data dir)
│   ├── middleware/
│   │   ├── auth.ts           # JWT verification middleware
│   │   ├── error-handler.ts  # Global error handler
│   │   └── logger.ts         # Request logger
│   ├── routes/
│   │   ├── auth.ts           # /api/auth/*
│   │   ├── prompts.ts        # /api/prompts/*
│   │   ├── folders.ts        # /api/folders/*
│   │   ├── skills.ts         # /api/skills/*
│   │   ├── settings.ts       # /api/settings
│   │   ├── ai.ts             # /api/ai/*
│   │   ├── media.ts          # /api/media/*
│   │   ├── sync.ts           # /api/sync/*
│   │   └── import-export.ts  # /api/import, /api/export
│   ├── services/
│   │   ├── auth.service.ts   # Password hashing, JWT generation
│   │   ├── media.service.ts  # File storage for images/videos
│   │   ├── ai-proxy.service.ts  # HTTP/SSE forwarding
│   │   └── sync.service.ts   # Backup data assembly/restore
│   └── utils/
│       ├── response.ts       # Response envelope helpers
│       ├── validation.ts     # Input validation (Zod schemas)
│       └── ssrf.ts           # SSRF protection for image download
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 16. Dependencies (Planned)

| Package | Purpose |
|---------|---------|
| `hono` | HTTP framework |
| `@hono/node-server` | Node.js adapter for Hono |
| `@prompthub/db` | Database layer (shared with desktop) |
| `@prompthub/shared` | Types and constants |
| `jose` | JWT generation/verification (no native deps) |
| `bcryptjs` | Password hashing (pure JS, no native deps) |
| `zod` | Request body validation |
| `dotenv` | Environment variable loading |
| `uuid` | ID generation (already in @prompthub/db) |
