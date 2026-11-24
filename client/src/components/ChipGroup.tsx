// A row of big tappable chips where exactly one is selected (like radio buttons).
//
//    <ChipGroup
//      label="Your language"
//      options={[{ value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }]}
//      value={lang}
//      onChange={setLang}
//    />
//
// T is the type of the values: the options, `value` and `onChange` must agree on it.
interface Props<T> {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export default function ChipGroup<T extends string | number>({ label, options, value, onChange }: Props<T>) {
  return (
    <div className="chip-group" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'chip selected' : 'chip'}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
