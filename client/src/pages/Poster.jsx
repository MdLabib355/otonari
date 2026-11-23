import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { t } from '../i18n/index.js';
import { useUser } from '../UserContext.js';

// The join poster of my own group, or of the group in the address: /poster?code=XXXX-XXXX works
// without being a member, so that whoever just created a group can open its poster.
// Still simple: Step 10 adds the QR code, the three languages and printing.
export default function Poster() {
  const { lang, group: myGroup } = useUser();
  const [searchParams] = useSearchParams();
  const [poster, setPoster] = useState(null); // { code, name, type, city, memberCount }
  const [problem, setProblem] = useState(null); // the text to show instead

  const code = (searchParams.get('code') || myGroup?.code || '').trim().toUpperCase();

  useEffect(() => {
    if (!code) return;
    setPoster(null);
    setProblem(null);
    api
      .get(`/api/groups/by-code/${encodeURIComponent(code)}`)
      .then((group) => setPoster({ code, ...group }))
      .catch((error) => setProblem(error.status === 404 ? 'join.groupNotFound' : 'common.error'));
  }, [code]);

  if (!code) return <Navigate to="/join" replace />;
  if (problem) return <p className="error">{t(lang, problem)}</p>;
  if (!poster) return <p>{t(lang, 'common.loading')}</p>;

  return (
    <section>
      <h1>{t(lang, 'poster.title')}</h1>
      <p className="subtitle">{t(lang, 'join.groupFound', { group: poster.name, city: poster.city })}</p>
      <p className="big-code">{poster.code}</p>
    </section>
  );
}
