export type StoreCategory = "feeder" | "toy" | "room" | "decor";

export type StoreItem = {
  id: string;
  name: string;
  category: StoreCategory;
  price: number;
  description: string;
  effect: string;
  glyph: string;
};

export type AchievementDefinition = {
  id: string;
  name: string;
  description: string;
  reward: number;
  glyph: string;
};

export type FriendDefinition = {
  id: string;
  name: string;
  temperament: string;
  description: string;
  unlockHint: string;
  hue: string;
};

export type BlobFriendState = {
  id: string;
  bond: number;
  visits: number;
  lastVisit: number;
};

export type UpdateEntry = {
  version: string;
  date: string;
  title: string;
  changes: string[];
};

export type HubTab = "friends" | "achievements" | "store" | "updates";

export const FEEDER_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const STORE_ITEMS: StoreItem[] = [
  {
    id: "auto-feeder",
    name: "Nutrient Feeder",
    category: "feeder",
    price: 75,
    description: "Places one balanced nutrient mote every six hours.",
    effect: "Reliable care while you are away",
    glyph: "◉",
  },
  {
    id: "prism-ball",
    name: "Prism Ball",
    category: "toy",
    price: 45,
    description: "Bends room light into a moving color field.",
    effect: "Stronger play and curiosity response",
    glyph: "◌",
  },
  {
    id: "echo-chime",
    name: "Echo Chime",
    category: "toy",
    price: 65,
    description: "A soft resonant toy for patient, social blobs.",
    effect: "Stronger calm and bonding response",
    glyph: "⌁",
  },
  {
    id: "soft-nest",
    name: "Soft Nest",
    category: "decor",
    price: 35,
    description: "A warm resting place that helps weak cells recover.",
    effect: "Small recovery bonus while resting",
    glyph: "⌒",
  },
  {
    id: "moss-room",
    name: "Moss Room",
    category: "room",
    price: 120,
    description: "A shaded green habitat with slow, quiet light.",
    effect: "Calmer movement and longer rests",
    glyph: "❋",
  },
  {
    id: "moon-room",
    name: "Moon Room",
    category: "room",
    price: 180,
    description: "A nocturnal habitat filled with cool orbital light.",
    effect: "More exploration and luminous skin",
    glyph: "◐",
  },
];

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "first-meal",
    name: "First Light",
    description: "Digest the first nutrient mote.",
    reward: 10,
    glyph: "✦",
  },
  {
    id: "new-growth",
    name: "New Growth",
    description: "Reach 60 living cells.",
    reward: 15,
    glyph: "⬡",
  },
  {
    id: "full-bloom",
    name: "Full Bloom",
    description: "Reach 150 living cells.",
    reward: 25,
    glyph: "✺",
  },
  {
    id: "trusted-touch",
    name: "Trusted Touch",
    description: "Build the bond to 50%.",
    reward: 30,
    glyph: "♡",
  },
  {
    id: "play-routine",
    name: "Play Routine",
    description: "Play together five times.",
    reward: 15,
    glyph: "◌",
  },
  {
    id: "small-circle",
    name: "Small Circle",
    description: "Discover two blob friends.",
    reward: 25,
    glyph: "◍",
  },
  {
    id: "room-maker",
    name: "Room Maker",
    description: "Own a second habitat room.",
    reward: 20,
    glyph: "⌂",
  },
  {
    id: "thirty-days",
    name: "Thirty Sunrises",
    description: "Care for one life for 30 days.",
    reward: 50,
    glyph: "☼",
  },
];

export const FRIENDS: FriendDefinition[] = [
  {
    id: "pip",
    name: "Pip",
    temperament: "Bold grazer",
    description: "Follows nutrient trails and brings tiny gifts.",
    unlockHint: "Share three meals with LIVI.",
    hue: "#68e7e5",
  },
  {
    id: "oona",
    name: "Oona",
    temperament: "Curious scout",
    description: "Loves large, growing bodies and unfamiliar rooms.",
    unlockHint: "Grow to 100 living cells.",
    hue: "#a78bf4",
  },
  {
    id: "moss",
    name: "Moss",
    temperament: "Gentle sleeper",
    description: "Visits blobs who have learned to trust touch.",
    unlockHint: "Reach a 50% bond.",
    hue: "#87c9a5",
  },
];

export const UPDATE_HISTORY: UpdateEntry[] = [
  {
    version: "0.3.0",
    date: "July 29, 2026",
    title: "A wider life",
    changes: [
      "Added lifespan and visible life stages.",
      "Added discoverable blob friends and visits.",
      "Added Motes, achievements, the store, rooms, toys, décor, and an automatic feeder.",
      "Added in-app update history and the CC0 1.0 public-domain dedication.",
    ],
  },
  {
    version: "0.2.0",
    date: "July 29, 2026",
    title: "Growth without the queue",
    changes: [
      "Expanded the body field from 23×23 to 35×35.",
      "Raised practical growth from 250 to roughly 880 cells.",
      "Changed food seeking from placement order to nearest-food selection.",
      "Added automatic migration for older saved organisms.",
    ],
  },
  {
    version: "0.1.0",
    date: "July 28, 2026",
    title: "First awakening",
    changes: [
      "Introduced cellular metabolism, growth, starvation, decay, and dormancy.",
      "Added adaptive traits, mutation, feed, pet, play, bonding, offline life, and camera AR mode.",
      "Published the first public browser experience.",
    ],
  },
];
