import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../api.js';
import ChipGroup from '../components/ChipGroup.jsx';
import { LANGUAGES } from '../data/catalog.js';
import { formatNumber, meta, t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

const DOUBLE_TAP_MS = 500;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

async function qrDataUrl(text) {
  const svg = await QRCode.toString(text, { type: 'svg' });
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Settings: language, elder mode, neighborhood stats, push notifications, device transfer, poster, and leaving.
export default function Settings() {
  const { user, group, lang, setMe, logout } = useUser();
  const [failed, setFailed] = useState(false);
  const [stats, setStats] = useState(null);
  const [leaveTappedAt, setLeaveTappedAt] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveProblem, setLeaveProblem] = useState(null);

  const [transfer, setTransfer] = useState(null); // { code, qr }
  const [transferBusy, setTransferBusy] = useState(false);

  const pushSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext;
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState(null);

  useEffect(() => {
    api.get('/api/group/stats').then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pushSupported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushEnabled(Boolean(sub)))
      .catch(() => {});
  }, [pushSupported]);

  async function save(change) {
    setFailed(false);
    try {
      setMe(await api.patch('/api/me', change));
    } catch {
      setFailed(true);
    }
  }

  async function generateTransferCode() {
    setTransferBusy(true);
    setFailed(false);
    try {
      const data = await api.post('/api/me/transfer-code');
      const restoreUrl = `${window.location.origin}/join?restore=${encodeURIComponent(data.code)}`;
      const qr = await qrDataUrl(restoreUrl);
      setTransfer({ code: data.code, qr });
    } catch {
      setFailed(true);
    } finally {
      setTransferBusy(false);
    }
  }

  async function togglePush() {
    if (!pushSupported || pushBusy) return;
    setPushBusy(true);
    setPushError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await api.delete('/api/push/subscribe', { endpoint: sub.endpoint }).catch(() => {});
          await sub.unsubscribe();
        }
        setPushEnabled(false);
      } else {
        if (Notification.permission === 'denied') {
          setPushError('settings.pushDenied');
          return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setPushError('settings.pushDenied');
          return;
        }
        const { publicKey } = await api.get('/api/push/vapid-key');
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await api.post('/api/push/subscribe', sub.toJSON());
        setPushEnabled(true);
      }
    } catch {
      setPushError('common.error');
    } finally {
      setPushBusy(false);
    }
  }

  function tapLeave() {
    if (leaveTappedAt === null) {
      setLeaveProblem(null);
      setLeaveTappedAt(Date.now());
    } else if (Date.now() - leaveTappedAt > DOUBLE_TAP_MS) {
      leave();
    }
  }

  async function leave() {
    setLeaving(true);
    try {
      await api.post('/api/leave');
      if (pushSupported) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        const sub = await reg?.pushManager?.getSubscription().catch(() => null);
        if (sub) await sub.unsubscribe().catch(() => {});
      }
      logout();
    } catch (error) {
      setLeaveProblem(error.status === 409 ? 'settings.leaveBlocked' : 'common.error');
      setLeaveTappedAt(null);
      setLeaving(false);
    }
  }

  const languageOptions = LANGUAGES.map((language) => ({ value: language, label: meta(language).name }));
  const confirming = leaveTappedAt !== null;

  return (
    <section>
      <h1>{t(lang, 'settings.title')}</h1>

      <div className="field">
        <p className="label">{t(lang, 'settings.language')}</p>
        <ChipGroup
          label={t(lang, 'settings.language')}
          options={languageOptions}
          value={lang}
          onChange={(language) => save({ lang: language })}
        />
      </div>

      <div className="field">
        <label className="switch-row">
          <span>
            <strong>{t(lang, 'settings.elderMode')}</strong>
            <span className="hint">{t(lang, 'settings.elderModeHint')}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={user.elder_mode}
            onChange={() => save({ elder_mode: !user.elder_mode })}
          />
        </label>
        {failed && <p className="error">{t(lang, 'common.error')}</p>}
      </div>

      <div className="field">
        <label className="switch-row">
          <span>
            <strong>🔔 {t(lang, 'settings.pushTitle')}</strong>
            <span className="hint">
              {pushSupported ? t(lang, 'settings.pushHint') : t(lang, 'settings.pushUnsupported')}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            disabled={!pushSupported || pushBusy}
            checked={pushEnabled}
            onChange={togglePush}
          />
        </label>
        {pushError && <p className="error">{t(lang, pushError)}</p>}
      </div>

      {stats && (
        <div className="field">
          <p className="label">{t(lang, 'stats.title')}</p>
          <div className="stats-grid">
            <div className="stat-card">
              <strong>{formatNumber(lang, stats.members)}</strong>
              <span className="muted">{t(lang, 'stats.members')}</span>
            </div>
            <div className="stat-card">
              <strong>{formatNumber(lang, stats.items)}</strong>
              <span className="muted">{t(lang, 'stats.items')}</span>
            </div>
            <div className="stat-card">
              <strong>{formatNumber(lang, stats.completed_loans)}</strong>
              <span className="muted">{t(lang, 'stats.completed')}</span>
            </div>
            <div className="stat-card">
              <strong>{formatNumber(lang, stats.cross_language_loans)}</strong>
              <span className="muted">{t(lang, 'stats.crossLang')}</span>
            </div>
          </div>
        </div>
      )}

      <div className="field">
        <p className="label">{t(lang, 'settings.transferTitle')}</p>
        <p className="hint" style={{ marginBottom: 10 }}>
          {t(lang, 'settings.transferHint')}
        </p>
        <button
          type="button"
          className="button-secondary"
          disabled={transferBusy}
          onClick={generateTransferCode}
        >
          📱 {t(lang, 'settings.transferButton')}
        </button>
        {transfer && (
          <div className="transfer-box">
            <p className="hint">{t(lang, 'settings.transferExpires')}</p>
            <p className="big-code">{transfer.code}</p>
            <img className="transfer-qr" src={transfer.qr} alt={transfer.code} />
          </div>
        )}
      </div>

      <div className="field">
        <p className="label">{t(lang, 'settings.group')}</p>
        <div className="group-preview">
          <div>
            <strong>{group.name}</strong>
            <p>{t(lang, `groupType.${group.type}`)}</p>
          </div>
        </div>
      </div>

      <div className="actions">
        <Link to="/poster" className="button-secondary button-link">
          {t(lang, 'settings.poster')}
        </Link>
        <button
          type="button"
          className={confirming ? 'button-secondary button-danger' : 'button-secondary'}
          disabled={leaving}
          onClick={tapLeave}
        >
          {t(lang, confirming ? 'settings.leaveConfirm' : 'settings.leave')}
        </button>
        {leaveProblem && <p className="error">{t(lang, leaveProblem)}</p>}
      </div>
    </section>
  );
}
