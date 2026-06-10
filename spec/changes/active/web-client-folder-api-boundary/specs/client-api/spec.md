# Web Client Folder API Boundary

## Modified Requirements

### Requirement: Client folder creation supports nested folders

The Web client API wrapper for folder creation MUST expose the backend
`parentId` create-field so client code can create child folders through the same
wrapper used for root folders.

#### Scenario: Client creates a child folder

- Given client code calls `createFolder()` with `parentId`
- When the wrapper sends the request
- Then the JSON request body includes `parentId`
- And the route remains responsible for validating ownership and visibility
