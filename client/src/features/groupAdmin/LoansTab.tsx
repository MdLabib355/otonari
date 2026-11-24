import { useState } from 'react';
import type { GroupAdminLoan, Lang } from '../../../../shared/types.ts';
import SpeakButton from '../../components/SpeakButton.tsx';
import { api, ApiError } from '../../core/api.ts';
import { findItem } from '../../data/catalog.ts';
import { displayName, formatDate, itemName, meta, renderPhrase, spotName, t } from '../../i18n/index.ts';

const MEDIATION_KEYS = ['admin.gentleReminder', 'admin.spotAssist', 'admin.receivedAtDesk'] as const;

export interface LoansTabProps {
  lang: Lang;
  loans: GroupAdminLoan[];
  onRefresh: () => Promise<void>;
  onNotify: (msg: string, isError?: boolean) => void;
}

export default function LoansTab({ lang, loans, onRefresh, onNotify }: LoansTabProps) {
  const [mediationLoan, setMediationLoan] = useState<GroupAdminLoan | null>(null);
  const [selectedPhrase, setSelectedPhrase] = useState<(typeof MEDIATION_KEYS)[number]>(MEDIATION_KEYS[0]);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function sendMediation() {
    if (!mediationLoan) return;
    setBusyId(mediationLoan.id);
    try {
      await api.post(`/group-admin/loans/${mediationLoan.id}/nudge`, { phrase_key: selectedPhrase });
      setMediationLoan(null);
      await onRefresh();
      onNotify(t(lang, 'groupAdmin.sendStructuredNotice'));
    } catch (error) {
      const msg =
        error instanceof ApiError && error.status === 429
          ? t(lang, 'groupAdmin.nudgeCooldown')
          : error instanceof ApiError
            ? error.message
            : t(lang, 'common.error');
      onNotify(msg, true);
    } finally {
      setBusyId(null);
    }
  }

  async function resolveLoan(loan: GroupAdminLoan, resolution: 'force_return' | 'escalate') {
    setBusyId(loan.id);
    try {
      await api.post(`/group-admin/loans/${loan.id}/resolve`, {
        resolution,
        reason_key: loan.flagged_reason ?? 'item_damaged',
      });
      await onRefresh();
      onNotify(
        resolution === 'force_return' ? t(lang, 'groupAdmin.resolveReturn') : t(lang, 'groupAdmin.escalatedBadge')
      );
    } catch (error) {
      onNotify(error instanceof ApiError ? error.message : t(lang, 'common.error'), true);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ga-stack">
      <div>
        <h2>
          {t(lang, 'groupAdmin.loansTitle')} ({loans.length})
        </h2>
        <p className="ga-meta">{t(lang, 'groupAdmin.loansSub')}</p>
      </div>

      {loans.length === 0 ? (
        <div className="ga-card">
          <p className="ga-meta">{t(lang, 'groupAdmin.loansEmpty')}</p>
        </div>
      ) : (
        loans.map((loan) => {
          const label = itemName(lang, loan.item_key);
          const spot = spotName(lang, loan.spot);
          const statusCls = loan.is_overdue
            ? 'ga-badge-red'
            : loan.status === 'returned'
              ? 'ga-badge-green'
              : 'ga-badge-indigo';
          const statusLabel = loan.is_overdue ? t(lang, 'groupAdmin.overdueBadge') : t(lang, `status.${loan.status}`);

          return (
            <div key={loan.id} className={`ga-card ${loan.is_overdue ? 'ga-card-overdue' : ''}`}>
              <div className="ga-card-top">
                <div className="ga-identity">
                  <div className="ga-item-emoji" aria-hidden="true">
                    {findItem(loan.item_key)?.emoji ?? '📦'}
                  </div>
                  <div>
                    <div className="ga-entity-name">
                      <span>
                        #{loan.id} · {label}
                      </span>
                      <span className={`ga-badge ${statusCls}`}>{statusLabel}</span>
                      {loan.flagged_reason && (
                        <span className="ga-badge ga-badge-amber">{t(lang, 'groupAdmin.flaggedBadge')}</span>
                      )}
                      {loan.escalated_to_super_admin && (
                        <span className="ga-badge ga-badge-red">{t(lang, 'groupAdmin.escalatedBadge')}</span>
                      )}
                    </div>
                    <p className="ga-meta">
                      {t(lang, 'groupAdmin.borrowerRole')}:{' '}
                      <strong>{displayName(lang, loan.borrower.nickname)}</strong> ({meta(loan.borrower.lang).name}) ·{' '}
                      {t(lang, 'groupAdmin.lenderRole')}: <strong>{displayName(lang, loan.lender.nickname)}</strong> (
                      {meta(loan.lender.lang).name}) · {spot}
                    </p>
                  </div>
                </div>
                <SpeakButton lang={lang} text={`${label}. ${statusLabel}.`} />
              </div>

              {(loan.handover_photo || loan.return_photo) && (
                <div className="ga-photo-grid">
                  {loan.handover_photo && (
                    <div className="ga-photo-box">
                      <span className="ga-badge ga-badge-green">{t(lang, 'loan.handoverPhoto')}</span>
                      <img src={loan.handover_photo} alt={t(lang, 'loan.handoverPhoto')} />
                    </div>
                  )}
                  {loan.return_photo && (
                    <div className="ga-photo-box">
                      <span className="ga-badge ga-badge-green">{t(lang, 'loan.returnPhoto')}</span>
                      <img src={loan.return_photo} alt={t(lang, 'loan.returnPhoto')} />
                    </div>
                  )}
                </div>
              )}

              <div className="ga-actions">
                {loan.status !== 'returned' && (
                  <>
                    <button
                      type="button"
                      className="ga-btn ga-btn-primary"
                      disabled={busyId === loan.id}
                      onClick={() => {
                        setSelectedPhrase(MEDIATION_KEYS[0]);
                        setMediationLoan(loan);
                      }}
                    >
                      {t(lang, 'groupAdmin.sendCheckIn')}
                    </button>
                    <button
                      type="button"
                      className="ga-btn ga-btn-green"
                      disabled={busyId === loan.id}
                      onClick={() => resolveLoan(loan, 'force_return')}
                    >
                      {t(lang, 'groupAdmin.resolveReturn')}
                    </button>
                  </>
                )}
                {!loan.escalated_to_super_admin && (
                  <button
                    type="button"
                    className="ga-btn ga-btn-danger"
                    disabled={busyId === loan.id}
                    onClick={() => resolveLoan(loan, 'escalate')}
                  >
                    {t(lang, 'groupAdmin.escalate')}
                  </button>
                )}
              </div>

              {loan.timeline.length > 0 && (
                <div className="ga-timeline">
                  {loan.timeline.slice(0, 6).map((ev) => (
                    <div key={ev.id} className="ga-timeline-item">
                      <div className="ga-timeline-top">
                        <span className="ga-code-chip">{ev.phrase_key}</span>
                        <span>{formatDate(lang, ev.created_at)}</span>
                      </div>
                      <div>{renderPhrase(lang, ev.phrase_key, ev.params)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Dual-Language Gentle Mediation Modal */}
      {mediationLoan && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>{t(lang, 'groupAdmin.mediationTitle', { id: mediationLoan.id })}</h2>
            </div>
            <div className="modal-body">
              <p className="ga-meta">{t(lang, 'groupAdmin.mediationDesc')}</p>
              <div className="ga-stack" style={{ marginTop: 12 }}>
                {MEDIATION_KEYS.map((key) => {
                  const preview = renderPhrase(lang, key, {
                    item: mediationLoan.item_key,
                    spot: mediationLoan.spot,
                  });
                  return (
                    <label
                      key={key}
                      className={`ga-radio-option ${selectedPhrase === key ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="mediation-phrase"
                        value={key}
                        checked={selectedPhrase === key}
                        onChange={() => setSelectedPhrase(key)}
                      />
                      <div>
                        <span className="ga-code-chip">{key}</span>
                        <div style={{ marginTop: 4 }}>{preview}</div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="ga-preview-grid">
                {[
                  {
                    roleLabel: t(lang, 'groupAdmin.borrowerPreview', {
                      name: mediationLoan.borrower.nickname,
                    }),
                    targetLang: mediationLoan.borrower.lang,
                  },
                  {
                    roleLabel: t(lang, 'groupAdmin.lenderPreview', {
                      name: mediationLoan.lender.nickname,
                    }),
                    targetLang: mediationLoan.lender.lang,
                  },
                ].map(({ roleLabel, targetLang }) => {
                  const text = renderPhrase(targetLang, selectedPhrase, {
                    item: mediationLoan.item_key,
                    spot: mediationLoan.spot,
                  });
                  return (
                    <div key={roleLabel} className="ga-preview-box">
                      <div className="ga-preview-head">
                        <span>
                          {roleLabel} ({meta(targetLang).name})
                        </span>
                        <SpeakButton lang={targetLang} text={text} />
                      </div>
                      <p style={{ margin: 0 }}>{text}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="button-secondary" onClick={() => setMediationLoan(null)}>
                {t(lang, 'common.cancel')}
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={busyId === mediationLoan.id}
                onClick={sendMediation}
              >
                {t(lang, 'groupAdmin.sendStructuredNotice')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
