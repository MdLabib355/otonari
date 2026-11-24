import type { Lang } from '../../../../shared/types.ts';
import { useUser } from '../../core/UserContext.ts';
import { renderPhrase, t } from '../../i18n/index.ts';

interface Look {
  skin: string;
  hair: string;
  top: string;
  bun?: boolean; // long hair, tied up
}

const GRANDMOTHER: Look = { skin: '#f3cfae', hair: '#b9b5b0', top: '#8a5a83', bun: true };
const NEWCOMER: Look = { skin: '#b97f55', hair: '#1f1a18', top: '#1f4b6e' };

// The rooms of the building: who lives there, and what they share. In a room without a look nobody is home.
const ROOMS: { look?: Look; emoji: string }[][] = [
  [
    { look: { skin: '#f0c7a0', hair: '#2b2623', top: '#2f7a63' }, emoji: '📽️' },
    { emoji: '🪴' },
    { look: { skin: '#f3cfae', hair: '#3a2c26', top: '#d98a5b', bun: true }, emoji: '🍲' },
  ],
  [
    { look: { skin: '#b97f55', hair: '#1f1a18', top: '#e0a93b', bun: true }, emoji: '🍚' },
    { look: { skin: '#d9a679', hair: '#5b3a26', top: '#c9574f', bun: true }, emoji: '🧳' },
    { emoji: '🐙' },
  ],
];

// Fixed phrases, as the app would show them to each neighbor.
const BUBBLES: { lang: Lang; phrase: string; place: string }[] = [
  { lang: 'ja', phrase: 'qr.noProblem', place: 'bubble-top' },
  { lang: 'bn', phrase: 'qr.onMyWay', place: 'bubble-middle' },
  { lang: 'en', phrase: 'qr.thanks', place: 'bubble-bottom' },
];

// A Japanese apartment building with the neighbors inside, and a handover at the entrance.
export default function NeighborBuilding() {
  const { lang } = useUser();

  return (
    <div className="neighbor-building">
      <svg viewBox="0 0 600 560" role="img" aria-label={t(lang, 'landing.buildingAlt')}>
        <circle cx="545" cy="70" r="46" fill="#e9b7a4" />
        <path d="M0 400 Q80 300 170 350 T350 310 T600 340 V500 H0Z" fill="#cbdadb" />

        {/* Roof with a water tank, as on many Japanese buildings */}
        <path d="M126 70 V44 M164 70 V44" stroke="#8d9aa3" strokeWidth="5" />
        <rect x="114" y="14" width="62" height="34" rx="6" fill="#aebac1" />
        <rect x="64" y="68" width="472" height="18" rx="4" fill="#1f4b6e" />
        <rect x="76" y="86" width="448" height="414" fill="#fbf7ef" />

        {ROOMS.map((floor, row) =>
          floor.map(({ look, emoji }, column) => (
            <Room key={emoji} x={92 + column * 142} y={100 + row * 134} look={look} emoji={emoji} />
          ))
        )}

        {/* Ground floor: mailboxes, the entrance with a noren curtain, a bicycle */}
        <rect x="76" y="366" width="448" height="134" fill="#e8dfcf" />
        <g fill="#8fa3b0">
          {[98, 128, 158].map((x) => (
            <path key={x} d={`M${x} 396 h26 v20 h-26Z M${x} 420 h26 v20 h-26Z`} />
          ))}
        </g>
        <rect x="210" y="376" width="180" height="124" fill="#594636" />
        <rect x="218" y="384" width="164" height="116" fill="#f9dfa6" />
        <path d="M214 380 h55 v28 h-55Z M273 380 h54 v28 h-54Z M331 380 h55 v28 h-55Z" fill="#1f4b6e" />
        <circle cx="300" cy="394" r="8" fill="none" stroke="#fbf7ef" strokeWidth="3" />
        <text x="456" y="496" fontSize="60" textAnchor="middle">
          🚲
        </text>

        <rect y="500" width="600" height="60" fill="#c8bda9" />
        <path d="M0 534 H600" stroke="#f6f2ea" strokeWidth="4" strokeDasharray="34 26" />

        {/* Cherry tree */}
        <path d="M44 504 Q52 430 40 370" stroke="#6d4c3d" strokeWidth="12" fill="none" strokeLinecap="round" />
        <g fill="#f2bcc6">
          <circle cx="30" cy="368" r="34" />
          <circle cx="62" cy="348" r="32" />
          <circle cx="34" cy="328" r="30" />
        </g>

        {/* The handover */}
        <Person x={240} y={508} look={GRANDMOTHER} legs />
        <Person x={360} y={508} look={NEWCOMER} legs />
        <path d="M258 452 L282 460" stroke={GRANDMOTHER.skin} strokeWidth="9" strokeLinecap="round" />
        <path d="M342 452 L318 460" stroke={NEWCOMER.skin} strokeWidth="9" strokeLinecap="round" />
        <rect x="276" y="434" width="48" height="36" rx="4" fill="#cf9f65" />
        <path d="M300 434 V470" stroke="#f3dfbd" strokeWidth="8" />
      </svg>

      {BUBBLES.map(({ lang: bubbleLang, phrase, place }) => (
        <span key={phrase} className={`building-bubble ${place}`} lang={bubbleLang} aria-hidden="true">
          {renderPhrase(bubbleLang, phrase)}
        </span>
      ))}
    </div>
  );
}

function Room({ x, y, look, emoji }: { x: number; y: number; look?: Look; emoji: string }) {
  return (
    <g>
      <rect x={x} y={y} width="132" height="104" rx="4" fill={look ? '#fbe3ae' : '#cbd8de'} />
      {look && <Person x={x + 52} y={y + 104} look={look} />}
      <text x={x + 102} y={y + 74} fontSize="32" textAnchor="middle">
        {emoji}
      </text>
      <path d={`M${x} ${y} h24 q-2 44 -24 60Z`} fill="#fff" opacity="0.75" />
      {/* Balcony */}
      <rect x={x - 4} y={y + 80} width="140" height="34" rx="3" fill="#a9bfcc" />
      <path d={`M${x + 16} ${y + 87} v20 m25 -20 v20 m25 -20 v20 m25 -20 v20 m25 -20 v20`} stroke="#dbe6ec" strokeWidth="4" />
    </g>
  );
}

// A neighbor. x is the middle, y the feet (or the floor of the room).
function Person({ x, y, look, legs = false }: { x: number; y: number; look: Look; legs?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {legs && <path d="M-9 -34 V-4 M9 -34 V-4" stroke="#3b4550" strokeWidth="13" strokeLinecap="round" />}
      <g transform={legs ? 'translate(0 -26)' : undefined}>
        <path d="M-24 0 V-24 Q-24 -46 0 -46 T24 -24 V0Z" fill={look.top} />
        {look.bun && <circle cy="-82" r="8" fill={look.hair} />}
        <circle cy="-60" r="21" fill={look.hair} />
        <path d="M-17 -60 Q-6 -62 2 -71 Q8 -62 17 -60 Q17 -40 0 -40 T-17 -60Z" fill={look.skin} />
        <circle cx="-7" cy="-56" r="2" fill="#2b2623" />
        <circle cx="7" cy="-56" r="2" fill="#2b2623" />
        <path d="M-6 -49 Q0 -43 6 -49" stroke="#8c3f35" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}
