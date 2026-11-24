import { useState, type FormEvent } from 'react';
import type { CatalogCategoryRecord } from '../../../../shared/types.ts';
import { CATEGORY_ICON_KEYS, CategoryIcon } from '../../components/ItemIcons.tsx';
import { api, ApiError } from '../../core/api.ts';
import LabelFields, { EMPTY_LABELS } from './LabelFields.tsx';

interface Props {
  categories: CatalogCategoryRecord[];
  onRefresh: () => Promise<void>;
  onNotify: (text: string, isError?: boolean) => void;
}

const EMPTY_FORM = { category_key: '', icon_key: 'default', ...EMPTY_LABELS };

// The categories of the catalog: add one, change its drawing and its 4 labels, enable or disable it.
export default function CategoryManager({ categories, onRefresh, onNotify }: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState<'add' | 'edit' | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await action();
      setOpen(null);
      await onRefresh();
      onNotify(message);
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : 'The category could not be saved', true);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const { category_key, ...changes } = form;
    if (open === 'add') save(() => api.post('/super-admin/categories', form), `Added category "${category_key}"`);
    else save(() => api.patch(`/super-admin/categories/${category_key}`, changes), `Saved "${category_key}"`);
  }

  function edit(category: CatalogCategoryRecord) {
    const { category_key, icon_key, label_en, label_ja, label_ja_easy, label_bn } = category;
    setForm({ category_key, icon_key, label_en, label_ja, label_ja_easy, label_bn });
    setOpen('edit');
  }

  return (
    <div className="sa-card">
      <div className="sa-card-head">
        <div>
          <h2>Categories ({categories.length})</h2>
          <p className="ga-meta">Changes sync to residents via GET /api/v1/categories.</p>
        </div>
        <button
          type="button"
          className="ga-btn ga-btn-soft"
          onClick={() => {
            setForm(EMPTY_FORM);
            setOpen('add');
          }}
        >
          + Add Category
        </button>
      </div>

      <div className="sa-category-grid">
        {categories.map((category) => (
          <div key={category.category_key} className={`sa-category ${category.is_active ? '' : 'ga-card-dimmed'}`}>
            <CategoryIcon iconKey={category.icon_key} className="sa-category-icon" />
            <div className="sa-category-text">
              <strong>{category.label_en}</strong>
              <span className="ga-meta">
                {category.label_ja} · {category.label_ja_easy} · {category.label_bn}
              </span>
              <span>
                <span className="ga-code-chip">{category.category_key}</span>{' '}
                {!category.is_active && <span className="ga-badge ga-badge-muted">Disabled</span>}
              </span>
            </div>
            <div className="ga-actions">
              <button type="button" className="ga-btn" disabled={busy} onClick={() => edit(category)}>
                Edit
              </button>
              <button
                type="button"
                className="ga-btn"
                disabled={busy}
                onClick={() =>
                  save(
                    () =>
                      api.patch(`/super-admin/categories/${category.category_key}`, { is_active: !category.is_active }),
                    `Category "${category.category_key}" ${category.is_active ? 'disabled' : 'enabled'}`
                  )
                }
              >
                {category.is_active ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-header">
              <h2>{open === 'add' ? 'Add Category' : `Edit Category: ${form.category_key}`}</h2>
            </div>
            <form className="modal-form" onSubmit={submit}>
              <div className="modal-body">
                {open === 'add' && (
                  <div className="field">
                    <label className="label" htmlFor="cc-key">
                      category_key (snake_case)
                    </label>
                    <input
                      id="cc-key"
                      className="text-input"
                      required
                      pattern="[a-z0-9_]{2,32}"
                      value={form.category_key}
                      onChange={(e) => setForm({ ...form, category_key: e.target.value.toLowerCase() })}
                      placeholder="e.g., musical_instruments"
                    />
                  </div>
                )}
                <div className="field">
                  <p className="label">Icon</p>
                  <div className="sa-icon-picker" role="group" aria-label="Icon">
                    {CATEGORY_ICON_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={form.icon_key === key ? 'sa-icon-option selected' : 'sa-icon-option'}
                        aria-pressed={form.icon_key === key}
                        aria-label={key}
                        title={key}
                        onClick={() => setForm({ ...form, icon_key: key })}
                      >
                        <CategoryIcon iconKey={key} />
                      </button>
                    ))}
                  </div>
                </div>
                <LabelFields idPrefix="cc" labels={form} onChange={(labels) => setForm({ ...form, ...labels })} />
              </div>
              <div className="modal-footer">
                <button type="button" className="button-secondary" onClick={() => setOpen(null)}>
                  Cancel
                </button>
                <button type="submit" className="button-primary" disabled={busy}>
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
