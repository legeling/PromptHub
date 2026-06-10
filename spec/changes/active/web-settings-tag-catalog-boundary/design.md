# Design

## Overview

Add a dedicated tag catalog schema for live Web settings updates. The route keeps using the existing strict settings object schema, but `promptTagCatalog` becomes a bounded array of trimmed, non-empty strings.

## Affected Areas

- Data model: no SQLite schema change.
- API / contracts: `PUT /api/settings` returns `422 VALIDATION_ERROR` for empty, overlong, or oversized prompt tag catalogs.
- Filesystem / sync: rejected live settings updates do not write the settings JSON file or database settings rows.
- UI / UX: valid tag catalogs continue to read/write through the same settings route.

## Tradeoffs

- The route rejects invalid entries instead of silently filtering them, so clients see clear feedback when their settings payload is malformed.
- This narrow fix only covers the tag catalog. Other settings arrays/records remain candidates for later audits.
