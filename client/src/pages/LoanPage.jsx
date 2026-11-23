import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import PhotoCapture from '../components/PhotoCapture.jsx';
import PhraseBubble from '../components/PhraseBubble.jsx';
import TipCard from '../components/TipCard.jsx';
import { QUICK_REPLIES, findItem } from '../data/catalog.js';
import { displayName, formatDate, itemName, renderPhrase, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// Quick replies ("I'm on my way", "Thank you") make sense once the lender has said yes.
const QUICK_REPLY_STATUSES = ['accepted', 'active', 'returned'];

export default function LoanPage() {
  const { id } = useParams();
  // The key makes React start fresh when the banner opens another loan while one is on the screen.
  return <Loan key={id} loanId={Number(id)} />;
}

// One loan: what it is about, the conversation, and what I can do next.
function Loan({ loanId }) {
  const { user, lang, inbox, markRead } = useUser();
  const { state } = useLocation(); // { sentTo } right after sending a request from the item page
  const [details, setDetails] = useState(null); // { loan, item, borrower, lender, messages }
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadLoan() {
    api
      .get(`/api/loans/${loanId}`)
      .then((result) => {
        setDetails(result);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }

  useEffect(() => {
    loadLoan();
  }, []);

  // New messages for this loan while it is on the screen: I can see them, so they are read.
  // Reload too, because a message usually also means a new status.
  const unreadIds = inbox.filter((message) => message.loan_id === loanId).map((message) => message.id);
  useEffect(() => {
    if (unreadIds.length === 0) return;
    loadLoan();
    markRead(unreadIds);
  }, [unreadIds.join(',')]);

  // Every button on this page: send the action, then show the updated loan from the answer.
  async function act(action, body) {
    setBusy(true);
    setFailed(false);
    try {
      setDetails(await api.post(`/api/loans/${loanId}/${action}`, body));
    } catch (error) {
      // 409: the other person was faster (e.g. cancelled). Reloading shows what happened.
      if (error.status === 409) loadLoan();
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function sendPhoto(action, file) {
    const form = new FormData();
    form.append('photo', file);
    act(action, form);
  }

  const backLink = (
    <Link to="/loans" className="back-link">
      ← {t(lang, 'common.back')}
    </Link>
  );
  const errorText = failed && <p className="error">{t(lang, 'common.error')}</p>;

  if (!details) {
    return (
      <section>
        {backLink}
        {errorText || <p>{t(lang, 'common.loading')}</p>}
      </section>
    );
  }

  const { loan, item, borrower, lender, messages } = details;
  const iAmLender = loan.lender_id === user.id;
  const other = iAmLender ? borrower : lender;
  const step = { loan, iAmLender, otherName: displayName(lang, other.nickname), lang, busy, act, sendPhoto };

  return (
    <section>
      {backLink}
      <LoanHeader loan={loan} item={item} other={other} lang={lang} />

      {state?.sentTo && loan.status === 'pending' && (
        <p className="notice">{t(lang, 'borrow.sent', { name: displayName(lang, state.sentTo) })}</p>
      )}

      <ol className="messages">
        {messages.map((message) => (
          <PhraseBubble key={message.id} message={message} lang={lang} myId={user.id} other={other} />
        ))}
      </ol>

      <LoanPhotos loan={loan} lang={lang} />

      {errorText}
      {loan.status === 'pending' && <PendingActions iAmLender={iAmLender} lang={lang} busy={busy} act={act} />}
      {loan.status === 'accepted' && <HandoverStep {...step} />}
      {loan.status === 'active' && <ReturnStep {...step} />}
      {QUICK_REPLY_STATUSES.includes(loan.status) && <QuickReplies item={item} lang={lang} busy={busy} act={act} />}
      {loan.status === 'active' && <DemoButtons loanId={loan.id} lang={lang} onDone={loadLoan} />}
    </section>
  );
}

function LoanHeader({ loan, item, other, lang }) {
  return (
    <>
      <header className="item-header">
        <span className="item-header-emoji" aria-hidden="true">
          {findItem(item.item_key)?.emoji}
        </span>
        <div>
          <h1>{itemName(lang, item.item_key)}</h1>
          <p className="muted">{t(lang, 'loans.with', { name: displayName(lang, other.nickname) })}</p>
        </div>
      </header>
      <p className="loan-facts">
        {t(lang, 'loan.period', { start: formatDate(lang, loan.start_at), end: formatDate(lang, loan.end_at) })}
      </p>
      <span className={`badge badge-${loan.status}`}>{t(lang, `status.${loan.status}`)}</span>
    </>
  );
}

// While a request waits for an answer: the lender answers, the borrower can still cancel.
function PendingActions({ iAmLender, lang, busy, act }) {
  if (!iAmLender) {
    return (
      <div className="actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={() => act('cancel')}>
          {t(lang, 'loan.cancel')}
        </button>
      </div>
    );
  }

  const decline = (reason) => act('decline', { reason });
  return (
    <div className="actions">
      <button type="button" className="button-primary" disabled={busy} onClick={() => act('accept')}>
        {t(lang, 'loan.accept')}
      </button>
      <button type="button" className="button-secondary" disabled={busy} onClick={() => decline('default')}>
        {t(lang, 'loan.decline')}
      </button>
      <button type="button" className="button-secondary" disabled={busy} onClick={() => decline('busy')}>
        {t(lang, 'loan.declineBusy')}
      </button>
    </div>
  );
}

// The condition before and after, side by side, so both people can compare.
function LoanPhotos({ loan, lang }) {
  const photos = [
    { url: loan.handover_photo, label: t(lang, 'loan.handoverPhoto') },
    { url: loan.return_photo, label: t(lang, 'loan.returnPhoto') },
  ].filter((photo) => photo.url);
  if (photos.length === 0) return null;

  return (
    <div className="loan-photos">
      {photos.map((photo) => (
        <figure key={photo.url}>
          <img src={photo.url} alt={photo.label} />
          <figcaption>{photo.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

// Accepted: the lender photographs the item, then the borrower confirms they have it.
function HandoverStep({ loan, iAmLender, otherName, lang, busy, act, sendPhoto }) {
  if (iAmLender) {
    if (loan.handover_photo) return null; // now it's the borrower's turn
    return (
      <div className="step">
        <p className="label">{t(lang, 'loan.handoverStep')}</p>
        <PhotoCapture lang={lang} busy={busy} onSend={(file) => sendPhoto('handover', file)} />
      </div>
    );
  }

  if (!loan.handover_photo) return <p className="notice">{t(lang, 'loan.waitHandover', { name: otherName })}</p>;
  return (
    <div className="step">
      <TipCard lang={lang} tipKey="atHandover" />
      <button type="button" className="button-primary" disabled={busy} onClick={() => act('received')}>
        {t(lang, 'loan.confirmReceived')}
      </button>
    </div>
  );
}

// Borrowed: the borrower photographs the item when returning it, then the lender confirms.
function ReturnStep({ loan, iAmLender, otherName, lang, busy, act, sendPhoto }) {
  if (!iAmLender) {
    if (loan.return_photo) return null; // now it's the lender's turn
    return (
      <div className="step">
        <TipCard lang={lang} tipKey="atReturn" />
        <p className="label">{t(lang, 'loan.returnStep')}</p>
        <PhotoCapture lang={lang} busy={busy} onSend={(file) => sendPhoto('return', file)} />
      </div>
    );
  }

  if (!loan.return_photo) return <p className="notice">{t(lang, 'loan.waitReturn', { name: otherName })}</p>;
  return (
    <div className="step">
      <button type="button" className="button-primary" disabled={busy} onClick={() => act('return-confirmed')}>
        {t(lang, 'loan.confirmReturn')}
      </button>
    </div>
  );
}

// Demo mode only: jump to the moments when reminders are sent, instead of waiting for days.
function DemoButtons({ loanId, lang, onDone }) {
  const [demoMode, setDemoMode] = useState(false);

  // The demo routes only exist in demo mode, so an answer means it is on (like on the join page).
  useEffect(() => {
    api
      .get('/api/demo/users')
      .then(() => setDemoMode(true))
      .catch(() => setDemoMode(false));
  }, []);

  async function fastForward(to) {
    try {
      await api.post(`/api/demo/fast-forward/${loanId}`, { to });
    } catch {
      // E.g. the item was returned in the meantime: reloading the loan shows what happened.
    }
    onDone();
  }

  if (!demoMode) return null;
  return (
    <div className="demo-buttons">
      <button type="button" onClick={() => fastForward('dueSoon')}>
        {t(lang, 'loan.demoDueSoon')}
      </button>
      <button type="button" onClick={() => fastForward('overdue')}>
        {t(lang, 'loan.demoOverdue')}
      </button>
    </div>
  );
}

// Fixed phrases instead of typing. Each chip shows the whole sentence that will be sent.
function QuickReplies({ item, lang, busy, act }) {
  return (
    <div className="quick-replies">
      <p className="label">{t(lang, 'loan.quickReplies')}</p>
      <div className="chip-group">
        {QUICK_REPLIES.map((phraseKey) => (
          <button
            key={phraseKey}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => act('quick-reply', { phrase_key: phraseKey })}
          >
            {renderPhrase(lang, phraseKey, { spot: item.spot })}
          </button>
        ))}
      </div>
    </div>
  );
}
