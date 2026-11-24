// The first super_admin comes from the settings: nobody can register as one.

import { transaction } from '../../core/database.ts';
import { SUPER_ADMIN } from '../../core/settings.ts';
import { createUser, findUserByEmail, setPassword, setRole } from '../user/userModel.ts';
import { hashSecret } from './password.ts';
import { deleteSessionsOf } from './sessionModel.ts';

export async function ensureSuperAdmin() {
  const { email, password } = SUPER_ADMIN;
  if (!email || !password) return;
  if (password.length < 8) throw new Error('SUPER_ADMIN_PASSWORD must have at least 8 characters');

  const passwordHash = await hashSecret(password);
  const address = email.trim().toLowerCase();
  await transaction(async () => {
    let user = await findUserByEmail(address);
    if (user && !user.email_verified) await deleteSessionsOf(user.id); // somebody else may have registered it
    user ??= await createUser({ email: address, lang: 'en', nickname: 'Admin' });
    await setPassword(user.id, passwordHash);
    await setRole(user.id, 'super_admin');
  });
}
