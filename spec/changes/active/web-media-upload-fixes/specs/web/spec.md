# Delta for Self-Hosted Web Media Upload

## MODIFIED Requirements

### Requirement: Web Media Paste Compatibility

The self-hosted web runtime MUST support pasted image uploads even when `crypto.randomUUID()` is unavailable in the browser context.

#### Scenario

- GIVEN the self-hosted web runtime is served from a context without `crypto.randomUUID`
- WHEN the user pastes an image into the prompt editor
- THEN the image save flow still generates a valid file name and succeeds

### Requirement: Internal Network Media URL Guidance

When a self-hosted web user tries to import media from a blocked local-network address, the UI MUST explain that LAN/internal URLs are not supported by the remote fetch flow.

#### Scenario

- GIVEN the user pastes an image URL pointing to a local-network or internal address
- WHEN the remote download is rejected by SSRF protection
- THEN the UI shows a specific explanatory error message instead of a generic upload failure
