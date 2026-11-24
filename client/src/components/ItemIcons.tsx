// The drawings of household items and their categories, in the stroke style of Icons.tsx.

import type { ReactNode } from 'react';

// Each drawing is one or more paths on a 24 x 24 grid.
type Drawing = string[];

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

const CATEGORY_DRAWINGS: Record<string, Drawing> = {
  // pot with a lid
  kitchen: ['M4 10h16v6.5a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.500Z', 'M5 10a7 4 0 0 1 14 0M12 6V4M4 13H2.500M21.5 13H20'],
  // bucket
  cleaning: ['M5 10h14l-1.3 9.200a2 2 0 0 1-2 1.800H8.300a2 2 0 0 1-2-1.800Z', 'M5 10a7 7 0 0 1 14 0M6 14h12'],
  // wrench
  tools: ['M20.5 7.200a5 5 0 0 1-6.7 5.500L7.5 19a2.1 2.1 0 0 1-3-3l6.3-6.300a5 5 0 0 1 5.5-6.700L13.5 6l1 3.5 3.5 1Z'],
  // sofa
  living: ['M6 11V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3', 'M6 14v-1.500a2 2 0 1 0-4 0V18h20v-5.500a2 2 0 1 0-4 0V14ZM5 18v2M19 18v2'],
  // sun over a mountain
  outdoor: ['M2 20 9 8l4.5 7.500L16 12l6 8Z', 'M18.5 8.500a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  // plug
  electronics: ['M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0ZM12 17v4'],
  // ball
  sports: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M5.6 5.600a9 9 0 0 1 0 12.800M18.4 5.600a9 9 0 0 0 0 12.800M12 3v18M3 12h18'],
  // bottle
  baby: ['M8 10h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2ZM7 7h10v3H7ZM10 7V5.500a2 2 0 0 1 4 0V7M8 14h3M8 17h3'],
  // open book
  books: ['M12 6.500C10 5 7 4.5 3 5v13.500c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.500V5c-4-.5-7 0-9 1.500ZM12 6.500V20'],
  // sprout
  garden: ['M12 21v-9M12 12c0-4-3-6-8-6 0 4 3 6 8 6ZM12 15c0-4 3-6 8-6 0 4-3 6-8 6ZM8 21h8'],
  // box
  default: ['M12 3 20 7.500v9L12 21l-8-4.500v-9ZM4 7.500l8 4.5 8-4.500M12 12v9M8 5.250l8 4.5'],
};

function Svg({ drawing, className }: { drawing: Drawing; className: string }): ReactNode {
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
      {/* A light tint inside the shapes, then the lines */}
      <path d={drawing[0]} fill="currentColor" fillOpacity={0.1} stroke="none" />
      {drawing.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export function CategoryIcon({ iconKey, className = '' }: { iconKey: string; className?: string }) {
  return <Svg drawing={CATEGORY_DRAWINGS[iconKey] ?? CATEGORY_DRAWINGS.default} className={className} />;
}
