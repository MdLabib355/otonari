// Persistent volume photo storage (item photos, handover photos, return photos, issue photos).
// Enforces: magic-byte validation, 5 MB cap, server-side JPEG EXIF/GPS stripping,
// UUID filenames, and canonicalized path-traversal checks inside UPLOADS_DIR.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';

const MAX_BYTES = 5 * 1024 * 1024;
const SAFE_FILENAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const MIME_BY_EXT = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } }).single('photo');

export function getUploadsDir() {
  const dir = path.resolve(process.env.UPLOADS_DIR || path.join(import.meta.dirname, '..', 'uploads'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function imageExtension(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const hex = buffer.toString('hex', 0, 12);
  if (hex.startsWith('ffd8ff')) return 'jpg';
  if (hex.startsWith('89504e470d0a1a0a')) return 'png';
  if (hex.startsWith('52494646') && hex.endsWith('57454250')) return 'webp';
  return null;
}

export function stripJpegExif(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return buffer;
  }

  const chunks = [buffer.subarray(0, 2)];
  let offset = 2;

  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    let markerPos = offset + 1;
    while (markerPos < buffer.length && buffer[markerPos] === 0xff) {
      markerPos += 1;
    }
    if (markerPos >= buffer.length) break;

    const marker = buffer[markerPos];
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      chunks.push(buffer.subarray(offset, markerPos + 1));
      offset = markerPos + 1;
      continue;
    }

    if (markerPos + 2 >= buffer.length) {
      chunks.push(buffer.subarray(offset));
      break;
    }
    const segLength = buffer.readUInt16BE(markerPos + 1);
    const nextOffset = markerPos + 1 + segLength;
    if (segLength < 2 || nextOffset > buffer.length) {
      chunks.push(buffer.subarray(offset));
      break;
    }

    if (marker !== 0xe1 && marker !== 0xfe) {
      chunks.push(buffer.subarray(offset, nextOffset));
    }
    offset = nextOffset;
  }

  return Buffer.concat(chunks);
}

function resolveInsideUploads(filename) {
  if (typeof filename !== 'string' || !SAFE_FILENAME_RE.test(filename)) {
    return null;
  }
  const root = getUploadsDir();
  const resolved = path.resolve(root, filename);
  if (!resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}

export function receivePhoto(req, res, next) {
  upload(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'The photo is larger than 5 MB' });
    }
    if (error || !req.file || !imageExtension(req.file.buffer)) {
      return res.status(400).json({ error: "Send one JPEG, PNG or WebP image as 'photo'" });
    }
    next();
  });
}

export function receiveOptionalPhoto(req, res, next) {
  if (!req.is('multipart/form-data')) {
    return next();
  }
  upload(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'The photo is larger than 5 MB' });
    }
    if (error) {
      return res.status(400).json({ error: "Send one JPEG, PNG or WebP image as 'photo'" });
    }
    if (req.file && !imageExtension(req.file.buffer)) {
      return res.status(400).json({ error: "Send one JPEG, PNG or WebP image as 'photo'" });
    }
    next();
  });
}

export async function savePhoto(file) {
  const ext = imageExtension(file?.buffer);
  if (!ext) {
    throw new Error('Invalid image buffer');
  }
  const payload = ext === 'jpg' ? stripJpegExif(file.buffer) : file.buffer;
  const filename = `${crypto.randomUUID()}.${ext}`;
  const target = resolveInsideUploads(filename);
  await fs.promises.writeFile(target, payload);
  return `/uploads/${filename}`;
}

export async function deletePhotoFile(photoUrl) {
  if (typeof photoUrl !== 'string' || !photoUrl.startsWith('/uploads/')) return;
  const filename = photoUrl.slice('/uploads/'.length);
  const target = resolveInsideUploads(filename);
  if (!target) return;
  try {
    await fs.promises.unlink(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function deletePhotos() {
  const dir = getUploadsDir();
  const entries = await fs.promises.readdir(dir);
  for (const name of entries) {
    if (name === '.gitkeep') continue;
    const target = path.resolve(dir, name);
    if (target.startsWith(dir + path.sep)) {
      await fs.promises.unlink(target);
    }
  }
}

export function servePhoto(req, res) {
  const filename = req.params.filename;
  const resolved = resolveInsideUploads(filename);
  if (!resolved) {
    return res.status(400).json({ error: 'Invalid photo filename' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'Photo not found' });
  }
  const ext = filename.split('.').pop();
  res.setHeader('Content-Type', MIME_BY_EXT[ext]);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  return res.sendFile(resolved);
}
