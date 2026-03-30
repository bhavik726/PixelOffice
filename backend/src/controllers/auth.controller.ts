import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { toErrorMessage } from '../utils/errors';

export async function signup(req: Request, res: Response) {
  const { email, password, username } = req.body;
  if (!email || !password || !username) {
    return res.status(400).json({ message: 'Missing fields' });
  }
  try {
    const data = await authService.signup(email, password, username);
    res.status(201).json(data);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err, 'Signup failed') });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Missing fields' });
  }
  try {
    const data = await authService.login(email, password);
    res.json(data);
  } catch (err: unknown) {
    res.status(400).json({ message: toErrorMessage(err, 'Login failed') });
  }
}
