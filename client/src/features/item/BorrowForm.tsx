import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ItemDetails, LoanDetails } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import TipCard from '../../components/TipCard.tsx';
import { api, errorStatus } from '../../core/api.ts';
import { useMember } from '../../core/UserContext.ts';
import { DURATIONS, START_DAYS, TIME_SLOTS, type TimeSlot } from '../../data/catalog.ts';
import { formatDate, renderPhrase, t, type UiKey } from '../../i18n/index.ts';
import { japanTime, openSlots } from './borrowTimes.ts';

const DAY = 24 * 60 * 60 * 1000;
const DAY_LABELS: Record<number, UiKey> = { 0: 'borrow.today', 1: 'borrow.tomorrow', 2: 'borrow.dayAfter' }; // START_DAYS

interface Props {
  item: ItemDetails;
  onRefused: () => void;
}

// Day, time and length are all chips (nothing to type), and the preview shows the exact sentence
// the owner will receive, in the OWNER's language.
export default function BorrowForm({ item, onRefused }: Props) {
  const { user, lang } = useMember();
  const navigate = useNavigate();
  const [dayOffset, setDayOffset] = useState(1); // tomorrow
  const [slot, setSlot] = useState<TimeSlot>('morning');
  const [days, setDays] = useState(Math.min(3, item.max_days));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Late in the evening "Today" has no time slots left, so it is not offered.
  const dayOptions = START_DAYS.filter((offset) => openSlots(offset).length > 0).map((offset) => ({
    value: offset,
    label: t(lang, DAY_LABELS[offset]),
  }));
  const slotOptions = openSlots(dayOffset).map((name) => ({
    value: name,
    label: `${t(lang, `borrow.${name}`)} ${TIME_SLOTS[name]}:00`,
  }));
  const lengthOptions = DURATIONS.filter((n) => n <= item.max_days).map((n) => ({
    value: n,
    label: n === 1 ? t(lang, 'borrow.day') : t(lang, 'borrow.days', { n }),
  }));

  function chooseDay(offset: number) {
    setDayOffset(offset);
    // Switching to today: if the chosen time is already over, take the next one that is still open.
    const slots = openSlots(offset);
    if (!slots.includes(slot)) setSlot(slots[0]);
  }

  const startAt = japanTime(dayOffset, TIME_SLOTS[slot]);
  const endAt = new Date(Date.parse(startAt) + days * DAY).toISOString();
  // Exactly the params the server stores with the 'request' message (name = me, seen by the owner).
  const params = { item: item.item_key, spot: item.spot, start: startAt, end: endAt, name: user.nickname };

  async function send() {
    setBusy(true);
    setFailed(false);
    try {
      const result = await api.post<LoanDetails>('/api/loans', { item_id: item.id, start_at: startAt, end_at: endAt });
      navigate(`/loan/${result.loan.id}`, { state: { sentTo: item.owner_nickname } });
    } catch (error) {
      setBusy(false);
      // 409: someone else got it first, or I already asked (e.g. on another device).
      // 403: the owner has just switched on "trusted neighbors only".
      // Reloading the item shows the right note for all of them.
      const status = errorStatus(error);
      if (status === 409 || status === 403) onRefused();
      else setFailed(true);
    }
  }

  return (
    <>
      <TipCard lang={lang} tipKey="beforeRequest" />

      <div className="field">
        <p className="label">{t(lang, 'borrow.when')}</p>
        <div className="chip-stack">
          <ChipGroup label={t(lang, 'borrow.when')} options={dayOptions} value={dayOffset} onChange={chooseDay} />
          <ChipGroup label={t(lang, 'borrow.when')} options={slotOptions} value={slot} onChange={setSlot} />
        </div>
      </div>

      <div className="field">
        <p className="label">{t(lang, 'borrow.howLong')}</p>
        <ChipGroup label={t(lang, 'borrow.howLong')} options={lengthOptions} value={days} onChange={setDays} />
        <p className="period">
          {t(lang, 'loan.period', { start: formatDate(lang, startAt), end: formatDate(lang, endAt) })}
        </p>
      </div>

      <div className="preview">
        <p className="label">{t(lang, 'borrow.preview')}</p>
        <p className="preview-bubble" lang={item.owner_lang === 'ja-easy' ? 'ja' : item.owner_lang}>
          {renderPhrase(item.owner_lang, 'request', params)}
        </p>
      </div>

      {failed && <p className="error">{t(lang, 'common.error')}</p>}
      <button type="button" className="button-primary" disabled={busy} onClick={send}>
        {t(lang, 'borrow.send')}
      </button>
    </>
  );
}
