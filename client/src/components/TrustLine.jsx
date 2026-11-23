import { t } from '../i18n/index.js';

// How reliable the neighbor who asks has been so far, on an incoming request:
//    <TrustLine lang={lang} trust={{ joined_days: 12, on_time: 3, late: 0 }} />
export default function TrustLine({ lang, trust }) {
  return <p className="trust-line">{trustText(lang, trust)}</p>;
}

function trustText(lang, { joined_days, on_time, late }) {
  if (on_time + late === 0) return t(lang, 'trust.new');

  let joined = t(lang, 'trust.joinedDays', { n: joined_days });
  if (joined_days === 1) joined = t(lang, 'trust.joinedDay');
  if (joined_days === 0) joined = t(lang, 'trust.joinedToday');

  const returns = on_time === 1 ? t(lang, 'trust.return', { late }) : t(lang, 'trust.returns', { n: on_time, late });
  return `${joined} · ${returns}`;
}
