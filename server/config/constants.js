// Domain allowlists accepted by the server (kept in sync with client/src/data/catalog.js).

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

export const SPOT_KEYS = ['entrance', 'mailbox', 'bike_parking', 'notice_board', 'konbini'];

export const QUICK_REPLY_KEYS = ['qr.onMyWay', 'qr.atSpot', 'qr.late', 'qr.noProblem', 'qr.thanks'];

export const ISSUE_KEYS = ['issue.missingOrBroken', 'issue.damaged'];

export const STAMP_KEYS = ['stamp.bigThanks', 'stamp.clean', 'stamp.snack', 'stamp.anytime'];

export const LANGUAGES = ['en', 'ja', 'ja-easy', 'bn'];

export const GROUP_TYPES = ['building', 'block'];

export const DURATIONS = [1, 2, 3, 7];
