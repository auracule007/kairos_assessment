# Job Application State Machine (NestJS + Prisma)

This project implements a job application workflow with strict status transitions, audit logging, role-based security, contract email notifications, and CI automation.

## Features Implemented

- State machine flow with controlled transitions:
  - `APPLIED -> INTERVIEWING -> CONTRACTED -> COMPLETED`
  - `CLOSED` as a terminal state that can be reached from earlier statuses.
- Prisma data model:
  - `Application` table with status enum.
  - `StatusHistory` table for audit trail.
- Transactional audit trail:
  - Every status change writes `previousStatus`, `newStatus`, `changedBy`, `createdAt`, and optional `metadata` in the same DB transaction.
- API endpoints:
  - `POST /api/auth/token`
  - `PATCH /api/applications/:id/status`
  - `GET /api/applications/:id/history`
  - `POST /api/applications` (helper endpoint for creating test data)
- Security:
  - JWT auth guard validates bearer token and extracts `sub` + `role` claims.
  - Only `COMPANY` or `ADMIN` can move to `INTERVIEWING` or `CONTRACTED`.
- Validation:
  - Transition to `CONTRACTED` is blocked unless `contractUrl` exists.
- Email integration:
  - Resend API integration for contracted notifications.
  - Retry logic with exponential backoff + error handling.
- CI:
  - GitHub Actions workflow to run install, lint, test, and build on push/PR.

## Tech Stack

- NestJS
- Prisma ORM
- PostgreSQL
- Jest
- ESLint
- GitHub Actions

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

```bash
cp .env.example .env
```

3. Update `DATABASE_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `JWT_SECRET` in `.env`.

4. Generate Prisma client:

```bash
npx prisma generate
```

5. Create and apply migration:

```bash
npx prisma migrate dev --name init_job_application_state_machine
```

6. Start the app:

```bash
npm run start:dev
```

## API Usage

### 1) Create application (helper)

`POST /api/applications`

```json
{
  "candidateEmail": "candidate@example.com"
}
```

### 2) Transition application status

`PATCH /api/applications/:id/status`

Required headers:
- `Authorization: Bearer <JWT_TOKEN>`

Required JWT claims:
- `sub` (user id)
- `role` (`ADMIN`, `COMPANY`, or `CANDIDATE`)

Request body example:

```json
{
  "newStatus": "CONTRACTED",
  "contractUrl": "https://contracts.example.com/offer/1",
  "metadata": {
    "source": "manual-review"
  }
}
```

### 3) Issue JWT token

`POST /api/auth/token`

```json
{
  "userId": "admin-1",
  "role": "ADMIN"
}
```

### 4) Fetch status history

`GET /api/applications/:id/history`

## Payloads To Test

Use these request bodies for demo/testing.

### A) Move APPLIED -> INTERVIEWING (allowed for ADMIN/COMPANY)

```json
{
  "newStatus": "INTERVIEWING",
  "metadata": {
    "note": "candidate passed CV screening"
  }
}
```

### B) Move INTERVIEWING -> CONTRACTED (requires valid contractUrl)

```json
{
  "newStatus": "CONTRACTED",
  "contractUrl": "https://contracts.example.com/offer/123",
  "metadata": {
    "approvedBy": "hr-lead"
  }
}
```

### C) Move CONTRACTED -> COMPLETED

```json
{
  "newStatus": "COMPLETED",
  "metadata": {
    "completedAt": "2026-03-11T10:00:00.000Z"
  }
}
```

### D) Negative test: CONTRACTED without contractUrl (should fail 400)

```json
{
  "newStatus": "CONTRACTED"
}
```

### E) Negative test: invalid contractUrl (should fail 400)

```json
{
  "newStatus": "CONTRACTED",
  "contractUrl": "invalid-url"
}
```

## How To Test End-To-End

1. Start API:

```bash
npm run start:dev
```

2. Create an application:

```bash
curl -X POST http://localhost:3000/api/applications \
  -H "Content-Type: application/json" \
  -d '{"candidateEmail":"candidate@example.com"}'
```

3. Save returned `id` as the application id.

4. Issue an access token (example: ADMIN):

```bash
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"admin-1","role":"ADMIN"}'
```

5. Save `accessToken` as `TOKEN` and transition (example: INTERVIEWING):

```bash
curl -X PATCH http://localhost:3000/api/applications/<APPLICATION_ID>/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"newStatus":"INTERVIEWING","metadata":{"source":"curl"}}'
```

6. Transition to CONTRACTED with a valid URL:

```bash
curl -X PATCH http://localhost:3000/api/applications/<APPLICATION_ID>/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"newStatus":"CONTRACTED","contractUrl":"https://contracts.example.com/offer/123"}'
```

7. Verify audit trail:

```bash
curl http://localhost:3000/api/applications/<APPLICATION_ID>/history
```

8. Validate security rule (expect 403):

```bash
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"candidate-1","role":"CANDIDATE"}'
```

Use the candidate token as `Authorization: Bearer <CANDIDATE_TOKEN>` and repeat restricted transitions.

9. Validate contract rule (expect 400): send CONTRACTED payload without `contractUrl`.

## Full Manual Test Checklist

Run the checks below in sequence to fully verify behavior after JWT auth changes.

1. Start API with env configured (`DATABASE_URL`, `JWT_SECRET`, and email envs):

```bash
npm run start:dev
```

2. Create actor tokens:

```bash
curl -X POST http://localhost:3000/api/auth/token -H "Content-Type: application/json" -d '{"userId":"admin-1","role":"ADMIN"}'
curl -X POST http://localhost:3000/api/auth/token -H "Content-Type: application/json" -d '{"userId":"company-1","role":"COMPANY"}'
curl -X POST http://localhost:3000/api/auth/token -H "Content-Type: application/json" -d '{"userId":"candidate-1","role":"CANDIDATE"}'
```

3. Create one application:

```bash
curl -X POST http://localhost:3000/api/applications \
  -H "Content-Type: application/json" \
  -d '{"candidateEmail":"candidate@example.com"}'
```

4. Positive auth + authorization path:
   - ADMIN token can move `APPLIED -> INTERVIEWING`.
   - ADMIN token can move `INTERVIEWING -> CONTRACTED` with valid `contractUrl`.
   - ADMIN token can move `CONTRACTED -> COMPLETED`.

5. Negative auth checks:
   - Missing `Authorization` header returns `401`.
   - Invalid/expired bearer token returns `401`.

6. Negative role check:
   - CANDIDATE token attempting `APPLIED -> INTERVIEWING` returns `403`.

7. Negative business rule checks:
   - CONTRACTED without `contractUrl` returns `400`.
   - CONTRACTED with malformed URL returns `400`.

8. Audit trail check:

```bash
curl http://localhost:3000/api/applications/<APPLICATION_ID>/history
```

Confirm each successful transition created one history row with `changedBy` matching the JWT `sub` claim.

## Running Tests

```bash
npm run test
npm run test:cov
```

Coverage target for interview requirement is 70%+.

## CI/CD

GitHub Actions workflow file:

- `.github/workflows/test.yml`

Workflow steps:
- `npm install`
- `npm run lint`
- `npm run test`
- `npm run build`

## Postman Collection

Import this file in Postman:

- `postman/jobapp_state_machine.postman_collection.json`

## Environment Variables

See `.env.example` for required variables:

- `DATABASE_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `EMAIL_MAX_RETRIES`
- `JWT_SECRET`
- `PORT`
