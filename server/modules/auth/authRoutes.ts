//   GET    /api/v1/auth/config               anyone   what the login page can offer
//   POST   /api/v1/auth/email-codes          anyone   { email, purpose: 'register' | 'login' | 'reset', lang }
//   POST   /api/v1/auth/email-codes/verify   anyone   { email, code, purpose } → { ticket }
//   POST   /api/v1/auth/register             anyone   { ticket, password, lang } → { token, user, group }
//   POST   /api/v1/auth/login                anyone   { email, password } → { token, user, group }
//   POST   /api/v1/auth/login-with-code      anyone   { email, code } → { token, user, group }
//   POST   /api/v1/auth/google               anyone   { credential, lang } → logs in, or creates the account
//   POST   /api/v1/auth/reset-password       anyone   { ticket, password } → a new password; { token, user, group }
//   POST   /api/v1/me/password               user     { current_password, password }
//   DELETE /api/v1/auth/session              user     log out on this device

import express from 'express';
import { requireUser } from '../../core/auth.ts';
import { read, write } from '../../core/http.ts';
import {
  changeMyPassword,
  login,
  loginWithCode,
  loginWithGoogle,
  logout,
  register,
  requestCode,
  resetPassword,
  showConfig,
  verifyCode,
} from './authController.ts';

const router = express.Router();

router.get('/auth/config', read(showConfig));
router.post('/auth/register', read(register));
router.post('/auth/login', read(login));
router.post('/auth/email-codes', read(requestCode));
router.post('/auth/email-codes/verify', read(verifyCode));
router.post('/auth/login-with-code', read(loginWithCode));
router.post('/auth/google', read(loginWithGoogle));
router.post('/auth/reset-password', read(resetPassword));
router.post('/me/password', read(requireUser, changeMyPassword));
router.delete('/auth/session', write(requireUser, logout));

export default router;
