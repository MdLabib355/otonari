import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type {
  Lang,
  Loan as LoanData,
  LoanDetails,
  LoanItem,
  LoanStatus,
  MyLoans,
  Person,
  Trust,
} from '../../../shared/types.ts';
import { api, errorStatus } from '../api.ts';
import PhotoCapture from '../components/PhotoCapture.tsx';
import PhraseBubble from '../components/PhraseBubble.tsx';
import TipCard from '../components/TipCard.tsx';
import TrustLine from '../components/TrustLine.tsx';
import { QUICK_REPLIES, findItem } from '../data/catalog.ts';
import { displayName, formatDate, itemName, renderPhrase, t } from '../i18n/index.ts';
import { useMember } from '../UserContext.ts';

// Quick replies ("I'm on my way", "Thank you") make sense once the lender has said yes.
const QUICK_REPLY_STATUSES: LoanStatus[] = ['accepted', 'active', 'returned'];

// Sends an action ('accept', 'received', ...) for this loan.
type Act = (action: string, body?: object) => void;

// What the handover step and the return step need.
interface StepProps {
  loan: LoanData;
  iAmLender: boolean;
  otherName: string;
  lang: Lang;
  busy: boolean;
  act: Act;
  sendPhoto: (action: 'handover' | 'return', file: Blob) => void;
}

export default function LoanPage() {
  const { id } = useParams();
  // The key makes React start fresh when the banner opens another loan while one is on the screen.
  return <Loan key={id} loanId={Number(id)} />;
}

