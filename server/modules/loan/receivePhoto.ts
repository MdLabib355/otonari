// Receives one uploaded condition photo (at handover and at return): images only, max 5 MB.

import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { imageExtension } from './photoFiles.ts';

const MAX_BYTES = 5 * 1024 * 1024;

// The photo stays in memory until the controller has checked who sends it and when, so a refused
// upload never leaves a file behind.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } }).single('photo');

// Puts the photo in req.file, or answers 400 / 413 if it isn't an image / is too big.
export function receivePhoto(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'The photo is larger than 5 MB' });
    }
    if (error || !req.file || !imageExtension(req.file.buffer)) {
      return res.status(400).json({ error: "Send one JPEG, PNG or WebP image as 'photo'" });
    }
    next();
  });
}
