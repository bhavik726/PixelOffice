import { Request, Response } from 'express';
import { getCloudflareIceServers } from '../services/rtc.service';
import { toErrorMessage } from '../utils/errors';

export async function getIceServers(req: Request, res: Response) {
  try {
    const data = await getCloudflareIceServers();
    res.json({
      iceServers: data.iceServers,
      expiresAt: data.expiresAt,
      source: data.source,
    });
  } catch (error) {
    res.status(503).json({ message: toErrorMessage(error, 'Failed to generate ICE servers') });
  }
}
