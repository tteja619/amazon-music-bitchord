# Amazon authorization adapter requirements

This folder is reserved for the Amazon-approved authorization implementation.

No OAuth endpoints, request parameters, token response fields, scopes, or refresh rules are hard-coded here because the official Amazon Music Web API is closed beta and the project has not been granted its API contract.

When Amazon grants access, implement only the flow documented for this application:

1. Use the exact authorization and token endpoints, scopes, and grant types in the approved Amazon documentation.
2. Keep client secrets and refresh tokens in Cloudflare Worker secrets, never in Git, client-side code, logs, or BitChord manifest fields.
3. Validate token expiry and refresh only through the documented token endpoint.
4. Keep access tokens in memory for the request lifecycle where practical. Do not expose tokens in addon responses or URLs.
5. Restrict outbound requests to the documented Amazon API origin. Do not create an open proxy.
6. Redact authorization headers and token values from logs.
7. Fail closed when credentials are absent, expired, revoked, or unauthorized.

Do not infer that Login with Amazon credentials automatically grant Amazon Music catalogue or playback permissions. The approved Music API contract must explicitly grant the required access.
