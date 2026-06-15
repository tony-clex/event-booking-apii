
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  date TIMESTAMP NOT NULL,
  total_seats INTEGER NOT NULL CHECK (total_seats >= 0),
  available_seats INTEGER NOT NULL CHECK (available_seats >= 0),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT available_seats_check CHECK (available_seats <= total_seats)
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  seats_booked INTEGER NOT NULL CHECK (seats_booked > 0),
  booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event_id ON bookings(event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_event_user_unique ON bookings(event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

DROP FUNCTION IF EXISTS book_event(integer, integer, integer);
DROP FUNCTION IF EXISTS cancel_booking(integer, integer);

CREATE OR REPLACE FUNCTION book_event(
  p_event_id integer,
  p_user_id integer,
  p_seats integer
)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event events%ROWTYPE;
  v_booking bookings%ROWTYPE;
BEGIN
  IF p_event_id IS NULL OR p_user_id IS NULL OR p_seats IS NULL OR p_seats <= 0 THEN
    RAISE EXCEPTION 'seats must be a positive integer';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF v_event.date <= now() THEN
    RAISE EXCEPTION 'Cannot book past events';
  END IF;

  IF EXISTS (SELECT 1 FROM bookings WHERE event_id = p_event_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'You already have a booking for this event';
  END IF;

  UPDATE events
  SET available_seats = available_seats - p_seats
  WHERE id = p_event_id
    AND available_seats >= p_seats;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient seats available';
  END IF;

  INSERT INTO bookings (event_id, user_id, seats_booked)
  VALUES (p_event_id, p_user_id, p_seats)
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION cancel_booking(
  p_booking_id integer,
  p_user_id integer
)
RETURNS bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking bookings%ROWTYPE;
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.user_id <> p_user_id THEN
    RAISE EXCEPTION 'Cannot cancel another user''s booking';
  END IF;

  DELETE FROM bookings WHERE id = p_booking_id;

  UPDATE events
  SET available_seats = LEAST(total_seats, available_seats + v_booking.seats_booked)
  WHERE id = v_booking.event_id;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION book_event(integer, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_booking(integer, integer) TO anon, authenticated;
