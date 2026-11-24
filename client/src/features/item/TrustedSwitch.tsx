import type { Lang } from '../../../../shared/types.ts';
import { t } from '../../i18n/index.ts';

// "Trusted neighbors only": for one item, when adding it and later in the list.
interface TrustedSwitchProps {
  lang: Lang;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function TrustedSwitch({ lang, checked, onChange }: TrustedSwitchProps) {
  return (
    <label className="switch-row">
      <span>🔒 {t(lang, 'trust.only')}</span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
