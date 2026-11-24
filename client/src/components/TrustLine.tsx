import type { Lang, Trust } from '../../../shared/types.ts';
import { t } from '../i18n/index.ts';

// How reliable the neighbor who asks has been so far, on an incoming request:
//    <TrustLine lang={lang} trust={{ joined_days: 12, on_time: 3, late: 0 }} />
export default function TrustLine({ lang, trust }: { lang: Lang; trust: Trust }) {
  return <p className="trust-line">{trustText(lang, trust)}</p>;
}

function trustText(lang: Lang, { joined_days, on_time, late }: Trust): string {
  if (on_time + late === 0) return t(lang, 'trust.new');

  let joined = t(lang, 'trust.joinedDays', { n: joined_days });
  if (joined_days === 1) joined = t(lang, 'trust.joinedDay');
  if (joined_days === 0) joined = t(lang, 'trust.joinedToday');

  const returns = on_time === 1 ? t(lang, 'trust.return', { late }) : t(lang, 'trust.returns', { n: on_time, late });
  return `${joined} · ${returns}`;
}
