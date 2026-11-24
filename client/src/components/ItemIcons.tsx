// The icons of household items and their categories.
// The shapes are from Tabler Icons 3.52 (https://tabler.io/icons, MIT license, (c) 2020-2026 Paweł Kuna).

// Super admins choose one of these for a category (the server has the same list in core/allowedKeys.ts).
export const CATEGORY_ICON_KEYS = [
  'kitchen',
  'cleaning',
  'tools',
  'living',
  'outdoor',
  'electronics',
  'sports',
  'baby',
  'books',
  'garden',
  'default',
];

const CATEGORY_ICONS: Record<string, string[]> = {
  // Tabler: tools-kitchen-2
  kitchen: [
    'M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12m0 12v6h-1v-3m-10 -14v17m-3 -17v3a3 3 0 1 0 6 0v-3',
  ],
  // Tabler: bucket-droplet
  cleaning: [
    'M5 16l1.465 1.638a2 2 0 1 1 -3.015 .099l1.55 -1.737',
    'M13.737 9.737c2.299 -2.3 3.23 -5.095 2.081 -6.245c-1.15 -1.15 -3.945 -.217 -6.244 2.082c-2.3 2.299 -3.231 5.095 -2.082 6.244c1.15 1.15 3.946 .218 6.245 -2.081',
    'M7.492 11.818c.362 .362 .768 .676 1.208 .934l6.895 4.047c1.078 .557 2.255 -.075 3.692 -1.512c1.437 -1.437 2.07 -2.614 1.512 -3.692c-.372 -.718 -1.72 -3.017 -4.047 -6.895a6.015 6.015 0 0 0 -.934 -1.208',
  ],
  // Tabler: tools
  tools: [
    'M3 21h4l13 -13a1.5 1.5 0 0 0 -4 -4l-13 13v4',
    'M14.5 5.5l4 4',
    'M12 8l-5 -5l-4 4l5 5',
    'M7 8l-1.5 1.5',
    'M16 12l5 5l-4 4l-5 -5',
    'M16 17l-1.5 1.5',
  ],
  // Tabler: sofa
  living: [
    'M4 11a2 2 0 0 1 2 2v1h12v-1a2 2 0 1 1 4 0v5a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-5a2 2 0 0 1 2 -2',
    'M4 11v-3a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v3',
    'M12 5v9',
  ],
  // Tabler: mountain
  outdoor: [
    'M3 20h18l-6.921 -14.612a2.3 2.3 0 0 0 -4.158 0l-6.921 14.612',
    'M7.5 11l2 2.5l2.5 -2.5l2 3l2.5 -2',
  ],
  // Tabler: plug
  electronics: [
    'M9.785 6l8.215 8.215l-2.054 2.054a5.81 5.81 0 1 1 -8.215 -8.215l2.054 -2.054',
    'M4 20l3.5 -3.5',
    'M15 4l-3.5 3.5',
    'M20 9l-3.5 3.5',
  ],
  // Tabler: ball-football
  sports: [
    'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0',
    'M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55l4.76 -3.45',
    'M12 7v-4m3 13l2.5 3m-.74 -8.55l3.74 -1.45m-11.44 7.05l-2.56 2.95m.74 -8.55l-3.74 -1.45',
  ],
  // Tabler: baby-bottle
  baby: [
    'M5 10h14',
    'M12 2v2',
    'M12 4a5 5 0 0 1 5 5v11a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2v-11a5 5 0 0 1 5 -5',
  ],
  // Tabler: books
  books: [
    'M5 5a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -14',
    'M9 5a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -14',
    'M5 8h4',
    'M9 16h4',
    'M13.803 4.56l2.184 -.53c.562 -.135 1.133 .19 1.282 .732l3.695 13.418a1.02 1.02 0 0 1 -.634 1.219l-.133 .041l-2.184 .53c-.562 .135 -1.133 -.19 -1.282 -.732l-3.695 -13.418a1.02 1.02 0 0 1 .634 -1.219l.133 -.041',
    'M14 9l4 -1',
    'M16 16l3.923 -.98',
  ],
  // Tabler: plant-2
  garden: [
    'M2 9a10 10 0 1 0 20 0',
    'M12 19a10 10 0 0 1 10 -10',
    'M2 9a10 10 0 0 1 10 10',
    'M12 4a9.7 9.7 0 0 1 2.99 7.5',
    'M9.01 11.5a9.7 9.7 0 0 1 2.99 -7.5',
  ],
  // Tabler: package
  default: [
    'M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5',
    'M12 12l8 -4.5',
    'M12 12l0 9',
    'M12 12l-8 -4.5',
    'M16 5.25l-8 4.5',
  ],
};

