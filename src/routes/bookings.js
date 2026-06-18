import express from 'express';
import { bookEvent, getUserBookings, cancelBooking } from '../controllers/bookingController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authMiddleware, getUserBookings);
router.delete('/:id', authMiddleware, cancelBooking);

export default router;
