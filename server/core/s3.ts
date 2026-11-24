// Photos in an AWS S3 bucket. The bucket is private: the browser gets a signed URL that works for one hour.
// (The AWS library reads AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY by itself.)

import './env.ts';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const BUCKET = process.env.S3_BUCKET || null;
const HOUR = 60 * 60;

export const usesS3 = BUCKET !== null;
const s3 = usesS3 ? new S3Client({ region: process.env.AWS_REGION }) : null;

export async function putObject(key: string, body: Buffer, contentType: string) {
  // The name is random and the photo never changes, so browsers may keep it.
  const CacheControl = 'private, max-age=31536000, immutable';
  await s3!.send(
    new PutObjectCommand({ Bucket: BUCKET!, Key: key, Body: body, ContentType: contentType, CacheControl })
  );
}

// The same URL for half an hour: otherwise the browser would load a photo again whenever a page is refreshed.
const signedUrls = new Map<string, { url: string; until: number }>();

export async function signedUrl(key: string): Promise<string> {
  const now = Date.now();
  const known = signedUrls.get(key);
  if (known && known.until > now) return known.url;

  if (signedUrls.size > 5000) signedUrls.clear();
  const url = await getSignedUrl(s3!, new GetObjectCommand({ Bucket: BUCKET!, Key: key }), { expiresIn: HOUR });
  signedUrls.set(key, { url, until: now + (HOUR / 2) * 1000 });
  return url;
}
