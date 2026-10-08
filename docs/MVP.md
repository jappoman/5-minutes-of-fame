# Product and release requirements

## Experience
- Single worldwide stream. Everyone visiting immediately watches whoever is live.
- Viewers never book or reserve. Broadcasters who have passed verification may request the next available turn; FIFO queue for V1.
- Each speaker gets exactly 300 seconds measured and enforced server-side. No extensions or retries after consumption. A disconnected speaker does not recover remaining time.
- Idle stage displays upcoming status, not a prerecorded stream. Nobody gets a preferential rank.
- The broadcaster chooses which *verified* claims to show before going live. Zero fields is valid; all verified fields is valid.
- Email verification requires an email challenge; phone requires an SMS challenge; legal name needs an identity verification provider; residential address needs reliable verification appropriate to the country (a submitted bill alone is not automatically proof).
- Public disclosure of home address/telephone carries severe harassment and doxxing risks. Make such disclosures granular, explicit and revocable before the stream; provide clear warnings; never include hidden fields in response objects.
- Ban from broadcasting after first use, not from watching.

## Technical MVP release gates
1. Real Cognito JWT validation and authorization for every speaker API.
2. External KYC vendor with documented uniqueness/deduplication and legal review, plus manual handling for false positives. Never store raw ID documents in DynamoDB.
3. Per-claim verification status and timestamp from trusted server-side proof provider, plus immutable pre-broadcast disclosure snapshot.
4. DynamoDB conditional transactions for one lifetime entitlement, FIFO queue, stage ownership and expiry.
5. Streaming provider integration: issue publish token only for active turn, server-side revoke/stop after 300 seconds, playback URL for viewers.
6. Immediate suspend/stop endpoint and operator access; basic reporting; rate limiting and logging with personal-data redaction.
7. Privacy policy, retention/deletion policies, vendor DPA, impact assessment where applicable, abuse process and age policy.
8. End-to-end tests including concurrent starts, expired sessions, reconnection, no-shows and disclosure changes.
9. Deployment review before public traffic. This skeleton MUST NOT be advertised as live-ready.

## Cost controls
Keep the frontend static on S3 + CloudFront. Serverless HTTP API + Lambda + DynamoDB on demand. Use EventBridge Scheduler/Step Functions or an expiring lease and controlled worker for turn expiry; never trust browser timers. Cost-test IVS at expected spectator concurrency before enabling a stream. Set AWS budget alarms.

## Current state
Only static welcome UI, minimal API health/stage placeholder, CDK resources and GitHub workflow are scaffolded. No KYC, claims verification, sign-up, queue or live publishing is implemented yet. A minimal skeleton is intentional so an agent cannot accidentally expose unverified user data.
