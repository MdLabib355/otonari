// Condition photos (at handover and at return): receive one uploaded image, save it in server/uploads.
// Images only, max 5 MB, random file name.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

const uploadsDir = path.join(import.meta.dirname, 'uploads');
const MAX_BYTES = 5 * 1024 * 1024;

// The photo stays in memory until the route has checked who sends it and when, so a refused upload
// never leaves a file behind.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } }).single('photo');

// Every image format starts with its own fixed bytes. Looking at those is safer than trusting the
// file name or type, which the sender can choose freely.
function imageExtension(buffer: Buffer): string | null {
  const hex = buffer.toString('hex', 0, 12);
  if (hex.startsWith('ffd8ff')) return 'jpg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'png';
  if (hex.startsWith('52494646') && hex.endsWith('57454250')) return 'webp'; // "RIFF....WEBP"
  return null;
}

// Middleware: puts the photo in req.file, or answers 400 / 413 if it isn't an image / is too big.
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

// Saves the photo and returns its URL, e.g. '/uploads/3f9c1a….jpg'
export function savePhoto(file: Express.Multer.File): string {
  const name = `${crypto.randomUUID()}.${imageExtension(file.buffer)}`;
  fs.writeFileSync(path.join(uploadsDir, name), file.buffer);
  return `/uploads/${name}`;
}

// Deletes all photos (used by seed.ts). .gitkeep stays: it keeps the empty folder in git.
export function deletePhotos() {
  for (const name of fs.readdirSync(uploadsDir)) {
    if (name !== '.gitkeep') fs.unlinkSync(path.join(uploadsDir, name));
  }
}
