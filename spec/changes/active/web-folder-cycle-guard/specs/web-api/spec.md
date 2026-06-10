# Web API Delta Spec

## Modified Requirements

### Requirement: Folder parent updates must keep the folder graph acyclic

Normal Web folder update APIs MUST reject parent changes that would make a
folder its own ancestor.

#### Scenario: Folder update sets parent to itself

Given an authenticated user owns a folder
When the user updates that folder with `parentId` equal to the folder id
Then the API returns `422 VALIDATION_ERROR`
And the folder parent remains unchanged.

#### Scenario: Folder update moves a parent under its descendant

Given an authenticated user owns folder A
And folder B is a child or deeper descendant of folder A
When the user updates folder A with `parentId` equal to folder B
Then the API returns `422 VALIDATION_ERROR`
And the folder hierarchy remains acyclic.

### Requirement: Folder parent updates can clear the parent

Normal Web folder update APIs MUST allow moving a nested folder back to the
root by sending `parentId: null`.

#### Scenario: Folder update clears parentId

Given an authenticated user owns folder A
And folder B is a child of folder A
When the user updates folder B with `parentId: null`
Then the API returns `200`
And folder B has no parent.

### Requirement: Folder visibility updates must preserve edge visibility

Normal Web folder update APIs MUST reject visibility-only changes that would
leave a folder and its current parent or direct children with different
visibility values.

#### Scenario: Folder update changes child visibility under existing parent

Given an authenticated admin owns shared folder A
And shared folder B is a child of folder A
When the admin updates folder B with `visibility: private`
Then the API returns `422 VALIDATION_ERROR`
And folder B remains shared.

#### Scenario: Folder update changes parent visibility above existing child

Given an authenticated admin owns private folder A
And private folder B is a child of folder A
When the admin updates folder A with `visibility: shared`
Then the API returns `422 VALIDATION_ERROR`
And folder A remains private.
