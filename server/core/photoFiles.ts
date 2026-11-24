// The photos, with random names: in an S3 bucket if S3_BUCKET is set, otherwise in server/uploads.
// The database keeps only where a photo is: 's3:photos/3f9c1a.jpg' or '/uploads/3f9c1a.jpg'.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { deleteObject, putObject, signedUrl, usesS3 } from './s3.ts';

const uploadsDir = path.join(import.meta.dirname, '..', 'uploads');
const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const S3_PREFIX = 's3:';

// Every image format starts with its own fixed bytes. Looking at those is safer than trusting the
// file name or type, which the sender can choose freely.
export function imageExtension(buffer: Buffer): string | null {
  const hex = buffer.toString('hex', 0, 12);
  if (hex.startsWith('ffd8ff')) return 'jpg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'png';
  if (hex.startsWith('52494646') && hex.endsWith('57454250')) return 'webp'; // "RIFF....WEBP"
  return null;
}

async function savePhoto(buffer: Buffer): Promise<string> {
  const extension = imageExtension(buffer);
  if (!extension) throw new Error('Not an image'); // receivePhoto has checked it
  const name = `${crypto.randomUUID()}.${extension}`;
  if (usesS3) {
    await putObject(`photos/${name}`, buffer, CONTENT_TYPES[extension]);
    return `${S3_PREFIX}photos/${name}`;
  }
  await fs.writeFile(path.join(uploadsDir, name), buffer);
  return `/uploads/${name}`;
}

// Middleware: saves the photo in req.file, and puts where it is in req.photo. This can take a moment, so it is
// done before the transaction of write() starts: nobody else has to wait for it.
export async function storePhoto(req: Request, res: Response, next: NextFunction) {
  try {
    req.photo = await savePhoto(req.file!.buffer);
  } catch (error) {
    console.error('Photo could not be saved:', (error as Error).message);
    return res.status(502).json({ error: 'The photo could not be saved' });
  }
  next();
}

// The same for a photo that may be missing: where it is goes to req.optionalPhoto.
export async function storeOptionalPhoto(req: Request, res: Response, next: NextFunction) {
  if (!req.file) return next();
  await storePhoto(req, res, () => {
    req.optionalPhoto = req.photo;
    next();
  });
}

// Middleware after storeOptionalPhoto: a photo of a refused request is of no use.
export function deleteRefusedPhoto(req: Request, res: Response, next: NextFunction) {
  res.on('finish', () => {
    if (res.statusCode >= 400 && req.optionalPhoto) deletePhoto(req.optionalPhoto);
  });
  next();
}

// The URL for the browser. A signed S3 URL works for an hour, so it is made for every answer, never stored.
export async function photoUrl(photo: string | null): Promise<string | null> {
  return photo?.startsWith(S3_PREFIX) ? signedUrl(photo.slice(S3_PREFIX.length)) : photo;
}

// For a photo that has been replaced. If it can't be deleted, it is only an unused file.
export async function deletePhoto(photo: string | null) {
  try {
    if (photo?.startsWith(S3_PREFIX)) await deleteObject(photo.slice(S3_PREFIX.length));
    else if (photo) await fs.unlink(path.join(uploadsDir, path.basename(photo)));
  } catch (error) {
    console.error('Old photo could not be deleted:', (error as Error).message);
  }
}

// Deletes the photos in server/uploads (used by seedData.ts). .gitkeep stays: it keeps the empty folder in git.
// Never those in S3: other servers may use the same bucket.
export async function deletePhotos() {
  for (const name of await fs.readdir(uploadsDir)) {
    if (name !== '.gitkeep') await fs.unlink(path.join(uploadsDir, name));
  }
}
