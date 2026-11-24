import { ApiError, errorStatus } from '../../core/api.ts';
import type { UiKey } from '../../i18n/index.ts';

// The text for a refused login. `wrong` is what 401 means here (a wrong password, a wrong code, ...).
export function authError(error: unknown, wrong: UiKey): UiKey {
  if (error instanceof ApiError && error.data?.use_google) return 'auth.useGoogle';
  // The seeded accounts have made-up addresses, so they can't get a code.
  if (error instanceof ApiError && error.data?.error?.startsWith('Demo accounts')) return 'auth.demoPassword';
  const texts: Record<number, UiKey> = {
    401: wrong,
    403: 'auth.deactivated',
    404: 'auth.unknownEmail',
    409: 'auth.emailTaken',
    429: 'auth.tooMany',
    502: 'auth.emailFailed',
  };
  return texts[errorStatus(error) ?? 0] ?? 'common.error';
}
