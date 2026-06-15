const BASE = 'http://127.0.0.1:3000';

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

async function main() {
  console.log('\n=== 1. LOGIN (alice@example.com / password123) ===');
  let r = await req('POST', '/api/auth/login', { email: 'alice@example.com', password: 'password123' });
  console.log(`Status: ${r.status}`);
  console.log(JSON.stringify(r.data, null, 2));
  const aliceToken = r.data.token;

  console.log('\n=== 2. LOGIN (bob@example.com / password123) ===');
  r = await req('POST', '/api/auth/login', { email: 'bob@example.com', password: 'password123' });
  console.log(`Status: ${r.status}`);
  console.log(JSON.stringify(r.data, null, 2));
  const bobToken = r.data.token;

  console.log('\n=== 3. LIST EVENTS (public) ===');
  r = await req('GET', '/api/events?startDate=2026-07-01&endDate=2026-12-31');
  console.log(`Status: ${r.status}`);
  console.log(JSON.stringify(r.data, null, 2));
  const eventId = r.data.events?.[0]?.id;

  console.log('\n=== 4. GET EVENT BY ID (public) ===');
  r = await req('GET', `/api/events/${eventId}`);
  console.log(`Status: ${r.status}`);
  console.log(JSON.stringify(r.data, null, 2));

  console.log('\n=== 5. CREATE EVENT (protected, alice) ===');
  r = await req('POST', '/api/events', { title: 'Test Event', description: 'API test', date: '2026-12-01T10:00:00', total_seats: 50 }, aliceToken);
  console.log(`Status: ${r.status}`);
  console.log(JSON.stringify(r.data, null, 2));

  console.log('\n=== 6. BOOK SEATS (protected, bob) ===');
  r = await req('POST', `/api/events/${eventId}/book`, { seats: 2 }, bobToken);
  console.log(`Status: ${r.status}`);
  console.log(JSON.stringify(r.data, null, 2));

  console.log('\n=== 7. LIST MY BOOKINGS (protected, bob) ===');
  r = await req('GET', '/api/bookings', null, bobToken);
  console.log(`Status: ${r.status}`);
  console.log(JSON.stringify(r.data, null, 2));

  console.log('\n=== 8. CANCEL BOOKING (protected, bob) ===');
  const bookingId = r.data.bookings?.[0]?.id;
  if (bookingId) {
    r = await req('DELETE', `/api/bookings/${bookingId}`, null, bobToken);
    console.log(`Status: ${r.status}`);
    console.log(JSON.stringify(r.data, null, 2));
  } else {
    console.log('No booking found to cancel');
  }

  console.log('\n=== 9. CREATE EVENT WITHOUT TOKEN (should 401) ===');
  r = await req('POST', '/api/events', { title: 'No Auth', date: '2026-12-01T10:00:00', total_seats: 10 });
  console.log(`Status: ${r.status}`);
  console.log(JSON.stringify(r.data, null, 2));

  console.log('\n=== 10. OVERBOOK (should 409) ===');
  r = await req('POST', `/api/events/${eventId}/book`, { seats: 9999 }, bobToken);
  console.log(`Status: ${r.status}`);
  console.log(JSON.stringify(r.data, null, 2));

  console.log('\nDone!');
}

main().catch((e) => { console.error(e); process.exit(1); });
