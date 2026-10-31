# Backend verification HTTP contract

This test contract applies to routes relative to `/api`. It implements the status and envelope choices in the read-only design proposal. The approved feature specification controls product behavior.

| Operation | Success | Expected failure |
| --- | --- | --- |
| GET /auth/state | 200 `{kind:"ok",value:{kind:"setup-required"\|"signed-out"\|"authenticated"\|"disabled",...}}` | 503 temporary-failure |
| POST /auth/setup | 200 `{kind:"ok",value:{confirmation:"setup-inbox"}}` | 400 invalid-input, 403 email-not-allowed, 409 setup-complete, 429 throttled, 503 temporary-failure |
| POST /auth/sign-in | 200 `{kind:"ok",value:{confirmation:"sign-in-inbox"}}` for known and unknown identities | 400 invalid-input, 409 setup-required, 429 throttled, 503 temporary-failure |
| POST /auth/confirm/preview | 200 `{kind:"ok",value:{email,purpose}}`, no cookie | 400 invalid-link or superseded-link, 409 setup-complete |
| POST /auth/confirm | 200 `{kind:"ok",value:{destination:{kind:"dashboard"}}}`, signed cookie after commit | 400 invalid-link or superseded-link, 409 setup-complete, 503 temporary-failure |
| GET /auth/session | 200 `{kind:"ok",value:{user:{id,name,email,authority:"super_user"},expiresAt}}` | 401 unauthenticated, 503 temporary-failure |
| POST /auth/activity | 200 same projected session, renewed cookie | 401 unauthenticated, 503 temporary-failure |
| POST /auth/sign-out | 200 `{kind:"ok",value:{destination:"/sign-in"}}`, cleared cookie | 503 temporary-failure |
| POST /auth/entry | 200 `{kind:"ok",value:{destination}}` | 401 unauthenticated, 403 forbidden, 400 invalid-input |
| GET /development-inbox/messages | 200 `{kind:"ok",value:[...]}`, no-store | 404 disabled |
| POST /development-inbox/messages/:id/open | 200 `{kind:"ok",value:...}`, no-store | 404 disabled |

Disabled mutations and inbox endpoints return 404. Unlisted methods and raw library paths return 404. Requests with disallowed Host or Origin return 403. Missing trusted transport peer never falls back to forwarded headers. Confirmation responses use `Referrer-Policy: no-referrer`.

`invalid-link` and `superseded-link` include `next:"setup"|"sign-in"` according to permanent setup state. Expired and consumed links are invalid. A superseded link is distinct only while unexpired. An otherwise valid losing setup claim returns setup-complete.

Times are Unix milliseconds, controlled by an injected clock. A token is invalid at issuance plus 300000. A session is invalid at its expiry. Foreground activity renews to operation time plus 1209600000; reads do not renew.

Setup and sign-in requests may include optional `returnTo` transport metadata as a `ProtectedDestination` object from the core auth contract. Validate this metadata separately from the strict shared account input schemas. External URLs, unsupported destination kinds, and unsupported page names are invalid input. Capture the destination with the issued link; confirmation accepts the captured token and purpose without resubmitting the destination. The confirmation success above describes the default. With a captured destination, return that destination when authorized at redemption, otherwise `{kind:"dashboard"}`. Preview does not freeze authorization. An authorized requested destination takes priority over onboarding and records it as skipped under R4. These are internal HTTP representations of R4/R5, not additional product behavior.

The real-Postgres fixture initializes the existing content layout independently, opens the real public storage/admission factories, and mounts the real public auth runtime. It obtains tokens from captured mail and cookies only from confirmation. Fault wrappers delegate to the real storage transaction and inbox preparation. They do not implement authentication.

The child launcher is `apps/api/src/features/auth/test-support/server.ts`. Run with Bun development conditions and Node fork IPC. It prints `AIRCASTLE_TEST_URL=http://127.0.0.1:<port>` and sends `{kind:"ready",origin}`. Send `{kind:"advance",milliseconds,id}` to move the shared policy clock forward; it acknowledges `{kind:"advanced",id}`. It constructs explicit test configuration from the environment so development runs compose real storage, admission, and runtime factories independently of the ordinary configuration parser's nonfunctional stub. It adds no HTTP test routes. Backend process tests can also send `{kind:"inbox",id}` and receive `{kind:"inbox",id,entries}` over IPC to read the real in-memory inbox after publication.

These tests are preparation. A status assertion can fail at the first request while later effects remain unreachable. JUnit and the backend report distinguish those assertions from verified behavior. Instance recreation does not prove process/container restart. A wrapper throwing after a commit models unknown acknowledgment but does not prove actual network loss.
