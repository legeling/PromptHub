# Proposal

## Why

`GET /api/prompts` returned `pagination.total` from the number of prompts in the
current page. When callers requested `limit` and more matching prompts existed,
the response made the current page look like the full result set, which breaks
pagination controls and "next page" decisions.

## Scope

- In scope:
  - Return prompt list `pagination.total` as the filtered result count before
    limit/offset are applied.
  - Preserve existing filtering, sorting, and page item behavior.
  - Add a route regression for page size smaller than total matches.
- Out of scope:
  - Rewriting prompt list filtering into SQL.
  - Changing the maximum `limit` value.
  - Changing desktop prompt list pagination.

## Risks

Clients that were treating `pagination.total` as page length may need to use
`data.length` for that value. The API shape already names the field `total`, so
the corrected behavior is the safer contract.

## Rollback Thinking

Rollback is limited to returning page-length totals again and removing the
regression test. No data migration is involved.
