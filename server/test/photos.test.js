import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import {
  deletePhotoFile,
  deletePhotos,
  getUploadsDir,
  imageExtension,
  receiveOptionalPhoto,
  receivePhoto,
  savePhoto,
  servePhoto,
  stripJpegExif,
} from '../photos.js';

// Minimal valid JPEG containing an APP1 EXIF/GPS segment ("Exif\0\0GPS_SECRET") before SOS + EOI.
function makeJpegWithExif() {
  const soi = Buffer.from([0xff, 0xd8]);
  const exifPayload = Buffer.from('Exif\0\0GPS_LAT_32.7503_LON_129.8779', 'ascii');
  const app1Len = Buffer.alloc(2);
  app1Len.writeUInt16BE(exifPayload.length + 2, 0);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), app1Len, exifPayload]);
  const jfif = Buffer.from([0xff, 0xe0, 0x00, 0x07, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  const sosAndEoi = Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xaa, 0xbb, 0xff, 0xd9]);
  return Buffer.concat([soi, jfif, app1, sosAndEoi]);
}

const VALID_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const VALID_WEBP = Buffer.from('RIFF\x24\x00\x00\x00WEBP', 'binary');

describe('Slice 2: Persistent volume photos, EXIF stripping, and path-traversal protection', () => {
  let tempDir;
  let prevUploadsDir;
  let server;
  let baseUrl;

  before(async () => {
    prevUploadsDir = process.env.UPLOADS_DIR;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otonari-photos-test-'));
    process.env.UPLOADS_DIR = tempDir;

    const app = express();
    app.use(express.json());
    app.post('/req-photo', receivePhoto, async (req, res) => {
      const url = await savePhoto(req.file);
      res.status(201).json({ url });
    });
    app.post('/opt-photo', receiveOptionalPhoto, async (req, res) => {
      const url = req.file ? await savePhoto(req.file) : null;
      res.status(201).json({ url, body: req.body });
    });
    app.get('/uploads/:filename', servePhoto);

    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (prevUploadsDir === undefined) delete process.env.UPLOADS_DIR;
    else process.env.UPLOADS_DIR = prevUploadsDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('detects magic bytes for JPEG, PNG, WebP and rejects spoofed payloads', () => {
    assert.equal(imageExtension(makeJpegWithExif()), 'jpg');
    assert.equal(imageExtension(VALID_PNG), 'png');
    assert.equal(imageExtension(VALID_WEBP), 'webp');
    assert.equal(imageExtension(Buffer.from('not an image at all')), null);
  });

  it('strips APP1 EXIF/GPS segment from JPEG while preserving SOI, JFIF, SOS, and EOI', () => {
    const raw = makeJpegWithExif();
    assert.ok(raw.includes(Buffer.from('GPS_LAT_32.7503')));

    const stripped = stripJpegExif(raw);
    assert.equal(imageExtension(stripped), 'jpg');
    assert.equal(stripped.includes(Buffer.from('GPS_LAT_32.7503')), false);
    assert.equal(stripped.includes(Buffer.from('Exif')), false);
    assert.ok(stripped.includes(Buffer.from('JFIF')));
    assert.equal(stripped[stripped.length - 2], 0xff);
    assert.equal(stripped[stripped.length - 1], 0xd9);
  });

  it('saves EXIF-stripped JPEG into UPLOADS_DIR, serves it with nosniff, and cleans up on deletePhotoFile', async () => {
    const form = new FormData();
    form.append('photo', new Blob([makeJpegWithExif()], { type: 'image/jpeg' }), 'camera.jpg');

    const uploadRes = await fetch(`${baseUrl}/req-photo`, { method: 'POST', body: form });
    assert.equal(uploadRes.status, 201);
    const { url } = await uploadRes.json();
    assert.match(url, /^\/uploads\/[0-9a-f-]{36}\.jpg$/);

    const fileRes = await fetch(`${baseUrl}${url}`);
    assert.equal(fileRes.status, 200);
    assert.equal(fileRes.headers.get('content-type'), 'image/jpeg');
    assert.equal(fileRes.headers.get('x-content-type-options'), 'nosniff');
    const servedBytes = Buffer.from(await fileRes.arrayBuffer());
    assert.equal(servedBytes.includes(Buffer.from('GPS_LAT_32.7503')), false);

    await deletePhotoFile(url);
    const afterDelete = await fetch(`${baseUrl}${url}`);
    assert.equal(afterDelete.status, 404);
  });

  it('rejects non-image uploads (400) and files larger than 5 MB (413)', async () => {
    const fakeForm = new FormData();
    fakeForm.append('photo', new Blob(['hello world text pretending to be jpeg'], { type: 'image/jpeg' }), 'fake.jpg');
    const fakeRes = await fetch(`${baseUrl}/req-photo`, { method: 'POST', body: fakeForm });
    assert.equal(fakeRes.status, 400);

    const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 128, 0);
    VALID_PNG.copy(bigBuffer, 0);
    const bigForm = new FormData();
    bigForm.append('photo', new Blob([bigBuffer], { type: 'image/png' }), 'huge.png');
    const bigRes = await fetch(`${baseUrl}/req-photo`, { method: 'POST', body: bigForm });
    assert.equal(bigRes.status, 413);
  });

  it('supports optional photo middleware for both JSON and multipart requests', async () => {
    const jsonRes = await fetch(`${baseUrl}/opt-photo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_key: 'ladder' }),
    });
    assert.equal(jsonRes.status, 201);
    const jsonData = await jsonRes.json();
    assert.equal(jsonData.url, null);
    assert.equal(jsonData.body.item_key, 'ladder');

    const form = new FormData();
    form.append('item_key', 'ladder');
    form.append('photo', new Blob([VALID_PNG], { type: 'image/png' }), 'ladder.png');
    const multiRes = await fetch(`${baseUrl}/opt-photo`, { method: 'POST', body: form });
    assert.equal(multiRes.status, 201);
    const multiData = await multiRes.json();
    assert.match(multiData.url, /^\/uploads\/[0-9a-f-]{36}\.png$/);
  });

  it('blocks path traversal and non-UUID filenames on servePhoto and preserves .gitkeep on deletePhotos', async () => {
    fs.writeFileSync(path.join(getUploadsDir(), '.gitkeep'), '');
    fs.writeFileSync(path.join(getUploadsDir(), 'secret.txt'), 'nope');

    for (const badPath of ['/uploads/secret.txt', '/uploads/..%2Fpackage.json', '/uploads/.gitkeep']) {
      const res = await fetch(`${baseUrl}${badPath}`);
      assert.equal(res.status, 400, `Expected 400 for ${badPath}`);
    }

    await deletePhotos();
    assert.equal(fs.existsSync(path.join(getUploadsDir(), '.gitkeep')), true);
    assert.equal(fs.existsSync(path.join(getUploadsDir(), 'secret.txt')), false);
  });
});
