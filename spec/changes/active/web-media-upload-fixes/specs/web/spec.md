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

### Requirement: Media Base64 Upload Request Size Boundary

Self-hosted web media base64 upload routes MUST reject declared oversized
request bodies before parsing JSON.

#### Scenario

- GIVEN an authenticated user uploads media through `/api/media/images/base64`
- WHEN the request declares a `Content-Length` larger than the upload request
  limit
- THEN the API returns `400 BAD_REQUEST`
- AND the response explains that the media upload request body exceeds the size
  limit
- AND no media directory or media file is created

### Requirement: Media Writes Must Not Expose Partial Files

Self-hosted web media upload and remote download writes MUST use a temporary
same-directory file and only publish the final media filename after the write
completes.

#### Scenario

- GIVEN an authenticated user uploads media through `/api/media/images/base64`
- WHEN the media file write is interrupted before the replacement file is
  complete
- THEN the API returns `400 BAD_REQUEST`
- AND the media list does not include a partially written media file

### Requirement: Media Preview Windows Must Not Retain Opener Access

Self-hosted web runtime media preview helpers MUST open image and video preview
tabs without exposing the current application window as `window.opener`.

#### Scenario

- GIVEN the self-hosted web runtime desktop bridge is installed
- WHEN the app opens an image or video media preview in a new tab
- THEN the bridge passes `noopener,noreferrer` to `window.open`
- AND the media filename remains URL-encoded in the preview route

### Requirement: Media Creation Route Guidance

Self-hosted web media creation error guidance MUST point callers to every
supported creation route for that media kind.

#### Scenario

- GIVEN an authenticated user posts directly to `/api/media/videos`
- WHEN the route rejects the unsupported root create request
- THEN the error message mentions both `/api/media/videos/base64` and
  `/api/media/videos/download`

### Requirement: Media Filenames Must Reject Stream Separators

Self-hosted web media filename normalization MUST reject filenames containing
`:` before any filesystem read, write, delete, or sync operation.

#### Scenario

- GIVEN a media upload, read, delete, or sync operation receives a filename
  containing `:`
- WHEN the filename is normalized
- THEN the operation fails with a validation error
- AND no filesystem operation is attempted for the unsafe filename

### Requirement: Media Routes Must Expose Files Only

Self-hosted web media list and single-file routes MUST treat directory entries
as non-media, even when the directory name uses an allowed media extension.

#### Scenario

- GIVEN a user's media directory contains `safe.png` as a regular file
- AND it also contains `nested.png` as a directory
- WHEN the user lists image media
- THEN only `safe.png` is returned
- AND `nested.png` exists checks return false
- AND read, size, and delete requests for `nested.png` return not found