const ITEM_ICONS: Record<string, string[]> = {
  // Tabler: grill-spatula
  hot_plate: [
    'M10.2 10.2l6.3 6.3',
    'M19.347 16.575l1.08 1.079a1.96 1.96 0 0 1 -2.773 2.772l-1.08 -1.079a1.96 1.96 0 0 1 2.773 -2.772',
    'M3 7l3.05 3.15a2.9 2.9 0 0 0 4.1 -4.1l-3.15 -3.05l-4 4',
  ],
  // Tabler: bowl-chopsticks
  rice_cooker_large: [
    'M4 11h16a1 1 0 0 1 1 1v.5c0 1.5 -2.517 5.573 -4 6.5v1a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-1c-1.687 -1.054 -4 -5 -4 -6.5v-.5a1 1 0 0 1 1 -1',
    'M19 7l-14 1',
    'M19 2l-14 3',
  ],
  // Tabler: soup
  donabe: [
    'M4 11h16a1 1 0 0 1 1 1v.5c0 1.5 -2.517 5.573 -4 6.5v1a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-1c-1.687 -1.054 -4 -5 -4 -6.5v-.5a1 1 0 0 1 1 -1',
    'M12 4a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2',
    'M16 4a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2',
    'M8 4a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2',
  ],
  // Tabler: blender
  blender: [
    'M9 10h-3a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h10.802a1 1 0 0 1 .984 1.179l-1.786 9.821',
    'M8 4l2 11',
    'M11 15h4a3 3 0 0 1 3 3v2a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-2a3 3 0 0 1 3 -3',
    'M12 4v-1h2v1',
    'M13 18v.01',
  ],
  // Tabler: flame
  cassette_stove: [
    'M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235',
  ],
  // Tabler: bread
  bread_maker: [
    'M18 4a3 3 0 0 1 2 5.235v8.765a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-8.764a3 3 0 0 1 1.824 -5.231h12.176v-.005',
  ],
  // Tabler: bed
  futon_dryer: [
    'M5 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M22 17v-3h-20',
    'M2 8v9',
    'M12 14h10v-2a3 3 0 0 0 -3 -3h-7v5',
  ],
  // Tabler: vacuum-cleaner
  vacuum_cleaner: [
    'M21 12a9 9 0 1 1 -18 0a9 9 0 0 1 18 0',
    'M14 9a2 2 0 1 1 -4 0a2 2 0 0 1 4 0',
    'M12 16h.01',
  ],
  // Tabler: ironing-steam
  steam_iron: [
    'M12 19v2',
    'M9 4h7.459a3 3 0 0 1 2.959 2.507l.577 3.464l.81 4.865a1 1 0 0 1 -.985 1.164h-16.82a7 7 0 0 1 7 -7h9.8',
    'M8 19l-1 2',
    'M16 19l1 2',
  ],
  // Tabler: brush
  carpet_cleaner: [
    'M3 21v-4a4 4 0 1 1 4 4h-4',
    'M21 3a16 16 0 0 0 -12.8 10.2',
    'M21 3a16 16 0 0 1 -10.2 12.8',
    'M10.6 9a9 9 0 0 1 4.4 4.4',
  ],
  // Tabler: droplet-minus
  dehumidifier: [
    'M18.946 15.083a6.538 6.538 0 0 0 -.882 -4.206l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.376 1.376 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546a7.163 7.163 0 0 0 5.089 1.555',
    'M16 19h6',
  ],
  // Tabler: spray
  high_pressure_washer: [
    'M4 12a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-4a2 2 0 0 1 -2 -2l0 -7',
    'M6 10v-4a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v4',
    'M15 7h.01',
    'M18 9h.01',
    'M18 5h.01',
    'M21 3h.01',
    'M21 7h.01',
    'M21 11h.01',
    'M10 7h1',
  ],
  // Tabler: ladder
  ladder: [
    'M8 3v18',
    'M16 3v18',
    'M8 14h8',
    'M8 10h8',
    'M8 6h8',
    'M8 18h8',
  ],
  // Tabler: hammer-drill
  power_drill: [
    'M12 15v6',
    'M16 5h4',
    'M8 5h-4',
    'M15 11h-6a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1',
    'M14 11h-4v3a1 1 0 0 0 1 1h2a1 1 0 0 0 1 -1v-3',
  ],
  // Tabler: tools
  tool_set: [
    'M3 21h4l13 -13a1.5 1.5 0 0 0 -4 -4l-13 13v4',
    'M14.5 5.5l4 4',
    'M12 8l-5 -5l-4 4l5 5',
    'M7 8l-1.5 1.5',
    'M16 12l5 5l-4 4l-5 -5',
    'M16 17l-1.5 1.5',
  ],
  // Tabler: plug
  extension_cord: [
    'M9.785 6l8.215 8.215l-2.054 2.054a5.81 5.81 0 1 1 -8.215 -8.215l2.054 -2.054',
    'M4 20l3.5 -3.5',
    'M15 4l-3.5 3.5',
    'M20 9l-3.5 3.5',
  ],
  // Tabler: bike
  bicycle_pump: [
    'M2 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
    'M16 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0',
    'M12 19v-4l-3 -3l5 -4l2 3h3',
    'M13.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
  ],
  // Tabler: device-projector
  projector: [
    'M8 9a5 5 0 1 0 10 0a5 5 0 0 0 -10 0',
    'M9 6h-4a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2 -2v-8a2 2 0 0 0 -2 -2h-2',
    'M6 15h1',
    'M7 18l-1 2',
    'M18 18l1 2',
  ],
  // Tabler: device-speaker
  bluetooth_speaker: [
    'M5 5a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2l0 -14',
    'M9 14a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    'M12 7l0 .01',
  ],
  // Tabler: wind
  air_purifier: [
    'M5 8h8.5a2.5 2.5 0 1 0 -2.34 -3.24',
    'M3 12h15.5a2.5 2.5 0 1 1 -2.34 3.24',
    'M4 16h5.5a2.5 2.5 0 1 1 -2.34 3.24',
  ],
  // Tabler: temperature-plus
  electric_heater: [
    'M8 13.5a4 4 0 1 0 4 0v-8.5a2 2 0 0 0 -4 0v8.5',
    'M8 9l4 0',
    'M16 9l6 0',
    'M19 6l0 6',
  ],
  // Tabler: dice-5
  board_game: [
    'M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14',
    'M8 8.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0',
    'M15 8.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0',
    'M15 15.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0',
    'M8 15.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0',
    'M11.5 12a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0',
  ],
  // Tabler: baby-carriage
  baby_stroller: [
    'M6 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M16 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
    'M2 5h2.5l1.632 4.897a6 6 0 0 0 5.693 4.103h2.675a5.5 5.5 0 0 0 0 -11h-.5v6',
    'M6 9h14',
    'M9 17l1 -3',
    'M16 14l1 3',
  ],
  // Tabler: lawn-mower
  lawn_mower: [
    'M6 11h5.38a1 1 0 0 1 .9 .55l.72 1.45h5a1 1 0 0 1 1 1v2',
    'M3 4h1.13a1 1 0 0 1 1 .86l1.59 11.14',
    'M17 18h-8',
    'M9 18a2 2 0 1 1 -4 0a2 2 0 0 1 4 0',
    'M21 18a2 2 0 1 1 -4 0a2 2 0 0 1 4 0',
  ],
  // Tabler: scissors
  hedge_trimmer: [
    'M3 7a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    'M3 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0',
    'M8.6 8.6l10.4 10.4',
    'M8.6 15.4l10.4 -10.4',
  ],
  // Tabler: tent
  camping_tent: [
    'M11 14l4 6h6l-9 -16l-9 16h6l4 -6',
  ],
  // Tabler: luggage
  suitcase: [
    'M6 8a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2l0 -10',
    'M9 6v-1a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v1',
    'M6 10h12',
    'M6 16h12',
    'M9 20v1',
    'M15 20v1',
  ],
};

// Tabler has nothing like it, and an icon of something else would only confuse.
const ITEM_EMOJIS: Record<string, string> = { takoyaki_maker: '🐙' };

function Svg({ paths, className }: { paths: string[]; className: string }) {
  return (
    <svg
      className={`item-svg ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export function CategoryIcon({ iconKey, className = '' }: { iconKey: string; className?: string }) {
  return <Svg paths={CATEGORY_ICONS[iconKey] ?? CATEGORY_ICONS.default} className={className} />;
}

// An item without its own icon (a new or custom one) shows the one of its category.
export function ItemIcon({ itemKey, categoryIcon }: { itemKey: string; categoryIcon: string }) {
  const emoji = ITEM_EMOJIS[itemKey];
  if (emoji) {
    return (
      <span className="item-emoji-icon" aria-hidden="true">
        {emoji}
      </span>
    );
  }
  const paths = ITEM_ICONS[itemKey];
  return paths ? <Svg paths={paths} className="" /> : <CategoryIcon iconKey={categoryIcon} />;
}
