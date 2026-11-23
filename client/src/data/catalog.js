// Fixed item catalog. Users pick from this list instead of typing item names,
// so every item has a stable key that translates perfectly into every language.
// Names live in the i18n files under "items.<key>".

export const CATEGORIES = ['kitchen', 'cleaning', 'tools', 'living', 'outdoor'];

export const ITEMS = [
  // kitchen
  { key: 'takoyaki_maker', emoji: '🐙', category: 'kitchen' },
  { key: 'hot_plate', emoji: '🍳', category: 'kitchen' },
  { key: 'rice_cooker_large', emoji: '🍚', category: 'kitchen' },
  { key: 'donabe', emoji: '🍲', category: 'kitchen' },
  { key: 'blender', emoji: '🥤', category: 'kitchen' },
  { key: 'cassette_stove', emoji: '🔥', category: 'kitchen' },
  { key: 'bread_maker', emoji: '🍞', category: 'kitchen' },

  // cleaning & laundry
  { key: 'futon_dryer', emoji: '🛏️', category: 'cleaning' },
  { key: 'vacuum_cleaner', emoji: '🧹', category: 'cleaning' },
  { key: 'steam_iron', emoji: '👔', category: 'cleaning' },
  { key: 'carpet_cleaner', emoji: '🧽', category: 'cleaning' },
  { key: 'dehumidifier', emoji: '💧', category: 'cleaning' },
  { key: 'high_pressure_washer', emoji: '🚿', category: 'cleaning' },

  // tools
  { key: 'ladder', emoji: '🪜', category: 'tools' },
  { key: 'power_drill', emoji: '🔩', category: 'tools' },
  { key: 'tool_set', emoji: '🧰', category: 'tools' },
  { key: 'extension_cord', emoji: '🔌', category: 'tools' },
  { key: 'bicycle_pump', emoji: '🚲', category: 'tools' },

  // living
  { key: 'projector', emoji: '📽️', category: 'living' },
  { key: 'bluetooth_speaker', emoji: '🔊', category: 'living' },
  { key: 'air_purifier', emoji: '🌬️', category: 'living' },
  { key: 'electric_heater', emoji: '♨️', category: 'living' },
  { key: 'board_game', emoji: '🎲', category: 'living' },
  { key: 'baby_stroller', emoji: '👶', category: 'living' },

  // outdoor & travel
  { key: 'lawn_mower', emoji: '🌱', category: 'outdoor' },
  { key: 'hedge_trimmer', emoji: '✂️', category: 'outdoor' },
  { key: 'camping_tent', emoji: '⛺', category: 'outdoor' },
  { key: 'suitcase', emoji: '🧳', category: 'outdoor' },
];

// Handover spots: shared places only — never a home address or room number.
export const SPOTS = ['entrance', 'mailbox', 'bike_parking', 'notice_board', 'konbini'];

// Fixed quick replies either side can send during a loan.
export const QUICK_REPLIES = ['qr.onMyWay', 'qr.atSpot', 'qr.late', 'qr.noProblem', 'qr.thanks'];

// Structured non-confrontational issue phrases (active or returned loans).
export const ISSUE_KEYS = ['issue.missingOrBroken', 'issue.damaged'];

// Warm Japanese neighborly thank-you stamps on completed (returned) loans.
export const STAMPS = [
  { key: 'stamp.bigThanks', emoji: '🙇' },
  { key: 'stamp.clean', emoji: '✨' },
  { key: 'stamp.snack', emoji: '🍪' },
  { key: 'stamp.anytime', emoji: '🤝' },
];
export const STAMP_KEYS = STAMPS.map((s) => s.key);

// Loan length choices (days). Chips above the item's max_days are hidden.
export const DURATIONS = [1, 2, 3, 7];

// Start choices for the tap-only time picker.
export const START_DAYS = [0, 1, 2]; // today, tomorrow, day after
export const TIME_SLOTS = { morning: 9, afternoon: 13, evening: 18 }; // hour, Japan time

export const LANGUAGES = ['en', 'ja', 'ja-easy', 'bn'];

export function findItem(key) {
  return ITEMS.find((item) => item.key === key);
}
