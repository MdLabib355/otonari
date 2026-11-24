// A slim row of filters where exactly one is selected. On a phone it scrolls sideways.
interface Props {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}

export default function FilterStrip({ label, options, value, onChange }: Props) {
  return (
    <div className="filter-strip" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'filter-chip selected' : 'filter-chip'}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
