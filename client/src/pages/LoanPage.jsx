import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import {
  ArrowLeftIconWrapped,
  BellIcon,
  CameraIcon,
  CheckIcon,
  PinIcon,
  WarningIcon,
} from '../components/Icons.jsx';
import PhotoCapture, { shrinkPhoto } from '../components/PhotoCapture.jsx';
import PhraseBubble from '../components/PhraseBubble.jsx';
import TipCard from '../components/TipCard.jsx';
import TrustLine from '../components/TrustLine.jsx';
import { ISSUE_KEYS, QUICK_REPLIES, STAMPS, findItem } from '../data/catalog.js';
import { displayName, formatDate, itemName, renderPhrase, spotName, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

const QUICK_REPLY_STATUSES = ['accepted', 'active', 'returned'];

export default function LoanPage() {
  const { id } = useParams();
  return <Loan key={id} loanId={Number(id)} />;
}

function Loan({ loanId }) {
  const { user, lang, inbox, markRead, refreshInbox } = useUser();
  const { state } = useLocation();
  const [details, setDetails] = useState(null);
  const [failed, setFailed] = useState(false);
  const [pingNotice, setPingNotice] = useState(null);
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

  const unreadIds = inbox.filter((message) => message.loan_id === loanId).map((message) => message.id);
  useEffect(() => {
    if (unreadIds.length === 0) return;
    loadLoan();
    markRead(unreadIds);
  }, [unreadIds.join(',')]);

  const messageList = useRef(null);
  useEffect(() => {
    messageList.current?.lastElementChild?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [details?.messages.length]);

  async function act(action, body) {
    setBusy(true);
    setFailed(false);
    setPingNotice(null);
    try {
      setDetails(await api.post(`/api/loans/${loanId}/${action}`, body));
      if (action === 'return' || action === 'return-confirmed' || action === 'cancel') {
        refreshInbox();
      }
      return true;
    } catch (error) {
      if (action === 'ping' && error.status === 429) {
        setPingNotice(t(lang, 'loan.pingCooldown'));
      } else if (error.status === 409) {
        loadLoan();
      } else {
        setFailed(true);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  function sendPhoto(action, file) {
    const form = new FormData();
    form.append('photo', file, `${action}.jpg`);
    act(action, form);
  }

  const backLink = (
    <Link to="/loans" className="back-link">
      <ArrowLeftIconWrapped className="icon-sm" /> {t(lang, 'common.back')}
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
  const step = { loan, iAmLender, otherName: displayName(lang, other.nickname), lang, busy, act, sendPhoto, pingNotice };

  return (
    <section className="wide-page">
      {backLink}
      <div className="loan-workspace">
        <aside className="loan-sidebar">
          <LoanHeader loan={loan} item={item} other={other} lang={lang} />

          {(loan.status === 'accepted' || loan.status === 'active') && (
            <p className="handover-summary inline-icon-text">
              <PinIcon className="icon-sm" />
              <span>
                {t(lang, 'loan.handoverSummary', {
                  spot: spotName(lang, item.spot),
                  start: formatDate(lang, loan.start_at),
                })}
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
              loanId={loan.id}
              iAmLender={iAmLender}
              trust={borrower_trust}
              lang={lang}
              busy={busy}
              act={act}
            />
          )}
          {loan.status === 'accepted' && <HandoverStep {...step} />}
          {loan.status === 'active' && <ReturnStep {...step} />}
          {loan.status === 'returned' && <ThankYouStamps item={item} lang={lang} busy={busy} act={act} />}
          {QUICK_REPLY_STATUSES.includes(loan.status) && <QuickReplies item={item} lang={lang} busy={busy} act={act} />}
          {(loan.status === 'active' || loan.status === 'returned') && (
            <ReportIssue item={item} lang={lang} busy={busy} act={act} />
          )}
          {loan.status === 'active' && (
            <DemoButtons
              loanId={loan.id}
              lang={lang}
              onDone={() => {
                loadLoan();
                refreshInbox();
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function LoanHeader({ loan, item, other, lang }) {
  return (
    <>
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
          <p className="muted">{t(lang, 'loans.with', { name: displayName(lang, other.nickname) })}</p>
        </div>
      </header>
      <p className="loan-facts">
        {t(lang, 'loan.period', { start: formatDate(lang, loan.start_at), end: formatDate(lang, loan.end_at) })}
      </p>
      <span className={`badge badge-${loan.status}`}>{t(lang, `status.${loan.status}`)}</span>
      <LoanStepper status={loan.status} lang={lang} />
    </>
  );
}

const STEP_ORDER = ['pending', 'accepted', 'active', 'returned'];

function LoanStepper({ status, lang }) {
  const activeIndex = STEP_ORDER.indexOf(status);
  if (activeIndex === -1) return null;

  return (
    <ol className="loan-stepper" aria-label={t(lang, `status.${status}`)}>
      {STEP_ORDER.map((step, idx) => {
        const done = idx < activeIndex || (idx === activeIndex && status === 'returned');
        const current = idx === activeIndex && status !== 'returned';
        return (
          <li
            key={step}
            aria-current={current ? 'step' : undefined}
            className={done ? 'stepper-step done' : current ? 'stepper-step current' : 'stepper-step'}
          >
            <span className="stepper-dot" aria-hidden="true">
              {done ? <CheckIcon className="icon-xs" /> : idx + 1}
            </span>
            <span className="stepper-label">{t(lang, `status.${step}`).split(/[—・]/)[0].trim()}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PendingActions({ loanId, iAmLender, trust, lang, busy, act }) {
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
      <FirstRequestTip loanId={loanId} lang={lang} />
      <TrustLine lang={lang} trust={trust} />
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

function FirstRequestTip({ loanId, lang }) {
  const [isFirst, setIsFirst] = useState(false);

  useEffect(() => {
    api
      .get('/api/loans')
      .then(({ lending }) => {
        const otherLanguage = lending.filter((loan) => loan.other_lang !== lang);
        setIsFirst(otherLanguage.at(-1)?.id === loanId);
      })
      .catch(() => setIsFirst(false));
  }, [loanId, lang]);

  return isFirst && <TipCard lang={lang} tipKey="forLender" />;
}

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

function HandoverStep({ loan, iAmLender, otherName, lang, busy, act, sendPhoto }) {
  const cancelBeforeHandover = !loan.handover_photo && (
    <button type="button" className="button-secondary" disabled={busy} onClick={() => act('cancel')}>
      {t(lang, 'loan.cancelAccepted')}
    </button>
  );

  if (iAmLender) {
    if (loan.handover_photo) return null;
    return (
      <div className="step">
        <p className="label">{t(lang, 'loan.handoverStep')}</p>
        <PhotoCapture lang={lang} busy={busy} onSend={(file) => sendPhoto('handover', file)} />
        <div className="actions">{cancelBeforeHandover}</div>
      </div>
    );
  }

  if (!loan.handover_photo) {
    return (
      <div className="step">
        <p className="notice">{t(lang, 'loan.waitHandover', { name: otherName })}</p>
        <div className="actions">{cancelBeforeHandover}</div>
      </div>
    );
  }
  return (
    <div className="step">
      <TipCard lang={lang} tipKey="atHandover" />
      <button type="button" className="button-primary" disabled={busy} onClick={() => act('received')}>
        {t(lang, 'loan.confirmReceived')}
      </button>
    </div>
  );
}

function ReturnStep({ loan, iAmLender, otherName, lang, busy, act, sendPhoto, pingNotice }) {
  if (!iAmLender) {
    if (loan.return_photo) return null;
    return (
      <div className="step">
        <TipCard lang={lang} tipKey="atReturn" />
        <p className="label">{t(lang, 'loan.returnStep')}</p>
        <PhotoCapture lang={lang} busy={busy} onSend={(file) => sendPhoto('return', file)} />
      </div>
    );
  }

  if (!loan.return_photo) {
    const isOverdue = Date.now() > Date.parse(loan.end_at);
    return (
      <div className="step">
        <p className="notice">{t(lang, 'loan.waitReturn', { name: otherName })}</p>
        <div className="actions ping-section">
          <button type="button" className="button-secondary inline-btn" disabled={busy} onClick={() => act('ping')}>
            <BellIcon className="icon-sm" /> {t(lang, isOverdue ? 'loan.pingOverdue' : 'loan.pingNeedBack')}
          </button>
          {pingNotice && <p className="hint">{pingNotice}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="step">
      <button type="button" className="button-primary" disabled={busy} onClick={() => act('return-confirmed')}>
        {t(lang, 'loan.confirmReturn')}
      </button>
    </div>
  );
}

function ThankYouStamps({ item, lang, busy, act }) {
  return (
    <div className="step">
      <p className="label">{t(lang, 'loan.stampsTitle')}</p>
      <div className="chip-group">
        {STAMPS.map((stamp) => (
          <button
            key={stamp.key}
            type="button"
            className="chip chip-stamp"
            disabled={busy}
            onClick={() => act('stamp', { stamp_key: stamp.key })}
          >
            {renderPhrase(lang, stamp.key, { item: item.item_key })}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportIssue({ item, lang, busy, act }) {
  const [open, setOpen] = useState(false);
  const [issueKey, setIssueKey] = useState(ISSUE_KEYS[0]);
  const [photo, setPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoRefused, setPhotoRefused] = useState(false);

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  async function pickPhoto(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setPhoto(null);
    setPhotoRefused(false);
    setPhotoBusy(true);
    try {
      const jpeg = await shrinkPhoto(file);
      setPhoto({ file: jpeg, url: URL.createObjectURL(jpeg) });
    } catch {
      setPhotoRefused(true);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function sendIssue() {
    let payload;
    if (photo) {
      const form = new FormData();
      form.append('issue_key', issueKey);
      form.append('photo', photo.file, 'issue.jpg');
      payload = form;
    } else {
      payload = { issue_key: issueKey };
    }
    const ok = await act('issue', payload);
    if (ok) {
      setPhoto(null);
      setOpen(false);
    }
  }

  return (
    <div className="step">
      {!open ? (
        <button type="button" className="text-button inline-icon-text" onClick={() => setOpen(true)}>
          <WarningIcon className="icon-sm" /> {t(lang, 'loan.reportIssue')}
        </button>
      ) : (
        <div className="issue-box">
          <p className="label inline-icon-text">
            <WarningIcon className="icon-sm" /> {t(lang, 'loan.reportIssue')}
          </p>
          <div className="chip-stack">
            {ISSUE_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={key === issueKey ? 'chip selected issue-chip' : 'chip issue-chip'}
                onClick={() => setIssueKey(key)}
              >
                {renderPhrase(lang, key, { item: item.item_key, spot: item.spot })}
              </button>
            ))}
          </div>
          <div className="actions" style={{ marginTop: 12, marginBottom: 0 }}>
            <label className="photo-button button-secondary">
              <CameraIcon /> {t(lang, 'loan.issuePhotoOptional')}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="visually-hidden"
                disabled={busy || photoBusy}
                onChange={pickPhoto}
              />
            </label>
            {photoRefused && <p className="error">{t(lang, 'loan.photoRefused')}</p>}
            {photo && <img className="photo-preview" src={photo.url} alt="" />}
            <button type="button" className="button-primary" disabled={busy || photoBusy} onClick={sendIssue}>
              {t(lang, 'loan.sendIssue')}
            </button>
            <button type="button" className="button-secondary" onClick={() => setOpen(false)}>
              {t(lang, 'myItems.cancelEdit')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DemoButtons({ loanId, lang, onDone }) {
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    api
      .get('/api/health')
      .then((health) => setDemoMode(Boolean(health?.demo_mode)))
      .catch(() => setDemoMode(false));
  }, []);

  async function fastForward(to) {
    try {
      await api.post(`/api/demo/fast-forward/${loanId}`, { to });
    } catch {
      // Loan status may have changed concurrently; reloading reflects latest state.
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
