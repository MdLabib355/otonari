// A row of big tappable chips where exactly one is selected (like radio buttons).
//
//    <ChipGroup
//      label="Your language"
//      options={[{ value: 'en', label: 'English' }, { value: 'ja', label: '日本語' }]}
//      value={lang}
//      onChange={setLang}
//    />
export default function ChipGroup({ label, options, value, onChange }) {
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
