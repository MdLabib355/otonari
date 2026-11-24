import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: string;
  onText: (text: string) => void;
}

// One labeled input of the login pages.
export default function AuthField({ id, label, hint, onText, className = '', ...input }: Props) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`text-input ${className}`}
        onChange={(event) => onText(event.target.value)}
        required
        {...input}
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
