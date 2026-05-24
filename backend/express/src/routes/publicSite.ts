import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authLimiter } from '../middleware/rateLimit';
import { logger } from '../config/logger';

const router = Router();

router.post(
  '/contact',
  authLimiter,
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('email').isEmail().normalizeEmail(),
  body('subject').trim().isLength({ min: 2, max: 200 }),
  body('message').trim().isLength({ min: 10, max: 5000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const { name, email, subject, message } = req.body;
    logger.info('Public contact form submission', {
      name,
      email,
      subject,
      messageLength: String(message).length,
    });
    return res.json({
      success: true,
      data: {
        message:
          'Thank you. Your message has been received. Our team will respond within 2 business days.',
      },
    });
  }
);

export default router;
