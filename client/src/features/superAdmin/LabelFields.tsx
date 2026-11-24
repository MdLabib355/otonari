export const EMPTY_LABELS = { label_en: '', label_ja: '', label_ja_easy: '', label_bn: '' };
type Labels = typeof EMPTY_LABELS;

const FIELDS: { key: keyof Labels; label: string }[] = [
  { key: 'label_en', label: 'English (en)' },
  { key: 'label_ja', label: 'Japanese (ja)' },
  { key: 'label_ja_easy', label: 'Easy Japanese (ja-easy)' },
  { key: 'label_bn', label: 'Bengali (bn)' },
];

interface Props {
  idPrefix: string;
  labels: Labels;
  onChange: (labels: Partial<Labels>) => void;
}

// One name in all four languages. All are required, so nothing is ever shown untranslated.
export default function LabelFields({ idPrefix, labels, onChange }: Props) {
  return (
    <div className="sa-form-row">
      {FIELDS.map(({ key, label }) => (
        <div key={key} className="field">
          <label className="label" htmlFor={`${idPrefix}-${key}`}>
            {label}
          </label>
          <input
            id={`${idPrefix}-${key}`}
            className="text-input"
            required
            maxLength={60}
            value={labels[key]}
            onChange={(e) => onChange({ [key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
