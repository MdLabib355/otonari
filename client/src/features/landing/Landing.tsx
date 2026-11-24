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
import { ITEMS, LANGUAGES } from '../../data/catalog.ts';
import { itemName, meta, t, type UiKey } from '../../i18n/index.ts';
import NeighborBuilding from './NeighborBuilding.tsx';
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

// Some of the catalog, to show what neighbors lend.
const SHOWN_ITEMS = [
  'futon_dryer', 'takoyaki_maker', 'projector', 'ladder', 'donabe', 'camping_tent',
  'suitcase', 'rice_cooker_large', 'power_drill', 'hot_plate', 'dehumidifier', 'board_game',
];

// Files in public/landing/ (README.md says where they are from)
const PLACES: { file: string; alt: UiKey; title: UiKey; text: UiKey }[] = [
  {
    file: 'apartments',
    alt: 'landing.photoApartments',
    title: 'landing.placeBuilding',
    text: 'landing.placeBuildingText',
  },
  { file: 'lane', alt: 'landing.photoLane', title: 'landing.placeBlock', text: 'landing.placeBlockText' },
  { file: 'shop', alt: 'landing.photoShop', title: 'landing.placeSpot', text: 'landing.placeSpotText' },
];

// The first page for visitors: what Otonari is for.
export default function Landing() {
  const { lang } = useUser();

  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-hero-text">
          <p className="landing-theme">TSUNAGU · {t(lang, 'landing.theme')}</p>
          <h1>{t(lang, 'tagline')}</h1>
          <p className="landing-lead">{t(lang, 'landing.lead')}</p>
          <CallToAction />
          <Languages />
        </div>
        <div className="landing-hero-picture">
          <img src="/landing/street.jpg" alt={t(lang, 'landing.photoStreet')} width="1000" height="1500" />
          <SamplePhrase />
        </div>
      </section>

      <section className="landing-section">
        <h2>{t(lang, 'landing.itemsTitle')}</h2>
        <p className="landing-intro">{t(lang, 'landing.itemsText')}</p>
        <ul className="landing-items">
          {ITEMS.filter((item) => SHOWN_ITEMS.includes(item.key)).map((item) => (
            <li key={item.key}>
              <span className="landing-item-emoji" aria-hidden="true">
                {item.emoji}
              </span>
              {itemName(lang, item.key)}
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section landing-band landing-building">
        <div>
          <h2>{t(lang, 'landing.buildingTitle')}</h2>
          <p className="landing-intro">{t(lang, 'landing.buildingText')}</p>
        </div>
        <NeighborBuilding />
      </section>

      <section className="landing-section">
        <h2>{t(lang, 'landing.problemTitle')}</h2>
        <CardGrid cards={PROBLEMS} />
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
        <h2>{t(lang, 'landing.placesTitle')}</h2>
        <p className="landing-intro">{t(lang, 'landing.placesText')}</p>
        <div className="landing-places">
          {PLACES.map(({ file, alt, title, text }) => (
            <figure key={file} className="landing-place">
              <img src={`/landing/${file}.jpg`} alt={t(lang, alt)} loading="lazy" />
              <figcaption>
                <strong>{t(lang, title)}</strong>
                <span>{t(lang, text)}</span>
              </figcaption>
            </figure>
          ))}
          {/* After registering, the Join page offers to start a neighborhood. */}
          <Link to="/register" className="landing-place landing-place-start">
            <strong>
              {t(lang, 'newGroup.link')} <span aria-hidden="true">→</span>
            </strong>
            <span>{t(lang, 'newGroup.hint')}</span>
          </Link>
        </div>
      </section>

      <section className="landing-section">
        <h2>{t(lang, 'landing.promiseTitle')}</h2>
        <CardGrid cards={PROMISES} />
      </section>

      <section className="landing-vision">
        <h2>{t(lang, 'landing.visionTitle')}</h2>
        <p>{t(lang, 'landing.vision')}</p>
      </section>

      <section className="landing-end">
        <h2>{t(lang, 'landing.endTitle')}</h2>
        <CallToAction />
      </section>
    </div>
  );
}

function Languages() {
  return (
    <p className="landing-languages">
      {LANGUAGES.map((code) => (
        <span key={code} lang={code === 'ja-easy' ? 'ja' : code}>
          {meta(code).name}
        </span>
      ))}
    </p>
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
