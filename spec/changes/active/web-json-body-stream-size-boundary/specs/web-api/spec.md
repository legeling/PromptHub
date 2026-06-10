# Web JSON Body Stream Size Boundary

## Added Requirements

### Requirement: JSON body parsing must enforce size while reading

Web route JSON body parsing MUST enforce a maximum byte count during body
reading, including requests that do not declare `Content-Length`.

#### Scenario: Streamed auth body exceeds the limit

- Given a Web auth endpoint receives a JSON request body without
  `Content-Length`
- When the streamed body grows beyond the configured auth body limit
- Then the API responds with `400 BAD_REQUEST`
- And the auth operation does not mutate tokens or users

### Requirement: Route-specific large body limits must be preserved

Routes that legitimately accept larger JSON or binary payloads MUST pass their
own explicit body limits to the shared reader.

#### Scenario: Sync data keeps the sync import limit

- Given `PUT /api/sync/data` receives a sync import request
- When the request body is within the sync data limit
- Then the route can parse and validate the sync payload normally

#### Scenario: Media base64 keeps the media upload limit

- Given `POST /api/media/images/base64` receives a base64 media upload
- When the request body exceeds the media upload limit while being read
- Then the API responds with `400 BAD_REQUEST`
- And no media file is created

#### Scenario: Multipart import enforces the import limit while streaming

- Given `POST /api/import` receives a multipart ZIP import without
  `Content-Length`
- When the streamed multipart request exceeds the import body limit
- Then the API responds with `400 BAD_REQUEST`
- And no prompts, folders, skills, media, or settings are imported
