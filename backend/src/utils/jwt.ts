import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export function signJwt(payload: object, expiresIn: jwt.SignOptions['expiresIn'] = '7d') {
  return jwt.sign(payload, env.JWT_SECRET as jwt.Secret, { expiresIn });
}

export function verifyJwt(token: string) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    return null;
  }
}
