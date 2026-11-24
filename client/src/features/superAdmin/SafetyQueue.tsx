import { useEffect, useState } from 'react';
import type {
  BreakGlassEvidence,
  BreakGlassUnlockResponse,
  DisputeSummary,
} from '../../../../shared/types.ts';
import { api, ApiError } from '../../core/api.ts';
import ItemVisual from '../../components/ItemVisual.tsx';
import { formatDate, itemDisplayTitle, renderPhrase } from '../../i18n/index.ts';

const BREAK_GLASS_REASONS = [
  'Damaged Item Claim',
  'Unresolved Overdue Escalation',
  'Safety / Abuse Investigation',
];

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface SafetyQueueProps {
  disputes: DisputeSummary[];
  onRefresh: () => Promise<void>;
  onNotify: (text: string, isError?: boolean) => void;
}

export default function SafetyQueue({ disputes, onRefresh, onNotify }: SafetyQueueProps) {
  const [selectedId, setSelectedId] = useState<number | null>(disputes[0]?.id ?? null);
  const [reason, setReason] = useState(BREAK_GLASS_REASONS[0]);
  const [unlockedReason, setUnlockedReason] = useState<string>('');
  const [evidence, setEvidence] = useState<BreakGlassEvidence | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);

  const dispute = disputes.find((d) => d.id === selectedId) ?? disputes[0] ?? null;
  const isUnlocked = Boolean(evidence && evidence.dispute_id === dispute?.id && remainingSeconds > 0);

  useEffect(() => {
    if (!isUnlocked) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setEvidence(null);
          onNotify('Break-Glass session expired and re-locked automatically.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isUnlocked, onNotify]);

  async function unlockBreakGlass() {
    if (!dispute) return;
    setBusy(true);
    try {
      const grant = await api.post<BreakGlassUnlockResponse>(`/super-admin/disputes/${dispute.id}/break-glass`, {
        reason,
      });
      const data = await api.get<BreakGlassEvidence>(`/super-admin/disputes/${dispute.id}/evidence`, {
        'X-Break-Glass-Token': grant.break_glass_token,
      });
      setEvidence(data);
      setUnlockedReason(grant.reason);
      setRemainingSeconds(grant.ttl_seconds);
      await onRefresh();
      onNotify('Break-Glass access unlocked (15:00) and recorded in Audit Log.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Unable to unlock Break-Glass access', true);
    } finally {
      setBusy(false);
    }
  }

  function relock() {
    setEvidence(null);
    setRemainingSeconds(0);
    onNotify('Break-Glass privacy shield re-locked.');
  }

  async function sendNotice() {
    if (!dispute) return;
    setBusy(true);
    try {
      await api.post(`/super-admin/disputes/${dispute.id}/notice`);
      await onRefresh();
      onNotify('Structured platform escalation notice dispatched in each resident’s language.');
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Failed to send notice', true);
    } finally {
      setBusy(false);
    }
  }

  async function markResolved() {
    if (!dispute) return;
    setBusy(true);
    try {
      await api.patch(`/super-admin/disputes/${dispute.id}/resolve`, {
        resolution_note: `Resolved after Break-Glass inspection (${unlockedReason || reason})`,
      });
      await onRefresh();
      onNotify(`Dispute #${dispute.id} marked as resolved.`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Failed to resolve dispute', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="sa-page-head">
        <div>
          <h1>Break-Glass Dispute Inspection</h1>
          <p>
            Zero-snoop privacy control: condition photos and structured logs stay blurred until a mandatory audit
            reason is recorded for a 15-minute session.
          </p>
        </div>
        <span className={`ga-badge ${disputes.some((d) => d.status === 'open') ? 'ga-badge-amber' : 'ga-badge-green'}`}>
          {disputes.filter((d) => d.status === 'open').length} Open Escalation(s)
        </span>
      </div>

      {disputes.length === 0 ? (
        <div className="sa-card">
          <p className="ga-meta">No disputes have been escalated to the Super Admin Safety Queue.</p>
        </div>
      ) : (
        <>
          {disputes.length > 1 && (
            <div className="sa-card">
              <div className="ga-actions">
                {disputes.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`ga-btn ${dispute?.id === d.id ? 'ga-btn-primary' : ''}`}
                    onClick={() => {
                      setSelectedId(d.id);
                      setEvidence(null);
                      setRemainingSeconds(0);
                    }}
                  >
                    #{d.id} · Loan #{d.loan_id} ({d.status})
                  </button>
                ))}
              </div>
            </div>
          )}

          {dispute && (
            <div className="sa-card">
              <div className="sa-card-head">
                <ItemVisual itemKey={dispute.item_key} categoryKey={dispute.category_key} alt="" size="sm" />
                <div className="sa-grow">
                  <h2>
                    Loan #{dispute.loan_id} — {itemDisplayTitle('en', dispute.item_key, dispute.custom_title)} ({dispute.group_name})
                  </h2>
                  <p className="ga-meta">
                    Borrower: <strong>{dispute.borrower_nickname}</strong> ({dispute.borrower_lang}) · Lender:{' '}
                    <strong>{dispute.lender_nickname}</strong> ({dispute.lender_lang}) · Reason:{' '}
                    <code>{dispute.reason_key}</code>
                  </p>
                </div>

                <div className="ga-actions">
                  {isUnlocked && <span className="sa-countdown">{formatCountdown(remainingSeconds)}</span>}
                  <span className={`ga-badge ${isUnlocked ? 'ga-badge-amber' : 'ga-badge-indigo'}`}>
                    {isUnlocked ? 'Break-Glass Active' : 'Privacy Shield Locked'}
                  </span>
                  <span className={`ga-badge ${dispute.status === 'resolved' ? 'ga-badge-green' : 'ga-badge-amber'}`}>
                    {dispute.status}
                  </span>
                </div>
              </div>

              {isUnlocked && (
                <div className="sa-alert sa-alert-amber">
                  <div>
                    <strong>Audited Inspection Session:</strong> Reason recorded as <em>&ldquo;{unlockedReason}&rdquo;</em>.
                    Automatically locks at 00:00.
                  </div>
                  <div className="ga-actions">
                    <button
                      type="button"
                      className="ga-btn ga-btn-soft"
                      disabled={busy || dispute.escalation_notice_sent}
                      onClick={sendNotice}
                    >
                      {dispute.escalation_notice_sent ? 'Escalation Notice Sent' : 'Send Platform Escalation Notice'}
                    </button>
                    <button
                      type="button"
                      className="ga-btn ga-btn-green"
                      disabled={busy || dispute.status === 'resolved'}
                      onClick={markResolved}
                    >
                      {dispute.status === 'resolved' ? 'Resolved' : 'Mark Dispute Resolved'}
                    </button>
                    <button type="button" className="ga-btn" onClick={relock}>
                      Re-Lock Session
                    </button>
                  </div>
                </div>
              )}

              <div className="sa-evidence-stage">
                {!isUnlocked && (
                  <div className="sa-privacy-overlay">
                    <div className="sa-privacy-card">
                      <h3>Privacy Shield Active</h3>
                      <p className="ga-meta" style={{ marginBottom: 14 }}>
                        Condition photos and neighbor message logs are inaccessible by default. Select a mandatory
                        audit reason to unlock a 15-minute signed read-only session.
                      </p>
                      <div className="field" style={{ textAlign: 'left' }}>
                        <label className="label" htmlFor="sa-bg-reason">
                          Mandatory Audit Reason
                        </label>
                        <select
                          id="sa-bg-reason"
                          className="select-input"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        >
                          {BREAK_GLASS_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        className="button-primary"
                        disabled={busy}
                        onClick={unlockBreakGlass}
                      >
                        Unlock Break-Glass Access (15 min)
                      </button>
                    </div>
                  </div>
                )}

                <div className={`sa-evidence-inner ${isUnlocked ? '' : 'blurred'}`}>
                  <div className="ga-photo-grid">
                    <div className="ga-photo-box">
                      <span className="ga-badge ga-badge-green">Handover Condition Photo (Before)</span>
                      {evidence?.handover_photo ? (
                        <img src={evidence.handover_photo} alt="Handover before condition" />
                      ) : (
                        <p className="ga-meta" style={{ marginTop: 10 }}>
                          No handover photo file attached to this loan.
                        </p>
                      )}
                    </div>
                    <div className="ga-photo-box">
                      <span className="ga-badge ga-badge-amber">Return Condition Photo (After)</span>
                      {evidence?.return_photo ? (
                        <img src={evidence.return_photo} alt="Return after condition" />
                      ) : (
                        <p className="ga-meta" style={{ marginTop: 10 }}>
                          No return photo file attached to this loan.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="sa-card-head" style={{ marginTop: 14 }}>
                    <h3>Structured Phrase Timeline (Loan #{dispute.loan_id})</h3>
                    <label className="ga-btn">
                      <input
                        type="checkbox"
                        checked={showOriginal}
                        onChange={(e) => setShowOriginal(e.target.checked)}
                      />
                      <span>Show original sender language</span>
                    </label>
                  </div>

                  <div className="ga-stack">
                    {(evidence?.messages ?? []).map((m) => {
                      const renderLang = showOriginal && m.sender_lang ? m.sender_lang : 'en';
                      return (
                        <div key={m.id} className="ga-activity-row">
                          <div>
                            <strong>{m.sender_nickname ?? 'System'}</strong>{' '}
                            <span className="ga-badge ga-badge-muted">{m.sender_lang ?? 'sys'}</span>{' '}
                            <span className="ga-code-chip">{m.phrase_key}</span>
                            <div style={{ marginTop: 4 }}>{renderPhrase(renderLang, m.phrase_key, m.params)}</div>
                          </div>
                          <span className="ga-mono-time">{formatDate('en', m.created_at)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
