import { supabase } from '../config/database.js';

function mapRpcError(error, fallback) {
  const message = error?.message || '';

  if (message.includes('Event not found')) {
    return { status: 404, body: { error: 'Event not found' } };
  }

  if (message.includes('Cannot book past events')) {
    return { status: 400, body: { error: 'Cannot book past events' } };
  }

  if (message.includes('You already have a booking') || message.includes('duplicate key')) {
    return { status: 409, body: { error: 'You already have a booking for this event' } };
  }

  if (message.includes('Insufficient seats available')) {
    return { status: 409, body: { error: 'Insufficient seats available' } };
  }

  if (message.includes('Booking not found')) {
    return { status: 404, body: { error: 'Booking not found' } };
  }

  if (message.includes("Cannot cancel another user's booking")) {
    return { status: 403, body: { error: "Cannot cancel another user's booking" } };
  }

  return { status: 500, body: { error: fallback } };
}

function getFirstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

async function reserveSeats(eventId, seats) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, available_seats')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      throw new Error('Event not found');
    }

    if (event.available_seats < seats) {
      throw new Error('Insufficient seats available');
    }

    const { data: updatedEvent, error: updateError } = await supabase
      .from('events')
      .update({ available_seats: event.available_seats - seats })
      .eq('id', eventId)
      .eq('available_seats', event.available_seats)
      .select('id, available_seats')
      .single();

    if (!updateError && updatedEvent) {
      return updatedEvent;
    }
  }

  throw new Error('Insufficient seats available');
}

async function restoreSeats(eventId, seats) {
  const { data: event } = await supabase
    .from('events')
    .select('id, total_seats, available_seats')
    .eq('id', eventId)
    .single();

  if (!event) {
    return;
  }

  await supabase
    .from('events')
    .update({ available_seats: Math.min(event.total_seats, event.available_seats + seats) })
    .eq('id', eventId);
}

async function bookWithRpc(eventId, userId, seats) {
  const { data, error } = await supabase.rpc('book_event', {
    p_event_id: eventId,
    p_user_id: userId,
    p_seats: seats,
  });

  if (error && !error.message.includes('Could not find the function')) {
    throw error;
  }

  if (error) {
    return null;
  }

  return getFirstRow(data);
}

async function cancelWithRpc(bookingId, userId) {
  const { data, error } = await supabase.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_user_id: userId,
  });

  if (error && !error.message.includes('Could not find the function')) {
    throw error;
  }

  if (error) {
    return null;
  }

  return getFirstRow(data);
}

async function bookWithRest(eventId, userId, seats) {
  const { data: event } = await supabase
    .from('events')
    .select('id, date')
    .eq('id', eventId)
    .single();

  if (!event) {
    throw new Error('Event not found');
  }

  const eventDate = new Date(event.date);
  if (isNaN(eventDate.getTime()) || eventDate <= new Date()) {
    throw new Error('Cannot book past events');
  }

  const { data: existingBooking } = await supabase
    .from('bookings')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingBooking) {
    throw new Error('You already have a booking for this event');
  }

  await reserveSeats(eventId, seats);

  try {
    const { data: newBooking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        event_id: eventId,
        user_id: userId,
        seats_booked: seats,
      })
      .select('*')
      .single();

    if (bookingError) {
      await restoreSeats(eventId, seats);
      throw bookingError;
    }

    return newBooking;
  } catch (err) {
    if (err.message === 'You already have a booking for this event') {
      await restoreSeats(eventId, seats);
    }
    throw err;
  }
}

async function cancelWithRest(bookingId, userId) {
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .single();

  if (bookingError || !booking) {
    throw new Error('Booking not found');
  }

  if (booking.user_id !== userId) {
    throw new Error("Cannot cancel another user's booking");
  }

  const { error: deleteError } = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId);

  if (deleteError) {
    throw deleteError;
  }

  await restoreSeats(booking.event_id, booking.seats_booked);

  return booking;
}

export async function bookEvent(req, res, next) {
  try {
    const eventId = Number(req.params.id);
    const userId = Number(req.user.id);
    const seats = Number(req.body.seats);

    if (!Number.isInteger(seats) || seats <= 0) {
      return res.status(400).json({ error: 'seats must be a positive integer' });
    }

    const booking = await bookWithRpc(eventId, userId, seats)
      || await bookWithRest(eventId, userId, seats);

    if (!booking) {
      return res.status(500).json({ error: 'Failed to create booking' });
    }

    res.status(201).json({
      id: booking.id,
      event_id: booking.event_id,
      seats_booked: booking.seats_booked,
      booked_at: booking.booked_at,
      message: 'Booking created successfully',
    });
  } catch (err) {
    if (err.message && err.message !== 'Failed to create booking') {
      const mapped = mapRpcError(err, 'Failed to create booking');
      return res.status(mapped.status).json(mapped.body);
    }

    next(err);
  }
}

export async function getUserBookings(req, res, next) {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const { data: bookings, error, count } = await supabase
      .from('bookings')
      .select('*, events(id, title, date)', { count: 'exact' })
      .eq('user_id', userId)
      .order('booked_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch bookings' });
    }

    res.json({
      bookings: bookings || [],
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: count || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function cancelBooking(req, res, next) {
  try {
    const bookingId = Number(req.params.id);
    const userId = Number(req.user.id);

    const booking = await cancelWithRpc(bookingId, userId)
      || await cancelWithRest(bookingId, userId);

    if (!booking) {
      return res.status(500).json({ error: 'Failed to cancel booking' });
    }

    res.json({ message: 'Booking cancelled successfully' });
  } catch (err) {
    if (err.message && err.message !== 'Failed to cancel booking') {
      const mapped = mapRpcError(err, 'Failed to cancel booking');
      return res.status(mapped.status).json(mapped.body);
    }

    next(err);
  }
}
