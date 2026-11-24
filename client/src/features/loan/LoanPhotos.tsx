import type { Lang, Loan } from '../../../../shared/types.ts';
import { t } from '../../i18n/index.ts';

// The condition before and after, side by side, so both people can compare.
export default function LoanPhotos({ loan, lang }: { loan: Loan; lang: Lang }) {
  const photos = [
    { url: loan.handover_photo, label: t(lang, 'loan.handoverPhoto') },
    { url: loan.return_photo, label: t(lang, 'loan.returnPhoto') },
  ];
  const taken = photos.flatMap(({ url, label }) => (url ? [{ url, label }] : []));
  if (taken.length === 0) return null;

  return (
    <div className="loan-photos">
      {taken.map((photo) => (
        <figure key={photo.url}>
          <img src={photo.url} alt={photo.label} />
          <figcaption>{photo.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
