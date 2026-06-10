# Web API Delta Spec

## Modified Requirements

### Requirement: Media File Names Must Stay Within Filesystem Segment Limits

Web media routes that accept a `:filename` path parameter must reject file names
whose UTF-8 byte length is greater than 240 bytes.

#### Scenario: Oversized media file name is requested

- Given an authenticated user calls a web media read route
- When the `:filename` route parameter is longer than 240 UTF-8 bytes
- Then PromptHub returns `400 BAD_REQUEST`
- And the error message is `Invalid filename: file name is too long`
- And PromptHub does not attempt to treat the value as a valid filesystem media
  path

#### Scenario: File name is at the byte limit

- Given media file-name normalization receives a file name at 240 UTF-8 bytes
- When the name has no path separators, traversal segments, or control
  characters
- Then the normalized name is accepted
