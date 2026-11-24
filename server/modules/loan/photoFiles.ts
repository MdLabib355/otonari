// The photo files in server/uploads, with random names.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const uploadsDir = path.join(import.meta.dirname, '..', '..', 'uploads');

// Every image format starts with its own fixed bytes. Looking at those is safer than trusting the
// file name or type, which the sender can choose freely.
export function imageExtension(buffer: Buffer): string | null {
  const hex = buffer.toString('hex', 0, 12);
  if (hex.startsWith('ffd8ff')) return 'jpg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'png';
  if (hex.startsWith('52494646') && hex.endsWith('57454250')) return 'webp'; // "RIFF....WEBP"
  return null;
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
