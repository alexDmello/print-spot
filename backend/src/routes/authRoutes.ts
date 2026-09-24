import { Router, Request, Response } from 'express';
import { requestPhoneOtp, verifyPhoneOtp, authMiddleware } from '../services/authService';

const router = Router();

router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ error: 'Phone number is required.' });
      return;
    }
    const result = await requestPhoneOtp(phone);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, otp, name } = req.body;
    if (!phone || !otp) {
      res.status(400).json({ error: 'Phone number and 6-digit OTP are required.' });
      return;
    }
    const result = await verifyPhoneOtp(phone, otp, name);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/me', authMiddleware, (req: any, res: Response) => {
  res.json({ user: req.user });
});

export default router;
