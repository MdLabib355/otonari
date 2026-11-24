import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { LoanDetails, LoanStatus } from '../../../../shared/types.ts';
import { api, errorStatus } from '../../core/api.ts';
import PhraseBubble from '../message/PhraseBubble.tsx';
import { ArrowLeftIcon, PinIcon } from '../../components/Icons.tsx';
import { displayName, formatDate, spotName, t } from '../../i18n/index.ts';
import { useMember } from '../../core/UserContext.ts';
import DemoButtons from '../demo/DemoButtons.tsx';
import HandoverStep from './HandoverStep.tsx';
import LoanHeader from './LoanHeader.tsx';
import LoanPhotos from './LoanPhotos.tsx';
import type { StepProps } from './loanProps.ts';
import PendingActions from './PendingActions.tsx';
import QuickReplies from './QuickReplies.tsx';
import ReturnStep from './ReturnStep.tsx';

// Quick replies ("I'm on my way", "Thank you") make sense once the lender has said yes.
const QUICK_REPLY_STATUSES: LoanStatus[] = ['accepted', 'active', 'returned'];

export default function LoanPage() {
  const { id } = useParams();
  // The key makes React start fresh when the banner opens another loan while one is on the screen.
  return <Loan key={id} loanId={Number(id)} />;
}

// One loan: what it is about, the conversation, and what I can do next.
function Loan({ loanId }: { loanId: number }) {
  const { user, lang, inbox, markRead } = useMember();
  // { sentTo } right after sending a request from the item page
  const state: { sentTo?: string } | null = useLocation().state;
  const [details, setDetails] = useState<LoanDetails | null>(null); // { loan, item, borrower, lender, messages }
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  function loadLoan() {
    api
      .get<LoanDetails>(`/loans/${loanId}`)
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
      setDetails(await api.post<LoanDetails>(`/loans/${loanId}/${action}`, body));
    } catch (error) {
      // 409: the other person was faster (e.g. cancelled). Reloading shows what happened.
      if (errorStatus(error) === 409) loadLoan();
      else setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function sendPhoto(action: 'handover-photo' | 'return-photo', file: Blob) {
    const form = new FormData();
    form.append('photo', file);
    act(action, form);
  }

  const backLink = (
    <Link to="/loans" className="back-link">
      <ArrowLeftIcon className="icon-sm" /> {t(lang, 'common.back')}
    </Link>
  );
  const errorText = failed && <p className="error">{t(lang, 'common.error')}</p>;

  if (!details) {
    return (
      <section className="wide-page">
        {backLink}
        {errorText || <p>{t(lang, 'common.loading')}</p>}
      </section>
    );
  }

  const { loan, item, borrower, lender, borrower_trust, messages } = details;
  const iAmLender = loan.lender_id === user.id;
  const other = iAmLender ? borrower : lender;
  const otherName = displayName(lang, other.nickname);
  const step: StepProps = { loan, iAmLender, otherName, lang, busy, act, sendPhoto };

  return (
    <section className="wide-page">
      {backLink}
      <div className="loan-workspace">
        <aside className="loan-sidebar">
          <LoanHeader loan={loan} item={item} other={other} lang={lang} />
          {loan.status === 'accepted' && (
            <p className="handover-summary inline-icon-text">
              <PinIcon className="icon-sm" />
              <span>
                {t(lang, 'loan.handoverSummary', { spot: spotName(lang, item.spot), start: formatDate(lang, loan.start_at) })}
              </span>
            </p>
          )}
          <LoanPhotos loan={loan} lang={lang} />
        </aside>

        <div className="loan-thread">
          {state?.sentTo && loan.status === 'pending' && (
            <p className="notice">{t(lang, 'borrow.sent', { name: displayName(lang, state.sentTo) })}</p>
          )}

          <ol className="messages" ref={messageList}>
            {messages.map((message) => (
              <PhraseBubble key={message.id} message={message} lang={lang} myId={user.id} other={other} />
            ))}
          </ol>

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
        </div>
      </div>
    </section>
  );
}