// One loan: what it is about, the conversation, and what I can do next.
function Loan({ loanId }: { loanId: number }) {
  const { user, lang, inbox, markRead } = useMember();
  const state: { sentTo?: string } | null = useLocation().state; // { sentTo } right after sending a request from the item page
  const [details, setDetails] = useState<LoanDetails | null>(null); // { loan, item, borrower, lender, messages }
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadLoan() {
    api
      .get<LoanDetails>(`/api/loans/${loanId}`)
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

  // The newest message comes into view: when the page opens, and whenever another one arrives.
  const messageList = useRef<HTMLOListElement>(null);
  useEffect(() => {
    messageList.current?.lastElementChild?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [details?.messages.length]);

  // Every button on this page: send the action, then show the updated loan from the answer.
  async function act(action: string, body?: object) {
    setBusy(true);
    setFailed(false);
    try {
      setDetails(await api.post<LoanDetails>(`/api/loans/${loanId}/${action}`, body));
    } catch (error) {
      // 409: the other person was faster (e.g. cancelled). Reloading shows what happened.
      if (errorStatus(error) === 409) loadLoan();
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function sendPhoto(action: 'handover' | 'return', file: Blob) {
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

  const { loan, item, borrower, lender, borrower_trust, messages } = details;
  const iAmLender = loan.lender_id === user.id;
  const other = iAmLender ? borrower : lender;
  const step: StepProps = { loan, iAmLender, otherName: displayName(lang, other.nickname), lang, busy, act, sendPhoto };

  return (
    <section>
      {backLink}
      <LoanHeader loan={loan} item={item} other={other} lang={lang} />

      {state?.sentTo && loan.status === 'pending' && (
        <p className="notice">{t(lang, 'borrow.sent', { name: displayName(lang, state.sentTo) })}</p>
      )}

      <ol className="messages" ref={messageList}>
        {messages.map((message) => (
          <PhraseBubble key={message.id} message={message} lang={lang} myId={user.id} other={other} />
        ))}
      </ol>

      <LoanPhotos loan={loan} lang={lang} />

      {errorText}
      {loan.status === 'pending' && (
        <PendingActions
          loan={loan}
          iAmLender={iAmLender}
          trust={borrower_trust}
          lang={lang}
          busy={busy}
          act={act}
        />
      )}
      {loan.status === 'accepted' && <HandoverStep {...step} />}
      {loan.status === 'active' && <ReturnStep {...step} />}
      {QUICK_REPLY_STATUSES.includes(loan.status) && <QuickReplies item={item} lang={lang} busy={busy} act={act} />}
      {loan.status === 'active' && <DemoButtons loanId={loan.id} lang={lang} onDone={loadLoan} />}
    </section>
  );
}

interface LoanHeaderProps {
  loan: LoanData;
  item: LoanItem;
  other: Person;
  lang: Lang;
}

function LoanHeader({ loan, item, other, lang }: LoanHeaderProps) {
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

interface PendingActionsProps {
  loan: LoanData;
  iAmLender: boolean;
  trust: Trust | null;
  lang: Lang;
  busy: boolean;
  act: Act;
}

// While a request waits for an answer: the lender answers, the borrower can still cancel.
function PendingActions({ loan, iAmLender, trust, lang, busy, act }: PendingActionsProps) {
  if (!iAmLender) {
    return (
      <div className="actions">
        <button type="button" className="button-secondary" disabled={busy} onClick={() => act('cancel')}>
          {t(lang, 'loan.cancel')}
        </button>
      </div>
    );
  }

  const datesOver = Date.parse(loan.end_at) <= Date.now(); // too late for a yes
  const decline = (reason: 'default' | 'busy') => act('decline', { reason });
  return (
    <div className="actions">
      <FirstRequestTip loanId={loan.id} lang={lang} />
      {trust && <TrustLine lang={lang} trust={trust} />}
      {datesOver ? (
        <p className="notice">{t(lang, 'loan.datesOver')}</p>
      ) : (
        <button type="button" className="button-primary" disabled={busy} onClick={() => act('accept')}>
          {t(lang, 'loan.accept')}
        </button>
      )}
      <button type="button" className="button-secondary" disabled={busy} onClick={() => decline('default')}>
        {t(lang, 'loan.decline')}
      </button>
      <button type="button" className="button-secondary" disabled={busy} onClick={() => decline('busy')}>
        {t(lang, 'loan.declineBusy')}
      </button>
    </div>
  );
}

// Only on the first request a lender ever gets from someone who uses another language: don't worry.
function FirstRequestTip({ loanId, lang }: { loanId: number; lang: Lang }) {
  const [isFirst, setIsFirst] = useState(false);

  useEffect(() => {
    api
      .get<MyLoans>('/api/loans')
      .then(({ lending }) => {
        const otherLanguage = lending.filter((loan) => loan.other_lang !== lang);
        setIsFirst(otherLanguage.at(-1)?.id === loanId); // newest first, so the last one is the first
      })
      .catch(() => setIsFirst(false));
  }, [loanId, lang]);

  return isFirst && <TipCard lang={lang} tipKey="forLender" />;
}

// The condition before and after, side by side, so both people can compare.
function LoanPhotos({ loan, lang }: { loan: LoanData; lang: Lang }) {
  const photos = [
    { url: loan.handover_photo, label: t(lang, 'loan.handoverPhoto') },
    { url: loan.return_photo, label: t(lang, 'loan.returnPhoto') },
  ];
  const taken = photos.flatMap(({ url, label }) => (url ? [{ url, label }] : []));
  if (taken.length === 0) return null;

  return (
    <div className="loan-photos">
      {taken.map((photo) => (
        <figure key={photo.url}>
          <img src={photo.url} alt={photo.label} />
          <figcaption>{photo.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

// Accepted: the lender photographs the item, then the borrower confirms they have it.
function HandoverStep({ loan, iAmLender, otherName, lang, busy, act, sendPhoto }: StepProps) {
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
function ReturnStep({ loan, iAmLender, otherName, lang, busy, act, sendPhoto }: StepProps) {
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
function DemoButtons({ loanId, lang, onDone }: { loanId: number; lang: Lang; onDone: () => void }) {
  const [demoMode, setDemoMode] = useState(false);

  // The demo routes only exist in demo mode, so an answer means it is on (like on the join page).
  useEffect(() => {
    api
      .get('/api/demo/users')
      .then(() => setDemoMode(true))
      .catch(() => setDemoMode(false));
  }, []);

  async function fastForward(to: 'dueSoon' | 'overdue') {
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
function QuickReplies({ item, lang, busy, act }: { item: LoanItem; lang: Lang; busy: boolean; act: Act }) {
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
