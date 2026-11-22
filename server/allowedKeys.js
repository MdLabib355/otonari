// Keys and values the server accepts from the client, copied from client/src/data/catalog.js.
// Everything that comes in (item, spot, quick reply, language, loan length) is checked against
// these lists. If you add something to catalog.js, add it here too.

export const ITEM_KEYS = [
  // kitchen
  'takoyaki_maker',
  'hot_plate',
  'rice_cooker_large',
  'donabe',
  'blender',
  'cassette_stove',
  'bread_maker',
  // cleaning & laundry
  'futon_dryer',
  'vacuum_cleaner',
  'steam_iron',
  'carpet_cleaner',
  'dehumidifier',
  'high_pressure_washer',
  // tools
  'ladder',
  'power_drill',
  'tool_set',
  'extension_cord',
  'bicycle_pump',
  // living
  'projector',
  'bluetooth_speaker',
  'air_purifier',
  'electric_heater',
  'board_game',
  'baby_stroller',
  // outdoor & travel
  'lawn_mower',
  'hedge_trimmer',
  'camping_tent',
  'suitcase',
];

// Handover spots: shared places only, never a home address or room number.
export const SPOT_KEYS = ['entrance', 'mailbox', 'bike_parking', 'notice_board', 'konbini'];

// The only phrases a user can pick freely (everything else is chosen by the server).
export const QUICK_REPLY_KEYS = ['qr.onMyWay', 'qr.atSpot', 'qr.late', 'qr.noProblem', 'qr.thanks'];

export const LANGUAGES = ['en', 'ja', 'ja-easy', 'bn'];

// Loan lengths in days (an item's max_days must be one of these).
export const DURATIONS = [1, 2, 3, 7];
