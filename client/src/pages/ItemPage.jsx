import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import TipCard from '../components/TipCard.jsx';
import { DURATIONS, START_DAYS, TIME_SLOTS, findItem } from '../data/catalog.js';
import { displayName, formatDate, formatHour, itemName, renderPhrase, spotName, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MAX_FUTURE_DAYS = 14;
const DAY_LABELS = { 0: 'borrow.today', 1: 'borrow.tomorrow', 2: 'borrow.dayAfter' };

// YYYY-MM-DD in Japan time (UTC+9, no daylight saving time) for `daysFromToday`.
function japanDateKey(daysFromToday) {
  const japanDate = new Date(Date.now() + JST_OFFSET_MS + daysFromToday * DAY_MS);
  const y = japanDate.getUTCFullYear();
  const m = String(japanDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(japanDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ISO UTC string for a specific JST calendar date ("YYYY-MM-DD") at `hour:00` JST.
function japanTimeForDate(dateKey, hour) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 9)).toISOString();
}

function openSlotsForDate(dateKey) {
  return Object.keys(TIME_SLOTS).filter((slot) => Date.parse(japanTimeForDate(dateKey, TIME_SLOTS[slot])) > Date.now());
}

export default function ItemPage() {
  const { id } = useParams();
  const { user, lang } = useUser();
  const [item, setItem] = useState(null);
  const [problem, setProblem] = useState(null);

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
        {item.photo_url ? (
          <img className="item-header-photo" src={item.photo_url} alt="" />
        ) : (
          <span className="item-header-emoji" aria-hidden="true">
            {findItem(item.item_key)?.emoji}
          </span>
        )}
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

function AskForItem({ item, onRefused }) {
  const { lang } = useUser();
  if (item.status !== 'available') return <p className="notice">{t(lang, 'borrow.notAvailable')}</p>;
  if (!item.allowed_for_me) return <p className="notice">🔒 {t(lang, 'trust.explain')}</p>;
  return <BorrowForm item={item} onRefused={onRefused} />;
}

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

// Tap-only quick chips (Today / Tomorrow / Day after) PLUS exact date picker up to 14 days ahead,
// with live preview rendered in the LENDER's language.
function BorrowForm({ item, onRefused }) {
  const { user, lang } = useUser();
  const navigate = useNavigate();

  const todayKey = japanDateKey(0);
  const minDateKey = openSlotsForDate(todayKey).length > 0 ? todayKey : japanDateKey(1);
  const maxDateKey = japanDateKey(MAX_FUTURE_DAYS);

  const [dateKey, setDateKey] = useState(japanDateKey(1)); // tomorrow by default
  const [slot, setSlot] = useState('morning');
  const [days, setDays] = useState(Math.min(3, item.max_days));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const quickDayOptions = START_DAYS.map((offset) => ({
    offset,
    dateKey: japanDateKey(offset),
  }))
    .filter(({ dateKey: key }) => openSlotsForDate(key).length > 0)
    .map(({ offset, dateKey: key }) => ({
      value: key,
      label: t(lang, DAY_LABELS[offset]),
    }));

  const availableSlots = openSlotsForDate(dateKey);
  const activeSlot = availableSlots.includes(slot) ? slot : (availableSlots[0] ?? 'morning');
  const slotOptions = availableSlots.map((name) => ({
    value: name,
    label: `${t(lang, `borrow.${name}`)} ${formatHour(lang, TIME_SLOTS[name])}`,
  }));
  const lengthOptions = DURATIONS.filter((n) => n <= item.max_days).map((n) => ({
    value: n,
    label: n === 1 ? t(lang, 'borrow.day') : t(lang, 'borrow.days', { n }),
  }));

  function chooseDate(nextKey) {
    if (!nextKey || nextKey < minDateKey || nextKey > maxDateKey) return;
    setDateKey(nextKey);
    const slots = openSlotsForDate(nextKey);
    if (slots.length > 0 && !slots.includes(slot)) setSlot(slots[0]);
  }

  const startAt = japanTimeForDate(dateKey, TIME_SLOTS[activeSlot]);
  const endAt = new Date(Date.parse(startAt) + days * DAY_MS).toISOString();
  const params = { item: item.item_key, spot: item.spot, start: startAt, end: endAt, name: user.nickname };

  async function send() {
    setBusy(true);
    setFailed(false);
    try {
      const result = await api.post('/api/loans', { item_id: item.id, start_at: startAt, end_at: endAt });
      navigate(`/loan/${result.loan.id}`, { state: { sentTo: item.owner_nickname } });
    } catch (error) {
      setBusy(false);
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
          <ChipGroup label={t(lang, 'borrow.when')} options={quickDayOptions} value={dateKey} onChange={chooseDate} />
          <label className="date-picker-row">
            <span className="hint">{t(lang, 'borrow.pickDate')}</span>
            <input
              type="date"
              className="text-input date-input"
              value={dateKey}
              min={minDateKey}
              max={maxDateKey}
              onChange={(event) => chooseDate(event.target.value)}
            />
          </label>
          <ChipGroup label={t(lang, 'borrow.when')} options={slotOptions} value={activeSlot} onChange={setSlot} />
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
      <button type="button" className="button-primary" disabled={busy || availableSlots.length === 0} onClick={send}>
        {t(lang, 'borrow.send')}
      </button>
    </>
  );
}
