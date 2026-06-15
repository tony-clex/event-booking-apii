import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function startServer() {
  const server = spawn('node', ['src/server.js'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, PORT: '3000' },
  });

  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.status === 200) break;
    } catch {
      continue;
    }
  }

  return server;
}

function stopServer(server) {
  if (!server || !server.pid || server.killed) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      server.stdout?.destroy();
      server.stderr?.destroy();
      resolve();
    };

    server.once('exit', finish);
    server.kill('SIGTERM');

    setTimeout(() => {
      if (!settled && server.pid) {
        spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    }, 2000);

    setTimeout(finish, 3000);
  });
}

async function request(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

function getTokenUserId(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).id;
}

async function getOwnedEventId(token) {
  const userId = getTokenUserId(token);
  const res = await request('GET', '/api/events', null, token);
  const event = res.data.events.find((item) => item.created_by === userId);

  if (!event) {
    throw new Error('No owned event found for test user');
  }

  return event.id;
}

async function createTestEvent(token, title, totalSeats = 10) {
  const res = await request('POST', '/api/events', {
    title,
    description: 'Temporary test event',
    date: '2026-12-15T10:00:00',
    total_seats: totalSeats,
  }, token);

  if (res.status !== 201) {
    throw new Error(`Failed to create test event: ${res.status} ${JSON.stringify(res.data)}`);
  }

  return res.data;
}

let server;
let aliceToken, bobToken;
const testSuffix = Date.now();

describe('Event Booking API', () => {
  before(async () => {
    server = await startServer();
  });

  after(async () => {
    await stopServer(server);
  });

  describe('Authentication', () => {
    it('should register a new user', async () => {
      const res = await request('POST', '/api/auth/register', {
        username: `testuser-${testSuffix}`,
        email: `test-${testSuffix}@example.com`,
        password: 'password123',
      });
      assert.strictEqual(res.status, 201);
      assert.ok(res.data.token);
      assert.strictEqual(res.data.user.username, `testuser-${testSuffix}`);
    });

    it('should reject duplicate registration', async () => {
      const res = await request('POST', '/api/auth/register', {
        username: `testuser-${testSuffix}`,
        email: `test-${testSuffix}@example.com`,
        password: 'password123',
      });
      assert.strictEqual(res.status, 409);
    });

    it('should login with valid credentials', async () => {
      const res = await request('POST', '/api/auth/login', {
        email: 'alice@example.com',
        password: 'password123',
      });
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.token);
      aliceToken = res.data.token;
    });

    it('should reject invalid login', async () => {
      const res = await request('POST', '/api/auth/login', {
        email: 'alice@example.com',
        password: 'wrongpassword',
      });
      assert.strictEqual(res.status, 401);
    });

    it('should reject short password on register', async () => {
      const res = await request('POST', '/api/auth/register', {
        username: `shortpass-${testSuffix}`,
        email: `short-${testSuffix}@example.com`,
        password: '123',
      });
      assert.strictEqual(res.status, 400);
    });
  });

  describe('Events', () => {
    it('should list public events', async () => {
      const res = await request('GET', '/api/events');
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.events));
    });

    it('should filter events by date range', async () => {
      const res = await request('GET', '/api/events?startDate=2026-07-01&endDate=2026-08-31');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.events.length >= 2);
    });

    it('should get event by id', async () => {
      const listRes = await request('GET', '/api/events');
      const eventId = listRes.data.events[0].id;
      const res = await request('GET', `/api/events/${eventId}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.id, eventId);
    });

    it('should create event when authenticated', async () => {
      const res = await request('POST', '/api/events', {
        title: 'Test Event',
        description: 'A test event',
        date: '2026-12-01T10:00:00',
        total_seats: 50,
      }, aliceToken);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.title, 'Test Event');
    });

    it('should reject unauthenticated event creation', async () => {
      const res = await request('POST', '/api/events', {
        title: 'Unauth Event',
        description: 'Should fail',
        date: '2026-12-01T10:00:00',
        total_seats: 20,
      });
      assert.strictEqual(res.status, 401);
    });

    it('should update event as owner', async () => {
      const eventId = await getOwnedEventId(aliceToken);
      const res = await request('PUT', `/api/events/${eventId}`, {
        title: 'Updated Event',
      }, aliceToken);
      assert.strictEqual(res.status, 200);
    });

    it('should reject past date for event creation', async () => {
      const res = await request('POST', '/api/events', {
        title: 'Past Event',
        description: 'Should fail',
        date: '2020-01-01T10:00:00',
        total_seats: 20,
      }, aliceToken);
      assert.strictEqual(res.status, 400);
    });
  });

  describe('Bookings', () => {
    it('should book seats when available', async () => {
      bobToken = (await request('POST', '/api/auth/login', {
        email: 'bob@example.com',
        password: 'password123',
      })).data.token;

      const event = await createTestEvent(aliceToken, 'Booking Available Test');
      const res = await request('POST', `/api/events/${event.id}/book`, { seats: 2 }, bobToken);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.seats_booked, 2);
    });

    it('should reject insufficient seats', async () => {
      const event = await createTestEvent(aliceToken, 'Insufficient Seats Test', 2);
      const res = await request('POST', `/api/events/${event.id}/book`, { seats: 3 }, bobToken);
      assert.strictEqual(res.status, 409);
    });

    it('should reject duplicate booking', async () => {
      const event = await createTestEvent(aliceToken, 'Duplicate Booking Test');
      const firstRes = await request('POST', `/api/events/${event.id}/book`, { seats: 1 }, bobToken);
      const duplicateRes = await request('POST', `/api/events/${event.id}/book`, { seats: 1 }, bobToken);

      assert.strictEqual(firstRes.status, 201);
      assert.strictEqual(duplicateRes.status, 409);
    });

    it('should list my bookings', async () => {
      const res = await request('GET', '/api/bookings', null, bobToken);
      assert.strictEqual(res.status, 200);
      assert.ok(Array.isArray(res.data.bookings));
      assert.ok(res.data.bookings.length > 0);
    });

    it('should reject unauthenticated booking', async () => {
      const event = await createTestEvent(aliceToken, 'Unauth Booking Test');
      const res = await request('POST', `/api/events/${event.id}/book`, { seats: 1 });
      assert.strictEqual(res.status, 401);
    });

    it('should list bookings as alice', async () => {
      const res = await request('GET', '/api/bookings', null, aliceToken);
      assert.strictEqual(res.status, 200);
    });

    it('should cancel booking and restore seats', async () => {
      const event = await createTestEvent(aliceToken, 'Cancellation Test');
      const availableBefore = event.available_seats;

      const bookingRes = await request('POST', `/api/events/${event.id}/book`, { seats: 1 }, bobToken);
      assert.strictEqual(bookingRes.status, 201);

      const bookedEvent = await request('GET', `/api/events/${event.id}`);
      assert.strictEqual(bookedEvent.data.available_seats, availableBefore - 1);

      const cancelRes = await request('DELETE', `/api/bookings/${bookingRes.data.id}`, null, bobToken);
      assert.strictEqual(cancelRes.status, 200);

      const restoredEvent = await request('GET', `/api/events/${event.id}`);
      assert.strictEqual(restoredEvent.data.available_seats, availableBefore);
    });
  });
});
