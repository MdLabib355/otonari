import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, clearManagerToken, getManagerToken, managerApi, saveManagerToken } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import { displayName, formatDate, formatNumber, itemName, meta, renderPhrase, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

async function qrDataUrl(text) {
  const svg = await QRCode.toString(text, { type: 'svg' });
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Building manager / neighborhood association portal:
// authenticate, create/configure buildings, rotate codes, approve/remove residents,
// issue lost-phone restore codes, and view reported item issues.
export default function Manager() {
  const { lang } = useUser();
  const [account, setAccount] = useState(null); // { manager, groups }
  const [loading, setLoading] = useState(Boolean(getManagerToken()));
  const [selectedGroupId, setSelectedGroupId] = useState(null);

  async function loadAccount() {
    setLoading(true);
    try {
      const data = await managerApi.get('/api/manager/me');
      setAccount(data);
      setSelectedGroupId((prev) =>
        data.groups.some((g) => g.id === prev) ? prev : (data.groups[0]?.id ?? null)
      );
    } catch (error) {
      if (error.status === 401) clearManagerToken();
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (getManagerToken()) loadAccount();
  }, []);

  async function handleSignedIn(result) {
    saveManagerToken(result.token);
    await loadAccount();
  }

  async function handleLogout() {
    try {
      await managerApi.post('/api/manager/logout');
    } catch {
      // Clear local session regardless of network state
    }
    clearManagerToken();
    setAccount(null);
    setSelectedGroupId(null);
  }

  if (loading) {
    return (
      <section>
        <h1>{t(lang, 'manager.title')}</h1>
        <p>{t(lang, 'common.loading')}</p>
      </section>
    );
  }

  if (!account) {
    return <ManagerAuth lang={lang} onSignedIn={handleSignedIn} />;
  }

  const activeGroup = account.groups.find((g) => g.id === selectedGroupId) ?? account.groups[0] ?? null;

  return (
    <section>
      <Link to="/join" className="back-link">
        ← {t(lang, 'common.back')}
      </Link>
      <div className="manager-header">
        <div>
          <h1>{t(lang, 'manager.title')}</h1>
          <p className="muted">
            {account.manager.name} · {account.manager.email}
          </p>
        </div>
        <button type="button" className="button-secondary" onClick={handleLogout}>
          {t(lang, 'manager.logout')}
        </button>
      </div>

      {account.groups.length > 0 && (
        <div className="field">
          <p className="label">{t(lang, 'manager.myGroups')}</p>
          <div className="chip-group">
            {account.groups.map((g) => (
              <button
                key={g.id}
                type="button"
                className={g.id === activeGroup?.id ? 'chip selected' : 'chip'}
                onClick={() => setSelectedGroupId(g.id)}
              >
                {g.type === 'building' ? '🏢' : '🏘️'} {g.name}
                {g.pending_count > 0 && ` (${formatNumber(lang, g.pending_count)})`}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeGroup && (
        <GroupDashboard
          key={activeGroup.id}
          group={activeGroup}
          lang={lang}
          onGroupChanged={loadAccount}
        />
      )}

      <CreateGroupForm
        lang={lang}
        onCreated={async (created) => {
          await loadAccount();
          setSelectedGroupId(created.id);
        }}
      />
    </section>
  );
}

function ManagerAuth({ lang, onSignedIn }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState(null);

  useEffect(() => {
    api
      .get('/api/health')
      .then((h) => setDemoMode(Boolean(h?.demo_mode)))
      .catch(() => setDemoMode(false));
  }, []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setErrorText(null);
    try {
      const path = mode === 'register' ? '/api/manager/register' : '/api/manager/login';
      const body = mode === 'register' ? { name: name.trim(), email: email.trim(), password } : { email: email.trim(), password };
      const result = await api.post(path, body);
      await onSignedIn(result);
    } catch (error) {
      setErrorText(error.message || t(lang, 'common.error'));
      setBusy(false);
    }
  }

  async function demoLogin() {
    setBusy(true);
    setErrorText(null);
    try {
      const result = await api.post('/api/demo/manager-login');
      await onSignedIn(result);
    } catch (error) {
      setErrorText(error.message || t(lang, 'common.error'));
      setBusy(false);
    }
  }

  return (
    <section>
      <Link to="/join" className="back-link">
        ← {t(lang, 'common.back')}
      </Link>
      <h1>{t(lang, 'manager.title')}</h1>
      <p className="subtitle">{t(lang, 'newGroup.hint')}</p>

      <div className="field">
        <ChipGroup
          label={t(lang, 'manager.title')}
          options={[
            { value: 'login', label: t(lang, 'manager.loginTab') },
            { value: 'register', label: t(lang, 'manager.registerTab') },
          ]}
          value={mode}
          onChange={(next) => {
            setMode(next);
            setErrorText(null);
          }}
        />
      </div>

      <form onSubmit={submit}>
        {mode === 'register' && (
          <div className="field">
            <label className="label" htmlFor="mgr-name">
              {t(lang, 'manager.name')}
            </label>
            <input
              id="mgr-name"
              className="text-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="mgr-email">
            {t(lang, 'manager.email')}
          </label>
          <input
            id="mgr-email"
            type="email"
            className="text-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={120}
            autoComplete="email"
            required
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="mgr-password">
            {t(lang, 'manager.password')}
          </label>
          <input
            id="mgr-password"
            type="password"
            className="text-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === 'register' ? 8 : 1}
            maxLength={128}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            required
          />
        </div>

        {errorText && <p className="error">{errorText}</p>}
        <button type="submit" className="button-primary" disabled={busy}>
          {t(lang, mode === 'register' ? 'manager.registerButton' : 'manager.loginButton')}
        </button>
      </form>

      {demoMode && (
        <div className="demo">
          <button type="button" className="button-secondary" style={{ width: '100%' }} disabled={busy} onClick={demoLogin}>
            🔑 {t(lang, 'manager.demoLogin')}
          </button>
        </div>
      )}
    </section>
  );
}

function GroupDashboard({ group, lang, onGroupChanged }) {
  const [members, setMembers] = useState(null); // { pending, active }
  const [issues, setIssues] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState(null);
  const [restoreInfo, setRestoreInfo] = useState(null); // { userId, nickname, code, qr }

  async function loadDetails() {
    try {
      const [m, iss] = await Promise.all([
        managerApi.get(`/api/manager/groups/${group.id}/members`),
        managerApi.get(`/api/manager/groups/${group.id}/issues`),
      ]);
      setMembers(m);
      setIssues(iss);
    } catch {
      setErrorText(t(lang, 'common.error'));
    }
  }

  useEffect(() => {
    loadDetails();
  }, [group.id]);

  async function toggleApproval() {
    setBusy(true);
    setErrorText(null);
    try {
      await managerApi.patch(`/api/manager/groups/${group.id}`, {
        require_approval: !group.require_approval,
      });
      await onGroupChanged();
    } catch {
      setErrorText(t(lang, 'common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function rotateCode() {
    setBusy(true);
    setErrorText(null);
    try {
      await managerApi.post(`/api/manager/groups/${group.id}/rotate-code`);
      await onGroupChanged();
    } catch {
      setErrorText(t(lang, 'common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function moderateMember(userId, action) {
    setBusy(true);
    setErrorText(null);
    try {
      await managerApi.post(`/api/manager/groups/${group.id}/members/${userId}/${action}`);
      await Promise.all([loadDetails(), onGroupChanged()]);
    } catch (error) {
      setErrorText(
        action === 'remove' && error.status === 409
          ? t(lang, 'manager.removeBlocked')
          : t(lang, 'common.error')
      );
    } finally {
      setBusy(false);
    }
  }

  async function generateRestore(member) {
    setBusy(true);
    setErrorText(null);
    try {
      const data = await managerApi.post(`/api/manager/groups/${group.id}/members/${member.id}/transfer-code`);
      const url = `${window.location.origin}/join?restore=${encodeURIComponent(data.code)}`;
      const qr = await qrDataUrl(url);
      setRestoreInfo({ userId: member.id, nickname: member.nickname, code: data.code, qr });
    } catch {
      setErrorText(t(lang, 'common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manager-card">
      <h2>
        {group.name} · <span className="muted">{group.city}</span>
      </h2>
      <p className="big-code">{group.code}</p>

      <div className="actions">
        <Link to={`/poster?code=${encodeURIComponent(group.code)}`} className="button-primary button-link">
          {t(lang, 'newGroup.poster')}
        </Link>
        <button type="button" className="button-secondary" disabled={busy} onClick={rotateCode}>
          🔄 {t(lang, 'manager.rotateCode')}
        </button>
      </div>

      <div className="field">
        <label className="switch-row">
          <span>
            <strong>{t(lang, 'manager.requireApproval')}</strong>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            disabled={busy}
            checked={Boolean(group.require_approval)}
            onChange={toggleApproval}
          />
        </label>
      </div>

      {errorText && <p className="error">{errorText}</p>}

      {restoreInfo && (
        <div className="transfer-box">
          <p className="label">
            🔑 {displayName(lang, restoreInfo.nickname)} — {t(lang, 'settings.transferExpires')}
          </p>
          <p className="big-code">{restoreInfo.code}</p>
          <img className="transfer-qr" src={restoreInfo.qr} alt={restoreInfo.code} />
        </div>
      )}

      <div className="manager-section">
        <h3>{t(lang, 'manager.pendingRequests')}</h3>
        {!members ? (
          <p className="muted">{t(lang, 'common.loading')}</p>
        ) : members.pending.length === 0 ? (
          <p className="muted">{t(lang, 'manager.noPending')}</p>
        ) : (
          <ul className="manager-list">
            {members.pending.map((m) => (
              <li key={m.id} className="manager-row">
                <div className="manager-row-info">
                  <strong>{displayName(lang, m.nickname)}</strong>
                  <span className="muted">{meta(m.lang).name}</span>
                  {m.manager_note && <span className="badge badge-available">📝 {m.manager_note}</span>}
                </div>
                <div className="manager-row-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => moderateMember(m.id, 'approve')}
                  >
                    ✓ {t(lang, 'manager.approve')}
                  </button>
                  <button
                    type="button"
                    className="button-secondary button-danger"
                    disabled={busy}
                    onClick={() => moderateMember(m.id, 'reject')}
                  >
                    {t(lang, 'manager.reject')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="manager-section">
        <h3>{t(lang, 'manager.members')}</h3>
        {!members ? (
          <p className="muted">{t(lang, 'common.loading')}</p>
        ) : members.active.length === 0 ? (
          <p className="muted">{t(lang, 'manager.noMembers')}</p>
        ) : (
          <ul className="manager-list">
            {members.active.map((m) => (
              <li key={m.id} className="manager-row">
                <div className="manager-row-info">
                  <strong>{displayName(lang, m.nickname)}</strong>
                  <span className="muted">
                    {meta(m.lang).name} · ✓ {formatNumber(lang, m.on_time)} / ⏰ {formatNumber(lang, m.late)}
                  </span>
                  {m.manager_note && <span className="muted">📝 {m.manager_note}</span>}
                </div>
                <div className="manager-row-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => generateRestore(m)}
                  >
                    🔑 {t(lang, 'manager.restoreCode')}
                  </button>
                  <button
                    type="button"
                    className="button-secondary button-danger"
                    disabled={busy}
                    onClick={() => moderateMember(m.id, 'remove')}
                  >
                    {t(lang, 'manager.removeMember')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="manager-section">
        <h3>{t(lang, 'manager.issues')}</h3>
        {issues.length === 0 ? (
          <p className="muted">{t(lang, 'manager.noIssues')}</p>
        ) : (
          <ul className="manager-list">
            {issues.map((issue) => (
              <li key={issue.id} className="manager-row">
                <div className="manager-row-info">
                  <strong>{itemName(lang, issue.item_key)}</strong>
                  <p style={{ margin: '2px 0' }}>
                    {renderPhrase(lang, issue.phrase_key, { item: issue.item_key, spot: issue.spot ?? 'entrance' })}
                  </p>
                  <span className="muted">
                    {displayName(lang, issue.reporter_nickname ?? '?')} →{' '}
                    {displayName(lang, issue.other_nickname ?? '?')} · {formatDate(lang, issue.created_at)}
                  </span>
                </div>
                {issue.issue_photo && (
                  <img className="my-item-thumb" src={issue.issue_photo} alt="" loading="lazy" />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreateGroupForm({ lang, onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('building');
  const [city, setCity] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(createAnyway = false) {
    setBusy(true);
    setFailed(false);
    setDuplicate(null);
    try {
      const created = await managerApi.post('/api/groups', {
        name: name.trim(),
        type,
        city: city.trim(),
        require_approval: requireApproval,
        create_anyway: createAnyway,
      });
      setName('');
      setCity('');
      setRequireApproval(false);
      setOpen(false);
      await onCreated(created);
    } catch (error) {
      if (error.status === 409 && error.data?.existing_name) {
        setDuplicate(error.data.existing_name);
      } else {
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-title">
      {!open ? (
        <button type="button" className="button-secondary" style={{ width: '100%' }} onClick={() => setOpen(true)}>
          ＋ {t(lang, 'manager.createGroup')}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <h2>{t(lang, 'manager.createGroup')}</h2>
          <div className="field">
            <label className="label" htmlFor="new-group-name">
              {t(lang, 'newGroup.name')}
            </label>
            <input
              id="new-group-name"
              className="text-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>
          <div className="field">
            <p className="label">{t(lang, 'newGroup.type')}</p>
            <ChipGroup
              label={t(lang, 'newGroup.type')}
              options={[
                { value: 'building', label: `🏢 ${t(lang, 'groupType.building')}` },
                { value: 'block', label: `🏘️ ${t(lang, 'groupType.block')}` },
              ]}
              value={type}
              onChange={setType}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="new-group-city">
              {t(lang, 'newGroup.city')}
            </label>
            <input
              id="new-group-city"
              className="text-input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={40}
              required
            />
          </div>
          <div className="field">
            <label className="switch-row">
              <span>{t(lang, 'manager.requireApproval')}</span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
              />
            </label>
          </div>

          {duplicate && (
            <div className="notice">
              <p>{t(lang, 'newGroup.duplicate', { name: duplicate, city: city.trim() })}</p>
              <button type="button" className="button-secondary" disabled={busy} onClick={() => submit(true)}>
                {t(lang, 'newGroup.createAnyway')}
              </button>
            </div>
          )}
          {failed && <p className="error">{t(lang, 'common.error')}</p>}

          <div className="actions">
            <button type="submit" className="button-primary" disabled={!name.trim() || !city.trim() || busy}>
              {t(lang, 'newGroup.create')}
            </button>
            <button type="button" className="button-secondary" onClick={() => setOpen(false)}>
              {t(lang, 'myItems.cancelEdit')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
