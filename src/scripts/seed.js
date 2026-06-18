import 'dotenv/config';

import { supabase } from '../config/database.js';
import { hashPassword } from '../utils/crypto.js';

async function seedData() {
  console.log('Seeding data...');

  const usersToCreate = [
    { username: 'alice', email: 'alice@example.com', password: 'password123' },
    { username: 'bob', email: 'bob@example.com', password: 'password123' },
    { username: 'charlie', email: 'charlie@example.com', password: 'password123' },
  ];

  const createdUsers = [];

  const existingRecords = await supabase.from('users').select('id, username');

  if (existingRecords.error) {
    console.error('Error querying users:', existingRecords.error.message);
  } else {
    for (const existing of existingRecords.data || []) {
      const user = usersToCreate.find(u => u.username === existing.username);
      if (user) {
        console.log(`User already exists: ${user.username}`);
        createdUsers.push({ id: existing.id, username: user.username, email: user.email });
      }
    }
  }

  for (const user of usersToCreate) {
    if (createdUsers.find(u => u.username === user.username)) continue;

    const passwordHash = await hashPassword(user.password);
    const resolvedEmail = user.email;

    const { data, error } = await supabase
      .from('users')
      .insert({ username: user.username, email: resolvedEmail, password_hash: passwordHash })
      .select('id, username, email')
      .single();

    if (error) {
      console.error(`Error creating user ${user.email}:`, error.message);
    } else {
      createdUsers.push({ id: data.id, username: user.username, email: resolvedEmail });
      console.log(`Created user: ${user.username}`);
    }
  }

  const eventsToCreate = [
    { title: 'Tech Conference 2026', description: 'Annual tech conference with speakers and workshops', date: '2026-07-15T09:00:00', total_seats: 200, created_by: createdUsers[0]?.id },
    { title: 'Music Festival', description: 'Outdoor music festival featuring local artists', date: '2026-08-20T12:00:00', total_seats: 500, created_by: createdUsers[0]?.id },
    { title: 'Startup Meetup', description: 'Networking event for startup founders and investors', date: '2026-07-01T18:00:00', total_seats: 50, created_by: createdUsers[1]?.id },
    { title: 'Art Exhibition', description: 'Contemporary art exhibition opening night', date: '2026-09-10T19:00:00', total_seats: 100, created_by: createdUsers[1]?.id },
    { title: 'Marathon 2026', description: 'City marathon with multiple distance categories', date: '2026-10-05T07:00:00', total_seats: 1000, created_by: createdUsers[2]?.id },
    { title: 'Book Launch', description: 'Launch event for a new bestselling novel', date: '2026-08-01T14:00:00', total_seats: 80, created_by: createdUsers[2]?.id },
    { title: 'Cooking Workshop', description: 'Learn to cook authentic Italian cuisine', date: '2026-07-20T11:00:00', total_seats: 30, created_by: createdUsers[0]?.id },
    { title: 'Yoga Retreat', description: 'Weekend yoga and wellness retreat', date: '2026-09-25T08:00:00', total_seats: 40, created_by: createdUsers[1]?.id },
  ];

  for (const event of eventsToCreate) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        title: event.title,
        description: event.description,
        date: event.date,
        total_seats: event.total_seats,
        available_seats: event.total_seats,
        created_by: event.created_by,
      })
      .select()
      .single();

    if (error) {
      console.error(`Error creating event '${event.title}':`, error.message);
    } else {
      console.log(`Created event: ${event.title}`);
    }
  }

  console.log('Seeding completed successfully');
}

seedData().catch(console.error);
