import { useState } from 'react';
import type { Group, GroupMemberSummary, JoinPolicy, Lang, Role, User } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import Modal from '../../components/Modal.tsx';
import { CheckIcon } from '../../components/Icons.tsx';
import SpeakButton from '../../components/SpeakButton.tsx';
import TrustLine from '../../components/TrustLine.tsx';
import { api, ApiError } from '../../core/api.ts';
import { displayName, t } from '../../i18n/index.ts';

type MemberFilter = 'all' | 'admins' | 'trusted' | 'muted' | 'inLoan';

function langTag(lang: Lang): string {
  if (lang === 'ja-easy') return 'やさしい';
  return lang.toUpperCase();
}

export interface NeighborsTabProps {
  lang: Lang;
  me: User;
  group: Group;
  members: GroupMemberSummary[];
  onRefresh: () => Promise<void>;
  onGroupUpdated: (group: Group) => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export default function NeighborsTab({
  lang,
  me,
  group,
  members,
  onRefresh,
  onGroupUpdated,
  onNotify,
}: NeighborsTabProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<MemberFilter>('all');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<GroupMemberSummary | null>(null);

  const pending = members.filter((m) => m.member_status === 'pending');
  const activeRoster = members.filter((m) => m.member_status !== 'pending');

  const q = search.trim().toLowerCase();
  const filtered = activeRoster.filter((m) => {
    if (q && !m.nickname.toLowerCase().includes(q) && !m.lang.toLowerCase().includes(q)) return false;
    if (filter === 'admins' && m.role === 'user') return false;
    if (filter === 'trusted' && !m.is_trusted) return false;
    if (filter === 'muted' && m.member_status !== 'borrow_muted' && m.member_status !== 'suspended') return false;
    if (filter === 'inLoan' && m.active_loans.length === 0) return false;
    return true;
  });

  async function runAction(userId: number, work: () => Promise<void>, successMsg: string) {
    setBusyId(userId);
    try {
      await work();
      await onRefresh();
      onNotify(successMsg);
    } catch (error) {
      onNotify(error instanceof ApiError ? error.message : t(lang, 'common.error'), true);
    } finally {
      setBusyId(null);
    }
  }

  async function changePolicy(policy: JoinPolicy) {
    try {
      const updated = await api.patch<Group>('/group-admin/settings', { join_policy: policy });
      onGroupUpdated(updated);
      onNotify(`${t(lang, 'groupAdmin.joinPolicy')}: ${policy}`);
    } catch (error) {
      onNotify(error instanceof ApiError ? error.message : t(lang, 'common.error'), true);
    }
  }

  const policyOptions: { value: JoinPolicy; label: string }[] = [
    { value: 'open', label: t(lang, 'groupAdmin.policyOpen') },
    { value: 'approval_required', label: t(lang, 'groupAdmin.policyApproval') },
    { value: 'locked', label: t(lang, 'groupAdmin.policyLocked') },
  ];

  const filterOptions: { value: MemberFilter; label: string }[] = [
    { value: 'all', label: t(lang, 'groupAdmin.filterAll') },
    { value: 'admins', label: t(lang, 'groupAdmin.filterAdmins') },
    { value: 'trusted', label: t(lang, 'groupAdmin.filterTrusted') },
    { value: 'muted', label: t(lang, 'groupAdmin.filterMuted') },
    { value: 'inLoan', label: t(lang, 'groupAdmin.filterInLoan') },
  ];

  function roleLabel(role: Role): string {
    if (role === 'group_admin' || role === 'super_admin') return t(lang, 'groupAdmin.roleGroupAdmin');
    return t(lang, 'groupAdmin.roleMember');
  }

  return (
    <div className="ga-stack">
      {/* Join Policy Selector */}
      <div className="ga-card">
        <p className="label">{t(lang, 'groupAdmin.joinPolicy')}</p>
        <ChipGroup
          label={t(lang, 'groupAdmin.joinPolicy')}
          options={policyOptions}
          value={group.join_policy}
          onChange={changePolicy}
        />
      </div>

      {/* Pending Join Requests Queue */}
      <div className="ga-card">
        <div className="ga-card-top">
          <h2>
            {t(lang, 'groupAdmin.pendingTitle')} ({pending.length})
          </h2>
          <SpeakButton
            lang={lang}
            text={`${t(lang, 'groupAdmin.pendingTitle')}: ${pending.length}`}
          />
        </div>
        {pending.length === 0 ? (
          <p className="ga-meta">{t(lang, 'groupAdmin.pendingNone')}</p>
        ) : (
          <div className="ga-stack">
            {pending.map((req) => (
              <div key={req.id} className="ga-card ga-card-pending">
                <div className="ga-card-top">
                  <div className="ga-identity">
                    <div className="ga-avatar" aria-hidden="true">
                      {req.nickname.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="ga-entity-name">
                        <span>{displayName(lang, req.nickname)}</span>
                        <span className="ga-badge ga-badge-indigo">{langTag(req.lang)}</span>
                      </div>
                      <TrustLine lang={lang} trust={req.trust} />
                    </div>
                  </div>
                  <div className="ga-actions">
                    <SpeakButton lang={lang} text={displayName(lang, req.nickname)} />
                    <button
                      type="button"
                      className="ga-btn ga-btn-green"
                      disabled={busyId === req.id}
                      onClick={() =>
                        runAction(
                          req.id,
                          async () => {
                            await api.post(`/group-admin/members/${req.id}/approve`, { grant_trust: false });
                          },
                          `${t(lang, 'groupAdmin.approve')}: ${req.nickname}`
                        )
                      }
                    >
                      {t(lang, 'groupAdmin.approve')}
                    </button>
                    <button
                      type="button"
                      className="ga-btn ga-btn-danger"
                      disabled={busyId === req.id}
                      onClick={() =>
                        runAction(
                          req.id,
                          async () => {
                            await api.post(`/group-admin/members/${req.id}/reject`);
                          },
                          `${t(lang, 'groupAdmin.decline')}: ${req.nickname}`
                        )
                      }
                    >
                      {t(lang, 'groupAdmin.decline')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Neighbors Roster */}
      <div className="ga-toolbar">
        <h2>
          {t(lang, 'groupAdmin.activeNeighbors')} ({activeRoster.length})
        </h2>
        <input
          type="search"
          className="text-input ga-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t(lang, 'groupAdmin.searchNeighbors')}
        />
      </div>

      <ChipGroup
        label={t(lang, 'groupAdmin.activeNeighbors')}
        options={filterOptions}
        value={filter}
        onChange={setFilter}
      />

      <div className="ga-stack">
        {filtered.map((member) => {
          const isSelf = member.id === me.id;
          const isMuted = member.member_status === 'borrow_muted';
          const isAnyAdmin = member.role !== 'user';
          const hasActiveLoan = member.active_loans.length > 0;
          const canEditRole = !isSelf && member.member_status === 'active' && member.role !== 'super_admin';
          const canRestrict = !isSelf && member.role !== 'super_admin';
          const isGroupAdmin = member.role === 'group_admin';

          return (
            <div key={member.id} className="ga-card">
              <div className="ga-card-top">
                <div className="ga-identity">
                  <div className="ga-avatar" aria-hidden="true">
                    {member.nickname.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="ga-entity-name">
                      <span>{displayName(lang, member.nickname)}</span>
                      <span className="ga-badge ga-badge-muted">{langTag(member.lang)}</span>
                      <span className={`ga-badge ${isAnyAdmin ? 'ga-badge-indigo' : 'ga-badge-muted'}`}>
                        {roleLabel(member.role)}
                      </span>
                    </div>
                    <TrustLine lang={lang} trust={member.trust} />
                  </div>
                </div>
                <SpeakButton
                  lang={lang}
                  text={`${displayName(lang, member.nickname)}. ${roleLabel(member.role)}.`}
                />
              </div>

              <div className="ga-badge-row">
                {member.is_trusted && (
                  <span className="ga-badge ga-badge-green">{t(lang, 'groupAdmin.trusted')}</span>
                )}
                {isMuted && <span className="ga-badge ga-badge-amber">{t(lang, 'groupAdmin.muted')}</span>}
                {member.active_loans.map((loan) => (
                  <span
                    key={loan.loan_id}
                    className={`ga-badge ${loan.is_overdue ? 'ga-badge-red' : 'ga-badge-indigo'}`}
                  >
                    #{loan.loan_id} ·{' '}
                    {loan.role === 'lender' ? t(lang, 'groupAdmin.lenderRole') : t(lang, 'groupAdmin.borrowerRole')}
                  </span>
                ))}
              </div>

              <div className="ga-actions">
                <button
                  type="button"
                  className={`ga-btn ${member.is_trusted ? 'ga-btn-soft' : ''}`}
                  disabled={busyId === member.id}
                  onClick={() =>
                    runAction(
                      member.id,
                      async () => {
                        await api.patch(`/group-admin/members/${member.id}/trust`, {
                          trusted: !member.is_trusted,
                        });
                      },
                      `${member.nickname}: ${!member.is_trusted ? t(lang, 'groupAdmin.trusted') : t(lang, 'groupAdmin.roleMember')}`
                    )
                  }
                >
                  {member.is_trusted && <CheckIcon className="icon-xs" />}
                  {member.is_trusted ? t(lang, 'groupAdmin.trusted') : t(lang, 'groupAdmin.endorseTrust')}
                </button>

                {canRestrict && (
                  <button
                    type="button"
                    className={`ga-btn ${isMuted ? 'ga-btn-amber' : ''}`}
                    disabled={busyId === member.id}
                    onClick={() =>
                      runAction(
                        member.id,
                        async () => {
                          await api.patch(`/group-admin/members/${member.id}/status`, {
                            status: isMuted ? 'active' : 'borrow_muted',
                          });
                        },
                        `${member.nickname}: ${isMuted ? t(lang, 'groupAdmin.unmuteBorrow') : t(lang, 'groupAdmin.muteBorrow')}`
                      )
                    }
                  >
                    {isMuted ? t(lang, 'groupAdmin.unmuteBorrow') : t(lang, 'groupAdmin.muteBorrow')}
                  </button>
                )}
              </div>

              {canRestrict && (
                <details className="ga-more">
                  <summary>{t(lang, 'groupAdmin.moreActions')}</summary>
                  <div className="ga-actions ga-actions-more">
                    {canEditRole && (
                      <button
                        type="button"
                        className="ga-btn"
                        disabled={busyId === member.id}
                        onClick={() =>
                          runAction(
                            member.id,
                            async () => {
                              await api.patch(`/group-admin/members/${member.id}/role`, {
                                role: isGroupAdmin ? 'user' : 'group_admin',
                              });
                            },
                            `${member.nickname}: ${isGroupAdmin ? t(lang, 'groupAdmin.roleMember') : t(lang, 'groupAdmin.roleGroupAdmin')}`
                          )
                        }
                      >
                        {isGroupAdmin ? t(lang, 'groupAdmin.removeGroupAdmin') : t(lang, 'groupAdmin.makeGroupAdmin')}
                      </button>
                    )}
    
                    {canRestrict && (
                      <button
                        type="button"
                        className="ga-btn ga-btn-danger"
                        disabled={busyId === member.id || hasActiveLoan}
                        onClick={() => setRemoveTarget(member)}
                      >
                        {t(lang, 'groupAdmin.safeRemove')}
                      </button>
                    )}
                  </div>
                </details>
              )}

              {hasActiveLoan && (
                <div className="ga-note">
                  {t(lang, 'groupAdmin.safeRemoveBlocked', { id: member.active_loans[0].loan_id })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Safe Remove Confirmation Modal */}
      {removeTarget && (
        <Modal title={t(lang, 'groupAdmin.safeRemoveTitle', { name: displayName(lang, removeTarget.nickname) })} onClose={() => setRemoveTarget(null)}>
          <div className="modal-body">
            <p>
              {t(lang, 'groupAdmin.safeRemoveDesc', {
                name: displayName(lang, removeTarget.nickname),
              })}
            </p>
          </div>
          <div className="modal-footer">
            <button type="button" className="button-secondary" onClick={() => setRemoveTarget(null)}>
              {t(lang, 'common.cancel')}
            </button>
            <button
              type="button"
              className="ga-btn ga-btn-danger"
              disabled={busyId === removeTarget.id}
              onClick={() => {
                const target = removeTarget;
                setRemoveTarget(null);
                runAction(
                  target.id,
                  async () => {
                    await api.delete(`/group-admin/members/${target.id}`);
                  },
                  `${t(lang, 'groupAdmin.safeRemove')}: ${target.nickname}`
                );
              }}
            >
              {t(lang, 'groupAdmin.safeRemoveConfirm')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
