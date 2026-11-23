import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import TipCard from '../components/TipCard.jsx';
import { DURATIONS, START_DAYS, TIME_SLOTS, findItem } from '../data/catalog.js';
import { displayName, formatDate, formatHour, itemName, renderPhrase, spotName, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

const DAY = 24 * 60 * 60 * 1000;
const DAY_LABELS = { 0: 'borrow.today', 1: 'borrow.tomorrow', 2: 'borrow.dayAfter' }; // START_DAYS

// ISO time for "N days from today at hh:00 in Japan". Japan is always UTC+9 (no summer time),
// so this gives the same answer on a laptop in Bangladesh.
function japanTime(daysFromToday, hour) {
  const japanNow = new Date(Date.now() + 9 * 60 * 60 * 1000); // its UTC fields show the date in Japan
  const utc = Date.UTC(
    japanNow.getUTCFullYear(),
    japanNow.getUTCMonth(),
    japanNow.getUTCDate() + daysFromToday,
    hour - 9 // hh:00 in Japan is (hh - 9):00 in UTC
  );
  return new Date(utc).toISOString();
}

// The time slots that can still be picked on that day (today's earlier slots are already over).
function openSlots(dayOffset) {
  return Object.keys(TIME_SLOTS).filter((slot) => Date.parse(japanTime(dayOffset, TIME_SLOTS[slot])) > Date.now());
}

// The item page: what it is, whose it is, and the tap-only borrow request.
export default function ItemPage() {
  const { id } = useParams();
  const { user, lang } = useUser();
  const [item, setItem] = useState(null);
  const [problem, setProblem] = useState(null); // 'missing' | 'failed'

  function loadItem() {
    api
      .get(`/api/items/${id}`)
      .then(setItem)
      .catch((error) => setProblem(error.status === 404 || error.status === 403 ? 'missing' : 'failed'));
  }

  useEffect(() => {
    loadItem();
  }, [id]);

  const backLink = (
    <Link to="/" className="back-link">
      ← {t(lang, 'common.back')}
    </Link>
  );

  if (problem === 'missing') {
    return (
      <section>
        {backLink}
        <p className="notice">{t(lang, 'borrow.notAvailable')}</p>
      </section>
    );
  }
  if (problem === 'failed') return <p className="error">{t(lang, 'common.error')}</p>;
  if (!item) return <p>{t(lang, 'common.loading')}</p>;

  const mine = item.owner_id === user.id;
  const alreadyAsked = Boolean(item.my_loan_id);
  const canAsk = !mine && !alreadyAsked;
  const maxDays = item.max_days === 1 ? t(lang, 'item.maxDay') : t(lang, 'item.maxDays', { n: item.max_days });

  return (
    <section>
      {backLink}
      <header className="item-header">
        <span className="item-header-emoji" aria-hidden="true">
          {findItem(item.item_key)?.emoji}
        </span>
        <div>
          <h1>{itemName(lang, item.item_key)}</h1>
          <p className="muted">
            {mine ? t(lang, 'shelf.mine') : t(lang, 'shelf.from', { name: displayName(lang, item.owner_nickname) })}
          </p>
        </div>
      </header>
      <p className="item-facts">
        {maxDays} · {t(lang, 'item.spot', { spot: spotName(lang, item.spot) })}
      </p>

      {alreadyAsked && <AlreadyAsked item={item} />}
      {canAsk && <AskForItem item={item} onRefused={loadItem} />}
    </section>
  );
}

// The request form, or the reason why I can't ask for this item.
function AskForItem({ item, onRefused }) {
  const { lang } = useUser();
  if (item.status !== 'available') return <p className="notice">{t(lang, 'borrow.notAvailable')}</p>;
  if (!item.allowed_for_me) return <p className="notice">🔒 {t(lang, 'trust.explain')}</p>;
  return <BorrowForm item={item} onRefused={onRefused} />;
}

// I already have a pending or accepted request for this item: link to it instead of asking again.
function AlreadyAsked({ item }) {
  const { lang } = useUser();
  const navigate = useNavigate();
  return (
    <>
      <p className="notice">{t(lang, 'borrow.alreadyAsked', { name: displayName(lang, item.owner_nickname) })}</p>
      <button type="button" className="button-primary" onClick={() => navigate(`/loan/${item.my_loan_id}`)}>
        {t(lang, 'borrow.openLoan')}
      </button>
    </>
  );
}

// Day, time and length are all chips (nothing to type), and the preview shows the exact sentence
// the owner will receive, in the OWNER's language.
function BorrowForm({ item, onRefused }) {
  const { user, lang } = useUser();
  const navigate = useNavigate();
  const [dayOffset, setDayOffset] = useState(1); // tomorrow
  const [slot, setSlot] = useState('morning');
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
    label: `${t(lang, `borrow.${name}`)} ${formatHour(lang, TIME_SLOTS[name])}`,
  }));
  const lengthOptions = DURATIONS.filter((n) => n <= item.max_days).map((n) => ({
    value: n,
    label: n === 1 ? t(lang, 'borrow.day') : t(lang, 'borrow.days', { n }),
  }));

  function chooseDay(offset) {
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
      const result = await api.post('/api/loans', { item_id: item.id, start_at: startAt, end_at: endAt });
      navigate(`/loan/${result.loan.id}`, { state: { sentTo: item.owner_nickname } });
    } catch (error) {
      setBusy(false);
      // 409: someone else got it first, or I already asked (e.g. on another device).
      // 403: the owner has just switched on "trusted neighbors only".
      // Reloading the item shows the right note for all of them.
      if (error.status === 409 || error.status === 403) onRefused();
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
