# Event Booking API

A simple event management and seat booking API built with Node.js, Express, and Supabase PostgreSQL.

## What it does

* User registration and login with JWT authentication
* Create, view, update, and manage events
* Filter events by date range
* Prevent creating events in the past
* Prevent reducing event capacity below the number of seats already booked
* Book seats securely using an atomic database function (when migrations are applied)
* View your own bookings
* Cancel bookings and automatically restore seats
* Basic request validation and error handling
* Protection against overbooking, duplicate bookings, and unauthorized actions

## Tech Stack

* Node.js
* Express
* Supabase (`@supabase/supabase-js`)
* PostgreSQL
* `jsonwebtoken`
* Native Node.js `crypto` module (PBKDF2 password hashing)

## Getting Started

Install dependencies and create your environment file:

bash
npm install
cp .env.example .env


Update the values inside `.env`:

env
DATABASE_URL=postgres://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
JWT_SECRET=<random-string>


## Database Setup

Apply the schema:

bash
npm run migrate


This runs `migrations/001_initial_schema.sql` using `DATABASE_URL`. If `DATABASE_URL` isn't available, the migration script falls back to Supabase's `exec` RPC (when enabled).

## Seed Data

To create sample users and events:

bash
npm run migrate
npm run seed


The seed script creates:

* 3 sample users
* 8 sample events

Sample accounts:

| Email                                             | Password    |
| ------------------------------------------------- | ----------- |
| [alice@example.com](mailto:alice@example.com)     | password123 |
| [bob@example.com](mailto:bob@example.com)         | password123 |
| [charlie@example.com](mailto:charlie@example.com) | password123 |

## Running the API

bash
npm run dev


or

bash
npm start


The server runs on:

text
http://localhost:3000


## Authentication

Protected endpoints require a bearer token:

http
Authorization: Bearer <token>


### Register

http
POST /api/auth/register


Request body:

json
{
  "username": "john",
  "email": "john@example.com",
  "password": "password123"
}


### Login

http
POST /api/auth/login


Request body:

json
{
  "email": "alice@example.com",
  "password": "password123"
}


## Events

### Get Events

http
GET /api/events


Query parameters:

text
startDate=2026-07-01
endDate=2026-08-31
limit=10
offset=0


### Get Event By ID

http
GET /api/events/:id


### Create Event

http
POST /api/events


Request body:

json
{
  "title": "Conference",
  "description": "Annual tech conference",
  "date": "2026-12-01T10:00:00",
  "total_seats": 200
}

Notes:

* Event date must be in the future.
* Authentication is required.

### Update Event

http
PUT /api/events/:id


Request body:

json
{
  "title": "Updated Conference",
  "description": "Updated details",
  "date": "2026-12-02T10:00:00",
  "total_seats": 250
}


Rules:

* Only the event creator can update the event.
* `total_seats` cannot be set below the number of seats already booked.

## Bookings

### Create Booking

http
POST /api/events/:id/book


Request body:

json
{
  "seats": 2
}


### Get My Bookings

http
GET /api/bookings


Optional query parameters:

text
limit=20
offset=0


### Cancel Booking

http
DELETE /api/bookings/:id


Cancelling a booking automatically returns the reserved seats to the event.

## cURL Examples

### Register

bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"john","email":"john@example.com","password":"password123"}'


### Login

bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}'


### List Events

bash
curl http://localhost:3000/api/events?startDate=2026-07-01&endDate=2026-12-31


### Create Event

bash
TOKEN="<login_token>"

curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"New Conference","date":"2026-12-01T10:00:00","total_seats":200}'


### Book Seats

bash
TOKEN="<login_token>"
EVENT_ID="1"

curl -X POST http://localhost:3000/api/events/$EVENT_ID/book \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"seats":2}'


### Get My Bookings

bash
TOKEN="<login_token>"

curl http://localhost:3000/api/bookings \
  -H "Authorization: Bearer $TOKEN"


### Cancel a Booking

```bash
TOKEN="<login_token>"
BOOKING_ID="5"

curl -X DELETE http://localhost:3000/api/bookings/$BOOKING_ID \
  -H "Authorization: Bearer $TOKEN"
```

## Error Responses

| Status Code | Description                                            |
| ----------- | ------------------------------------------------------ |
| 400         | Invalid request data, validation errors, or past dates |
| 401         | Missing, invalid, or expired token                     |
| 403         | User is not allowed to perform the action              |
| 404         | Event or booking not found                             |
| 409         | Duplicate booking or insufficient seats available      |

## Testing

The project uses Node.js's built-in test runner with a real HTTP server loopback.

Run tests with:

```bash
npm test
```

Current test coverage includes:

* Registration and login
* Invalid login attempts
* Protected routes without authentication
* Event creation and updates
* Future date validation
* Owner-only event updates
* Preventing seat reductions below booked capacity
* Successful bookings
* Overbooking prevention
* Duplicate booking prevention
* Booking cancellation
* Event filtering and pagination

## Project Structure

```text
src/
  config/
    database.js

  middleware/
    auth.js
    errorHandler.js

  controllers/
    authController.js
    eventController.js
    bookingController.js

  routes/
    auth.js
    events.js
    bookings.js

  utils/
    crypto.js

  server.js

  scripts/
    seed.js
    apply-migration.js

migrations/
  001_initial_schema.sql

tests/
  api.test.js
```
