// The times that can be picked for borrowing, always in Japan time.

import { TIME_SLOTS, type TimeSlot } from '../../data/catalog.ts';

// ISO time for "N days from today at hh:00 in Japan". Japan is always UTC+9 (no summer time),
// so this gives the same answer on a laptop in Bangladesh.
export function japanTime(daysFromToday: number, hour: number): string {
  const japanNow = new Date(Date.now() + 9 * 60 * 60 * 1000); // its UTC fields show the date in Japan
  const utc = Date.UTC(
    japanNow.getUTCFullYear(),
    japanNow.getUTCMonth(),
    japanNow.getUTCDate() + daysFromToday,
    hour - 9 // hh:00 in Japan is (hh - 9):00 in UTC
  );
  return new Date(utc).toISOString();
}

// The time slots that can still be picked on that day (today's earlier slots are already over).
export function openSlots(dayOffset: number): TimeSlot[] {
  const slots = Object.keys(TIME_SLOTS) as TimeSlot[];
  return slots.filter((slot) => Date.parse(japanTime(dayOffset, TIME_SLOTS[slot])) > Date.now());
}
