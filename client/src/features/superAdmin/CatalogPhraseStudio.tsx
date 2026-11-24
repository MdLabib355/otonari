import { useState, type FormEvent } from 'react';
import type { CatalogCategoryRecord, CatalogItemRecord, Lang } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import ItemVisual from '../../components/ItemVisual.tsx';
import { api, ApiError } from '../../core/api.ts';
import { LANGUAGES } from '../../data/catalog.ts';
import { meta, renderPhrase } from '../../i18n/index.ts';
import CategoryManager from './CategoryManager.tsx';
import LabelFields, { EMPTY_LABELS } from './LabelFields.tsx';

const INSPECTABLE_PHRASES = [
  'request',
  'accept',
  'declineBusy',
  'sys.dueSoon',
  'sys.overdue',
  'sys.overdueLender',
  'admin.gentleReminder',
  'admin.spotAssist',
  'platform.escalationNotice',
];

const EMPTY_FORM = { item_key: '', category: 'kitchen', ...EMPTY_LABELS };

export interface CatalogPhraseStudioProps {
  catalog: CatalogItemRecord[];
  categories: CatalogCategoryRecord[];
  onRefresh: () => Promise<void>;
  onNotify: (text: string, isError?: boolean) => void;
}

export default function CatalogPhraseStudio({ catalog, categories, onRefresh, onNotify }: CatalogPhraseStudioProps) {
  const [category, setCategory] = useState<string>('all');
  const [selectedPhrase, setSelectedPhrase] = useState<string>(INSPECTABLE_PHRASES[0]);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);

  const filtered = category === 'all' ? catalog : catalog.filter((c) => c.category === category);

  async function toggleActive(item: CatalogItemRecord) {
    setBusy(true);
    try {
      await api.patch(`/super-admin/catalog/${encodeURIComponent(item.item_key)}`, { is_active: !item.is_active });
      await onRefresh();
      onNotify(`Catalog item "${item.item_key}" ${!item.is_active ? 'enabled' : 'disabled'}`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Failed to update catalog item', true);
    } finally {
      setBusy(false);
    }
  }

  async function submitAdd(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post('/super-admin/catalog', form);
      setAddOpen(false);
      setForm(EMPTY_FORM);
      await onRefresh();
      onNotify(`Added "${form.item_key}" to global catalog`);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'Failed to add catalog item', true);
    } finally {
      setBusy(false);
    }
  }

  const categoryOptions = [
    { value: 'all', label: `All (${catalog.length})` },
    ...categories.map((c) => ({ value: c.category_key, label: c.label_en })),
  ];

  const sampleParams = {
    item: 'futon_dryer',
    spot: 'entrance',
    name: 'Sato',
    start: '2026-11-25T09:00:00.000Z',
    end: '2026-11-27T09:00:00.000Z',
  };

  return (
    <div>
      <div className="sa-page-head">
        <div>
          <h1>Fixed Catalog &amp; i18n Phrases</h1>
          <p>Govern Otonari&apos;s curated item allowlist and inspect 4-locale structured phrase templates.</p>
        </div>
        <button type="button" className="ga-btn ga-btn-primary" onClick={() => setAddOpen(true)}>
          + Add Catalog Item
        </button>
      </div>

      <div className="sa-alert sa-alert-indigo">
        <div>
          <strong>Zero Free-Text Messaging Policy:</strong> Every catalog item requires complete human-verified
          translations across <code>en</code>, <code>ja</code>, <code>ja-easy</code>, and <code>bn</code> before
          activation.
        </div>
      </div>

      <div className="sa-card">
        <div className="sa-card-head">
          <div>
            <h2>Global Fixed Item Catalog ({catalog.length})</h2>
            <p className="ga-meta">Changes sync immediately to residents via GET /api/v1/catalog.</p>
          </div>
          <span className="ga-badge ga-badge-green">4 / 4 Locales Verified</span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <ChipGroup label="Catalog category" options={categoryOptions} value={category} onChange={setCategory} />
        </div>

        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead>
              <tr>
                <th>Item Key</th>
                <th>Category</th>
                <th>4-Language Human Translations</th>
                <th>Status</th>
                <th>Control</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.item_key}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="inline-icon-text">
                      <ItemVisual itemKey={item.item_key} categoryKey={item.category} alt="" size="sm" />
                      <span className="ga-code-chip">{item.item_key}</span>
                    </span>
                  </td>
                  <td>
                    <span className="ga-badge ga-badge-muted">{item.category}</span>
                  </td>
                  <td>
                    <div className="sa-trans-grid">
                      <div className="sa-trans-cell">
                        <span className="sa-trans-code">en</span>
                        {item.label_en}
                      </div>
                      <div className="sa-trans-cell">
                        <span className="sa-trans-code">ja</span>
                        {item.label_ja}
                      </div>
                      <div className="sa-trans-cell">
                        <span className="sa-trans-code">ja-easy</span>
                        {item.label_ja_easy}
                      </div>
                      <div className="sa-trans-cell">
                        <span className="sa-trans-code">bn</span>
                        {item.label_bn}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`ga-badge ${item.is_active ? 'ga-badge-green' : 'ga-badge-muted'}`}>
                      {item.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ga-btn"
                      disabled={busy}
                      onClick={() => toggleActive(item)}
                    >
                      {item.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CategoryManager categories={categories} onRefresh={onRefresh} onNotify={onNotify} />

      {/* Read-Only 4-Locale Phrase Template Inspector */}
      <div className="sa-card">
        <div className="sa-card-head">
          <div>
            <h2>Phrase Template Inspector (Read-Only)</h2>
            <p className="ga-meta">
              Preview how a fixed key renders simultaneously across all 4 locales using sample params (
              <code>futon_dryer</code>, <code>entrance</code>, <code>Sato</code>).
            </p>
          </div>
          <div style={{ minWidth: 260 }}>
            <select
              className="sa-select"
              aria-label="Select phrase key"
              value={selectedPhrase}
              onChange={(e) => setSelectedPhrase(e.target.value)}
            >
              {INSPECTABLE_PHRASES.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sa-phrase-grid">
          {LANGUAGES.map((locale: Lang) => (
            <div key={locale} className="sa-phrase-box">
              <div className="ga-preview-head" style={{ marginBottom: 6 }}>
                <span>
                  {meta(locale).name} ({locale})
                </span>
                <span className="ga-code-chip">{selectedPhrase}</span>
              </div>
              <div>{renderPhrase(locale, selectedPhrase, sampleParams)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Catalog Item Modal */}
      {addOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>Add Fixed Catalog Item</h2>
            </div>
            <form className="modal-form" onSubmit={submitAdd}>
              <div className="modal-body">
                <p className="ga-meta" style={{ marginBottom: 12 }}>
                  All 4 language labels are required to guarantee zero untranslated keys.
                </p>
                  <div className="field">
                    <label className="label" htmlFor="ci-cat">
                      Category
                    </label>
                    <select
                      id="ci-cat"
                      className="sa-select"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                    >
                      {categories
                        .filter((c) => c.is_active)
                        .map((c) => (
                          <option key={c.category_key} value={c.category_key}>
                            {c.label_en}
                          </option>
                        ))}
                    </select>
                  </div>
                <div className="field">
                  <label className="label" htmlFor="ci-key">
                    item_key (snake_case)
                  </label>
                  <input
                    id="ci-key"
                    className="text-input"
                    required
                    pattern="[a-z0-9_]{2,40}"
                    value={form.item_key}
                    onChange={(e) => setForm({ ...form, item_key: e.target.value.toLowerCase() })}
                    placeholder="e.g., hand_mixer"
                  />
                </div>
                <LabelFields idPrefix="ci" labels={form} onChange={(labels) => setForm({ ...form, ...labels })} />
              </div>
              <div className="modal-footer">
                <button type="button" className="button-secondary" onClick={() => setAddOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="button-primary" disabled={busy}>
                  Save to Global Catalog
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
