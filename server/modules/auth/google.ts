// "Continue with Google": the browser gets a signed ID token from Google, and we check that signature.

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { GOOGLE_CLIENT_ID } from '../../core/settings.ts';

const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface GoogleAccount {
  sub: string; // Google's id of the account: it never changes
  email: string;
  ownsEmail: boolean; // Google is sure that this person owns the address right now (Gmail or Workspace)
}

// Null if the token is not valid, not meant for this app, or has no verified email.
export async function readGoogleToken(token: string): Promise<GoogleAccount | null> {
  if (!GOOGLE_CLIENT_ID) return null;
  try {
    const { payload } = await jwtVerify(token, googleKeys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: GOOGLE_CLIENT_ID,
      algorithms: ['RS256'],
      requiredClaims: ['sub', 'email', 'exp'],
    });
    if (payload.email_verified !== true || typeof payload.email !== 'string' || !payload.sub) return null;
    const email = payload.email.toLowerCase();
    return { sub: payload.sub, email, ownsEmail: email.endsWith('@gmail.com') || typeof payload.hd === 'string' };
  } catch {
    return null;
  }
}
