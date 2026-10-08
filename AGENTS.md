# Agent instructions

Project: 5 Minutes of Fame. Repo role: frontend + backend + infra.
AWS default region: eu-west-1. Environments: dev only until production is explicitly authorized.

## Product invariants
- One worldwide live stage, five minutes per person, once in a lifetime.
- Viewers do not reserve slots or need accounts. Broadcasters join a FIFO queue and become eligible only after identity verification.
- Verified personal information is private by default. Every displayed field requires independent verification and explicit disclosure consent for that broadcast.
- Never treat Cognito signup, an email string, an unverified claim or a mocked KYC result as proof of real-world identity.
- Only the backend can grant stage access, set a start/end time, and mark a lifetime entitlement consumed. Client clocks are decorative.
- Never expose personal data, identity documents or KYC provider details through public APIs or logs.
- Do not enable real public livestreaming until identity, deduplication, abuse controls, takedown and incident processes work.

## Working rules
- Read the affected code, tests, CDK and workflows before editing.
- Keep frontend/, backend/, infra/ separated, TypeScript first, minimal AWS services.
- Use DynamoDB conditional writes or transactions for race-sensitive operations.
- Do not add domains, SQL databases or custom video infrastructure without evidence they are necessary.
- Keep provider integrations behind interfaces; do not pretend that scaffolding is a live implementation.
- Run npm build/type checks before committing where possible.
- GitHub main deploys via OIDC only when AWS_ROLE_ARN repository variable is configured. No long-lived AWS keys.
- Verify AWS account/region before deployment; do not edit production.
- In final report state exactly what is implemented, tested and still blocked.

## Next work
Implement Cognito authorization, verified claims adapter with deduplication, stage queue with atomic lease, IVS streaming, viewer player, pre-live consent, emergency stop and tests. Read docs/MVP.md.
