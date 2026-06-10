# Web Remote HTTP Stream Size Boundary Spec

## Modified Requirements

### Requirement: Remote streamed responses enforce byte limits

`requestRemoteStream()` MUST enforce `maxBytes` while the returned body is read.
If the remote body exceeds the limit, the stream MUST error with
`Remote response exceeds size limit` and stop reading upstream data.

#### Scenario: Stream exceeds configured size limit

- **GIVEN** a caller requests a remote streamed response with `maxBytes: 4`
- **WHEN** the upstream sends more than four bytes
- **THEN** reading the returned stream fails with
  `Remote response exceeds size limit`

### Requirement: Remote streamed responses preserve existing metadata

`requestRemoteStream()` MUST continue returning status, headers, final URL, and
a readable stream for responses that stay within the byte limit.
