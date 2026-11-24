// Sends the email with the 6-digit code, in the language of the person.

import nodemailer from 'nodemailer';
import type { Lang } from '../../../shared/types.ts';
import { SMTP } from '../../core/settings.ts';

export const canSendEmail = SMTP.host !== null;

const transport = canSendEmail
  ? nodemailer.createTransport({
      host: SMTP.host!,
      port: SMTP.port,
      secure: SMTP.port === 465,
      auth: SMTP.user ? { user: SMTP.user, pass: SMTP.password ?? '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

const TEXTS: Record<Lang, { subject: string; text: string }> = {
  en: {
    subject: 'Your Otonari code: {code}',
    text: 'Your code is {code}. It works for 10 minutes.\n\nIf you did not ask for it, you can ignore this email.',
  },
  ja: {
    subject: 'おとなりの確認コード:{code}',
    text: '確認コードは {code} です。10分間有効です。\n\nお心当たりのない場合は、このメールを破棄してください。',
  },
  'ja-easy': {
    subject: 'おとなりの コード:{code}',
    text: 'コードは {code} です。10ぷん つかえます。\n\nしらない ときは、なにも しなくて いいです。',
  },
  bn: {
    subject: 'আপনার Otonari কোড: {code}',
    text: 'আপনার কোড {code}। এটি ১০ মিনিট কাজ করবে।\n\nআপনি না চেয়ে থাকলে এই ইমেইলটি উপেক্ষা করুন।',
  },
};

export async function sendCode(email: string, code: string, lang: Lang) {
  const { subject, text } = TEXTS[lang];
  await transport?.sendMail({
    from: SMTP.from,
    to: email,
    subject: subject.replace('{code}', code),
    text: text.replace('{code}', code),
  });
}
