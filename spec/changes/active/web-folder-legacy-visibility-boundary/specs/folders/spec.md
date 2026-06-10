# Web Folder Legacy Visibility Boundary

## Modified Requirements

### Requirement: Legacy folder privacy input maps to one visibility source of truth

The Web folder API MUST keep the current `visibility` field and legacy
`isPrivate` field coherent. When both are supplied, `visibility` is authoritative.
When only `isPrivate` is supplied, `isPrivate: false` means `shared` and
`isPrivate: true` means `private`.

#### Scenario: Legacy shared create is admin-only and persists coherent state

- Given an authenticated admin sends a create-folder request with
  `isPrivate: false` and no `visibility`
- When the folder is created
- Then the response reports `visibility: "shared"`
- And the response reports `isPrivate: false`

#### Scenario: Legacy shared update persists coherent state

- Given an authenticated admin owns a private folder
- When the admin updates it with `isPrivate: false` and no `visibility`
- Then the response reports `visibility: "shared"`
- And the response reports `isPrivate: false`

#### Scenario: Legacy shared requests still require admin permission

- Given an authenticated normal user sends `isPrivate: false` without
  `visibility`
- When the user creates or updates a folder
- Then the API rejects the shared visibility request with `403 FORBIDDEN`
