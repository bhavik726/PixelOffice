/* eslint-disable @typescript-eslint/no-explicit-any */

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { ensureUserRow } from '../services/user.service';

export interface AuthRequest extends Request {
  user?: any;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    await ensureUserRow(data.user);

    req.user = data.user;

    next();
  } catch (err) {
    console.error('AUTH ERROR:', err);
    if (err instanceof Error) {
      return res.status(500).json({ message: `Auth failed: ${err.message}` });
    }
    return res.status(500).json({ message: 'Auth failed' });
  }
};