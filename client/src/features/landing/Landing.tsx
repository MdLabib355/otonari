import { Link } from 'react-router-dom';
import {
  BellIcon,
  BoxIcon,
  CameraIcon,
  LoansIcon,
  LockIcon,
  ShelfIcon,
  SpeakerIcon,
  UsersIcon,
} from '../../components/Icons.tsx';
import { useUser } from '../../core/UserContext.ts';
import { LANGUAGES } from '../../data/catalog.ts';
import { meta, t, type UiKey } from '../../i18n/index.ts';
import SamplePhrase from './SamplePhrase.tsx';

type Card = { Icon: typeof BoxIcon; title: UiKey; text: UiKey };

const PROBLEMS: Card[] = [
  { Icon: UsersIcon, title: 'landing.problem1', text: 'landing.problem1Text' },
  { Icon: LoansIcon, title: 'landing.problem2', text: 'landing.problem2Text' },
  { Icon: BoxIcon, title: 'landing.problem3', text: 'landing.problem3Text' },
];

const STEPS: { title: UiKey; text: UiKey }[] = [
  { title: 'landing.step1', text: 'landing.step1Text' },
  { title: 'landing.step2', text: 'landing.step2Text' },
  { title: 'landing.step3', text: 'landing.step3Text' },
  { title: 'landing.step4', text: 'landing.step4Text' },
];

const PROMISES: Card[] = [
  { Icon: ShelfIcon, title: 'landing.promise1', text: 'landing.promise1Text' },
  { Icon: BellIcon, title: 'landing.promise2', text: 'landing.promise2Text' },
  { Icon: LockIcon, title: 'landing.promise3', text: 'landing.promise3Text' },
  { Icon: CameraIcon, title: 'landing.promise4', text: 'landing.promise4Text' },
  { Icon: SpeakerIcon, title: 'landing.promise5', text: 'landing.promise5Text' },
];

// The first page for visitors: what Otonari is for.
export default function Landing() {
  const { lang } = useUser();

  return (
    <div className="landing">
      <section className="landing-hero">
        <div>
          <p className="landing-theme">TSUNAGU · {t(lang, 'landing.theme')}</p>
          <h1>{t(lang, 'tagline')}</h1>
          <p className="landing-lead">{t(lang, 'landing.lead')}</p>
          <CallToAction />
        </div>
        <SamplePhrase />
      </section>

      <section className="landing-section">
        <h2>{t(lang, 'landing.problemTitle')}</h2>
        <CardGrid cards={PROBLEMS} />
      </section>

      <section className="landing-vision">
        <h2>{t(lang, 'landing.visionTitle')}</h2>
        <p>{t(lang, 'landing.vision')}</p>
      </section>

      <section className="landing-section">
        <h2>{t(lang, 'landing.howTitle')}</h2>
        <ol className="landing-steps">
          {STEPS.map(({ title, text }, index) => (
            <li key={title}>
              <span className="landing-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <strong>{t(lang, title)}</strong>
              <p>{t(lang, text)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section">
        <h2>{t(lang, 'landing.promiseTitle')}</h2>
        <CardGrid cards={PROMISES} />
      </section>

      <section className="landing-end">
        <h2>{t(lang, 'landing.endTitle')}</h2>
        <p className="landing-languages">
          {LANGUAGES.map((code) => (
            <span key={code} className="badge badge-available" lang={code === 'ja-easy' ? 'ja' : code}>
              {meta(code).name}
            </span>
          ))}
        </p>
        <CallToAction />
      </section>
    </div>
  );
}

function CallToAction() {
  const { lang } = useUser();
  return (
    <div className="landing-buttons">
      <Link to="/register" className="button-primary button-link">
        {t(lang, 'auth.register')}
      </Link>
      <Link to="/login" className="button-secondary button-link">
        {t(lang, 'auth.login')}
      </Link>
    </div>
  );
}

function CardGrid({ cards }: { cards: Card[] }) {
  const { lang } = useUser();
  return (
    <ul className="landing-cards">
      {cards.map(({ Icon, title, text }) => (
        <li key={title}>
          <span className="landing-card-icon">
            <Icon />
          </span>
          <strong>{t(lang, title)}</strong>
          <p>{t(lang, text)}</p>
        </li>
      ))}
    </ul>
  );
}
