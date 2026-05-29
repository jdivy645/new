// The 4 visualizations — ids match the gesture app's tab ids (?tab=<id>).
export interface Experience {
  id: 'forest' | 'ocean' | 'earth' | 'energy';
  icon: string;
  name: string;
  blurb: string;
}

export const EXPERIENCES: Experience[] = [
  {
    id: 'forest',
    icon: '🌳',
    name: 'Grow a Forest',
    blurb: 'Open your hand over barren land and watch trees, flowers, and butterflies bloom to life.',
  },
  {
    id: 'ocean',
    icon: '🌊',
    name: 'Clean the Ocean',
    blurb: 'Sweep away plastic and oil with a wave of your hand and bring the fish back to clear water.',
  },
  {
    id: 'earth',
    icon: '🌍',
    name: 'Earth in Your Hands',
    blurb: 'Spin a living planet, then pinch to heal scarred land back to green. The world in your palm.',
  },
  {
    id: 'energy',
    icon: '⚡',
    name: 'Power the Future',
    blurb: 'Wave for wind, hold a palm to the sun, and light up a dark city with clean energy.',
  },
];
