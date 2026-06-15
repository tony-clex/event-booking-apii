import express from 'express';
import { getEvents, getEventById, createEvent, updateEvent } from '../controllers/eventController.js';
import { bookEvent } from '../controllers/bookingController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getEvents);
router.get('/:id', getEventById);
router.post('/', authMiddleware, createEvent);
router.put('/:id', authMiddleware, updateEvent);
router.post('/:id/book', authMiddleware, bookEvent);

export default router;
