import type { Lang } from '../../../../shared/types.ts';
import ChipGroup from '../../components/ChipGroup.tsx';
import { DURATIONS, SPOTS } from '../../data/catalog.ts';
import { spotName, t } from '../../i18n/index.ts';
import TrustedSwitch from './TrustedSwitch.tsx';

// How I lend an item.
export interface Lending {
  max_days: number;
  spot: string;
  trusted_only: boolean;
}

// Sensible defaults, so often one tap is enough.
export const NEW_LENDING: Lending = { max_days: 3, spot: 'entrance', trusted_only: false };

export function appendLending(form: FormData, lending: Lending) {
  form.append('max_days', String(lending.max_days));
  form.append('spot', lending.spot);
  form.append('trusted_only', String(lending.trusted_only));
}

// Spot names are lowercase because they sit inside sentences ("at the building entrance").
// On a chip they look better with a capital letter (no effect on Japanese or Bengali).
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface Props {
  lang: Lang;
  value: Lending;
  onChange: (value: Lending) => void;
  spotLocked?: boolean; // during a loan: the borrower was told this spot
}

export default function LendingFields({ lang, value, onChange, spotLocked = false }: Props) {
  const durationOptions = DURATIONS.map((n) => ({
    value: n,
    label: n === 1 ? t(lang, 'borrow.day') : t(lang, 'borrow.days', { n }),
  }));
  const spotOptions = SPOTS.map((key) => ({ value: key, label: capitalize(spotName(lang, key)) }));

  return (
    <>
      <div className="field">
        <p className="label">{t(lang, 'myItems.maxDays')}</p>
        <ChipGroup
          label={t(lang, 'myItems.maxDays')}
          options={durationOptions}
          value={value.max_days}
          onChange={(max_days) => onChange({ ...value, max_days })}
        />
      </div>
      {!spotLocked && (
        <div className="field">
          <p className="label">{t(lang, 'myItems.spot')}</p>
          <ChipGroup
            label={t(lang, 'myItems.spot')}
            options={spotOptions}
            value={value.spot}
            onChange={(spot) => onChange({ ...value, spot })}
          />
        </div>
      )}
      <TrustedSwitch
        lang={lang}
        checked={value.trusted_only}
        onChange={(trusted_only) => onChange({ ...value, trusted_only })}
      />
      <p className="hint">{t(lang, 'trust.explain')}</p>
      <p className="hint">{t(lang, 'trust.hint')}</p>
    </>
  );
}
