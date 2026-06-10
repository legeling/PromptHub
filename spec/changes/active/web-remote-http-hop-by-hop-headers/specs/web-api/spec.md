# Web API Delta Spec

## Modified Requirements

### Requirement: Remote HTTP Requests Must Strip Hop-By-Hop Request Headers

Web remote HTTP helpers must not forward caller-supplied hop-by-hop request
headers to upstream hosts.

#### Scenario: Caller supplies connection-level request headers

- Given a Web feature calls the shared remote HTTP helper with `Connection`,
  `Keep-Alive`, `Proxy-Authorization`, `TE`, `Trailer`, `Transfer-Encoding`, or
  `Upgrade` headers
- When PromptHub opens the upstream request
- Then those headers are not passed to the Node HTTP client
- And safe end-to-end headers are preserved
- And PromptHub still sets `Host` from the validated upstream URL
