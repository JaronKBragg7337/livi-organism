export type StoreCategory = "feeder" | "toy" | "room" | "decor" | "medicine";

export type StoreItem = {
  id: string;
  name: string;
  category: StoreCategory;
  price: number;
  description: string;
  effect: string;
  glyph: string;
  consumable?: boolean;
  maxUsesPerLife?: number;
  rarity?: "common" | "rare" | "emergency";
};

export type SyncStatus =
  | "local"
  | "syncing"
  | "synced"
  | "offline"
  | "conflict"
  | "error";

export type SyncConflictSnapshot = {
  id: string;
  source: "local" | "cloud";
  savedAt: number;
  deviceName: string;
  generation: number;
  livingCells: number;
  bond: number;
  note: string;
};

export type SaveHistoryEntry = {
  id: string;
  savedAt: number;
  reason: string;
  generation: number;
  livingCells: number;
  bond: number;
  lifePhase: string;
  deviceName?: string;
};

export type MemoryEpisode = {
  id: string;
  occurredAt: number;
  kind:
    | "birth"
    | "bond"
    | "absence"
    | "near-death"
    | "revival"
    | "bloom"
    | "collapse"
    | "mutation"
    | "friend"
    | "legacy";
  title: string;
  detail: string;
  generation: number;
  valence: "warm" | "quiet" | "difficult" | "transformative";
};

export type RoutineSummary = {
  date: string;
  meals: number;
  pets: number;
  plays: number;
  minutesTogether: number;
  longestAbsenceMinutes: number;
  careStyle: "calm" | "steady" | "playful" | "chaotic" | "distant";
  favoriteToy?: string;
  favoriteRoom?: string;
  favoriteFriend?: string;
};

export type GerminationState = {
  livingCells: number;
  status: "stable" | "dire" | "germinating" | "reviving";
  progress: number;
  mealsGiven: number;
  mealsNeeded: number;
  message: string;
  scaffoldCells?: number;
  scaffoldNutrition?: number;
  scaffoldProtectionMinutes?: number;
};

export type VitalInventory = {
  pulseCapsules: number;
  freePulseAvailable: boolean;
  monthlightSerums: number;
  monthlightUses: number;
  monthlightUseCap: number;
  canUseMonthlight: boolean;
  canAcquireMonthlight: boolean;
  monthlightReason: string;
};

export type LegacyGeneration = {
  generation: number;
  name: string;
  bornAt: number;
  endedAt?: number;
  endCause?: string;
  phenotype: string;
  highestBond: number;
  achievementCount: number;
  rememberedEpisodes: number;
  inheritedTraits: string[];
};

export type LegacyTransition = {
  available: boolean;
  seedReady: boolean;
  inheritedBond: number;
  inheritedAchievements: number;
  inheritedMemories: number;
  inheritedTraits: string[];
  message: string;
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

export type HubTab =
  | "commons"
  | "memory"
  | "lineage"
  | "friends"
  | "achievements"
  | "store"
  | "lab"
  | "updates";

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
    id: "pulse-capsule",
    name: "Pulse Capsule",
    category: "medicine",
    price: 45,
    description:
      "Coaxes a critically small body into a protected stem-cell scaffold.",
    effect: "Emergency bridge back to real cellular growth · first dose free",
    glyph: "ϟ",
    consumable: true,
    rarity: "emergency",
  },
  {
    id: "monthlight-serum",
    name: "Monthlight Serum",
    category: "medicine",
    price: 180,
    description:
      "A rare metabolic treatment that grants about 30 additional living days.",
    effect: "Adds 30 days · limited to two doses in a lifetime",
    glyph: "☾",
    consumable: true,
    maxUsesPerLife: 2,
    rarity: "rare",
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
    version: "0.5.1",
    date: "July 29, 2026",
    title: "A memory that lasts a lifetime",
    changes: [
      "Long-lived organisms no longer accumulate care detail forever. Every day you have shared is still remembered, and a three-year life now stays far inside mobile storage limits.",
      "Distant days keep the habits that shape behavior—favorite toys, rooms, friends, care hours, and calm or chaotic rhythms—and drop only their individual timestamps.",
      "Care counts can no longer be double counted when a folded history meets an older copy of the same day from another device.",
    ],
  },
  {
    version: "0.5.0",
    date: "July 29, 2026",
    title: "What a life carries",
    changes: [
      "A healthy lone seed can now germinate through careful feeding, ending the one-cell deadlock without erasing the danger.",
      "Added the Pulse Capsule emergency scaffold, with one free lifeline and later doses earned only with Motes.",
      "Added optional accounts, automatic cloud history, explicit conflict choices, and device-safe recovery while preserving instant local play.",
      "Added permanent episodic memories, daily care-routine summaries, and privacy boundaries that keep camera frames and location on-device.",
      "Added legacy generations that inherit bond, personality, achievements, and formative memories.",
      "Added the rare Monthlight Serum for a capped 30-day lifespan extension with no real-money purchases.",
    ],
  },
  {
    version: "0.4.0",
    date: "July 29, 2026",
    title: "The Commons opens",
    changes: [
      "Added optional cloud recovery without placing login in front of local play.",
      "Added public, privacy-filtered blob profiles, visits, daily gifts, and friendship requests.",
      "Added downloadable organism files and local restore imports.",
      "Added a simulation laboratory for accelerated aging, starvation, blooming, dormancy, and checkpoints.",
    ],
  },
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
