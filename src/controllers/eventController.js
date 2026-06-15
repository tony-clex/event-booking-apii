import { supabase } from '../config/database.js';

export async function getEvents(req, res, next) {
  try {
    const { startDate, endDate, limit = 20, offset = 0 } = req.query;

    let query = supabase.from('events').select('*', { count: 'exact' });

    if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate);
    }

    const { data, error, count } = await query
      .order('date', { ascending: true })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch events' });
    }

    res.json({
      events: data,
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

export async function getEventById(req, res, next) {
  try {
    const { id } = req.params;

    const { data: event, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const totalBookedSeats = event.total_seats - event.available_seats;

    res.json({
      ...event,
      total_booked_seats: totalBookedSeats,
      available_seats: event.available_seats,
    });
  } catch (err) {
    next(err);
  }
}

export async function createEvent(req, res, next) {
  try {
    const { title, description, date, total_seats } = req.body;
    const userId = req.user.id;

    if (!title || !date || !total_seats) {
      return res.status(400).json({ error: 'Title, date, and total_seats are required' });
    }

    const eventDate = new Date(date);
    if (isNaN(eventDate.getTime()) || eventDate <= new Date()) {
      return res.status(400).json({ error: 'Event date must be in the future' });
    }

    if (total_seats <= 0) {
      return res.status(400).json({ error: 'total_seats must be greater than 0' });
    }

    const { data, error } = await supabase
      .from('events')
      .insert({
        title,
        description: description || '',
        date,
        total_seats,
        available_seats: total_seats,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create event' });
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function updateEvent(req, res, next) {
  try {
    const { id } = req.params;
    const { title, description, date, total_seats } = req.body;
    const userId = req.user.id;

    const { data: existingEvent, error: fetchError } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (existingEvent.created_by !== userId) {
      return res.status(403).json({ error: 'Cannot update events created by other users' });
    }

    if (total_seats !== undefined) {
      if (total_seats <= 0) {
        return res.status(400).json({ error: 'total_seats must be greater than 0' });
      }

      const { data: bookings } = await supabase
        .from('bookings')
        .select('seats_booked')
        .eq('event_id', id);

      const totalBooked = bookings?.reduce((s, b) => s + b.seats_booked, 0) || 0;

      if (total_seats < totalBooked) {
        return res.status(409).json({
          error: `Cannot reduce seats below ${totalBooked} (already booked)`,
        });
      }
    }

    const updatePayload = {
      title: title || existingEvent.title,
      description: description !== undefined ? description : existingEvent.description,
      date: date || existingEvent.date,
    };

    if (total_seats !== undefined) {
      const currentAvailable = existingEvent.available_seats - (existingEvent.total_seats - total_seats);
      updatePayload.total_seats = total_seats;
      updatePayload.available_seats = currentAvailable;
    }

    const { data, error } = await supabase
      .from('events')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to update event' });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
}
