import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import type { GroupPreview } from '../../../../shared/types.ts';
import { api, errorStatus } from '../../core/api.ts';
import { t, type UiKey } from '../../i18n/index.ts';
import { useUser } from '../../core/UserContext.ts';
import PosterCard from './PosterCard.tsx';

// The join poster of my own group, or of the group in the address: /poster?code=XXXX-XXXX works
// without being a member, so that whoever just created a group can open its poster.
export default function Poster() {
  const { lang, group: myGroup } = useUser();
  const [searchParams] = useSearchParams();
  const [poster, setPoster] = useState<(GroupPreview & { code: string }) | null>(null);
  const [problem, setProblem] = useState<UiKey | null>(null);

  const code = (searchParams.get('code') || myGroup?.code || '').trim().toUpperCase();

  useEffect(() => {
    if (!code) return;
    setPoster(null);
    setProblem(null);
    api
      .get<GroupPreview>(`/groups/${encodeURIComponent(code)}`)
      .then((group) => setPoster({ code, ...group }))
      .catch((error) => setProblem(errorStatus(error) === 404 ? 'join.groupNotFound' : 'common.error'));
  }, [code]);

  if (!code) return <Navigate to="/join" replace />;
  if (problem) return <p className="error narrow-page">{t(lang, problem)}</p>;
  if (!poster) return <p className="narrow-page">{t(lang, 'common.loading')}</p>;

  return (
    <section className="narrow-page">
      <button type="button" className="button-primary print-button" onClick={() => window.print()}>
        {t(lang, 'poster.print')}
      </button>

      <PosterCard name={poster.name} city={poster.city} code={poster.code} />
    </section>
  );
}
