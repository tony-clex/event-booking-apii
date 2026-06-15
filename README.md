# Event Booking API

Node.js + Express API for event management and seat bookings powered by Supabase PostgreSQL.

## Features

- **Authentication**: JWT-based auth (register / login)
- **Events (CRUD)**: Filter by date range, enforce future dates, prevent reducing seats below booked
- **Bookings (protected)**: Reserve seats with an atomic database function when migrations are applied, list own bookings, cancel and restore seats
- **Validation**: Basic input validation, weak-password minimum length, expired/invalid token handling
- **Edge cases handled**: No overbooking via conditional seat reservation, duplicate booking guard, authorization checks (403)

## Tech Stack

- Node.js (native `crypto` for PBKDF2 password hashing)
- Express for routing
- Supabase (`@supabase/supabase-js`) for PostgreSQL access
- `jsonwebtoken` for JWT signing/verification

## Local Setup

```bash
npm install
cp .env.example .env
```

Replace the `.env` values:

```env
DATABASE_URL=postgres://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
JWT_SECRET=<random-string>
```

### Apply Database Schema

Run `npm run migrate` to apply `migrations/001_initial_schema.sql` through `DATABASE_URL`. If `DATABASE_URL` is not set, the script falls back to Supabase's `exec` RPC when enabled.

### Seed Sample Data

```bash
npm run migrate
npm run seed
```

Creates 3 sample users and 8 sample events.
Sample credentials: `alice@example.com`, `bob@example.com`, `charlie@example.com` (password: `password123`).

### Run Server

```bash
npm run dev   # watcher
npm start     # once
```

Server starts at `http://localhost:3000`.

## API Endpoints

All protected routes require header:
```
Authorization: Bearer <token>
```

### Auth

```
POST /api/auth/register
Body: { username, email, password }

POST /api/auth/login
Body: { email, password }
```

### Events

```
GET /api/events
  ?startDate=2026-07-01&endDate=2026-08-31&limit=10&offset=0

GET /api/events/:id

POST /api/events
Body: { title, description, date (future), total_seats }

PUT /api/events/:id
Body: { title, description?, date?, total_seats? }
  Only created_by can update. Can't set total_seats below booked.
```

### Bookings

```
POST /api/events/:id/book
Body: { seats }

GET /api/bookings
  ?limit=20&offset=0

DELETE /api/bookings/:id
```

## cURL Examples

### Register

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"john","email":"john@example.com","password":"password123"}'
```

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}'
```

### List Events

```bash
curl http://localhost:3000/api/events?startDate=2026-07-01&endDate=2026-12-31
```

### Create Event

```bash
TOKEN="<login_token>"
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"New Conference","date":"2026-12-01T10:00:00","total_seats":200}'
```

### Book Seats

```bash
TOKEN="<login_token>"
EVENT_ID="1"
curl -X POST http://localhost:3000/api/events/$EVENT_ID/book \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"seats":2}'
```

### My Bookings

```bash
TOKEN="<login_token>"
curl http://localhost:3000/api/bookings \
  -H "Authorization: Bearer $TOKEN"
```

### Cancel Booking

```bash
TOKEN="<login_token>"
BOOKING_ID="5"
curl -X DELETE http://localhost:3000/api/bookings/$BOOKING_ID \
  -H "Authorization: Bearer $TOKEN"
```

## Error Handling

| Code | Scenario |
|------|----------|
| 400 | Validation / invalid input / past date |
| 401 | Missing / invalid / expired token |
| 403 | Not event owner / not booking owner |
| 409 | Insufficient seats / duplicate booking |
| 404 | Event or booking not found |

## Testing

Uses built-in `node:test` runner and a real HTTP server loopback.

```bash
npm test
```

Tests cover:

- Register / login (success and failure)
- Protected endpoints without token
- Event CRUD (future-date validation, owner-only updates, seat-cannot-go-below-booked)
- Booking flow (success, overbooking, duplicate booking, cancellation)
- Date-range filtering and pagination parameters

## Architecture

```
src/
  config/database.js           # Supabase client
  middleware/
    auth.js                    # JWT verification
    errorHandler.js            # Centralized error response
  controllers/
    authController.js          # register / login
    eventController.js         # events CRUD
    bookingController.js       # book / list / cancel
  routes/
    auth.js / events.js / bookings.js
  utils/
    crypto.js                  # pbkdf2 hashing + jwt token helpers
  server.js                    # Express app entrypoint
  scripts/seed.js              # seed users + events
  scripts/apply-migration.js   # optional migration helper
migrations/
  001_initial_schema.sql       # Supabase SQL schema and atomic booking RPCs
tests/
  api.test.js                  # integration tests
```