"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CloudCommons from "./CloudCommons";
import LifeHub from "./LifeHub";
import SimulationLab from "./SimulationLab";
import {
  appendCloudMemoryEpisode,
  appendCloudRoutineSummary,
  checksumJson,
  cloudConfigured,
  decryptCloudPayload,
  enrollCloudDevice,
  forgetCachedCloudKey,
  getCachedCloudKey,
  getCloudAccountMetadata,
  getCloudClient,
  getCloudHead,
  getCloudRevision,
  getCloudServerTime,
  listCloudConflicts,
  listCloudHistory,
  listCloudMemoryEpisodes,
  listCloudRoutineSummaries,
  provisionCloudEncryption,
  pushCloudRevision,
  rewrapCloudKeyPassword,
  unlockAndCacheCloudKey,
  type CloudAccountMetadata,
  type CloudRevision,
  type CommonsFriendship,
  type CommonsProfile,
} from "./cloud";
import {
  ACHIEVEMENTS,
  FEEDER_INTERVAL_MS,
  FRIENDS,
  STORE_ITEMS,
  type BlobFriendState,
  type GerminationState as HubGerminationState,
  type HubTab,
  type LegacyGeneration,
  type LegacyTransition,
  type MemoryEpisode,
  type RoutineSummary,
  type SaveHistoryEntry,
  type SyncConflictSnapshot,
  type SyncStatus,
  type VitalInventory,
} from "./lifeData";

const GRID = 35;
const CENTER = Math.floor(GRID / 2);
const MAX_LIVING = Math.floor(GRID * GRID * 0.72);
const STORAGE_KEY = "livi-organism-v1";
const WELCOME_KEY = "livi-welcomed-v1";
const CLOUD_SYNC_META_KEY = "livi-cloud-sync-v1";
const LOCAL_RESTORE_HISTORY_KEY = "livi-local-restore-history-v1";
const LOCAL_ACTIVE_OWNER_KEY = "livi-local-active-owner-v1";
const RECOVERY_CODE_SESSION_KEY = "livi-pending-recovery-code-v1";
const LIFE_SCHEMA_VERSION = 6;
const PULSE_CAPSULE_PRICE = 45;
const MAX_PULSE_CAPSULES_HELD = 2;
const LIFESPAN_SERUM_PRICE = 180;
const LIFESPAN_SERUM_DAYS = 30;
const MAX_LIFESPAN_SERUM_USES = 2;
const ELDER_THRESHOLD = 0.65;
const SEED_MEALS_REQUIRED = 3;
const SEED_ASSIMILATION_MS = 15_000;
const SEED_PRIMING_DECAY_MS = 120_000;
// Per-event care detail is only ever read for the recent window (see
// rememberedBehavior). Older days keep every aggregate that drives behavior and
// drop only their individual timestamps, so a multi-year save stops growing
// without bound without losing a single remembered habit.
const ROUTINE_DETAIL_RETENTION_DAYS = 45;

type MemoryKind =
  | "long-absence"
  | "near-death"
  | "collapse"
  | "natural-recovery"
  | "pulse-revival"
  | "major-bloom"
  | "mutation"
  | "legacy"
  | "lifespan-extension";

type EpisodicMemory = {
  id: string;
  kind: MemoryKind;
  at: number;
  generation: number;
  summary: string;
  significance: "important" | "legacy";
  details: Record<string, string | number | boolean>;
};

type RoutineMemory = {
  day: string;
  generation: number;
  feeds: number;
  pets: number;
  plays: number;
  careMoments: number;
  calmMoments: number;
  chaoticMoments: number;
  lastCareAt: number;
  averageCareGapMinutes: number;
  longestCareGapMinutes: number;
  firstCareAt: number;
  careHourHistogram: Record<string, number>;
  actionLog: {
    id: string;
    at: number;
    kind: RoutineAction["kind"];
    refId?: string;
  }[];
  legacyBaseline: {
    feeds: number;
    pets: number;
    plays: number;
    careMoments: number;
    calmMoments: number;
    chaoticMoments: number;
    roomVisits: Record<string, number>;
    toyUses: Record<string, number>;
    friendVisits: Record<string, number>;
  };
  roomVisits: Record<string, number>;
  toyUses: Record<string, number>;
  friendVisits: Record<string, number>;
};

type GerminationState = {
  state: "stable" | "dire" | "priming" | "budding" | "legacy";
  nourishingMeals: number;
  progress: number;
  enteredAt: number;
  lastNourishedAt: number;
  naturalRecoveries: number;
  dormancyDepth: number;
};

type RevivalScar = {
  id: string;
  at: number;
  generation: number;
  severity: number;
  hueShift: number;
};

type SerumDoseRecord = {
  id: string;
  generation: number;
  generationId: string;
  purchasedAt: number;
  usedAt: number | null;
  voidedAt?: number | null;
  moteCost: number;
  acquisition: "purchased" | "inherited" | "legacy-migration";
  parentDoseId?: string;
};

type MoteTransaction = {
  id: string;
  at: number;
  generationId: string;
  amount: number;
  kind:
    | "founding"
    | "legacy-balance"
    | "achievement"
    | "care"
    | "friend-gift"
    | "store-purchase"
    | "pulse-purchase"
    | "serum-purchase"
    | "serum-refund";
  referenceId?: string;
};

type LegacyRecord = {
  generationId: string;
  parentGenerationId: string | null;
  successorGenerationId: string;
  generation: number;
  seed: number;
  phenotype: string;
  endedAt: number;
  livedDays: number;
  bond: number;
  trust: number;
  peakBond: number;
  peakTrust: number;
  achievements: string[];
  memoryIds: string[];
  bornAt: number;
  traits: Traits;
  traitsAtBirth: Traits;
  traitsAtDeath: Traits;
  terminalCause: "natural-senescence";
  serumUses: number;
};

type Cell = {
  alive: boolean;
  energy: number;
  health: number;
  age: number;
  phase: number;
  hue: number;
  origin?: "natural" | "pulse-scaffold";
  scaffoldUntilAgeMinutes?: number;
  scaffoldNutrients?: number;
  scaffoldScarId?: string;
};

type Traits = {
  curiosity: number;
  sociability: number;
  appetite: number;
  resilience: number;
  playfulness: number;
  growthBias: number;
  locomotion: number;
};

type Organism = {
  version: 1;
  lifeSchemaVersion: number;
  seed: number;
  cells: Cell[];
  traits: Traits;
  bond: number;
  trust: number;
  peakBond: number;
  peakTrust: number;
  joy: number;
  ageMinutes: number;
  meals: number;
  touches: number;
  births: number;
  lineage: number;
  generationId: string;
  parentGenerationId: string | null;
  naturalLifespanDays: number;
  generationBirthTraits: Traits;
  lastSeen: number;
  lastCare: number;
  currency: number;
  moteTransactions: MoteTransaction[];
  ownedItems: string[];
  equippedRoom: string;
  equippedToy: string | null;
  achievements: string[];
  friends: BlobFriendState[];
  activeFriendId: string | null;
  lastFeederAt: number;
  playCount: number;
  lastPlayRewardAt: number;
  lastMealRewardAt: number;
  episodicMemories: EpisodicMemory[];
  routineMemories: RoutineMemory[];
  memorySequence: number;
  germination: GerminationState;
  pulseCapsules: number;
  pulseCapsulesUsed: number;
  revivalScars: RevivalScar[];
  revivalProtectionUntilAgeMinutes: number;
  lifespanExtensionDays: number;
  lifespanSerums: number;
  lifespanSerumsUsed: number;
  serumDoseRecords: SerumDoseRecord[];
  terminalSenescenceStarted: boolean;
  legacyRecords: LegacyRecord[];
  generationStartedAt: number;
  lastObservedLiving: number;
  rememberedMilestones: string[];
};

type FoodDrop = {
  id: number;
  x: number;
  y: number;
  nutrition: number;
  phase: number;
};

type Snapshot = {
  living: number;
  energy: number;
  health: number;
  bond: number;
  stage: string;
  behavior: string;
  phenotype: string;
  age: string;
  births: number;
  meals: number;
  lineage: number;
  traits: Traits;
  currency: number;
  ownedItems: string[];
  equippedRoom: string;
  equippedToy: string | null;
  achievements: string[];
  friends: BlobFriendState[];
  activeFriendId: string | null;
  lifePhase: string;
  lifespanDays: number;
  lifeRemaining: string;
  lifeProgress: number;
  feederStatus: string;
  germinationState: GerminationState["state"];
  germinationMeals: number;
  germinationMealsRequired: number;
  germinationProgress: number;
  germinationDormancy: number;
  pulseScaffoldCells: number;
  pulseScaffoldNutrition: number;
  pulseScaffoldProtectionMinutes: number;
  pulseCapsules: number;
  pulseCapsulesUsed: number;
  revivalScars: number;
  lifespanExtensionDays: number;
  lifespanSerums: number;
  lifespanSerumsUsed: number;
  lifespanSerumUsesRemaining: number;
  canUsePulseCapsule: boolean;
  canUseLifespanSerum: boolean;
  legacyReady: boolean;
  generation: number;
  generationId: string;
  generationStartedAt: number;
  legacyRecords: LegacyRecord[];
  episodicMemories: EpisodicMemory[];
  routineMemories: RoutineMemory[];
  careStyle: "Calm" | "Steady" | "Chaotic";
};

type Heart = {
  id: number;
  x: number;
  y: number;
  born: number;
};

type CloudUserState = {
  id: string;
  email: string | null;
};

type LocalCloudMeta = {
  ownerId: string;
  headRevisionId: string | null;
  lastSyncedChecksum: string | null;
  lastSyncedAt: number | null;
  syncedMemoryIds: string[];
  routineFingerprints: Record<string, string>;
  routineSummaryIds: Record<string, string>;
  pendingRevision?: {
    revisionId: string;
    clientRevisionId: string;
    parentRevisionId: string | null;
    checksum: string;
    revisionKind:
      | "periodic"
      | "milestone"
      | "manual"
      | "merge"
      | "restore"
      | "legacy"
      | "migration";
    mergeParentRevisionId: string | null;
    restoredFromRevisionId: string | null;
    deviceTimestamp: string;
  };
};

type CloudConflictState = {
  localRevision: CloudRevision;
  cloudRevision: CloudRevision;
  localOrganism: Organism;
  cloudOrganism: Organism;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createOrganism(seed = Math.floor(Math.random() * 2_000_000_000)): Organism {
  const random = mulberry32(seed);
  const cells: Cell[] = [];

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const distance = Math.hypot(x - CENTER, (y - CENTER) * 1.04);
      const boundaryNoise = (random() - 0.5) * 0.65;
      const alive = distance < 3.45 + boundaryNoise;
      cells.push({
        alive,
        energy: alive ? 0.72 + random() * 0.16 : 0,
        health: alive ? 0.92 + random() * 0.08 : 0,
        age: alive ? random() * 12 : 0,
        phase: random() * Math.PI * 2,
        hue: (random() - 0.5) * 20,
      });
    }
  }

  const organism: Organism = {
    version: 1,
    lifeSchemaVersion: LIFE_SCHEMA_VERSION,
    seed,
    cells,
    traits: {
      curiosity: 0.3 + random() * 0.58,
      sociability: 0.3 + random() * 0.58,
      appetite: 0.3 + random() * 0.58,
      resilience: 0.3 + random() * 0.58,
      playfulness: 0.3 + random() * 0.58,
      growthBias: 0.3 + random() * 0.58,
      locomotion: 0.3 + random() * 0.58,
    },
    bond: 0.16,
    trust: 0.12,
    peakBond: 0.16,
    peakTrust: 0.12,
    joy: 0.62,
    ageMinutes: 0,
    meals: 0,
    touches: 0,
    births: 0,
    lineage: 1,
    generationId: `gen-1-${seed >>> 0}`,
    parentGenerationId: null,
    naturalLifespanDays: 0,
    generationBirthTraits: {} as Traits,
    lastSeen: Date.now(),
    lastCare: Date.now(),
    currency: 60,
    moteTransactions: [
      {
        id: `founding-${seed >>> 0}`,
        at: Date.now(),
        generationId: `gen-1-${seed >>> 0}`,
        amount: 60,
        kind: "founding",
      },
    ],
    ownedItems: [],
    equippedRoom: "atrium",
    equippedToy: null,
    achievements: [],
    friends: [],
    activeFriendId: null,
    lastFeederAt: Date.now(),
    playCount: 0,
    lastPlayRewardAt: 0,
    lastMealRewardAt: 0,
    episodicMemories: [],
    routineMemories: [],
    memorySequence: 0,
    germination: {
      state: "stable",
      nourishingMeals: 0,
      progress: 0,
      enteredAt: 0,
      lastNourishedAt: 0,
      naturalRecoveries: 0,
      dormancyDepth: 0,
    },
    pulseCapsules: 1,
    pulseCapsulesUsed: 0,
    revivalScars: [],
    revivalProtectionUntilAgeMinutes: 0,
    lifespanExtensionDays: 0,
    lifespanSerums: 0,
    lifespanSerumsUsed: 0,
    serumDoseRecords: [],
    terminalSenescenceStarted: false,
    legacyRecords: [],
    generationStartedAt: Date.now(),
    lastObservedLiving: cells.filter((cell) => cell.alive).length,
    rememberedMilestones: [],
  };
  organism.naturalLifespanDays = Math.round(
    120 + organism.traits.resilience * 180,
  );
  organism.generationBirthTraits = { ...organism.traits };
  return organism;
}

function livingCells(organism: Organism) {
  return organism.cells.reduce((count, cell) => count + Number(cell.alive), 0);
}

function migrateCellField(organism: Organism) {
  if (organism.cells.length === GRID * GRID) return organism;

  const oldGrid = Math.round(Math.sqrt(organism.cells.length));
  if (oldGrid * oldGrid !== organism.cells.length) return createOrganism(organism.seed);

  const random = mulberry32(organism.seed ^ 0x51f15e);
  const migrated = Array.from({ length: GRID * GRID }, () => ({
    alive: false,
    energy: 0,
    health: 0,
    age: 0,
    phase: random() * Math.PI * 2,
    hue: (random() - 0.5) * 20,
  }));
  const sourceStart = Math.max(0, Math.floor((oldGrid - GRID) / 2));
  const destinationStart = Math.max(0, Math.floor((GRID - oldGrid) / 2));
  const copySize = Math.min(oldGrid, GRID);

  for (let y = 0; y < copySize; y += 1) {
    for (let x = 0; x < copySize; x += 1) {
      const sourceIndex = (y + sourceStart) * oldGrid + x + sourceStart;
      const destinationIndex =
        (y + destinationStart) * GRID + x + destinationStart;
      migrated[destinationIndex] = organism.cells[sourceIndex];
    }
  }

  organism.cells = migrated;
  return organism;
}

function averages(organism: Organism) {
  let energy = 0;
  let health = 0;
  let living = 0;

  organism.cells.forEach((cell) => {
    if (!cell.alive) return;
    living += 1;
    energy += cell.energy;
    health += cell.health;
  });

  return {
    living,
    energy: living ? energy / living : 0,
    health: living ? health / living : 0,
  };
}

function phenotypeName(traits: Traits, seed: number) {
  const ranked = Object.entries(traits)
    .filter(([key]) => key !== "growthBias")
    .sort((a, b) => b[1] - a[1]);
  const first: Record<string, string> = {
    curiosity: "Seeking",
    sociability: "Tender",
    appetite: "Blooming",
    resilience: "Steady",
    playfulness: "Dancing",
    locomotion: "Drifting",
  };
  const second: Record<string, string> = {
    curiosity: "Scout",
    sociability: "Kin",
    appetite: "Grazer",
    resilience: "Seed",
    playfulness: "Spark",
    locomotion: "Wisp",
  };
  return `${first[ranked[0][0]]} ${second[ranked[1][0]]} · ${Math.abs(seed)
    .toString(16)
    .slice(-3)
    .toUpperCase()}`;
}

function memoryDay(at: number) {
  return new Date(at).toISOString().slice(0, 10);
}

function recordEpisode(
  organism: Organism,
  kind: MemoryKind,
  summary: string,
  details: EpisodicMemory["details"] = {},
  significance: EpisodicMemory["significance"] = "important",
  at = Date.now(),
) {
  organism.memorySequence += 1;
  const memory: EpisodicMemory = {
    id: crypto.randomUUID(),
    kind,
    at,
    generation: organism.lineage,
    summary,
    significance,
    details,
  };
  organism.episodicMemories.push(memory);
  return memory;
}

type RoutineAction =
  | { kind: "feed" }
  | { kind: "pet" }
  | { kind: "play"; toyId?: string | null }
  | { kind: "room"; roomId: string }
  | { kind: "friend"; friendId: string };

function recordRoutine(
  organism: Organism,
  action: RoutineAction,
  at = Date.now(),
) {
  const day = memoryDay(at);
  let routine = organism.routineMemories.find(
    (entry) => entry.day === day && entry.generation === organism.lineage,
  );
  if (!routine) {
    routine = {
      day,
      generation: organism.lineage,
      feeds: 0,
      pets: 0,
      plays: 0,
      careMoments: 0,
      calmMoments: 0,
      chaoticMoments: 0,
      lastCareAt: 0,
      averageCareGapMinutes: 0,
      longestCareGapMinutes: 0,
      firstCareAt: 0,
      careHourHistogram: {},
      actionLog: [],
      legacyBaseline: {
        feeds: 0,
        pets: 0,
        plays: 0,
        careMoments: 0,
        calmMoments: 0,
        chaoticMoments: 0,
        roomVisits: {},
        toyUses: {},
        friendVisits: {},
      },
      roomVisits: {},
      toyUses: {},
      friendVisits: {},
    };
    organism.routineMemories.push(routine);
  }

  if (action.kind === "feed") routine.feeds += 1;
  if (action.kind === "pet") routine.pets += 1;
  if (action.kind === "play") {
    routine.plays += 1;
    if (action.toyId) {
      routine.toyUses[action.toyId] =
        (routine.toyUses[action.toyId] ?? 0) + 1;
    }
  }
  if (action.kind === "room") {
    routine.roomVisits[action.roomId] =
      (routine.roomVisits[action.roomId] ?? 0) + 1;
  }
  if (action.kind === "friend") {
    routine.friendVisits[action.friendId] =
      (routine.friendVisits[action.friendId] ?? 0) + 1;
  }

  const refId =
    action.kind === "play"
      ? action.toyId ?? undefined
      : action.kind === "room"
        ? action.roomId
        : action.kind === "friend"
          ? action.friendId
          : undefined;
  routine.actionLog.push({
    id: crypto.randomUUID(),
    at,
    kind: action.kind,
    refId,
  });

  if (action.kind === "room" || action.kind === "friend") return;
  const previous = organism.routineMemories
    .filter(
      (entry) =>
        entry.generation === organism.lineage &&
        entry.lastCareAt > 0 &&
        entry.lastCareAt < at,
    )
    .reduce((latest, entry) => Math.max(latest, entry.lastCareAt), 0);
  const gapMinutes = previous > 0 ? Math.max(0, (at - previous) / 60_000) : 0;
  // Petting strokes and feed/play combinations within one visit form a single
  // care session. Their action counts remain exact without misreading affection
  // as a chaotic barrage.
  if (previous > 0 && gapMinutes < 5) return;
  routine.careMoments += 1;
  routine.firstCareAt ||= at;
  const hour = String(new Date(at).getUTCHours()).padStart(2, "0");
  routine.careHourHistogram[hour] =
    (routine.careHourHistogram[hour] ?? 0) + 1;
  if (previous > 0) {
    routine.averageCareGapMinutes +=
      (gapMinutes - routine.averageCareGapMinutes) /
      Math.max(1, routine.careMoments - 1);
    routine.longestCareGapMinutes = Math.max(
      routine.longestCareGapMinutes,
      gapMinutes,
    );
    if (gapMinutes >= 30 && gapMinutes <= 36 * 60) routine.calmMoments += 1;
    if (gapMinutes >= 5 && gapMinutes < 15) routine.chaoticMoments += 1;
  }
  routine.lastCareAt = at;
}

function rememberedCareStyle(organism: Organism): Snapshot["careStyle"] {
  const recent = organism.routineMemories.slice(-14);
  const calm = recent.reduce((sum, day) => sum + day.calmMoments, 0);
  const chaotic = recent.reduce((sum, day) => sum + day.chaoticMoments, 0);
  if (chaotic > calm * 1.35 && chaotic >= 3) return "Chaotic";
  if (calm > chaotic * 1.35 && calm >= 3) return "Calm";
  return "Steady";
}

function rememberedBehavior(organism: Organism) {
  const recent = organism.routineMemories.slice(-14);
  const roomCounts: Record<string, number> = {};
  const toyCounts: Record<string, number> = {};
  const friendCounts: Record<string, number> = {};
  const hourCounts: Record<string, number> = {};
  recent.forEach((routine) => {
    for (const [id, count] of Object.entries(routine.roomVisits)) {
      roomCounts[id] = (roomCounts[id] ?? 0) + count;
    }
    for (const [id, count] of Object.entries(routine.toyUses)) {
      toyCounts[id] = (toyCounts[id] ?? 0) + count;
    }
    for (const [id, count] of Object.entries(routine.friendVisits)) {
      friendCounts[id] = (friendCounts[id] ?? 0) + count;
    }
    for (const [hour, count] of Object.entries(routine.careHourHistogram)) {
      hourCounts[hour] = (hourCounts[hour] ?? 0) + count;
    }
  });
  const currentHour = String(new Date().getUTCHours()).padStart(2, "0");
  return {
    careStyle: rememberedCareStyle(organism),
    favoriteRoom: favoriteKey(roomCounts),
    favoriteToy: favoriteKey(toyCounts),
    favoriteFriend: favoriteKey(friendCounts),
    anticipatingCare: (hourCounts[currentHour] ?? 0) >= 3,
  };
}

function compactRoutineMemories(memories: RoutineMemory[]) {
  const compacted = new Map<string, RoutineMemory>();
  memories.forEach((memory) => {
    if (
      !memory ||
      typeof memory.day !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(memory.day) ||
      Number.isNaN(Date.parse(`${memory.day}T00:00:00Z`)) ||
      new Date(`${memory.day}T00:00:00Z`).toISOString().slice(0, 10) !==
        memory.day
    ) {
      return;
    }
    const generation = Number.isFinite(memory.generation)
      ? Math.max(1, Math.floor(memory.generation))
      : 1;
    const safeCount = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value)
        ? clamp(Math.floor(value), 0, 1_000_000)
        : 0;
    const safeTimestamp = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value)
        ? clamp(value, 0, 8_640_000_000_000_000)
        : 0;
    const safeMinutes = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value)
        ? clamp(value, 0, 10 * 365 * 24 * 60)
        : 0;
    const safeCounterMap = (counts: Record<string, number> | undefined) =>
      Object.fromEntries(
        Object.entries(counts ?? {})
          .filter(
            ([id]) =>
              id.length > 0 &&
              id.length <= 120 &&
              !/camera|image|frame|latitude|longitude|location/i.test(id),
          )
          .map(([id, count]) => [id, safeCount(count)]),
      );
    const key = `${generation}:${memory.day}`;
    const existing = compacted.get(key);
    if (!existing) {
      compacted.set(key, {
        ...memory,
        generation,
        feeds: safeCount(memory.feeds),
        pets: safeCount(memory.pets),
        plays: safeCount(memory.plays),
        careMoments: safeCount(memory.careMoments),
        calmMoments: safeCount(memory.calmMoments),
        chaoticMoments: safeCount(memory.chaoticMoments),
        lastCareAt: safeTimestamp(memory.lastCareAt),
        averageCareGapMinutes: safeMinutes(memory.averageCareGapMinutes),
        longestCareGapMinutes: safeMinutes(memory.longestCareGapMinutes),
        firstCareAt: safeTimestamp(memory.firstCareAt),
        careHourHistogram: safeCounterMap(memory.careHourHistogram),
        actionLog: (memory.actionLog ?? [])
          .filter(
            (event) =>
              event &&
              typeof event.id === "string" &&
              event.id.length <= 200 &&
              !/data:|camera|image|frame|latitude|longitude|location/i.test(
                event.id,
              ) &&
              Number.isFinite(event.at) &&
              ["feed", "pet", "play", "room", "friend"].includes(event.kind),
          )
          .map((event) => ({
            id: event.id.slice(0, 200),
            at: safeTimestamp(event.at),
            kind: event.kind,
            refId:
              typeof event.refId === "string"
                ? event.refId.slice(0, 120)
              : undefined,
          })),
        legacyBaseline: memory.legacyBaseline
          ? {
              feeds: safeCount(memory.legacyBaseline.feeds),
              pets: safeCount(memory.legacyBaseline.pets),
              plays: safeCount(memory.legacyBaseline.plays),
              careMoments: safeCount(memory.legacyBaseline.careMoments),
              calmMoments: safeCount(memory.legacyBaseline.calmMoments),
              chaoticMoments: safeCount(
                memory.legacyBaseline.chaoticMoments,
              ),
              roomVisits: safeCounterMap(
                memory.legacyBaseline.roomVisits,
              ),
              toyUses: safeCounterMap(memory.legacyBaseline.toyUses),
              friendVisits: safeCounterMap(
                memory.legacyBaseline.friendVisits,
              ),
            }
          : (memory.actionLog ?? []).length
            ? {
                feeds: 0,
                pets: 0,
                plays: 0,
                careMoments: 0,
                calmMoments: 0,
                chaoticMoments: 0,
                roomVisits: {},
                toyUses: {},
                friendVisits: {},
              }
            : {
                feeds: safeCount(memory.feeds),
                pets: safeCount(memory.pets),
                plays: safeCount(memory.plays),
                careMoments: safeCount(memory.careMoments),
                calmMoments: safeCount(memory.calmMoments),
                chaoticMoments: safeCount(memory.chaoticMoments),
                roomVisits: safeCounterMap(memory.roomVisits),
                toyUses: safeCounterMap(memory.toyUses),
                friendVisits: safeCounterMap(memory.friendVisits),
              },
        roomVisits: safeCounterMap(memory.roomVisits),
        toyUses: safeCounterMap(memory.toyUses),
        friendVisits: safeCounterMap(memory.friendVisits),
      });
      return;
    }
    existing.averageCareGapMinutes = Math.max(
      existing.averageCareGapMinutes,
      safeMinutes(memory.averageCareGapMinutes),
    );
    existing.feeds = Math.max(existing.feeds, safeCount(memory.feeds));
    existing.pets = Math.max(existing.pets, safeCount(memory.pets));
    existing.plays = Math.max(existing.plays, safeCount(memory.plays));
    existing.careMoments = Math.max(
      existing.careMoments,
      safeCount(memory.careMoments),
    );
    existing.calmMoments = Math.max(
      existing.calmMoments,
      safeCount(memory.calmMoments),
    );
    existing.chaoticMoments = Math.max(
      existing.chaoticMoments,
      safeCount(memory.chaoticMoments),
    );
    const incomingBaseline = memory.legacyBaseline;
    if (incomingBaseline) {
      existing.legacyBaseline.feeds = Math.max(
        existing.legacyBaseline.feeds,
        safeCount(incomingBaseline.feeds),
      );
      existing.legacyBaseline.pets = Math.max(
        existing.legacyBaseline.pets,
        safeCount(incomingBaseline.pets),
      );
      existing.legacyBaseline.plays = Math.max(
        existing.legacyBaseline.plays,
        safeCount(incomingBaseline.plays),
      );
      existing.legacyBaseline.careMoments = Math.max(
        existing.legacyBaseline.careMoments,
        safeCount(incomingBaseline.careMoments),
      );
      existing.legacyBaseline.calmMoments = Math.max(
        existing.legacyBaseline.calmMoments,
        safeCount(incomingBaseline.calmMoments),
      );
      existing.legacyBaseline.chaoticMoments = Math.max(
        existing.legacyBaseline.chaoticMoments,
        safeCount(incomingBaseline.chaoticMoments),
      );
      (
        [
          ["roomVisits", incomingBaseline.roomVisits],
          ["toyUses", incomingBaseline.toyUses],
          ["friendVisits", incomingBaseline.friendVisits],
        ] as const
      ).forEach(([field, counts]) => {
        Object.entries(counts ?? {}).forEach(([id, count]) => {
          existing.legacyBaseline[field][id] = Math.max(
            existing.legacyBaseline[field][id] ?? 0,
            safeCount(count),
          );
        });
      });
    }
    existing.lastCareAt = Math.max(
      existing.lastCareAt,
      safeTimestamp(memory.lastCareAt),
    );
    existing.firstCareAt =
      existing.firstCareAt > 0 && safeTimestamp(memory.firstCareAt) > 0
        ? Math.min(existing.firstCareAt, safeTimestamp(memory.firstCareAt))
        : Math.max(existing.firstCareAt, safeTimestamp(memory.firstCareAt));
    existing.longestCareGapMinutes = Math.max(
      existing.longestCareGapMinutes,
      safeMinutes(memory.longestCareGapMinutes),
    );
    existing.actionLog = [
      ...new Map(
        [
          ...existing.actionLog,
          ...(memory.actionLog ?? []).filter(
            (event) =>
              event &&
              typeof event.id === "string" &&
              Number.isFinite(event.at),
          ),
        ].map((event) => [event.id, event]),
      ).values(),
    ];
    (
      [
        ["roomVisits", memory.roomVisits],
        ["toyUses", memory.toyUses],
        ["friendVisits", memory.friendVisits],
        ["careHourHistogram", memory.careHourHistogram],
      ] as const
    ).forEach(([field, counts]) => {
      Object.entries(counts ?? {}).forEach(([id, count]) => {
        existing[field][id] = Math.max(
          existing[field][id] ?? 0,
          safeCount(count),
        );
      });
    });
  });
  compacted.forEach((routine) => {
    if (!routine.actionLog.length) return;
    routine.feeds = routine.legacyBaseline.feeds;
    routine.pets = routine.legacyBaseline.pets;
    routine.plays = routine.legacyBaseline.plays;
    routine.roomVisits = { ...routine.legacyBaseline.roomVisits };
    routine.toyUses = { ...routine.legacyBaseline.toyUses };
    routine.friendVisits = { ...routine.legacyBaseline.friendVisits };
    routine.careMoments = routine.legacyBaseline.careMoments;
    routine.calmMoments = routine.legacyBaseline.calmMoments;
    routine.chaoticMoments = routine.legacyBaseline.chaoticMoments;
    routine.careHourHistogram = {};
    routine.actionLog.forEach((event) => {
      if (event.kind === "feed") routine.feeds += 1;
      if (event.kind === "pet") routine.pets += 1;
      if (event.kind === "play") {
        routine.plays += 1;
        if (event.refId) {
          routine.toyUses[event.refId] =
            (routine.toyUses[event.refId] ?? 0) + 1;
        }
      }
      if (event.kind === "room" && event.refId) {
        routine.roomVisits[event.refId] =
          (routine.roomVisits[event.refId] ?? 0) + 1;
      }
      if (event.kind === "friend" && event.refId) {
        routine.friendVisits[event.refId] =
          (routine.friendVisits[event.refId] ?? 0) + 1;
      }
    });
    const careEvents = routine.actionLog
      .filter(({ kind }) => kind === "feed" || kind === "pet" || kind === "play")
      .sort((left, right) => left.at - right.at);
    let previousSessionAt = 0;
    let gapTotal = 0;
    let gapCount = 0;
    careEvents.forEach((event) => {
      const hour = String(new Date(event.at).getUTCHours()).padStart(2, "0");
      routine.careHourHistogram[hour] =
        (routine.careHourHistogram[hour] ?? 0) + 1;
      if (
        previousSessionAt > 0 &&
        event.at - previousSessionAt < 5 * 60_000
      ) {
        return;
      }
      routine.careMoments += 1;
      if (previousSessionAt > 0) {
        const gap = (event.at - previousSessionAt) / 60_000;
        gapTotal += gap;
        gapCount += 1;
        routine.longestCareGapMinutes = Math.max(
          routine.longestCareGapMinutes,
          gap,
        );
        if (gap >= 30 && gap <= 36 * 60) routine.calmMoments += 1;
        if (gap >= 5 && gap < 15) routine.chaoticMoments += 1;
      }
      previousSessionAt = event.at;
    });
    if (gapCount > 0) {
      routine.averageCareGapMinutes = Math.max(
        routine.averageCareGapMinutes,
        gapTotal / gapCount,
      );
    }
  });
  // Fold distant per-event detail into the day's aggregates. The aggregates
  // stay authoritative because the recompute pass above is skipped for days
  // with an empty action log, and the baseline is left at zero so a folded day
  // that later meets an unfolded copy from another device recomputes from that
  // copy's events instead of double counting them.
  const newestDay = [...compacted.values()].reduce(
    (newest, routine) => (routine.day > newest ? routine.day : newest),
    "",
  );
  if (newestDay) {
    const detailCutoff = new Date(
      Date.parse(`${newestDay}T00:00:00Z`) -
        ROUTINE_DETAIL_RETENTION_DAYS * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    compacted.forEach((routine) => {
      if (routine.day >= detailCutoff || !routine.actionLog.length) return;
      routine.actionLog = [];
      routine.legacyBaseline = {
        feeds: 0,
        pets: 0,
        plays: 0,
        careMoments: 0,
        calmMoments: 0,
        chaoticMoments: 0,
        roomVisits: {},
        toyUses: {},
        friendVisits: {},
      };
    });
  }
  return [...compacted.values()].sort((a, b) =>
    a.day === b.day ? a.generation - b.generation : a.day.localeCompare(b.day),
  );
}

function reconcileSerumLedger(
  organism: Organism,
  now = Date.now(),
  incomingSchemaVersion = LIFE_SCHEMA_VERSION,
) {
  const legacyUsed = Number.isFinite(organism.lifespanSerumsUsed)
    ? clamp(
        Math.floor(organism.lifespanSerumsUsed),
        0,
        MAX_LIFESPAN_SERUM_USES,
      )
    : 0;
  const legacyHeld = Number.isFinite(organism.lifespanSerums)
    ? clamp(
        Math.floor(organism.lifespanSerums),
        0,
        MAX_LIFESPAN_SERUM_USES - legacyUsed,
      )
    : 0;
  const source = Array.isArray(organism.serumDoseRecords)
    ? organism.serumDoseRecords
    : [];
  const records = source
    .filter(
      (dose) =>
        dose &&
        typeof dose.id === "string" &&
        dose.id.length <= 160 &&
        Number.isFinite(dose.generation) &&
        Number.isFinite(dose.purchasedAt),
    )
    .map((dose) => ({
      id: dose.id,
      generation: Math.max(1, Math.floor(dose.generation)),
      generationId:
        typeof dose.generationId === "string" && dose.generationId.length > 0
          ? dose.generationId
          : dose.generation === organism.lineage
            ? organism.generationId
            : organism.legacyRecords.find(
                ({ generation }) => generation === dose.generation,
              )?.generationId ?? `legacy-generation-${dose.generation}`,
      purchasedAt: clamp(dose.purchasedAt, 0, now + 60_000),
      usedAt:
        dose.usedAt === null
          ? null
          : Number.isFinite(dose.usedAt)
            ? clamp(dose.usedAt, dose.purchasedAt, now + 60_000)
            : null,
      voidedAt:
        Number.isFinite(dose.voidedAt)
          ? clamp(dose.voidedAt!, dose.purchasedAt, now + 60_000)
          : null,
      moteCost:
        dose.moteCost === 0 ? 0 : LIFESPAN_SERUM_PRICE,
      acquisition:
        dose.acquisition === "purchased" ||
        dose.acquisition === "inherited" ||
        dose.acquisition === "legacy-migration"
          ? dose.acquisition
          : incomingSchemaVersion < LIFE_SCHEMA_VERSION
            ? ("legacy-migration" as const)
            : ("purchased" as const),
      parentDoseId:
        typeof dose.parentDoseId === "string"
          ? dose.parentDoseId.slice(0, 160)
          : undefined,
    }))
    .filter(
      (dose, index, all) =>
        all.findIndex((candidate) => candidate.id === dose.id) === index,
    );
  if (
    incomingSchemaVersion < LIFE_SCHEMA_VERSION &&
    !records.some(({ generation }) => generation === organism.lineage)
  ) {
    for (let index = 0; index < legacyUsed + legacyHeld; index += 1) {
      records.push({
        id: `legacy-serum-${organism.lineage}-${index + 1}`,
        generation: organism.lineage,
        generationId: organism.generationId,
        purchasedAt: Math.max(0, organism.generationStartedAt || now),
        usedAt: index < legacyUsed ? Math.max(0, organism.lastSeen || now) : null,
        voidedAt: null,
        moteCost: LIFESPAN_SERUM_PRICE,
        acquisition: "legacy-migration",
        parentDoseId: undefined,
      });
    }
  }
  const hasPurchaseDebit = (doseId: string) =>
    organism.moteTransactions.some(
      (entry) =>
        entry.id === `serum-purchase:${doseId}` &&
        entry.kind === "serum-purchase" &&
        entry.referenceId === doseId &&
        entry.amount === -LIFESPAN_SERUM_PRICE,
    );
  const isValidInheritedDose = (dose: SerumDoseRecord) => {
    if (!dose.parentDoseId || dose.moteCost !== 0) return false;
    const parent = records.find(({ id }) => id === dose.parentDoseId);
    return Boolean(
      parent &&
        parent.generationId === organism.parentGenerationId &&
        parent.generation < dose.generation &&
        parent.usedAt === null &&
        parent.voidedAt,
    );
  };
  records.forEach((dose) => {
    const valid =
      dose.acquisition === "legacy-migration"
        ? incomingSchemaVersion < LIFE_SCHEMA_VERSION
        : dose.acquisition === "purchased"
          ? dose.moteCost === LIFESPAN_SERUM_PRICE &&
            hasPurchaseDebit(dose.id)
          : isValidInheritedDose(dose);
    if (!valid) dose.voidedAt ??= now;
  });
  organism.serumDoseRecords = records;
  const eligible = records
    .filter(
      ({ generationId, voidedAt }) =>
        generationId === organism.generationId && !voidedAt,
    )
    .sort(
      (left, right) =>
        left.purchasedAt - right.purchasedAt ||
        left.id.localeCompare(right.id),
    );
  const current = eligible.slice(0, MAX_LIFESPAN_SERUM_USES);
  eligible.slice(MAX_LIFESPAN_SERUM_USES).forEach((overflow) => {
    overflow.voidedAt = now;
    if (
      overflow.acquisition === "purchased" &&
      hasPurchaseDebit(overflow.id)
    ) {
      recordMoteTransaction(
        organism,
        overflow.moteCost,
        "serum-refund",
        overflow.id,
        `serum-overflow-refund:${overflow.id}`,
      );
    }
  });
  organism.lifespanSerumsUsed = current.filter(
    ({ usedAt }) => usedAt !== null,
  ).length;
  organism.lifespanSerums = current.filter(
    ({ usedAt }) => usedAt === null,
  ).length;
  organism.lifespanExtensionDays =
    organism.lifespanSerumsUsed * LIFESPAN_SERUM_DAYS;
}

function reconcileMoteLedger(organism: Organism, now = Date.now()) {
  const source = Array.isArray(organism.moteTransactions)
    ? organism.moteTransactions
    : [];
  const validKinds = new Set<MoteTransaction["kind"]>([
    "founding",
    "legacy-balance",
    "achievement",
    "care",
    "friend-gift",
    "store-purchase",
    "pulse-purchase",
    "serum-purchase",
    "serum-refund",
  ]);
  const transactions = source
    .filter(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        entry.id.length > 0 &&
        entry.id.length <= 200 &&
        !/data:|camera|image|frame|latitude|longitude|location/i.test(entry.id) &&
        typeof entry.generationId === "string" &&
        Number.isFinite(entry.at) &&
        Number.isFinite(entry.amount) &&
        validKinds.has(entry.kind),
    )
    .map((entry) => ({
      ...entry,
      at: clamp(entry.at, 0, now + 60_000),
      amount: clamp(Math.trunc(entry.amount), -1_000_000, 1_000_000),
      referenceId:
        typeof entry.referenceId === "string"
          ? entry.referenceId.slice(0, 160)
          : undefined,
    }))
    .filter(
      (entry, index, all) =>
        all.findIndex(({ id }) => id === entry.id) === index,
    )
    .slice(-100_000);
  if (!transactions.length) {
    transactions.push({
      id: `legacy-balance-${organism.generationId}`,
      at: Math.max(0, organism.generationStartedAt || now),
      generationId: organism.generationId,
      amount: clamp(Math.floor(organism.currency), 0, 1_000_000_000),
      kind: "legacy-balance",
      referenceId: undefined,
    });
  }
  organism.moteTransactions = transactions;
  organism.currency = clamp(
    transactions.reduce((sum, entry) => sum + entry.amount, 0),
    0,
    1_000_000_000,
  );
}

function recordMoteTransaction(
  organism: Organism,
  amount: number,
  kind: MoteTransaction["kind"],
  referenceId?: string,
  stableId?: string,
) {
  const id = stableId ?? crypto.randomUUID();
  if (organism.moteTransactions.some((entry) => entry.id === id)) {
    return false;
  }
  organism.moteTransactions.push({
    id,
    at: Date.now(),
    generationId: organism.generationId,
    amount,
    kind,
    referenceId,
  });
  reconcileMoteLedger(organism);
  return true;
}

function hydrateLifeSystems(organism: Organism) {
  const incomingSchemaVersion = Number.isFinite(organism.lifeSchemaVersion)
    ? Math.max(0, Math.floor(organism.lifeSchemaVersion))
    : 0;
  organism.lifeSchemaVersion = LIFE_SCHEMA_VERSION;
  const now = Date.now();
  const fallback = createOrganism(
    Number.isFinite(organism.seed) ? organism.seed : 83017,
  );
  const canonicalKeys = new Set(Object.keys(fallback));
  Object.keys(organism).forEach((key) => {
    if (!canonicalKeys.has(key)) {
      delete (organism as unknown as Record<string, unknown>)[key];
    }
  });
  organism.seed = Number.isFinite(organism.seed)
    ? Math.floor(organism.seed)
    : fallback.seed;
  organism.lineage = Number.isFinite(organism.lineage)
    ? clamp(Math.floor(organism.lineage), 1, 1_000_000)
    : 1;
  organism.generationId =
    typeof organism.generationId === "string" &&
    organism.generationId.length > 0 &&
    organism.generationId.length <= 160
      ? organism.generationId
      : `gen-${organism.lineage}-${organism.seed >>> 0}`;
  organism.parentGenerationId =
    typeof organism.parentGenerationId === "string" &&
    organism.parentGenerationId.length <= 160
      ? organism.parentGenerationId
      : null;
  organism.ageMinutes = Number.isFinite(organism.ageMinutes)
    ? clamp(organism.ageMinutes, 0, 2_000 * 365 * 1440)
    : 0;
  const safeTimestamp = (value: unknown, fallbackValue = now) =>
    typeof value === "number" && Number.isFinite(value)
      ? clamp(value, 0, now + 60_000)
      : fallbackValue;
  organism.generationStartedAt = safeTimestamp(
    organism.generationStartedAt,
  );
  organism.lastSeen = safeTimestamp(
    organism.lastSeen,
    organism.generationStartedAt,
  );
  organism.lastCare = safeTimestamp(
    organism.lastCare,
    organism.generationStartedAt,
  );
  organism.currency = Number.isFinite(organism.currency)
    ? clamp(Math.floor(organism.currency), 0, 1_000_000_000)
    : 60;
  organism.moteTransactions ??= [];
  const knownAchievementIds = new Set(ACHIEVEMENTS.map(({ id }) => id));
  organism.achievements = [
    ...new Set(
      (organism.achievements ?? []).filter(
        (id): id is string =>
          typeof id === "string" && knownAchievementIds.has(id),
      ),
    ),
  ];
  const knownItemIds = new Set(STORE_ITEMS.map(({ id }) => id));
  organism.ownedItems = [
    ...new Set(
      (organism.ownedItems ?? []).filter(
        (id): id is string => typeof id === "string" && knownItemIds.has(id),
      ),
    ),
  ];
  organism.bond = clamp(Number.isFinite(organism.bond) ? organism.bond : 0.16);
  organism.trust = clamp(Number.isFinite(organism.trust) ? organism.trust : 0.12);
  organism.peakBond = clamp(
    Number.isFinite(organism.peakBond) ? organism.peakBond : organism.bond,
  );
  organism.peakTrust = clamp(
    Number.isFinite(organism.peakTrust) ? organism.peakTrust : organism.trust,
  );
  organism.joy = clamp(Number.isFinite(organism.joy) ? organism.joy : 0.62);
  organism.traits = Object.fromEntries(
    (Object.keys(fallback.traits) as (keyof Traits)[]).map((trait) => [
      trait,
      clamp(
        Number.isFinite(organism.traits?.[trait])
          ? organism.traits[trait]
          : fallback.traits[trait],
        0.08,
        0.96,
      ),
    ]),
  ) as Traits;
  organism.generationBirthTraits = Object.fromEntries(
    (Object.keys(fallback.traits) as (keyof Traits)[]).map((trait) => [
      trait,
      clamp(
        Number.isFinite(organism.generationBirthTraits?.[trait])
          ? organism.generationBirthTraits[trait]
          : organism.traits[trait],
        0.08,
        0.96,
      ),
    ]),
  ) as Traits;
  organism.naturalLifespanDays = Number.isFinite(
    organism.naturalLifespanDays,
  )
    ? clamp(Math.round(organism.naturalLifespanDays), 30, 1_000)
    : Math.round(120 + organism.traits.resilience * 180);
  organism.cells = organism.cells.map((cell, index) => {
    const safe = fallback.cells[index];
    return {
      alive: Boolean(cell?.alive),
      energy: clamp(Number.isFinite(cell?.energy) ? cell.energy : 0),
      health: clamp(Number.isFinite(cell?.health) ? cell.health : 0),
      age: Number.isFinite(cell?.age) ? clamp(cell.age, 0, 1_000_000_000) : 0,
      phase: Number.isFinite(cell?.phase) ? cell.phase : safe.phase,
      hue: Number.isFinite(cell?.hue) ? clamp(cell.hue, -180, 180) : safe.hue,
      origin: cell?.origin,
      scaffoldUntilAgeMinutes: cell?.scaffoldUntilAgeMinutes,
      scaffoldNutrients: cell?.scaffoldNutrients,
      scaffoldScarId: cell?.scaffoldScarId,
    };
  });
  organism.ownedItems ??= [];
  organism.equippedRoom ??= "atrium";
  organism.equippedToy ??= null;
  if (
    organism.equippedRoom !== "atrium" &&
    !organism.ownedItems.includes(organism.equippedRoom)
  ) {
    organism.equippedRoom = "atrium";
  }
  if (
    organism.equippedToy &&
    !organism.ownedItems.includes(organism.equippedToy)
  ) {
    organism.equippedToy = null;
  }
  organism.achievements ??= [];
  organism.friends = (organism.friends ?? [])
    .filter(
      (friend) =>
        friend &&
        typeof friend.id === "string" &&
        FRIENDS.some(({ id }) => id === friend.id),
    )
    .map((friend) => ({
      id: friend.id,
      visits: Number.isFinite(friend.visits)
        ? clamp(Math.floor(friend.visits), 0, 1_000_000)
        : 0,
      bond: clamp(Number.isFinite(friend.bond) ? friend.bond : 0),
      lastVisit: safeTimestamp(friend.lastVisit, 0),
    }));
  organism.activeFriendId ??= null;
  organism.lastFeederAt ??= Date.now();
  organism.playCount ??= 0;
  organism.lastPlayRewardAt ??= 0;
  organism.lastMealRewardAt = Number.isFinite(organism.lastMealRewardAt)
    ? Math.max(0, organism.lastMealRewardAt)
    : 0;
  organism.episodicMemories ??= [];
  organism.routineMemories ??= [];
  organism.memorySequence ??= organism.episodicMemories.length;
  const savedGermination = organism.germination as
    | Partial<GerminationState>
    | undefined;
  const validGerminationStates: GerminationState["state"][] = [
    "stable",
    "dire",
    "priming",
    "budding",
    "legacy",
  ];
  const finiteGerminationNumber = (
    value: unknown,
    fallback: number,
  ) =>
    typeof value === "number" && Number.isFinite(value)
      ? value
      : fallback;
  const savedLastNourishedAt = finiteGerminationNumber(
    savedGermination?.lastNourishedAt,
    0,
  );
  organism.germination = {
    state:
      savedGermination?.state &&
      validGerminationStates.includes(savedGermination.state)
        ? savedGermination.state
        :
      (livingCells(organism) <= 1 ? "dire" : "stable"),
    nourishingMeals: Math.min(
      SEED_MEALS_REQUIRED,
      Math.max(
        0,
        Math.floor(
          finiteGerminationNumber(
            savedGermination?.nourishingMeals,
            0,
          ),
        ),
      ),
    ),
    progress: clamp(
      finiteGerminationNumber(savedGermination?.progress, 0),
    ),
    enteredAt:
      finiteGerminationNumber(
        savedGermination?.enteredAt,
        0,
      ) ||
      (livingCells(organism) <= 1 ? Date.now() : 0),
    lastNourishedAt:
      savedLastNourishedAt > now + 60_000
        ? 0
        : Math.max(0, savedLastNourishedAt),
    naturalRecoveries: Math.max(
      0,
      Math.floor(
        finiteGerminationNumber(
          savedGermination?.naturalRecoveries,
          0,
        ),
      ),
    ),
    dormancyDepth: clamp(
      finiteGerminationNumber(savedGermination?.dormancyDepth, 0),
    ),
  };
  organism.pulseCapsulesUsed = Number.isFinite(organism.pulseCapsulesUsed)
    ? Math.max(0, Math.floor(organism.pulseCapsulesUsed))
    : 0;
  organism.pulseCapsules = Number.isFinite(organism.pulseCapsules)
    ? Math.min(
        MAX_PULSE_CAPSULES_HELD,
        Math.max(0, Math.floor(organism.pulseCapsules)),
      )
    : organism.pulseCapsulesUsed === 0
      ? 1
      : 0;
  organism.revivalScars = (organism.revivalScars ?? []).filter(
    (scar) =>
      scar &&
      typeof scar.id === "string" &&
      scar.id.length <= 200 &&
      !/data:|camera|image|frame|latitude|longitude|location/i.test(scar.id) &&
      Number.isFinite(scar.at) &&
      Number.isFinite(scar.severity) &&
      Number.isFinite(scar.hueShift),
  );
  const validScarIds = new Set(organism.revivalScars.map(({ id }) => id));
  organism.cells.forEach((cell) => {
    if (cell.origin !== "pulse-scaffold") {
      cell.origin = "natural";
      cell.scaffoldUntilAgeMinutes = 0;
      cell.scaffoldNutrients = 0;
      cell.scaffoldScarId = undefined;
      return;
    }
    const deadline = Number.isFinite(cell.scaffoldUntilAgeMinutes)
      ? cell.scaffoldUntilAgeMinutes!
      : organism.ageMinutes;
    const scarIsValid =
      typeof cell.scaffoldScarId === "string" &&
      validScarIds.has(cell.scaffoldScarId);
    if (!scarIsValid) {
      cell.origin = "natural";
      cell.scaffoldUntilAgeMinutes = 0;
      cell.scaffoldNutrients = 0;
      cell.scaffoldScarId = undefined;
      return;
    }
    cell.scaffoldUntilAgeMinutes = clamp(
      deadline,
      organism.ageMinutes,
      organism.ageMinutes + 12 * 60,
    );
    cell.scaffoldNutrients = clamp(
      finiteGerminationNumber(cell.scaffoldNutrients, 0),
      0,
      1.15,
    );
  });
  organism.revivalProtectionUntilAgeMinutes = Number.isFinite(
    organism.revivalProtectionUntilAgeMinutes,
  )
    ? clamp(
        organism.revivalProtectionUntilAgeMinutes,
        0,
        organism.ageMinutes + 12 * 60,
      )
    : 0;
  organism.serumDoseRecords ??= [];
  organism.terminalSenescenceStarted = Boolean(
    organism.terminalSenescenceStarted,
  );
  organism.legacyRecords = (organism.legacyRecords ?? [])
    .filter(
      (record) =>
        record &&
        Number.isFinite(record.generation) &&
        record.generation >= 1 &&
        Number.isFinite(record.endedAt) &&
        Number.isFinite(record.livedDays) &&
        typeof record.phenotype === "string" &&
        Array.isArray(record.achievements) &&
        Array.isArray(record.memoryIds),
    )
    .map((record) => ({
      ...record,
      generation: Math.floor(record.generation),
      generationId:
        typeof record.generationId === "string"
          ? record.generationId
          : `gen-${Math.floor(record.generation)}-${record.seed >>> 0}`,
      parentGenerationId:
        typeof record.parentGenerationId === "string"
          ? record.parentGenerationId
          : null,
      successorGenerationId:
        typeof record.successorGenerationId === "string"
          ? record.successorGenerationId
          : `gen-${Math.floor(record.generation) + 1}-legacy`,
      endedAt: safeTimestamp(record.endedAt),
      bornAt: Math.min(
        safeTimestamp(
          record.bornAt,
          Math.max(0, record.endedAt - record.livedDays * 86_400_000),
        ),
        safeTimestamp(record.endedAt),
      ),
      traits: record.traits
        ? (Object.fromEntries(
            (Object.keys(fallback.traits) as (keyof Traits)[]).map((trait) => [
              trait,
              clamp(
                Number.isFinite(record.traits[trait])
                  ? record.traits[trait]
                  : fallback.traits[trait],
                0.08,
                0.96,
              ),
            ]),
          ) as Traits)
        : { ...fallback.traits },
      traitsAtBirth: record.traitsAtBirth
        ? (Object.fromEntries(
            (Object.keys(fallback.traits) as (keyof Traits)[]).map((trait) => [
              trait,
              clamp(
                Number.isFinite(record.traitsAtBirth[trait])
                  ? record.traitsAtBirth[trait]
                  : record.traits?.[trait] ?? fallback.traits[trait],
                0.08,
                0.96,
              ),
            ]),
          ) as Traits)
        : { ...(record.traits ?? fallback.traits) },
      traitsAtDeath: { ...(record.traits ?? fallback.traits) },
      peakBond: clamp(
        Number.isFinite(record.peakBond) ? record.peakBond : record.bond,
      ),
      peakTrust: clamp(
        Number.isFinite(record.peakTrust) ? record.peakTrust : record.trust,
      ),
      terminalCause: "natural-senescence" as const,
      serumUses: Number.isFinite(record.serumUses)
        ? clamp(Math.floor(record.serumUses), 0, MAX_LIFESPAN_SERUM_USES)
        : 0,
      phenotype: record.phenotype.slice(0, 160),
      achievements: record.achievements
        .filter((id): id is string => typeof id === "string")
        .slice(0, 500),
      memoryIds: record.memoryIds
        .filter((id): id is string => typeof id === "string")
        .slice(0, 10_000),
    }));
  organism.generationStartedAt ??= organism.lastSeen || Date.now();
  organism.lastObservedLiving ??= livingCells(organism);
  organism.rememberedMilestones = [
    ...new Set(
      (organism.rememberedMilestones ?? []).filter(
        (milestone): milestone is string =>
          typeof milestone === "string" &&
          milestone.length <= 200 &&
          !/data:|camera|image|frame|latitude|longitude|location/i.test(
            milestone,
          ),
      ),
    ),
  ];
  organism.routineMemories = compactRoutineMemories(
    organism.routineMemories ?? [],
  );
  reconcileMoteLedger(organism, now);
  reconcileSerumLedger(organism, now, incomingSchemaVersion);
  if (lifeStats(organism).naturalProgress >= 0.92) {
    organism.terminalSenescenceStarted = true;
  }

  // Older experimental saves may contain malformed memory rows. Preserve valid
  // memories while refusing to let untrusted imports smuggle camera/location data.
  organism.episodicMemories = organism.episodicMemories
    .filter(
      (memory) =>
        memory &&
        typeof memory.id === "string" &&
        memory.id.length <= 200 &&
        !/data:|camera|image|frame|latitude|longitude|location/i.test(
          memory.id,
        ) &&
        typeof memory.summary === "string" &&
        !/data:image|data:video|latitude|longitude|precise location/i.test(
          memory.summary,
        ) &&
        [
          "long-absence",
          "near-death",
          "collapse",
          "natural-recovery",
          "pulse-revival",
          "major-bloom",
          "mutation",
          "legacy",
          "lifespan-extension",
        ].includes(memory.kind) &&
        (memory.significance === "important" ||
          memory.significance === "legacy") &&
        Number.isFinite(memory.generation) &&
        memory.generation >= 1 &&
        Number.isFinite(memory.at) &&
        memory.at >= 0 &&
        memory.at <= 8_640_000_000_000_000,
    )
    .map((memory) => ({
      ...memory,
      summary: memory.summary.slice(0, 500),
      details: Object.fromEntries(
        Object.entries(memory.details ?? {}).filter(
          ([key, value]) =>
            !/camera|image|frame|latitude|longitude|location/i.test(key) &&
            ((typeof value === "string" &&
              !/data:image|data:video|latitude|longitude|precise location/i.test(
                value,
              )) ||
              typeof value === "number" ||
              typeof value === "boolean"),
        ),
      ),
    }))
    .filter(
      (memory, index, all) =>
        all.findIndex(({ id }) => id === memory.id) === index,
    );
  organism.memorySequence = Number.isFinite(organism.memorySequence)
    ? Math.max(
        organism.episodicMemories.length,
        Math.floor(organism.memorySequence),
      )
    : organism.episodicMemories.length;
  if (livingCells(organism) === 0) {
    const core = organism.cells[CENTER * GRID + CENTER];
    core.alive = true;
    core.energy = 0.01;
    core.health = 0.03;
    organism.germination.state = "dire";
    organism.germination.dormancyDepth = 1;
    recordEpisode(
      organism,
      "collapse",
      "A damaged save condensed into a recoverable dormant seed.",
      { provenance: "hydration-repair" },
    );
    organism.lastObservedLiving = 1;
  }
  return organism;
}

function lifeStats(organism: Organism) {
  const naturalLifespanDays = organism.naturalLifespanDays;
  const lifespanDays = naturalLifespanDays + organism.lifespanExtensionDays;
  const ageDays = organism.ageMinutes / 1440;
  const progress = ageDays / lifespanDays;
  const naturalProgress = ageDays / naturalLifespanDays;
  const lifePhase =
    naturalProgress < 0.04
      ? "Hatchling"
      : naturalProgress < 0.25
        ? "Young"
        : naturalProgress < ELDER_THRESHOLD
          ? "Mature"
          : progress >= 1
            ? "Legacy seed"
            : organism.lifespanExtensionDays > 0
              ? "Moonlit Elder"
              : "Elder";
  const remainingDays = Math.max(0, lifespanDays - ageDays);
  const lifeRemaining =
    remainingDays <= 0
      ? "Natural span complete"
      : remainingDays < 2
        ? `${Math.max(1, Math.ceil(remainingDays * 24))} hours`
        : remainingDays < 60
          ? `About ${Math.ceil(remainingDays)} days`
          : `About ${Math.ceil(remainingDays / 30)} months`;

  return {
    naturalLifespanDays,
    lifespanDays,
    lifePhase,
    lifeRemaining,
    progress: clamp(progress),
    naturalProgress: clamp(naturalProgress),
  };
}

function feederStatus(organism: Organism) {
  if (!organism.ownedItems.includes("auto-feeder")) return "Not installed";
  const remaining = Math.max(
    0,
    FEEDER_INTERVAL_MS - (Date.now() - organism.lastFeederAt),
  );
  if (remaining === 0) return "Ready to dispense";
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.ceil((remaining % 3_600_000) / 60_000);
  return hours ? `Next mote in ${hours}h ${minutes}m` : `Next mote in ${minutes}m`;
}

function evaluateProgress(organism: Organism) {
  organism.peakBond = Math.max(organism.peakBond, organism.bond);
  organism.peakTrust = Math.max(organism.peakTrust, organism.trust);
  const unlockedAchievements: string[] = [];
  const discoveredFriends: string[] = [];
  const living = livingCells(organism);
  const rules: Record<string, boolean> = {
    "first-meal": organism.meals >= 1,
    "new-growth": living >= 60,
    "full-bloom": living >= 150,
    "trusted-touch": organism.bond >= 0.5,
    "play-routine": organism.playCount >= 5,
    "small-circle": organism.friends.length >= 2,
    "room-maker": organism.ownedItems.some((id) =>
      STORE_ITEMS.some((item) => item.id === id && item.category === "room"),
    ),
    "thirty-days": organism.ageMinutes >= 30 * 1440,
  };

  ACHIEVEMENTS.forEach((achievement) => {
    if (rules[achievement.id] && !organism.achievements.includes(achievement.id)) {
      organism.achievements.push(achievement.id);
      recordMoteTransaction(
        organism,
        achievement.reward,
        "achievement",
        achievement.id,
        `achievement:${achievement.id}`,
      );
      unlockedAchievements.push(achievement.name);
    }
  });

  const friendRules: Record<string, boolean> = {
    pip: organism.meals >= 3,
    oona: living >= 100,
    moss: organism.bond >= 0.5,
  };
  FRIENDS.forEach((friend) => {
    if (friendRules[friend.id] && !organism.friends.some(({ id }) => id === friend.id)) {
      organism.friends.push({
        id: friend.id,
        bond: 0.08,
        visits: 0,
        lastVisit: 0,
      });
      discoveredFriends.push(friend.name);
    }
  });

  return { unlockedAchievements, discoveredFriends };
}

function makeSnapshot(organism: Organism, behavior = "Waking") {
  const { living, energy, health } = averages(organism);
  const life = lifeStats(organism);
  let stage = "Thriving";
  if (living <= 6) stage = "Dormant seed";
  else if (health < 0.28 || energy < 0.18) stage = "Critical";
  else if (health < 0.5 || energy < 0.38) stage = "Weakened";
  else if (energy < 0.58) stage = "Hungry";
  else if (energy > 0.88 && living > 65) stage = "Blooming";
  else if (organism.joy > 0.72) stage = "Curious";

  const days = Math.floor(organism.ageMinutes / 1440);
  const hours = Math.floor((organism.ageMinutes % 1440) / 60);
  const minutes = Math.floor(organism.ageMinutes % 60);
  const age =
    days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  const currentScars = organism.revivalScars.filter(
    ({ generation }) => generation === organism.lineage,
  );
  const pulseScaffolds = organism.cells.filter(
    (cell) => cell.alive && cell.origin === "pulse-scaffold",
  );
  const pulseScaffoldNutrition = pulseScaffolds.length
    ? pulseScaffolds.reduce(
        (sum, cell) => sum + (cell.scaffoldNutrients ?? 0),
        0,
      ) /
      (pulseScaffolds.length * 1.15)
    : 0;
  const pulseScaffoldProtectionMinutes = pulseScaffolds.length
    ? Math.max(
        0,
        ...pulseScaffolds.map(
          (cell) =>
            (cell.scaffoldUntilAgeMinutes ?? organism.ageMinutes) -
            organism.ageMinutes,
        ),
      )
    : 0;

  return {
    living,
    energy,
    health,
    bond: organism.bond,
    stage,
    behavior,
    phenotype: `${phenotypeName(organism.traits, organism.seed)}${
      currentScars.length ? " · Pulse-scarred" : ""
    }`,
    age,
    births: organism.births,
    meals: organism.meals,
    lineage: organism.lineage,
    traits: { ...organism.traits },
    currency: organism.currency,
    ownedItems: [...organism.ownedItems],
    equippedRoom: organism.equippedRoom,
    equippedToy: organism.equippedToy,
    achievements: [...organism.achievements],
    friends: organism.friends.map((friend) => ({ ...friend })),
    activeFriendId: organism.activeFriendId,
    lifePhase:
      life.progress >= 1 ? (living <= 1 ? "Legacy seed" : "Last light") : life.lifePhase,
    lifespanDays: life.lifespanDays,
    lifeRemaining: life.lifeRemaining,
    lifeProgress: life.progress,
    feederStatus: feederStatus(organism),
    germinationState: organism.germination.state,
    germinationMeals: organism.germination.nourishingMeals,
    germinationMealsRequired: SEED_MEALS_REQUIRED,
    germinationProgress: organism.germination.progress,
    germinationDormancy: organism.germination.dormancyDepth,
    pulseScaffoldCells: pulseScaffolds.length,
    pulseScaffoldNutrition: clamp(pulseScaffoldNutrition),
    pulseScaffoldProtectionMinutes,
    pulseCapsules: organism.pulseCapsules,
    pulseCapsulesUsed: organism.pulseCapsulesUsed,
    revivalScars: organism.revivalScars.length,
    lifespanExtensionDays: organism.lifespanExtensionDays,
    lifespanSerums: organism.lifespanSerums,
    lifespanSerumsUsed: organism.lifespanSerumsUsed,
    lifespanSerumUsesRemaining: Math.max(
      0,
      MAX_LIFESPAN_SERUM_USES - organism.lifespanSerumsUsed,
    ),
    canUsePulseCapsule:
      living <= 1 &&
      organism.pulseCapsules > 0 &&
      life.progress < 0.92 &&
      !organism.cells.some(
        (cell) => cell.alive && cell.origin === "pulse-scaffold",
      ),
    canUseLifespanSerum:
      organism.lifespanSerums > 0 &&
      organism.lifespanSerumsUsed < MAX_LIFESPAN_SERUM_USES &&
      life.naturalProgress >= ELDER_THRESHOLD &&
      life.progress < 1,
    legacyReady: life.progress >= 1 && living <= 1,
    generation: organism.lineage,
    generationId: organism.generationId,
    generationStartedAt: organism.generationStartedAt,
    legacyRecords: organism.legacyRecords.map((record) => ({
      ...record,
      achievements: [...record.achievements],
      memoryIds: [...record.memoryIds],
    })),
    episodicMemories: organism.episodicMemories.map((memory) => ({
      ...memory,
      details: { ...memory.details },
    })),
    routineMemories: organism.routineMemories.map((routine) => ({
      ...routine,
      roomVisits: { ...routine.roomVisits },
      toyUses: { ...routine.toyUses },
      friendVisits: { ...routine.friendVisits },
    })),
    careStyle: rememberedCareStyle(organism),
  } satisfies Snapshot;
}

function neighbors(index: number) {
  const x = index % GRID;
  const y = Math.floor(index / GRID);
  const result: number[] = [];
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      const nextX = x + offsetX;
      const nextY = y + offsetY;
      if (nextX >= 0 && nextX < GRID && nextY >= 0 && nextY < GRID) {
        result.push(nextY * GRID + nextX);
      }
    }
  }
  return result;
}

const neighborMap = Array.from({ length: GRID * GRID }, (_, index) =>
  neighbors(index),
);

function seedNeighborOrder(organism: Organism) {
  const survivorIndex = organism.cells.findIndex((cell) => cell.alive);
  const coreIndex =
    survivorIndex >= 0 ? survivorIndex : CENTER * GRID + CENTER;
  return [...neighborMap[coreIndex]].sort((a, b) => {
    const scoreA = Math.imul(a + 17, organism.seed ^ organism.lineage);
    const scoreB = Math.imul(b + 17, organism.seed ^ organism.lineage);
    return scoreA - scoreB;
  });
}

function enterSeedCrisis(organism: Organism, cause: "starvation" | "old-age") {
  const now = Date.now();
  if (cause === "old-age") {
    organism.germination.state = "legacy";
    organism.germination.progress = 0;
  } else if (
    organism.germination.state === "stable" ||
    organism.germination.state === "legacy"
  ) {
    organism.germination.state = "dire";
    organism.germination.progress = 0;
  }
  organism.germination.enteredAt ||= now;
  if (!organism.rememberedMilestones.includes(`collapse:${organism.lineage}`)) {
    organism.rememberedMilestones.push(`collapse:${organism.lineage}`);
    recordEpisode(
      organism,
      cause === "old-age" ? "legacy" : "collapse",
      cause === "old-age"
        ? "Its natural span closed around a quiet legacy seed."
        : "Its body collapsed until only the nutrient core endured.",
      { cause, livingCells: livingCells(organism) },
      cause === "old-age" ? "legacy" : "important",
      now,
    );
  }
}

function observeBodyState(
  organism: Organism,
  beforeLiving = organism.lastObservedLiving,
) {
  const living = livingCells(organism);
  const life = lifeStats(organism);
  if (life.naturalProgress >= 0.92) {
    organism.terminalSenescenceStarted = true;
  }

  if (
    living <= 6 &&
    beforeLiving > 6 &&
    !organism.rememberedMilestones.includes(`near-death:${organism.lineage}`)
  ) {
    organism.rememberedMilestones.push(`near-death:${organism.lineage}`);
    recordEpisode(
      organism,
      "near-death",
      "A severe collapse left only a handful of living cells.",
      { livingCells: living },
    );
  }
  if (living <= 1) {
    enterSeedCrisis(organism, life.progress >= 1 ? "old-age" : "starvation");
  } else if (
    living >= 2 &&
    organism.germination.state !== "stable" &&
    organism.germination.state !== "legacy"
  ) {
    organism.germination.state = "stable";
    organism.germination.nourishingMeals = 0;
    organism.germination.progress = 0;
    organism.germination.enteredAt = 0;
    organism.germination.lastNourishedAt = 0;
  }
  if (
    living >= 150 &&
    beforeLiving < 150 &&
    !organism.rememberedMilestones.includes(`bloom:${organism.lineage}`)
  ) {
    organism.rememberedMilestones.push(`bloom:${organism.lineage}`);
    recordEpisode(
      organism,
      "major-bloom",
      "A sustained nutrient surplus opened a major cellular bloom.",
      { livingCells: living, births: organism.births },
    );
  }
  organism.lastObservedLiving = living;
}

function nourishSeedCore(organism: Organism, now = Date.now()) {
  if (livingCells(organism) !== 1 || lifeStats(organism).progress >= 1) {
    return false;
  }
  const core = organism.cells.find((cell) => cell.alive);
  if (!core) return false;
  core.energy = clamp(core.energy + 0.32);
  core.health = clamp(core.health + 0.19);
  const canAssimilate =
    organism.germination.lastNourishedAt === 0 ||
    now - organism.germination.lastNourishedAt >= SEED_ASSIMILATION_MS;
  if (canAssimilate) {
    organism.germination.nourishingMeals = Math.min(
      SEED_MEALS_REQUIRED,
      organism.germination.nourishingMeals + 1,
    );
    organism.germination.lastNourishedAt = now;
    organism.germination.dormancyDepth = clamp(
      organism.germination.dormancyDepth - 0.16,
    );
  }
  organism.germination.state =
    organism.germination.nourishingMeals >= SEED_MEALS_REQUIRED &&
    core.energy >= 0.74 &&
    core.health >= 0.58
      ? "budding"
      : "priming";
  return true;
}

function nourishPulseScaffolds(organism: Organism, nutrition: number) {
  const scarIds = [
    ...new Set(
      organism.cells
        .filter((cell) => cell.alive && cell.origin === "pulse-scaffold")
        .map((cell) => cell.scaffoldScarId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  organism.cells.forEach((cell) => {
    if (!cell.alive || cell.origin !== "pulse-scaffold") return;
    cell.scaffoldNutrients = (cell.scaffoldNutrients ?? 0) + nutrition;
    if (cell.scaffoldNutrients >= 1.15) {
      cell.origin = "natural";
      cell.scaffoldUntilAgeMinutes = 0;
      cell.health = Math.max(cell.health, 0.74);
    }
  });
  observePulseScaffoldOutcomes(organism, scarIds);
  return organism.cells.filter(
    (cell) => cell.alive && cell.origin === "pulse-scaffold",
  ).length;
}

function observePulseScaffoldOutcomes(
  organism: Organism,
  candidateScarIds: string[],
) {
  candidateScarIds.forEach((scarId) => {
    const milestone = `pulse-outcome:${scarId}`;
    if (organism.rememberedMilestones.includes(milestone)) return;
    const related = organism.cells.filter(
      (cell) => cell.scaffoldScarId === scarId,
    );
    if (related.some((cell) => cell.alive && cell.origin === "pulse-scaffold")) {
      return;
    }
    const integrated = related.filter(
      (cell) => cell.alive && cell.origin === "natural",
    ).length;
    organism.rememberedMilestones.push(milestone);
    recordEpisode(
      organism,
      "pulse-revival",
      integrated > 0
        ? `${integrated} Pulse-grown stem cells permanently integrated into the body.`
        : "The temporary Pulse scaffold failed, but the original seed remained alive.",
      {
        scarId,
        outcome: integrated > 0 ? "integrated" : "failed",
        integratedCells: integrated,
      },
    );
  });
}

function advanceSeedGermination(
  organism: Organism,
  amount = 0.09,
  now = Date.now(),
) {
  if (livingCells(organism) !== 1 || lifeStats(organism).progress >= 1) {
    return false;
  }
  const coreIndex = organism.cells.findIndex((cell) => cell.alive);
  const core = organism.cells[coreIndex];
  if (
    organism.germination.lastNourishedAt > 0 &&
    organism.germination.nourishingMeals > 0
  ) {
    const staleFor = now - organism.germination.lastNourishedAt;
    const decayedMeals = Math.floor(staleFor / SEED_PRIMING_DECAY_MS);
    if (decayedMeals > 0) {
      organism.germination.nourishingMeals = Math.max(
        0,
        organism.germination.nourishingMeals - decayedMeals,
      );
      organism.germination.lastNourishedAt +=
        decayedMeals * SEED_PRIMING_DECAY_MS;
      organism.germination.progress = clamp(
        organism.germination.progress - decayedMeals * 0.16,
      );
      if (organism.germination.nourishingMeals === 0) {
        organism.germination.state = "dire";
      }
    }
  }
  if (
    !core ||
    organism.germination.nourishingMeals < SEED_MEALS_REQUIRED ||
    core.energy < 0.74 ||
    core.health < 0.58
  ) {
    if (organism.germination.nourishingMeals === 0) {
      organism.germination.state = "dire";
    } else if (organism.germination.nourishingMeals < SEED_MEALS_REQUIRED) {
      organism.germination.state = "priming";
    }
    organism.germination.progress = clamp(
      organism.germination.progress - amount * 0.08,
    );
    return false;
  }

  organism.germination.state = "budding";
  organism.germination.progress = clamp(
    organism.germination.progress +
      amount *
        (0.78 + organism.traits.resilience * 0.44) *
        (0.2 + (1 - organism.germination.dormancyDepth) * 0.8),
  );
  if (organism.germination.progress < 1) return false;

  const newbornIndex =
    seedNeighborOrder(organism).find(
      (index) => !organism.cells[index].alive,
    ) ?? neighborMap[coreIndex].find((index) => !organism.cells[index].alive);
  if (newbornIndex === undefined) return false;
  const newborn = organism.cells[newbornIndex];
  newborn.alive = true;
  newborn.energy = 0.43;
  newborn.health = 0.76;
  newborn.age = 0;
  newborn.phase = core.phase + 0.37;
  newborn.hue = core.hue + 2.5;
  core.energy = clamp(core.energy - 0.32);
  core.health = clamp(core.health - 0.08);
  organism.births += 1;
  organism.germination.naturalRecoveries += 1;
  organism.germination.state = "stable";
  organism.germination.nourishingMeals = 0;
  organism.germination.progress = 0;
  organism.germination.enteredAt = 0;
  organism.germination.lastNourishedAt = 0;
  organism.germination.dormancyDepth = clamp(
    organism.germination.dormancyDepth * 0.6,
  );
  organism.rememberedMilestones = organism.rememberedMilestones.filter(
    (milestone) =>
      milestone !== `collapse:${organism.lineage}` &&
      milestone !== `near-death:${organism.lineage}`,
  );
  recordEpisode(
    organism,
    "natural-recovery",
    "The well-fed lone core spent its reserves to bud a new stem cell.",
    {
      mealsRequired: SEED_MEALS_REQUIRED,
      recoveryNumber: organism.germination.naturalRecoveries,
      dormancyCarriedForward: Number(
        organism.germination.dormancyDepth.toFixed(3),
      ),
    },
  );
  organism.lastObservedLiving = 2;
  return true;
}

function advanceDormancyForElapsed(
  organism: Organism,
  elapsedMinutes: number,
) {
  const elapsed = Math.max(0, elapsedMinutes);
  const living = livingCells(organism);
  if (living === 1 && lifeStats(organism).progress < 1) {
    const survivor = organism.cells.find((cell) => cell.alive);
    if (survivor && (survivor.energy < 0.2 || survivor.health < 0.25)) {
      organism.germination.dormancyDepth = clamp(
        organism.germination.dormancyDepth +
          (elapsed / (30 * 1440)) *
            (1.16 - organism.traits.resilience * 0.36),
      );
    }
  } else if (living > 1) {
    organism.germination.dormancyDepth = clamp(
      organism.germination.dormancyDepth - elapsed / (14 * 1440),
    );
  }
}

type LifecycleActionResult = {
  ok: boolean;
  message: string;
};

function activatePulseCapsule(organism: Organism): LifecycleActionResult {
  const living = livingCells(organism);
  const life = lifeStats(organism);
  if (
    organism.terminalSenescenceStarted ||
    life.naturalProgress >= 0.92
  ) {
    organism.terminalSenescenceStarted = true;
    return {
      ok: false,
      message:
        "Terminal senescence has begun. Pulse cannot turn emergency repair into hidden lifespan extension.",
    };
  }
  if (living > 1) {
    return {
      ok: false,
      message: "Pulse Capsules open only when a lone seed is all that remains.",
    };
  }
  if (
    organism.cells.some(
      (cell) => cell.alive && cell.origin === "pulse-scaffold",
    )
  ) {
    return {
      ok: false,
      message: "The existing Pulse scaffold must stabilize before any new treatment.",
    };
  }
  if (organism.pulseCapsules < 1) {
    return {
      ok: false,
      message:
        "No capsule remains. Feeding the surviving seed can still restore it naturally.",
    };
  }

  const coreIndex = organism.cells.findIndex((cell) => cell.alive);
  const stableCoreIndex =
    coreIndex >= 0 ? coreIndex : CENTER * GRID + CENTER;
  const core = organism.cells[stableCoreIndex];
  core.alive = true;
  core.energy = Math.max(core.energy, 0.82);
  core.health = Math.max(core.health, 0.78);
  const nextUse = organism.pulseCapsulesUsed + 1;
  const scarId = `scar-${organism.lineage}-${nextUse}`;
  const scaffoldUntilAgeMinutes = organism.ageMinutes + 12 * 60;
  const targets = [
    ...neighborMap[stableCoreIndex],
    ...seedNeighborOrder(organism),
  ].filter(
    (index, position, list) =>
      !organism.cells[index].alive && list.indexOf(index) === position,
  );
  targets.slice(0, 3).forEach((index, offset) => {
    const cell = organism.cells[index];
    cell.alive = true;
    cell.energy = 0.55 - offset * 0.03;
    cell.health = 0.81 - offset * 0.025;
    cell.age = 0;
    cell.phase = core.phase + (offset + 1) * 0.61;
    cell.hue = core.hue + 8 + offset * 2;
    cell.origin = "pulse-scaffold";
    cell.scaffoldUntilAgeMinutes = scaffoldUntilAgeMinutes;
    cell.scaffoldNutrients = 0;
    cell.scaffoldScarId = scarId;
    organism.births += 1;
  });
  organism.pulseCapsules -= 1;
  organism.pulseCapsulesUsed += 1;
  organism.revivalProtectionUntilAgeMinutes = scaffoldUntilAgeMinutes;
  const scar: RevivalScar = {
    id: scarId,
    at: Date.now(),
    generation: organism.lineage,
    severity: clamp((4 - living) / 4, 0.25, 1),
    hueShift: 8,
  };
  organism.revivalScars.push(scar);
  organism.germination.state = "stable";
  organism.germination.nourishingMeals = 0;
  organism.germination.progress = 0;
  organism.germination.enteredAt = 0;
  organism.germination.lastNourishedAt = 0;
  organism.germination.dormancyDepth = clamp(
    organism.germination.dormancyDepth * 0.35,
  );
  organism.traits.resilience = clamp(
    organism.traits.resilience + 0.008,
    0.08,
    0.96,
  );
  recordEpisode(
    organism,
    "pulse-revival",
    "A Pulse Capsule shocked the failing core into three protected stem buds.",
    {
      livingBefore: living,
      scarId: scar.id,
      protectionHours: 12,
      freeDose: organism.pulseCapsulesUsed === 1,
    },
  );
  organism.lastObservedLiving = livingCells(organism);
  return {
    ok: true,
    message:
      "The capsule became living scaffold—not a reset. A faint cellular scar remains.",
  };
}

function purchasePulseCapsule(organism: Organism): LifecycleActionResult {
  if (organism.pulseCapsules >= MAX_PULSE_CAPSULES_HELD) {
    return {
      ok: false,
      message: "The reserve can safely hold only two Pulse Capsules.",
    };
  }
  if (organism.currency < PULSE_CAPSULE_PRICE) {
    return {
      ok: false,
      message: `Livi needs ${PULSE_CAPSULE_PRICE - organism.currency} more Motes. Natural seed recovery remains available.`,
    };
  }
  recordMoteTransaction(
    organism,
    -PULSE_CAPSULE_PRICE,
    "pulse-purchase",
    `capsule-${organism.pulseCapsulesUsed + organism.pulseCapsules + 1}`,
  );
  organism.pulseCapsules += 1;
  return { ok: true, message: "One Pulse Capsule is held in reserve." };
}

function purchaseLifespanSerum(organism: Organism): LifecycleActionResult {
  const life = lifeStats(organism);
  if (life.naturalProgress < ELDER_THRESHOLD) {
    return {
      ok: false,
      message: "Monthlight appears only when an elder metabolism begins.",
    };
  }
  if (organism.bond < 0.55) {
    return {
      ok: false,
      message:
        "Monthlight appears only after a deeply bonded elder life (55% bond).",
    };
  }
  if (
    organism.lifespanSerumsUsed + organism.lifespanSerums >=
    MAX_LIFESPAN_SERUM_USES
  ) {
    return {
      ok: false,
      message: "This generation has reached its two-serum lifetime limit.",
    };
  }
  if (organism.currency < LIFESPAN_SERUM_PRICE) {
    return {
      ok: false,
      message: `Livi needs ${LIFESPAN_SERUM_PRICE - organism.currency} more earned Motes.`,
    };
  }
  let doseId = crypto.randomUUID();
  while (organism.serumDoseRecords.some(({ id }) => id === doseId)) {
    doseId = crypto.randomUUID();
  }
  recordMoteTransaction(
    organism,
    -LIFESPAN_SERUM_PRICE,
    "serum-purchase",
    doseId,
    `serum-purchase:${doseId}`,
  );
  organism.serumDoseRecords.push({
    id: doseId,
    generation: organism.lineage,
    generationId: organism.generationId,
    purchasedAt: Date.now(),
    usedAt: null,
    voidedAt: null,
    moteCost: LIFESPAN_SERUM_PRICE,
    acquisition: "purchased",
    parentDoseId: undefined,
  });
  reconcileSerumLedger(organism);
  return {
    ok: true,
    message: "A rare Monthlight Serum is ready for Livi's elder phase.",
  };
}

function administerMonthlightSerum(
  organism: Organism,
): LifecycleActionResult {
  const life = lifeStats(organism);
  if (organism.lifespanSerums < 1) {
    return { ok: false, message: "No Monthlight Serum is available." };
  }
  if (organism.lifespanSerumsUsed >= MAX_LIFESPAN_SERUM_USES) {
    return {
      ok: false,
      message: "This generation has reached its natural extension limit.",
    };
  }
  if (life.naturalProgress < ELDER_THRESHOLD) {
    return {
      ok: false,
      message: "Monthlight only binds to an elder metabolism.",
    };
  }
  if (life.progress >= 1) {
    return {
      ok: false,
      message: "The natural span has already closed; this seed carries legacy now.",
    };
  }
  const heldDose = organism.serumDoseRecords.find(
    (dose) =>
      dose.generationId === organism.generationId && dose.usedAt === null,
  );
  if (!heldDose) {
    reconcileSerumLedger(organism);
    return { ok: false, message: "No intact Monthlight dose is available." };
  }
  heldDose.usedAt = Date.now();
  reconcileSerumLedger(organism);
  recordEpisode(
    organism,
    "lifespan-extension",
    "Monthlight slowed cellular senescence, adding thirty lived days.",
    {
      dose: organism.lifespanSerumsUsed,
      addedDays: LIFESPAN_SERUM_DAYS,
      totalExtensionDays: organism.lifespanExtensionDays,
    },
  );
  return {
    ok: true,
    message: "Thirty days joined this life. Its eventual ending still remains.",
  };
}

function hatchLegacyGeneration(organism: Organism): LifecycleActionResult {
  const life = lifeStats(organism);
  if (life.progress < 1 || livingCells(organism) > 1) {
    return {
      ok: false,
      message:
        life.progress < 1
          ? "This generation is still alive; its legacy seed is not ready."
          : "Its last elder cells are still completing their natural life.",
    };
  }

  const endedAt = Date.now();
  const oldGeneration = organism.lineage;
  const oldGenerationId = organism.generationId;
  const carriedSerums = organism.serumDoseRecords.filter(
    (dose) =>
      dose.generationId === oldGenerationId &&
      dose.usedAt === null &&
      !dose.voidedAt,
  );
  const nextSeed =
    (Math.imul(organism.seed ^ oldGeneration, 1664525) + 1013904223) >>>
    0;
  const successorGenerationId = `gen-${oldGeneration + 1}-${nextSeed}-${hashString(oldGenerationId)}`;
  const legacyMemory = recordEpisode(
    organism,
    "legacy",
    `Generation ${oldGeneration} folded its bond into a living seed.`,
    {
      livedDays: Math.floor(organism.ageMinutes / 1440),
      bond: Number(organism.bond.toFixed(4)),
      achievements: organism.achievements.length,
    },
    "legacy",
    endedAt,
  );
  organism.legacyRecords.push({
    generationId: oldGenerationId,
    parentGenerationId: organism.parentGenerationId,
    successorGenerationId,
    generation: oldGeneration,
    seed: organism.seed,
    phenotype: phenotypeName(organism.traits, organism.seed),
    endedAt,
    livedDays: organism.ageMinutes / 1440,
    bond: organism.bond,
    trust: organism.trust,
    achievements: [...organism.achievements],
    memoryIds: organism.episodicMemories
      .filter((memory) => memory.generation === oldGeneration)
      .map((memory) => memory.id),
    bornAt: organism.generationStartedAt,
    traits: { ...organism.traits },
    traitsAtBirth: { ...organism.generationBirthTraits },
    traitsAtDeath: { ...organism.traits },
    peakBond: organism.peakBond,
    peakTrust: organism.peakTrust,
    terminalCause: "natural-senescence",
    serumUses: organism.lifespanSerumsUsed,
  });

  const inherited = createOrganism(nextSeed);
  const random = mulberry32(nextSeed ^ 0x1e6ac7);
  (Object.keys(organism.traits) as (keyof Traits)[]).forEach((trait) => {
    inherited.traits[trait] = clamp(
      organism.traits[trait] * 0.88 +
        inherited.traits[trait] * 0.12 +
        (random() - 0.5) * 0.025,
      0.08,
      0.96,
    );
  });

  organism.seed = nextSeed;
  organism.cells = inherited.cells;
  organism.cells.forEach((cell, index) => {
    const isSeed = index === CENTER * GRID + CENTER;
    cell.alive = isSeed;
    cell.energy = isSeed ? 0.86 : 0;
    cell.health = isSeed ? 0.94 : 0;
    cell.age = 0;
  });
  organism.traits = inherited.traits;
  organism.generationBirthTraits = { ...inherited.traits };
  organism.bond = clamp(organism.bond * 0.72);
  organism.trust = clamp(organism.trust * 0.76);
  organism.peakBond = organism.bond;
  organism.peakTrust = organism.trust;
  organism.joy = 0.56;
  organism.ageMinutes = 0;
  organism.meals = 0;
  organism.touches = 0;
  organism.births = 0;
  organism.lineage = oldGeneration + 1;
  organism.parentGenerationId = oldGenerationId;
  organism.generationId = successorGenerationId;
  organism.naturalLifespanDays = Math.round(
    120 + organism.traits.resilience * 180,
  );
  carriedSerums.forEach((dose) => {
    dose.voidedAt = endedAt;
    organism.serumDoseRecords.push({
      ...dose,
      id: `${dose.id}:carried:${successorGenerationId}`,
      generation: organism.lineage,
      generationId: organism.generationId,
      purchasedAt: endedAt,
      voidedAt: null,
      moteCost: 0,
      acquisition: "inherited",
      parentDoseId: dose.id,
    });
  });
  organism.lastSeen = endedAt;
  organism.lastCare = endedAt;
  organism.playCount = 0;
  organism.lastPlayRewardAt = 0;
  organism.germination = {
    state: "dire",
    nourishingMeals: 0,
    progress: 0,
    enteredAt: 0,
    lastNourishedAt: 0,
    naturalRecoveries: 0,
    dormancyDepth: 0.08,
  };
  organism.revivalProtectionUntilAgeMinutes = 0;
  reconcileSerumLedger(organism, endedAt);
  organism.terminalSenescenceStarted = false;
  organism.generationStartedAt = endedAt;
  organism.lastObservedLiving = livingCells(organism);
  organism.rememberedMilestones = [];
  recordEpisode(
    organism,
    "legacy",
    `Generation ${organism.lineage} hatched already knowing the shape of your care.`,
    {
      inheritedFrom: oldGeneration,
      retainedBondPercent: 72,
      legacyMemoryId: legacyMemory.id,
    },
    "legacy",
    endedAt + 1,
  );
  return {
    ok: true,
    message: `Generation ${organism.lineage} hatched. The body is new; the relationship is not.`,
  };
}

function simulateElapsed(
  organism: Organism,
  elapsedMinutes: number,
  observedAt = Date.now(),
  rememberedElapsedMinutes = elapsedMinutes,
) {
  const beforeLiving = livingCells(organism);
  if (lifeStats(organism).naturalProgress >= 0.92) {
    organism.terminalSenescenceStarted = true;
  }
  const scaffoldScarIds = [
    ...new Set(
      organism.cells
        .filter((cell) => cell.alive && cell.origin === "pulse-scaffold")
        .map((cell) => cell.scaffoldScarId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const absoluteMinuteBucket = Math.floor(
    Math.max(organism.lastSeen, 0) / 60_000,
  );
  const offlineRandom = mulberry32(
    (organism.seed ^
      Math.floor(organism.ageMinutes) ^
      absoluteMinuteBucket) >>>
      0,
  );
  const protectedSeedIndex =
    beforeLiving <= 1 || organism.terminalSenescenceStarted
      ? organism.cells
          .map((cell, index) => ({ cell, index }))
          .filter(({ cell }) => cell.alive)
          .sort(
            (left, right) =>
              Math.abs((left.index % GRID) - CENTER) +
                Math.abs(Math.floor(left.index / GRID) - CENTER) -
              (Math.abs((right.index % GRID) - CENTER) +
                Math.abs(Math.floor(right.index / GRID) - CENTER)),
          )[0]?.index ?? -1
      : -1;
  const elapsedHours = Math.max(0, elapsedMinutes / 60);
  const drain = elapsedHours * (0.009 + organism.traits.appetite * 0.004);
  organism.cells.forEach((cell, index) => {
    if (!cell.alive) return;
    const scaffoldProtectionHours =
      cell.origin === "pulse-scaffold"
        ? Math.max(
            0,
            ((cell.scaffoldUntilAgeMinutes ?? 0) - organism.ageMinutes) / 60,
          )
        : 0;
    const exposedHours = Math.max(
      0,
      elapsedHours - scaffoldProtectionHours,
    );
    const oldEnergy = cell.energy;
    cell.energy = clamp(cell.energy - drain);
    const deficit = Math.max(0, drain - oldEnergy);
    cell.health = clamp(
      cell.health - deficit * (1.15 - organism.traits.resilience * 0.45),
    );
    if (
      cell.health < 0.08 &&
      index !== protectedSeedIndex &&
      exposedHours > 0 &&
      offlineRandom() < clamp(exposedHours / 72, 0, 0.72)
    ) {
      cell.alive = false;
      cell.energy = 0;
      cell.health = 0;
    }
  });

  organism.joy = clamp(organism.joy - elapsedHours * 0.006);
  organism.ageMinutes += elapsedMinutes;
  const life = lifeStats(organism);
  if (life.progress > 0.78) {
    const ageDrain =
      elapsedHours * (life.progress >= 1 ? 0.012 : (life.progress - 0.78) * 0.018);
    organism.cells.forEach((cell, index) => {
      if (cell.alive && index !== protectedSeedIndex) {
        cell.health = clamp(cell.health - ageDrain);
      }
    });
  }
  if (organism.terminalSenescenceStarted) {
    organism.cells.forEach((cell, index) => {
      if (cell.alive && index !== protectedSeedIndex) {
        cell.health = clamp(cell.health - elapsedHours * 0.022);
        if (cell.health <= 0.02) {
          cell.alive = false;
          cell.energy = 0;
          cell.health = 0;
        }
      }
    });
  }

  if (livingCells(organism) === 0) {
    const core = organism.cells[CENTER * GRID + CENTER];
    core.alive = true;
    core.energy = Math.max(core.energy, 0.01);
    core.health = Math.max(core.health, 0.03);
    organism.germination.state = "dire";
    organism.germination.dormancyDepth = 1;
    recordEpisode(
      organism,
      "collapse",
      "A damaged history reopened as a deeply dormant seed.",
      { provenance: "zero-cell-repair" },
      "important",
      observedAt,
    );
  }
  advanceDormancyForElapsed(organism, elapsedMinutes);
  if (livingCells(organism) === 1 && life.progress < 1) {
    advanceSeedGermination(
      organism,
      Math.min(0.9, elapsedMinutes * 0.004),
      Math.max(organism.lastSeen, 0) + elapsedMinutes * 60_000,
    );
  }
  const rememberedHours = rememberedElapsedMinutes / 60;
  if (rememberedHours >= 24) {
    recordEpisode(
      organism,
      "long-absence",
      `It remembers waiting through ${Math.floor(rememberedHours / 24)} quiet days.`,
      {
        absentHours: Math.round(rememberedHours),
        biologySimulatedHours: Math.round(elapsedHours),
        cellsBefore: beforeLiving,
        cellsAfter: livingCells(organism),
      },
      "important",
      observedAt,
    );
  }
  observeBodyState(organism, beforeLiving);
  observePulseScaffoldOutcomes(organism, scaffoldScarIds);
  organism.lastSeen = observedAt;
  return organism;
}

function applyOfflineLife(
  organism: Organism,
  observedAt = Date.now(),
  authoritativeLastSeen?: number,
) {
  if (Number.isFinite(authoritativeLastSeen)) {
    organism.lastSeen = authoritativeLastSeen!;
  }
  const actualElapsedMinutes = Math.floor(
    Math.max(0, observedAt - (organism.lastSeen || observedAt)) / 60_000,
  );
  const elapsedMinutes = Math.min(
    actualElapsedMinutes,
    365 * 24 * 60,
  );
  if (actualElapsedMinutes < 1.2) return organism;

  return simulateElapsed(
    organism,
    elapsedMinutes,
    observedAt,
    actualElapsedMinutes,
  );
}

function loadOrganism() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createOrganism();
    return normalizeSavedOrganism(JSON.parse(raw));
  } catch {
    return createOrganism();
  }
}

function parseSavedOrganism(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("cells" in value) ||
    !Array.isArray(value.cells)
  ) {
    throw new Error("This file is not a compatible LIVI organism.");
  }
  return hydrateLifeSystems(migrateCellField(value as Organism));
}

function normalizeSavedOrganism(value: unknown) {
  return applyOfflineLife(parseSavedOrganism(value));
}

function preserveMonotonicContinuity(
  target: Organism,
  current: Organism,
) {
  const mergePermanentHistory = (
    active: Organism,
    historical: Organism,
  ) => {
    active.revivalScars = [
      ...new Map(
        [...active.revivalScars, ...historical.revivalScars].map((scar) => [
          scar.id,
          scar,
        ]),
      ).values(),
    ];
    active.episodicMemories = [
      ...new Map(
        [...active.episodicMemories, ...historical.episodicMemories].map(
          (memory) => [memory.id, memory],
        ),
      ).values(),
    ].sort((left, right) => left.at - right.at);
    active.routineMemories = compactRoutineMemories([
      ...active.routineMemories,
      ...historical.routineMemories,
    ]);
    active.achievements = [
      ...new Set([...active.achievements, ...historical.achievements]),
    ];
    active.legacyRecords = [
      ...new Map(
        [...historical.legacyRecords, ...active.legacyRecords].map((record) => [
          record.generationId,
          record,
        ]),
      ).values(),
    ].sort((left, right) => left.generation - right.generation);
    const serumRecords = new Map<string, SerumDoseRecord>();
    for (const dose of [
      ...active.serumDoseRecords,
      ...historical.serumDoseRecords,
    ]) {
      const existing = serumRecords.get(dose.id);
      serumRecords.set(dose.id, existing
        ? {
            ...existing,
            usedAt: existing.usedAt ?? dose.usedAt,
            voidedAt: existing.voidedAt ?? dose.voidedAt,
            purchasedAt: Math.min(existing.purchasedAt, dose.purchasedAt),
          }
        : dose);
    }
    active.serumDoseRecords = [...serumRecords.values()];
    active.moteTransactions = [
      ...new Map(
        [
          ...historical.moteTransactions,
          ...active.moteTransactions,
        ].map((entry) => [entry.id, entry]),
      ).values(),
    ];
    active.memorySequence = Math.max(
      active.memorySequence,
      historical.memorySequence,
      active.episodicMemories.length,
    );
    reconcileSerumLedger(active);
    reconcileMoteLedger(active);
    return active;
  };

  if (target.generationId !== current.generationId) {
    const descendsFrom = (candidate: Organism, ancestorId: string) => {
      let cursor: string | null = candidate.parentGenerationId;
      const visited = new Set<string>();
      while (cursor && !visited.has(cursor)) {
        if (cursor === ancestorId) return true;
        visited.add(cursor);
        cursor =
          candidate.legacyRecords.find(
            ({ generationId }) => generationId === cursor,
          )?.parentGenerationId ?? null;
      }
      return false;
    };
    const targetCanReplace =
      target.lineage > current.lineage &&
      descendsFrom(target, current.generationId);
    const active = structuredClone(
      targetCanReplace ? target : current,
    );
    const historical = targetCanReplace ? current : target;
    return mergePermanentHistory(active, historical);
  }

  const priorPulseUses = target.pulseCapsulesUsed;
  target.pulseCapsulesUsed = Math.max(
    target.pulseCapsulesUsed,
    current.pulseCapsulesUsed,
  );
  if (target.pulseCapsulesUsed > priorPulseUses) {
    target.pulseCapsules = Math.min(
      target.pulseCapsules,
      current.pulseCapsules,
    );
  }
  target = mergePermanentHistory(target, current);
  target.terminalSenescenceStarted =
    target.terminalSenescenceStarted ||
    current.terminalSenescenceStarted;
  target.ownedItems = [
    ...new Set([...target.ownedItems, ...current.ownedItems]),
  ];
  target.equippedRoom = current.equippedRoom;
  target.equippedToy = current.equippedToy;
  target.lastFeederAt = Math.max(target.lastFeederAt, current.lastFeederAt);
  target.bond = Math.max(target.bond, current.bond);
  target.trust = Math.max(target.trust, current.trust);
  return target;
}

function cloudMetaKey(ownerId: string) {
  return `${CLOUD_SYNC_META_KEY}:${ownerId}`;
}

function ownerSlotKey(ownerId: string) {
  return `livi-organism-owner:${ownerId}`;
}

const LOCAL_SAVE_DB = "livi-local-first";
const LOCAL_SAVE_STORE = "organisms";

function openLocalSaveDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LOCAL_SAVE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LOCAL_SAVE_STORE)) {
        request.result.createObjectStore(LOCAL_SAVE_STORE, {
          keyPath: "ownerId",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeIndexedLocalOrganism(ownerId: string, serialized: string) {
  const database = await openLocalSaveDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LOCAL_SAVE_STORE, "readwrite");
      transaction.objectStore(LOCAL_SAVE_STORE).put({
        ownerId,
        serialized,
        updatedAt: Date.now(),
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function readIndexedLocalOrganism(ownerId: string) {
  const database = await openLocalSaveDatabase();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const request = database
        .transaction(LOCAL_SAVE_STORE, "readonly")
        .objectStore(LOCAL_SAVE_STORE)
        .get(ownerId);
      request.onsuccess = () =>
        resolve(
          typeof request.result?.serialized === "string"
            ? request.result.serialized
            : null,
        );
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

function persistLocalOrganism(organism: Organism, ownerId: string) {
  if (
    typeof document === "undefined" ||
    document.visibilityState !== "hidden"
  ) {
    organism.lastSeen = Date.now();
  }
  const serialized = JSON.stringify(organism);
  void writeIndexedLocalOrganism(ownerId, serialized);
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    localStorage.setItem(ownerSlotKey(ownerId), serialized);
  } catch {
    // IndexedDB remains the durable local-first source when mobile browser
    // localStorage quota is exhausted.
  }
}

function cloudSafeOrganism(organism: Organism) {
  const safe = structuredClone(organism);
  safe.lastCare = Math.floor(safe.lastCare / 3_600_000) * 3_600_000;
  safe.routineMemories = safe.routineMemories.map((routine) => {
    const daySummaryAt = Date.parse(`${routine.day}T12:00:00Z`);
    return {
      ...routine,
      firstCareAt: daySummaryAt,
      lastCareAt: daySummaryAt,
      actionLog: routine.actionLog.map((event) => ({
        ...event,
        at: daySummaryAt,
      })),
    };
  });
  return safe;
}

function loadLocalCloudMeta(ownerId: string): LocalCloudMeta {
  try {
    const raw = localStorage.getItem(cloudMetaKey(ownerId));
    if (!raw) throw new Error("No metadata");
    const parsed = JSON.parse(raw) as Partial<LocalCloudMeta>;
    if (parsed.ownerId !== ownerId) throw new Error("Wrong account");
    return {
      ownerId,
      headRevisionId:
        typeof parsed.headRevisionId === "string"
          ? parsed.headRevisionId
          : null,
      lastSyncedChecksum:
        typeof parsed.lastSyncedChecksum === "string"
          ? parsed.lastSyncedChecksum
          : null,
      lastSyncedAt:
        typeof parsed.lastSyncedAt === "number" ? parsed.lastSyncedAt : null,
      syncedMemoryIds: Array.isArray(parsed.syncedMemoryIds)
        ? parsed.syncedMemoryIds.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
      routineFingerprints:
        parsed.routineFingerprints &&
        typeof parsed.routineFingerprints === "object"
          ? (parsed.routineFingerprints as Record<string, string>)
          : {},
      routineSummaryIds:
        parsed.routineSummaryIds &&
        typeof parsed.routineSummaryIds === "object"
          ? (parsed.routineSummaryIds as Record<string, string>)
          : {},
      pendingRevision:
        parsed.pendingRevision &&
        typeof parsed.pendingRevision.revisionId === "string" &&
        typeof parsed.pendingRevision.clientRevisionId === "string"
          ? parsed.pendingRevision
          : undefined,
    };
  } catch {
    return {
      ownerId,
      headRevisionId: null,
      lastSyncedChecksum: null,
      lastSyncedAt: null,
      syncedMemoryIds: [],
      routineFingerprints: {},
      routineSummaryIds: {},
    };
  }
}

function writeLocalCloudMeta(meta: LocalCloudMeta) {
  localStorage.setItem(cloudMetaKey(meta.ownerId), JSON.stringify(meta));
}

function preserveLocalRestorePoint(organism: Organism, reason: string) {
  try {
    const raw = localStorage.getItem(LOCAL_RESTORE_HISTORY_KEY);
    const prior = raw
      ? (JSON.parse(raw) as { savedAt: number; reason: string; organism: Organism }[])
      : [];
    localStorage.setItem(
      LOCAL_RESTORE_HISTORY_KEY,
      JSON.stringify(
        [
          {
            savedAt: Date.now(),
            reason,
            organism: structuredClone(organism),
          },
          ...prior,
        ].slice(0, 3),
      ),
    );
  } catch {
    // A session checkpoint still protects the pre-import organism if storage
    // quota is unusually constrained.
  }
}

function cloudDeviceLabel() {
  if (typeof navigator === "undefined") return "LIVI device";
  const agent = navigator.userAgent;
  if (/iPhone/u.test(agent)) return "iPhone Safari";
  if (/iPad/u.test(agent)) return "iPad Safari";
  if (/Android/u.test(agent)) return "Android Chrome";
  return "Web companion";
}

function cloudMilestoneType(organism: Organism) {
  return organism.episodicMemories.at(-1)?.kind ?? null;
}

async function stableClientUuid(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`LIVI:${value}`),
    ),
  );
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function metabolize(organism: Organism, movementCost: number) {
  const beforeLiving = livingCells(organism);
  if (lifeStats(organism).naturalProgress >= 0.92) {
    organism.terminalSenescenceStarted = true;
  }
  const scaffoldScarIds = [
    ...new Set(
      organism.cells
        .filter((cell) => cell.alive && cell.origin === "pulse-scaffold")
        .map((cell) => cell.scaffoldScarId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const protectedSeedIndex =
    beforeLiving <= 1 || organism.terminalSenescenceStarted
      ? organism.cells
          .map((cell, index) => ({ cell, index }))
          .filter(({ cell }) => cell.alive)
          .sort(
            (left, right) =>
              Math.abs((left.index % GRID) - CENTER) +
                Math.abs(Math.floor(left.index / GRID) - CENTER) -
              (Math.abs((right.index % GRID) - CENTER) +
                Math.abs(Math.floor(right.index / GRID) - CENTER)),
          )[0]?.index ?? -1
      : -1;
  const { living, energy: meanEnergy } = averages(organism);
  const nextEnergy = organism.cells.map((cell, index) => {
    if (!cell.alive) return 0;
    const livingNeighbors = neighborMap[index]
      .map((neighbor) => organism.cells[neighbor])
      .filter((neighbor) => neighbor.alive);
    const neighborAverage = livingNeighbors.length
      ? livingNeighbors.reduce((sum, neighbor) => sum + neighbor.energy, 0) /
        livingNeighbors.length
      : cell.energy;
    const diffusion = (neighborAverage - cell.energy) * 0.12;
    const metabolism =
      0.00115 +
      organism.traits.appetite * 0.00055 +
      movementCost * 0.0007;
    return clamp(cell.energy + diffusion - metabolism);
  });

  organism.cells.forEach((cell, index) => {
    if (!cell.alive) return;
    cell.energy = nextEnergy[index];
    cell.age += 0.8;
    if (organism.terminalSenescenceStarted) {
      // Terminal tissue can be comforted and fed, but cannot repair faster
      // than senescence. One lineage seed is preserved below.
    } else if (cell.energy > 0.42) {
      cell.health = clamp(
        cell.health +
          0.0022 * (0.6 + organism.traits.resilience) +
          (organism.ownedItems.includes("soft-nest") ? 0.00045 : 0),
      );
    } else {
      cell.health = clamp(
        cell.health -
          (0.0032 + (0.42 - cell.energy) * 0.011) *
            (1.16 - organism.traits.resilience * 0.42),
      );
    }
    const scaffoldProtected =
      cell.origin === "pulse-scaffold" &&
      organism.ageMinutes < (cell.scaffoldUntilAgeMinutes ?? 0);
    if (
      cell.origin === "pulse-scaffold" &&
      !scaffoldProtected &&
      (cell.scaffoldNutrients ?? 0) < 1.15
    ) {
      cell.health = clamp(cell.health - 0.006);
    }
    if (
      cell.health < 0.035 &&
      index !== protectedSeedIndex &&
      !scaffoldProtected &&
      Math.random() < 0.12
    ) {
      cell.alive = false;
      cell.energy = 0;
      cell.health = 0;
    }
  });

  if (
    !organism.terminalSenescenceStarted &&
    meanEnergy > 0.67 &&
    living < MAX_LIVING
  ) {
    const candidates: { empty: number; parent: number }[] = [];
    organism.cells.forEach((cell, index) => {
      if (cell.alive) return;
      const parents = neighborMap[index].filter(
        (neighbor) =>
          organism.cells[neighbor].alive &&
          organism.cells[neighbor].energy > 0.72 &&
          organism.cells[neighbor].health > 0.68,
      );
      if (parents.length >= 2) {
        const parent = parents.sort(
          (a, b) =>
            organism.cells[b].energy - organism.cells[a].energy,
        )[0];
        candidates.push({ empty: index, parent });
      }
    });

    const birthsThisTick = Math.min(
      candidates.length,
      meanEnergy > 0.84 ? 3 : 1,
    );
    for (let birth = 0; birth < birthsThisTick; birth += 1) {
      if (Math.random() > 0.25 + organism.traits.growthBias * 0.35) break;
      const pick = candidates.splice(
        Math.floor(Math.random() * candidates.length),
        1,
      )[0];
      if (!pick) break;
      const parent = organism.cells[pick.parent];
      const newborn = organism.cells[pick.empty];
      newborn.alive = true;
      newborn.energy = 0.4;
      newborn.health = 0.72;
      newborn.age = 0;
      newborn.hue = parent.hue + (Math.random() - 0.5) * 5;
      newborn.phase = parent.phase + (Math.random() - 0.5);
      parent.energy = clamp(parent.energy - 0.15);
      organism.births += 1;

      if (Math.random() < 0.045) {
        const traitKeys = Object.keys(organism.traits) as (keyof Traits)[];
        const trait = traitKeys[Math.floor(Math.random() * traitKeys.length)];
        const before = organism.traits[trait];
        organism.traits[trait] = clamp(
          organism.traits[trait] + (Math.random() - 0.5) * 0.035,
          0.08,
          0.96,
        );
        recordEpisode(
          organism,
          "mutation",
          `A dividing edge cell altered ${traitLabel(trait).toLowerCase()}.`,
          {
            trait,
            before: Number(before.toFixed(4)),
            after: Number(organism.traits[trait].toFixed(4)),
          },
        );
      }
    }
  }

  if (livingCells(organism) === 0) {
    const core = organism.cells[CENTER * GRID + CENTER];
    core.alive = true;
    core.energy = Math.max(core.energy, 0.01);
    core.health = Math.max(core.health, 0.03);
    organism.germination.state = "dire";
    organism.germination.dormancyDepth = 1;
    recordEpisode(
      organism,
      "collapse",
      "A damaged body condensed into a deeply dormant seed.",
      { provenance: "zero-cell-repair" },
    );
  }

  organism.ageMinutes += 0.8 / 60;
  const life = lifeStats(organism);
  advanceDormancyForElapsed(organism, 0.8 / 60);
  if (life.progress > 0.78) {
    const ageDrain =
      life.progress >= 1 ? 0.0018 : (life.progress - 0.78) * 0.0022;
    organism.cells.forEach((cell, index) => {
      if (!cell.alive || index === CENTER * GRID + CENTER) return;
      cell.health = clamp(cell.health - ageDrain);
    });
  }
  if (organism.terminalSenescenceStarted) {
    organism.cells.forEach((cell, index) => {
      if (cell.alive && index !== protectedSeedIndex) {
        cell.health = clamp(cell.health - 0.0032);
        if (cell.health <= 0.02) {
          cell.alive = false;
          cell.energy = 0;
          cell.health = 0;
        }
      }
    });
  }
  advanceSeedGermination(organism);
  observeBodyState(organism, beforeLiving);
  observePulseScaffoldOutcomes(organism, scaffoldScarIds);
  organism.joy = clamp(organism.joy - 0.00025);
  organism.lastSeen = Date.now();
}

function traitLabel(key: keyof Traits) {
  const labels: Record<keyof Traits, string> = {
    curiosity: "Curiosity",
    sociability: "Sociability",
    appetite: "Appetite",
    resilience: "Resilience",
    playfulness: "Playfulness",
    growthBias: "Growth drive",
    locomotion: "Locomotion",
  };
  return labels[key];
}

function favoriteKey(counts: Record<string, number>) {
  return Object.entries(counts).sort(
    ([leftKey, leftCount], [rightKey, rightCount]) =>
      rightCount - leftCount || leftKey.localeCompare(rightKey),
  )[0]?.[0];
}

function memoryPresentation(memory: EpisodicMemory): Pick<
  MemoryEpisode,
  "kind" | "title" | "valence"
> {
  switch (memory.kind) {
    case "long-absence":
      return {
        kind: "absence",
        title: "The quiet stretch",
        valence: "quiet",
      };
    case "near-death":
      return {
        kind: "near-death",
        title: "The body almost went dark",
        valence: "difficult",
      };
    case "collapse":
      return {
        kind: "collapse",
        title: "The great collapse",
        valence: "difficult",
      };
    case "natural-recovery":
      return {
        kind: "revival",
        title: "The lone seed budded",
        valence: "transformative",
      };
    case "pulse-revival":
      return {
        kind: "revival",
        title: "The Pulse scar",
        valence: "transformative",
      };
    case "major-bloom":
      return { kind: "bloom", title: "A major bloom", valence: "warm" };
    case "mutation":
      return {
        kind: "mutation",
        title: "A trait turned",
        valence: "transformative",
      };
    case "legacy":
      return {
        kind: "legacy",
        title: "The bond crossed generations",
        valence: "transformative",
      };
    case "lifespan-extension":
      return {
        kind: "bond",
        title: "Thirty more days of becoming",
        valence: "warm",
      };
  }
}

function findNearestFoodIndex(
  foods: FoodDrop[],
  position: { x: number; y: number },
  width: number,
  height: number,
) {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  foods.forEach((food, index) => {
    const distance = Math.hypot(
      (food.x - position.x) * width,
      (food.y - position.y) * height,
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

// Intentionally small pure test surface. Production UI still owns all mutation,
// while invariant tests can exercise lifecycle rules without canvas, storage, or
// a browser clock/frame loop.
export const __liviTest = {
  constants: {
    grid: GRID,
    center: CENTER,
    seedMealsRequired: SEED_MEALS_REQUIRED,
    seedAssimilationMs: SEED_ASSIMILATION_MS,
    seedPrimingDecayMs: SEED_PRIMING_DECAY_MS,
    pulseCapsulePrice: PULSE_CAPSULE_PRICE,
    lifespanSerumPrice: LIFESPAN_SERUM_PRICE,
    lifespanSerumDays: LIFESPAN_SERUM_DAYS,
    maxLifespanSerumUses: MAX_LIFESPAN_SERUM_USES,
    elderThreshold: ELDER_THRESHOLD,
  },
  createOrganism,
  hydrateLifeSystems,
  livingCells,
  lifeStats,
  makeSnapshot,
  nourishSeedCore,
  nourishPulseScaffolds,
  advanceSeedGermination,
  advanceDormancyForElapsed,
  metabolize,
  simulateElapsed,
  activatePulseCapsule,
  purchasePulseCapsule,
  purchaseLifespanSerum,
  administerMonthlightSerum,
  hatchLegacyGeneration,
  recordRoutine,
  compactRoutineMemories,
  preserveMonotonicContinuity,
};

export default function LiviCompanion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const organismRef = useRef<Organism>(createOrganism(83017));
  const foodRef = useRef<FoodDrop[]>([]);
  const heartsRef = useRef<Heart[]>([]);
  const positionRef = useRef({
    x: 0.5,
    y: 0.59,
    vx: 0,
    vy: 0,
    targetX: 0.5,
    targetY: 0.59,
    nextWander: 0,
  });
  const behaviorRef = useRef("Waking");
  const pettingRef = useRef(false);
  const lastPetRef = useRef(0);
  const foodIdRef = useRef(1);
  const heartIdRef = useRef(1);
  const frameRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const checkpointRef = useRef<Organism | null>(null);
  const labOrganismRef = useRef<Organism | null>(null);
  const [ready, setReady] = useState(false);
  const [welcomed, setWelcomed] = useState(true);
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    makeSnapshot(createOrganism(83017)),
  );
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraMessage, setCameraMessage] = useState("");
  const [inspectOpen, setInspectOpen] = useState(false);
  const [lifeHubOpen, setLifeHubOpen] = useState(false);
  const [hubTab, setHubTab] = useState<HubTab>("commons");
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState("A small life is stirring.");
  const [cloudUser, setCloudUser] = useState<CloudUserState | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState("");
  const [cloudSyncStatus, setCloudSyncStatus] =
    useState<SyncStatus>("local");
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(null);
  const [cloudSaveHistory, setCloudSaveHistory] = useState<
    SaveHistoryEntry[]
  >([]);
  const [cloudHistoryHasMore, setCloudHistoryHasMore] = useState(false);
  const [cloudConflictSnapshots, setCloudConflictSnapshots] = useState<
    SyncConflictSnapshot[]
  >([]);
  const [cloudLocked, setCloudLocked] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [cloudAccountMetadata, setCloudAccountMetadata] =
    useState<CloudAccountMetadata | null>(null);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [commonsProfiles, setCommonsProfiles] = useState<CommonsProfile[]>([]);
  const [friendships, setFriendships] = useState<CommonsFriendship[]>([]);
  const [ownProfileId, setOwnProfileId] = useState<number | null>(null);
  const [checkpointAvailable, setCheckpointAvailable] = useState(false);
  const cloudKeyRef = useRef<CryptoKey | null>(null);
  const cloudDeviceIdRef = useRef<string | null>(null);
  const cloudMetaRef = useRef<LocalCloudMeta | null>(null);
  const cloudConflictRef = useRef<CloudConflictState | null>(null);
  const cloudQueueRef = useRef<Promise<void>>(Promise.resolve());
  const cloudHistoryLimitRef = useRef(60);
  const continuityOperationRef = useRef(false);
  const cloudAuthInProgressRef = useRef(false);
  const hadLocalSaveRef = useRef(false);
  const localOwnerRef = useRef("anonymous");

  useEffect(() => {
    const pendingRecoveryCode = sessionStorage.getItem(
      RECOVERY_CODE_SESSION_KEY,
    );
    if (pendingRecoveryCode) setRecoveryCode(pendingRecoveryCode);
  }, []);

  const playTone = useCallback(
    (kind: "eat" | "pet" | "play") => {
      if (!soundOn || typeof window === "undefined") return;
      try {
        const AudioContextClass =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextClass) return;
        const context = audioRef.current || new AudioContextClass();
        audioRef.current = context;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        const base = kind === "eat" ? 520 : kind === "pet" ? 670 : 760;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(base, now);
        oscillator.frequency.exponentialRampToValueAtTime(base * 1.32, now + 0.12);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.055, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.26);
      } catch {
        // Sound is optional; life continues if a browser blocks Web Audio.
      }
    },
    [soundOn],
  );

  const refreshCommons = useCallback(async () => {
    if (!cloudConfigured()) return;
    setCloudBusy(true);
    try {
      const cloud = getCloudClient();
      const { data: profiles, error: profileError } = await cloud
        .from("blob_profiles")
        .select(
          "id,slug,display_name,phenotype,life_phase,age_minutes,living_cells,bond,room_id,equipped_toy,achievements,traits,updated_at",
        )
        .eq("visibility", "public")
        .order("updated_at", { ascending: false })
        .limit(24);
      if (profileError) throw profileError;

      const profileIds = (profiles ?? []).map(({ id }) => id);
      const visits =
        profileIds.length > 0
          ? await cloud
              .from("blob_visits")
              .select("host_profile_id")
              .in("host_profile_id", profileIds)
          : { data: [], error: null };
      if (visits.error) throw visits.error;
      const visitCounts = new Map<number, number>();
      (visits.data ?? []).forEach(({ host_profile_id }) => {
        visitCounts.set(
          host_profile_id,
          (visitCounts.get(host_profile_id) ?? 0) + 1,
        );
      });
      setCommonsProfiles(
        (profiles ?? []).map((profile) => ({
          ...profile,
          age_minutes: Number(profile.age_minutes),
          bond: Number(profile.bond),
          traits: (profile.traits ?? {}) as Record<string, number>,
          visitCount: visitCounts.get(profile.id) ?? 0,
        })) as CommonsProfile[],
      );

      const { data: authData } = await cloud.auth.getUser();
      if (!authData.user) {
        setOwnProfileId(null);
        setFriendships([]);
        return;
      }
      const [ownProfile, friendshipRows] = await Promise.all([
        cloud
          .from("blob_profiles")
          .select("id")
          .eq("owner_id", authData.user.id)
          .maybeSingle(),
        cloud
          .from("blob_friendships")
          .select(
            "id,requester_profile_id,addressee_profile_id,status",
          )
          .order("created_at", { ascending: false }),
      ]);
      if (ownProfile.error) throw ownProfile.error;
      if (friendshipRows.error) throw friendshipRows.error;
      setOwnProfileId(ownProfile.data?.id ?? null);
      setFriendships(
        (friendshipRows.data ?? []) as CommonsFriendship[],
      );
    } catch (error) {
      setCloudMessage(
        error instanceof Error ? error.message : "The Commons could not refresh.",
      );
    } finally {
      setCloudBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      hadLocalSaveRef.current = Boolean(localStorage.getItem(STORAGE_KEY));
      localOwnerRef.current =
        localStorage.getItem(LOCAL_ACTIVE_OWNER_KEY) || "anonymous";
      const organism = loadOrganism();
      organismRef.current = organism;
      setSnapshot(makeSnapshot(organism, "Noticing you"));
      setWelcomed(localStorage.getItem(WELCOME_KEY) !== "yes");
      setReady(true);
      void readIndexedLocalOrganism(localOwnerRef.current)
        .then((serialized) => {
          if (!serialized) return;
          const indexed = normalizeSavedOrganism(JSON.parse(serialized));
          if (indexed.lastSeen <= organismRef.current.lastSeen) return;
          const continuous = preserveMonotonicContinuity(
            indexed,
            organismRef.current,
          );
          organismRef.current = continuous;
          setSnapshot(makeSnapshot(continuous, "Memory restored"));
        })
        .catch(() => {
          // Account-free play still starts instantly from the localStorage head.
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const save = () => {
      persistLocalOrganism(organismRef.current, localOwnerRef.current);
    };
    const interval = window.setInterval(save, 5000);
    window.addEventListener("pagehide", save);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [ready]);

  const feedAt = useCallback(
    (x?: number, y?: number) => {
      if (continuityOperationRef.current) return;
      const position = positionRef.current;
      const angle = Math.random() * Math.PI * 2;
      const distance = 0.18 + Math.random() * 0.08;
      foodRef.current.push({
        id: foodIdRef.current++,
        x: clamp(x ?? position.x + Math.cos(angle) * distance, 0.1, 0.9),
        y: clamp(y ?? position.y + Math.sin(angle) * distance * 0.55, 0.22, 0.82),
        nutrition: 0.78 + Math.random() * 0.22,
        phase: Math.random() * Math.PI * 2,
      });
      behaviorRef.current = "Sensing nutrients";
      setToast("Nutrient mote placed. Livi can sense its field.");
      playTone("play");
    },
    [playTone],
  );

  const refreshProgress = useCallback((fallback?: string) => {
    const organism = organismRef.current;
    const changes = evaluateProgress(organism);
    const messages = [
      changes.unlockedAchievements.length
        ? `Badge discovered: ${changes.unlockedAchievements.join(", ")}.`
        : "",
      changes.discoveredFriends.length
        ? `New nearby signal: ${changes.discoveredFriends.join(", ")}.`
        : "",
    ].filter(Boolean);
    if (messages.length) setToast(messages.join(" "));
    else if (fallback) setToast(fallback);
    setSnapshot(makeSnapshot(organism, behaviorRef.current));
  }, []);

  const pet = useCallback(
    (x?: number, y?: number) => {
      if (continuityOperationRef.current) return;
      const now = performance.now();
      if (now - lastPetRef.current < 145) return;
      lastPetRef.current = now;
      const organism = organismRef.current;
      organism.bond = clamp(organism.bond + 0.0065);
      organism.trust = clamp(organism.trust + 0.005);
      organism.joy = clamp(organism.joy + 0.012);
      organism.touches += 1;
      if (organism.touches % 12 === 0) {
        recordMoteTransaction(
          organism,
          1,
          "care",
          "petting",
          `petting:${organism.generationId}:${organism.touches}`,
        );
      }
      organism.lastCare = Date.now();
      recordRoutine(organism, { kind: "pet" }, organism.lastCare);
      behaviorRef.current =
        organism.traits.sociability > 0.58 ? "Leaning into your touch" : "Accepting touch";
      heartsRef.current.push({
        id: heartIdRef.current++,
        x: x ?? positionRef.current.x,
        y: y ?? positionRef.current.y - 0.08,
        born: performance.now(),
      });
      playTone("pet");
      persistLocalOrganism(organism, localOwnerRef.current);
      refreshProgress();
    },
    [playTone, refreshProgress],
  );

  const play = useCallback(() => {
    if (continuityOperationRef.current) return;
    const organism = organismRef.current;
    const now = Date.now();
    const equipped = organism.equippedToy;
    organism.joy = clamp(
      organism.joy + (equipped === "prism-ball" ? 0.1 : 0.065),
    );
    organism.bond = clamp(organism.bond + 0.012);
    if (equipped === "echo-chime") {
      organism.bond = clamp(organism.bond + 0.014);
      organism.trust = clamp(organism.trust + 0.012);
    }
    organism.trust = clamp(organism.trust + 0.006);
    organism.playCount += 1;
    if (now - organism.lastPlayRewardAt >= 60_000) {
      recordMoteTransaction(organism, 3, "care", "play");
      organism.lastPlayRewardAt = now;
    }
    organism.lastCare = Date.now();
    recordRoutine(
      organism,
      { kind: "play", toyId: organism.equippedToy },
      organism.lastCare,
    );
    positionRef.current.targetX = 0.2 + Math.random() * 0.6;
    positionRef.current.targetY = 0.38 + Math.random() * 0.28;
    positionRef.current.nextWander = performance.now() + 2400;
    behaviorRef.current =
      equipped === "echo-chime"
        ? "Listening to the echo chime"
        : equipped === "prism-ball"
          ? "Chasing prism light"
          : "Chasing your light";
    playTone("play");
    persistLocalOrganism(organism, localOwnerRef.current);
    refreshProgress("Play becomes memory—and earns Motes over time.");
  }, [playTone, refreshProgress]);

  const distributeMeal = useCallback(
    (nutrition: number) => {
      const organism = organismRef.current;
      const alive = organism.cells
        .map((cell, index) => ({ cell, index }))
        .filter(({ cell }) => cell.alive)
        .sort(({ index: a }, { index: b }) => {
          const ax = a % GRID;
          const ay = Math.floor(a / GRID);
          const bx = b % GRID;
          const by = Math.floor(b / GRID);
          return (
            Math.hypot(ax - CENTER, ay - CENTER) -
            Math.hypot(bx - CENTER, by - CENTER)
          );
        });
      const share = nutrition * (10 + organism.traits.appetite * 5);
      alive.forEach(({ cell }, rank) => {
        const coreWeight = 0.45 + Math.exp(-rank / Math.max(alive.length * 0.34, 1));
        cell.energy = clamp(cell.energy + (share / Math.max(alive.length, 1)) * coreWeight);
        cell.health = clamp(cell.health + 0.012 * coreWeight);
      });
      const scaffoldRemaining = nourishPulseScaffolds(
        organism,
        nutrition,
      );
      const seedWasNourished = nourishSeedCore(organism);
      organism.meals += 1;
      const mealAt = Date.now();
      const rewardedMeal =
        mealAt - organism.lastMealRewardAt >= 60_000;
      if (rewardedMeal) {
        organism.lastMealRewardAt = mealAt;
        recordMoteTransaction(
          organism,
          2,
          "care",
          "assimilated-meal",
          `meal:${organism.generationId}:${mealAt}`,
        );
      }
      organism.joy = clamp(organism.joy + 0.035);
      organism.trust = clamp(organism.trust + 0.004);
      organism.lastCare = Date.now();
      recordRoutine(organism, { kind: "feed" }, organism.lastCare);
      behaviorRef.current = scaffoldRemaining > 0
        ? `Differentiating ${scaffoldRemaining} Pulse stem cell${scaffoldRemaining === 1 ? "" : "s"}`
        : seedWasNourished
        ? organism.germination.state === "budding"
          ? "Gathering strength to bud"
          : `Priming the lone seed · ${organism.germination.nourishingMeals}/${SEED_MEALS_REQUIRED}`
        : "Digesting";
      playTone("eat");
      persistLocalOrganism(organism, localOwnerRef.current);
      refreshProgress(
        scaffoldRemaining > 0
          ? `${scaffoldRemaining} Pulse scaffold cell${scaffoldRemaining === 1 ? "" : "s"} still need nutrient-supported differentiation.`
          : seedWasNourished
          ? organism.germination.state === "budding"
            ? "The lone core is well-fed. A stem bud is slowly forming."
            : `The surviving core needs ${SEED_MEALS_REQUIRED - organism.germination.nourishingMeals} more nourishing meal${SEED_MEALS_REQUIRED - organism.germination.nourishingMeals === 1 ? "" : "s"} before it can bud.`
          : rewardedMeal
            ? "Nutrients entered the core. +2 Motes."
            : "Nutrients entered the core. Motes reward sustained care, not rapid drops.",
      );
    },
    [playTone, refreshProgress],
  );

  useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(() => {
      if (continuityOperationRef.current) return;
      if (document.visibilityState === "hidden") return;
      const motion = Math.hypot(positionRef.current.vx, positionRef.current.vy) * 120;
      const wasGerminating =
        organismRef.current.germination.state === "budding";
      metabolize(organismRef.current, clamp(motion, 0, 1));
      if (
        wasGerminating &&
        organismRef.current.germination.state === "stable" &&
        livingCells(organismRef.current) >= 2
      ) {
        behaviorRef.current = "Protecting a newborn stem cell";
        setToast(
          "The lone survivor budded. Ordinary cellular growth can begin again.",
        );
      }
      refreshProgress();
    }, 800);
    return () => window.clearInterval(interval);
  }, [ready, refreshProgress]);

  useEffect(() => {
    if (!ready) return;
    const reconcileVisibleTime = () => {
      if (
        document.visibilityState === "hidden" ||
        continuityOperationRef.current
      ) {
        return;
      }
      const now = Date.now();
      const elapsedMinutes = Math.floor(
        Math.max(0, now - organismRef.current.lastSeen) / 60_000,
      );
      if (elapsedMinutes < 1) return;
      simulateElapsed(organismRef.current, elapsedMinutes, now);
      evaluateProgress(organismRef.current);
      setSnapshot(
        makeSnapshot(
          organismRef.current,
          "Remembering the time you were apart",
        ),
      );
      persistLocalOrganism(organismRef.current, localOwnerRef.current);
    };
    window.addEventListener("pageshow", reconcileVisibleTime);
    window.addEventListener("focus", reconcileVisibleTime);
    document.addEventListener("visibilitychange", reconcileVisibleTime);
    return () => {
      window.removeEventListener("pageshow", reconcileVisibleTime);
      window.removeEventListener("focus", reconcileVisibleTime);
      document.removeEventListener("visibilitychange", reconcileVisibleTime);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const dispense = () => {
      const organism = organismRef.current;
      if (
        !organism.ownedItems.includes("auto-feeder") ||
        Date.now() - organism.lastFeederAt < FEEDER_INTERVAL_MS
      ) {
        return;
      }
      organism.lastFeederAt = Date.now();
      feedAt();
      behaviorRef.current = "Following the feeder signal";
      setToast("The Nutrient Feeder released its scheduled mote.");
      setSnapshot(makeSnapshot(organism, behaviorRef.current));
    };
    dispense();
    const interval = window.setInterval(dispense, 60_000);
    return () => window.clearInterval(interval);
  }, [feedAt, ready]);

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const mask = document.createElement("canvas");
    const maskContext = mask.getContext("2d");
    if (!maskContext) return;

    let width = 0;
    let height = 0;
    let previous = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      mask.width = Math.max(1, Math.floor(width));
      mask.height = Math.max(1, Math.floor(height));
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (time: number) => {
      const delta = Math.min((time - previous) / 1000, 0.05);
      previous = time;
      context.clearRect(0, 0, width, height);

      const organism = organismRef.current;
      const position = positionRef.current;
      const foods = foodRef.current;
      const mean = averages(organism);
      const memory = rememberedBehavior(organism);
      const activeFoodIndex = findNearestFoodIndex(
        foods,
        position,
        width,
        height,
      );
      const activeFood =
        activeFoodIndex >= 0 ? foods[activeFoodIndex] : undefined;

      if (activeFood) {
        position.targetX = activeFood.x;
        position.targetY = activeFood.y;
        behaviorRef.current = "Approaching food";
      } else if (time > position.nextWander) {
        const vigor = 0.08 + mean.energy * 0.15;
        position.targetX = clamp(
          position.x + (Math.random() - 0.5) * vigor * (0.8 + organism.traits.curiosity),
          0.18,
          0.82,
        );
        position.targetY = clamp(
          position.y + (Math.random() - 0.5) * vigor * 0.6,
          0.36,
          0.7,
        );
        position.nextWander =
          time + 2800 + (1 - organism.traits.curiosity) * 5200;
        behaviorRef.current =
          mean.energy < 0.42
            ? "Resting"
            : memory.anticipatingCare
              ? "Waiting near your usual care time"
              : memory.favoriteRoom === organism.equippedRoom
                ? "Settling into a remembered favorite room"
                : memory.favoriteToy === organism.equippedToy
                  ? "Circling a familiar favorite toy"
                  : memory.favoriteFriend && organism.activeFriendId
                    ? "Recognizing a familiar friend"
            : organism.traits.curiosity > 0.6
              ? "Exploring the room"
              : "Drifting";
      }

      const memoryTempo =
        memory.careStyle === "Calm"
          ? 0.94
          : memory.careStyle === "Chaotic"
            ? 1.06
            : 1;
      const speed =
        (0.12 + organism.traits.locomotion * 0.12) *
        memoryTempo *
        clamp(mean.energy * 1.3, 0.08, 1) *
        (1 - organism.germination.dormancyDepth * 0.38) *
        (1 -
          Math.min(
            0.12,
            organism.revivalScars
              .filter(({ generation }) => generation === organism.lineage)
              .reduce((sum, scar) => sum + scar.severity * 0.035, 0),
          ));
      const desiredX = (position.targetX - position.x) * speed;
      const desiredY = (position.targetY - position.y) * speed;
      position.vx += (desiredX - position.vx) * delta * 2.4;
      position.vy += (desiredY - position.vy) * delta * 2.4;
      position.x += position.vx * delta;
      position.y += position.vy * delta;

      if (activeFood) {
        const distance = Math.hypot(
          (activeFood.x - position.x) * width,
          (activeFood.y - position.y) * height,
        );
        if (
          !continuityOperationRef.current &&
          distance < Math.max(42, Math.sqrt(mean.living) * 5.8)
        ) {
          foods.splice(activeFoodIndex, 1);
          distributeMeal(activeFood.nutrition);
        }
      }

      foods.forEach((food) => {
        const x = food.x * width;
        const y = food.y * height;
        const pulse = 1 + Math.sin(time * 0.006 + food.phase) * 0.15;
        const glow = context.createRadialGradient(x, y, 0, x, y, 28 * pulse);
        glow.addColorStop(0, "rgba(255, 244, 189, .96)");
        glow.addColorStop(0.18, "rgba(255, 190, 126, .88)");
        glow.addColorStop(0.55, "rgba(255, 125, 189, .28)");
        glow.addColorStop(1, "rgba(255, 125, 189, 0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(x, y, 28 * pulse, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(255,255,255,.9)";
        context.beginPath();
        context.arc(x, y, 3.4 * pulse, 0, Math.PI * 2);
        context.fill();
      });

      const living = organism.cells
        .map((cell, index) => ({ cell, index }))
        .filter(({ cell }) => cell.alive);
      const spacing = clamp(Math.min(width, height) / 68, 6.3, 10.5);
      const centerX = position.x * width;
      const idleBob =
        Math.sin(time * 0.0022) * 2.5 * clamp(mean.energy * 1.4, 0.15, 1);
      const centerY = position.y * height + idleBob;
      const points = living.map(({ cell, index }) => {
        const gridX = index % GRID;
        const gridY = Math.floor(index / GRID);
        const wobble =
          Math.sin(time * 0.0018 + cell.phase) *
          spacing *
          0.13 *
          clamp(mean.energy * 1.2, 0.2, 1);
        return {
          cell,
          x: centerX + (gridX - CENTER) * spacing + wobble,
          y:
            centerY +
            (gridY - CENTER) * spacing * 0.94 +
            Math.cos(time * 0.0015 + cell.phase) * spacing * 0.09,
        };
      });

      if (points.length) {
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const left = Math.min(...xs) - spacing;
        const right = Math.max(...xs) + spacing;
        const top = Math.min(...ys) - spacing;
        const bottom = Math.max(...ys) + spacing;
        const bodyWidth = Math.max(right - left, 52);
        const bodyHeight = Math.max(bottom - top, 52);

        context.save();
        context.filter = "blur(10px)";
        context.fillStyle = `rgba(4, 10, 28, ${0.3 + (1 - mean.health) * 0.25})`;
        context.beginPath();
        context.ellipse(
          centerX + 5,
          bottom + 9,
          bodyWidth * 0.48,
          Math.max(8, bodyHeight * 0.1),
          0,
          0,
          Math.PI * 2,
        );
        context.fill();
        context.restore();

        maskContext.clearRect(0, 0, width, height);
        maskContext.save();
        maskContext.filter = `blur(${Math.max(5, spacing * 0.72)}px)`;
        maskContext.fillStyle = "white";
        points.forEach((point) => {
          maskContext.beginPath();
          maskContext.arc(point.x, point.y, spacing * 0.98, 0, Math.PI * 2);
          maskContext.fill();
        });
        maskContext.restore();
        maskContext.globalCompositeOperation = "source-in";
        const membrane = maskContext.createLinearGradient(left, top, right, bottom);
        const dullness = 1 - mean.health;
        membrane.addColorStop(
          0,
          dullness > 0.55 ? "rgba(75,88,108,.82)" : "rgba(82,225,255,.88)",
        );
        membrane.addColorStop(
          0.46,
          dullness > 0.55 ? "rgba(82,77,111,.82)" : "rgba(100,131,255,.84)",
        );
        membrane.addColorStop(
          1,
          dullness > 0.55 ? "rgba(48,61,70,.8)" : "rgba(203,112,255,.83)",
        );
        maskContext.fillStyle = membrane;
        maskContext.fillRect(left - 20, top - 20, bodyWidth + 40, bodyHeight + 40);
        maskContext.globalCompositeOperation = "source-over";
        context.save();
        context.globalAlpha = 0.68 + mean.health * 0.22;
        context.drawImage(mask, 0, 0);
        context.restore();

        context.save();
        context.globalCompositeOperation = "screen";
        points.forEach(({ cell, x, y }) => {
          const energyPulse =
            0.72 + Math.sin(time * 0.0026 + cell.phase) * 0.18;
          const radius = spacing * (0.55 + cell.health * 0.12);
          const hue = 188 + cell.hue + cell.energy * 48;
          const gradient = context.createRadialGradient(
            x - radius * 0.25,
            y - radius * 0.3,
            0,
            x,
            y,
            radius,
          );
          gradient.addColorStop(
            0,
            `hsla(${hue}, 100%, ${74 + cell.energy * 18}%, ${0.32 + cell.energy * 0.35})`,
          );
          gradient.addColorStop(
            0.72,
            `hsla(${hue + 35}, 92%, 62%, ${0.12 + cell.health * 0.2})`,
          );
          gradient.addColorStop(1, `hsla(${hue + 50}, 90%, 44%, .03)`);
          context.fillStyle = gradient;
          context.beginPath();
          context.arc(x, y, radius * energyPulse, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = `rgba(211, 250, 255, ${0.08 + cell.health * 0.22})`;
          context.lineWidth = 0.7;
          context.stroke();
        });
        context.restore();

        const visibleScars = organism.revivalScars.filter(
          ({ generation }) => generation === organism.lineage,
        );
        visibleScars.slice(-3).forEach((scar, scarIndex) => {
          const angle =
            -2.45 +
            ((Math.abs(hashString(scar.id)) % 100) / 100) * 1.2 +
            scarIndex * 0.24;
          const scarX = centerX + Math.cos(angle) * bodyWidth * 0.34;
          const scarY = centerY + Math.sin(angle) * bodyHeight * 0.3;
          const scarRadius = clamp(
            spacing * (0.6 + scar.severity * 0.42),
            4,
            13,
          );
          const scarGlow = context.createRadialGradient(
            scarX,
            scarY,
            0,
            scarX,
            scarY,
            scarRadius * 2.2,
          );
          scarGlow.addColorStop(
            0,
            `hsla(${320 + scar.hueShift}, 96%, 82%, .82)`,
          );
          scarGlow.addColorStop(
            0.38,
            `hsla(${285 + scar.hueShift}, 88%, 60%, .4)`,
          );
          scarGlow.addColorStop(1, "rgba(255,110,210,0)");
          context.save();
          context.globalCompositeOperation = "screen";
          context.fillStyle = scarGlow;
          context.beginPath();
          context.arc(scarX, scarY, scarRadius * 2.2, 0, Math.PI * 2);
          context.fill();
          context.strokeStyle = "rgba(255,220,249,.62)";
          context.lineWidth = 1.1;
          context.beginPath();
          context.arc(scarX, scarY, scarRadius, 0.32, Math.PI * 1.62);
          context.stroke();
          context.restore();
        });

        const coreX = centerX;
        const coreY = centerY + bodyHeight * 0.09;
        const coreRadius = Math.max(11, Math.min(bodyWidth, bodyHeight) * 0.13);
        const core = context.createRadialGradient(
          coreX,
          coreY,
          0,
          coreX,
          coreY,
          coreRadius * 2.6,
        );
        core.addColorStop(0, `rgba(255,255,227,${0.78 + mean.energy * 0.2})`);
        core.addColorStop(0.16, `rgba(255,211,129,${0.65 + mean.energy * 0.22})`);
        core.addColorStop(0.43, `rgba(255,119,201,${0.24 + mean.energy * 0.2})`);
        core.addColorStop(1, "rgba(115,77,255,0)");
        context.save();
        context.globalCompositeOperation = "screen";
        context.fillStyle = core;
        context.beginPath();
        context.arc(
          coreX,
          coreY,
          coreRadius * (2.2 + Math.sin(time * 0.004) * 0.16),
          0,
          Math.PI * 2,
        );
        context.fill();
        context.restore();

        const eyeY = centerY - bodyHeight * 0.1;
        const eyeSpacing = Math.max(12, bodyWidth * 0.17);
        const eyeRadius = clamp(bodyWidth * 0.087, 7, 18);
        const lookX = clamp(position.vx * 24, -2.8, 2.8);
        const lookY = clamp(position.vy * 24, -2.2, 2.2);
        [-1, 1].forEach((side) => {
          const eyeX = centerX + side * eyeSpacing;
          const droop = clamp((0.48 - mean.energy) * 1.8, 0, 0.72);
          context.fillStyle = "rgba(4, 17, 38, .94)";
          context.beginPath();
          context.ellipse(
            eyeX,
            eyeY,
            eyeRadius,
            eyeRadius * (1 - droop * 0.35),
            0,
            0,
            Math.PI * 2,
          );
          context.fill();
          const iris = context.createRadialGradient(
            eyeX + lookX,
            eyeY + lookY,
            0,
            eyeX + lookX,
            eyeY + lookY,
            eyeRadius * 0.72,
          );
          iris.addColorStop(0, "rgba(255,255,255,.98)");
          iris.addColorStop(0.18, "rgba(118,250,255,.96)");
          iris.addColorStop(0.58, "rgba(13,151,225,.92)");
          iris.addColorStop(1, "rgba(0,15,34,.95)");
          context.fillStyle = iris;
          context.beginPath();
          context.arc(
            eyeX + lookX,
            eyeY + lookY,
            eyeRadius * 0.71,
            0,
            Math.PI * 2,
          );
          context.fill();
          context.fillStyle = "white";
          context.beginPath();
          context.arc(
            eyeX - eyeRadius * 0.25 + lookX,
            eyeY - eyeRadius * 0.27 + lookY,
            eyeRadius * 0.17,
            0,
            Math.PI * 2,
          );
          context.fill();
        });

        context.strokeStyle = "rgba(5, 30, 52, .78)";
        context.lineWidth = Math.max(1.2, spacing * 0.18);
        context.lineCap = "round";
        context.beginPath();
        const mouthY = eyeY + eyeRadius * 1.35;
        if (mean.energy < 0.38) {
          context.arc(centerX, mouthY + 5, eyeRadius * 0.48, Math.PI * 1.12, Math.PI * 1.88);
        } else if (organism.joy > 0.64) {
          context.arc(centerX, mouthY - 2, eyeRadius * 0.54, 0.12, Math.PI - 0.12);
        } else {
          context.moveTo(centerX - eyeRadius * 0.35, mouthY);
          context.quadraticCurveTo(centerX, mouthY + 1, centerX + eyeRadius * 0.35, mouthY);
        }
        context.stroke();
      }

      heartsRef.current = heartsRef.current.filter((heart) => time - heart.born < 1450);
      heartsRef.current.forEach((heart) => {
        const life = (time - heart.born) / 1450;
        const x = heart.x * width + Math.sin(life * 8 + heart.id) * 9;
        const y = heart.y * height - life * 62;
        context.save();
        context.globalAlpha = 1 - life;
        context.translate(x, y);
        context.scale(0.7 + life * 0.5, 0.7 + life * 0.5);
        context.fillStyle = "#ff9ecf";
        context.beginPath();
        context.moveTo(0, 7);
        context.bezierCurveTo(-15, -2, -9, -13, 0, -6);
        context.bezierCurveTo(9, -13, 15, -2, 0, 7);
        context.fill();
        context.restore();
      });

      frameRef.current = window.requestAnimationFrame(draw);
    };

    frameRef.current = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [distributeMeal, ready]);

  const canvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  }, []);

  const isOnBody = useCallback((x: number, y: number) => {
    const mean = averages(organismRef.current);
    const radius = clamp(0.055 + Math.sqrt(mean.living) * 0.0052, 0.08, 0.25);
    return (
      Math.hypot(
        x - positionRef.current.x,
        (y - positionRef.current.y) * 1.28,
      ) < radius
    );
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const point = canvasPoint(event);
      if (isOnBody(point.x, point.y)) {
        pettingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        pet(point.x, point.y);
      } else {
        feedAt(point.x, point.y);
      }
    },
    [canvasPoint, feedAt, isOnBody, pet],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pettingRef.current) return;
      const point = canvasPoint(event);
      if (isOnBody(point.x, point.y)) pet(point.x, point.y);
    },
    [canvasPoint, isOnBody, pet],
  );

  const stopPetting = useCallback(() => {
    pettingRef.current = false;
  }, []);

  const toggleCamera = useCallback(async () => {
    if (cameraActive) {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraActive(false);
      setCameraMessage("");
      setToast("Habitat view restored.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraMessage("Camera mode needs a secure mobile browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setCameraMessage("");
      setToast("AR camera is live. Livi remains local to this device.");
    } catch {
      setCameraMessage("Camera permission was not granted.");
    }
  }, [cameraActive]);

  useEffect(
    () => () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      audioRef.current?.close();
    },
    [],
  );

  const welcome = useCallback(() => {
    localStorage.setItem(WELCOME_KEY, "yes");
    setWelcomed(false);
    setToast("Livi recognizes your presence.");
    pet();
  }, [pet]);

  const applyProtectedOrganism = useCallback(
    (
      organism: Organism,
      behavior: string,
      message: string,
      trustAcceptedHead = false,
    ) => {
      const authoritative = structuredClone(organism);
      const continuous = preserveMonotonicContinuity(
        organism,
        organismRef.current,
      );
      if (
        trustAcceptedHead &&
        authoritative.generationId === continuous.generationId
      ) {
        continuous.currency = authoritative.currency;
        continuous.ownedItems = authoritative.ownedItems;
        continuous.equippedRoom = authoritative.equippedRoom;
        continuous.equippedToy = authoritative.equippedToy;
        continuous.bond = authoritative.bond;
        continuous.trust = authoritative.trust;
      }
      organismRef.current = continuous;
      behaviorRef.current = behavior;
      persistLocalOrganism(continuous, localOwnerRef.current);
      hadLocalSaveRef.current = true;
      setSnapshot(makeSnapshot(continuous, behavior));
      setCloudMessage(message);
      setToast("Livi recognizes its protected living history.");
    },
    [],
  );

  const refreshCloudTimeline = useCallback(
    async (syncKey: CryptoKey, activeHeadId?: string | null) => {
      const requestedHistory = cloudHistoryLimitRef.current;
      const history: CloudRevision[] = [];
      for (
        let offset = 0;
        offset < requestedHistory + 1;
        offset += 500
      ) {
        const pageSize = Math.min(500, requestedHistory + 1 - offset);
        const page = await listCloudHistory(pageSize, offset);
        history.push(...page);
        if (page.length < pageSize) break;
      }
      const unresolved = await listCloudConflicts();
      setCloudHistoryHasMore(history.length > requestedHistory);
      const visibleHistory = history.slice(0, requestedHistory);
      const decrypted = await Promise.all(
        visibleHistory.map(async (revision) => {
          try {
            const organism = parseSavedOrganism(
              await decryptCloudPayload<unknown>(revision, syncKey),
            );
            const current = makeSnapshot(organism);
            return {
              revision,
              organism,
              entry: {
                id: revision.revision_id,
                savedAt: new Date(revision.created_at).getTime(),
                reason:
                  revision.milestone_type ??
                  revision.revision_kind.replaceAll("-", " "),
                generation: organism.lineage,
                livingCells: current.living,
                bond: organism.bond,
                lifePhase: current.lifePhase,
                deviceName:
                  revision.device_id === cloudDeviceIdRef.current
                    ? cloudDeviceLabel()
                    : "Another trusted device",
              } satisfies SaveHistoryEntry,
            };
          } catch {
            return null;
          }
        }),
      );
      const readable = decrypted.filter(
        (
          item,
        ): item is NonNullable<(typeof decrypted)[number]> => item !== null,
      );
      setCloudSaveHistory(readable.map(({ entry }) => entry));

      const conflictRevision = unresolved[0];
      const headId =
        activeHeadId ??
        cloudMetaRef.current?.headRevisionId ??
        (await getCloudHead())?.revision_id ??
        null;
      const headRevision = visibleHistory.find(
        ({ revision_id }) => revision_id === headId,
      ) ?? (headId ? await getCloudRevision(headId) : null);
      if (!conflictRevision || !headRevision) {
        cloudConflictRef.current = null;
        setCloudConflictSnapshots([]);
        return;
      }
      const [localOrganism, cloudOrganism] = await Promise.all([
        decryptCloudPayload<unknown>(conflictRevision, syncKey).then(
          parseSavedOrganism,
        ),
        decryptCloudPayload<unknown>(headRevision, syncKey).then(
          parseSavedOrganism,
        ),
      ]);
      const localSnapshot = makeSnapshot(localOrganism);
      const cloudSnapshot = makeSnapshot(cloudOrganism);
      cloudConflictRef.current = {
        localRevision: conflictRevision,
        cloudRevision: headRevision,
        localOrganism,
        cloudOrganism,
      };
      setCloudConflictSnapshots([
        {
          id: conflictRevision.revision_id,
          source: "local",
          savedAt: new Date(conflictRevision.created_at).getTime(),
          deviceName:
            conflictRevision.device_id === cloudDeviceIdRef.current
              ? cloudDeviceLabel()
              : "Another trusted device",
          generation: localOrganism.lineage,
          livingCells: localSnapshot.living,
          bond: localOrganism.bond,
          note: "A complete encrypted branch. It will remain in restore history.",
        },
        {
          id: headRevision.revision_id,
          source: "cloud",
          savedAt: new Date(headRevision.created_at).getTime(),
          deviceName:
            headRevision.device_id === cloudDeviceIdRef.current
              ? cloudDeviceLabel()
              : "Cloud head",
          generation: cloudOrganism.lineage,
          livingCells: cloudSnapshot.living,
          bond: cloudOrganism.bond,
          note: "The current protected head. Choosing never deletes the other branch.",
        },
      ]);
      setCloudSyncStatus("conflict");
    },
    [],
  );

  const rehydratePermanentCloudMemory = useCallback(
    async (syncKey: CryptoKey, organism: Organism) => {
      const episodeRows: Awaited<
        ReturnType<typeof listCloudMemoryEpisodes>
      > = [];
      const routineRows: Awaited<
        ReturnType<typeof listCloudRoutineSummaries>
      > = [];
      for (let offset = 0; ; offset += 500) {
        const page = await listCloudMemoryEpisodes(500, offset);
        episodeRows.push(...page);
        if (page.length < 500) break;
      }
      for (let offset = 0; ; offset += 400) {
        const page = await listCloudRoutineSummaries(undefined, offset);
        routineRows.push(...page);
        if (page.length < 400) break;
      }
      const [episodes, routines] = await Promise.all([
        Promise.all(
          episodeRows.map(async (row) => {
            try {
              return await decryptCloudPayload<EpisodicMemory>(row, syncKey);
            } catch {
              return null;
            }
          }),
        ),
        Promise.all(
          routineRows.map(async (row) => {
            try {
              return await decryptCloudPayload<RoutineMemory>(row, syncKey);
            } catch {
              return null;
            }
          }),
        ),
      ]);
      organism.episodicMemories.push(
        ...episodes.filter(
          (memory): memory is EpisodicMemory => memory !== null,
        ),
      );
      organism.routineMemories = compactRoutineMemories([
        ...organism.routineMemories,
        ...routines.filter(
          (routine): routine is RoutineMemory => routine !== null,
        ),
      ]);
      return hydrateLifeSystems(organism);
    },
    [],
  );

  const syncPermanentMemory = useCallback(
    async (
      ownerId: string,
      deviceId: string,
      metadata: CloudAccountMetadata,
      syncKey: CryptoKey,
      localMeta: LocalCloudMeta,
    ) => {
      const synced = new Set(localMeta.syncedMemoryIds);
      for (const memory of organismRef.current.episodicMemories) {
        if (synced.has(memory.id)) continue;
        const clientEventId = await stableClientUuid(
          `${ownerId}:episode:${memory.id}`,
        );
        await appendCloudMemoryEpisode(
          {
            ownerId,
            clientEventId,
            deviceId,
            generation: memory.generation,
            eventType: memory.kind,
            importance: memory.significance === "legacy" ? 5 : 4,
            occurredAt: new Date(memory.at).toISOString(),
            keyVersion: metadata.key_version,
          },
          memory,
          syncKey,
        );
        synced.add(memory.id);
        localMeta.syncedMemoryIds = [...synced];
        writeLocalCloudMeta(localMeta);
      }

      const cloudRoutines = cloudSafeOrganism(
        organismRef.current,
      ).routineMemories;
      for (const routine of cloudRoutines) {
        if (routine.day === memoryDay(Date.now())) continue;
        const fingerprint = await checksumJson(routine);
        const routineKey = `${routine.generation}:${routine.day}`;
        if (localMeta.routineFingerprints[routineKey] === fingerprint) continue;
        const clientSummaryId = await stableClientUuid(
          `${ownerId}:routine:${routineKey}:${fingerprint}`,
        );
        const summaryId = await appendCloudRoutineSummary(
          {
            ownerId,
            clientSummaryId,
            deviceId,
            summaryDay: routine.day,
            generation: routine.generation,
            keyVersion: metadata.key_version,
            supersedesSummaryId:
              localMeta.routineSummaryIds[routineKey] ?? null,
          },
          routine,
          syncKey,
        );
        localMeta.routineFingerprints[routineKey] = fingerprint;
        localMeta.routineSummaryIds[routineKey] = summaryId;
        writeLocalCloudMeta(localMeta);
      }
    },
    [],
  );

  const pushProtectedRevision = useCallback(
    async (
      ownerId: string,
      syncKey: CryptoKey,
      accountMetadata: CloudAccountMetadata,
      deviceId: string,
      localMeta: LocalCloudMeta,
      revisionKind:
        | "periodic"
        | "milestone"
        | "manual"
        | "merge"
        | "restore"
        | "legacy"
        | "migration",
      options?: {
        organism?: Organism;
        parentRevisionId?: string | null;
        mergeParentRevisionId?: string | null;
        restoredFromRevisionId?: string | null;
        force?: boolean;
      },
    ) => {
      const run = async () => {
        setCloudSyncStatus("syncing");
        try {
        const organism = cloudSafeOrganism(
          options?.organism ?? organismRef.current,
        );
        const checksum = await checksumJson(organism);
        if (
          !options?.force &&
          revisionKind === "periodic" &&
          checksum === localMeta.lastSyncedChecksum
        ) {
          setCloudSyncStatus("synced");
          return null;
        }
        const parentRevisionId =
          options?.parentRevisionId === undefined
            ? localMeta.headRevisionId
            : options.parentRevisionId;
        const pending =
          localMeta.pendingRevision?.checksum === checksum &&
          localMeta.pendingRevision.parentRevisionId === parentRevisionId &&
          localMeta.pendingRevision.revisionKind === revisionKind &&
          localMeta.pendingRevision.mergeParentRevisionId ===
            (options?.mergeParentRevisionId ?? null) &&
          localMeta.pendingRevision.restoredFromRevisionId ===
            (options?.restoredFromRevisionId ?? null)
            ? localMeta.pendingRevision
            : {
                revisionId: crypto.randomUUID(),
                clientRevisionId: crypto.randomUUID(),
                parentRevisionId,
                checksum,
                revisionKind,
                mergeParentRevisionId:
                  options?.mergeParentRevisionId ?? null,
                restoredFromRevisionId:
                  options?.restoredFromRevisionId ?? null,
                deviceTimestamp: new Date().toISOString(),
              };
        localMeta.pendingRevision = pending;
        writeLocalCloudMeta(localMeta);
        const result = await pushCloudRevision(
          {
            ownerId,
            revisionId: pending.revisionId,
            clientRevisionId: pending.clientRevisionId,
            deviceId,
            parentRevisionId,
            mergeParentRevisionId: options?.mergeParentRevisionId,
            restoredFromRevisionId: options?.restoredFromRevisionId,
            generation: organism.lineage,
            saveVersion: LIFE_SCHEMA_VERSION,
            revisionKind,
            milestoneType:
              revisionKind === "milestone" || revisionKind === "legacy"
                ? cloudMilestoneType(organism)
                : null,
            keyVersion: accountMetadata.key_version,
            deviceTimestamp: pending.deviceTimestamp,
          },
          organism,
          syncKey,
        );
        localMeta.pendingRevision = undefined;
        if (result.revision_status === "conflict") {
          writeLocalCloudMeta(localMeta);
          setCloudMessage(
            "Two complete timelines were preserved. Choose which one continues.",
          );
          await refreshCloudTimeline(syncKey, result.head_revision_id);
          setCloudSyncStatus("conflict");
          return result;
        }
        localMeta.headRevisionId = result.head_revision_id;
        localMeta.lastSyncedChecksum = checksum;
        localMeta.lastSyncedAt = Date.now();
        writeLocalCloudMeta(localMeta);
        cloudMetaRef.current = localMeta;
        setLastCloudSyncAt(localMeta.lastSyncedAt);
        await syncPermanentMemory(
          ownerId,
          deviceId,
          accountMetadata,
          syncKey,
          localMeta,
        );
        await refreshCloudTimeline(syncKey, result.head_revision_id);
        setCloudSyncStatus("synced");
        setCloudMessage("Encrypted living history is protected.");
        return result;
        } catch (error) {
          setCloudSyncStatus(
            typeof navigator !== "undefined" && !navigator.onLine
              ? "offline"
              : "error",
          );
          setCloudMessage(
            error instanceof Error
              ? `${error.message} Local play and its queued save remain safe.`
              : "Cloud paused. Local play and its queued save remain safe.",
          );
          return null;
        }
      };
      const queued = cloudQueueRef.current.then(run, run);
      cloudQueueRef.current = queued.then(
        () => undefined,
        () => undefined,
      );
      return queued;
    },
    [refreshCloudTimeline, syncPermanentMemory],
  );

  const initializeCloudContinuity = useCallback(
    async (
      user: { id: string; email?: string | null },
      password?: string,
    ) => {
      setCloudBusy(true);
      setCloudSyncStatus("syncing");
      setCloudMessage("Opening encrypted living history…");
      try {
        const ownerId = user.id;
        if (localOwnerRef.current !== ownerId) {
          localStorage.setItem(
            ownerSlotKey(localOwnerRef.current),
            JSON.stringify(organismRef.current),
          );
          const targetRaw = localStorage.getItem(ownerSlotKey(ownerId));
          if (targetRaw) {
            const targetOrganism = normalizeSavedOrganism(
              JSON.parse(targetRaw),
            );
            organismRef.current = targetOrganism;
            setSnapshot(
              makeSnapshot(targetOrganism, "Recognizing this account"),
            );
            hadLocalSaveRef.current = true;
          } else if (localOwnerRef.current === "anonymous") {
            hadLocalSaveRef.current = true;
          } else {
            const fresh = createOrganism();
            organismRef.current = fresh;
            setSnapshot(makeSnapshot(fresh, "Waking for this account"));
            hadLocalSaveRef.current = false;
          }
          localOwnerRef.current = ownerId;
          localStorage.setItem(LOCAL_ACTIVE_OWNER_KEY, ownerId);
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(organismRef.current),
          );
        }
        const localMeta = loadLocalCloudMeta(ownerId);
        cloudMetaRef.current = localMeta;
        setLastCloudSyncAt(localMeta.lastSyncedAt);

        let metadata = await getCloudAccountMetadata();
        let syncKey: CryptoKey | null = null;
        if (!metadata) {
          if (!password) {
            setCloudAccountMetadata(null);
            setCloudLocked(true);
            setCloudSyncStatus("local");
            setCloudMessage(
              "Enter the account password once to create this encrypted history. Local life continues safely.",
            );
            return;
          }
          const provisioned = await provisionCloudEncryption(
            ownerId,
            password,
            organismRef.current.lineage,
          );
          metadata = {
            owner_id: ownerId,
            active_generation: organismRef.current.lineage,
            autosave_enabled: true,
            ...provisioned.keyring,
          };
          syncKey = provisioned.syncKey;
          setRecoveryCode(provisioned.recoveryCode);
          if (provisioned.recoveryCode) {
            sessionStorage.setItem(
              RECOVERY_CODE_SESSION_KEY,
              provisioned.recoveryCode,
            );
          }
        } else {
          syncKey = password
            ? await unlockAndCacheCloudKey(
                ownerId,
                password,
                metadata,
                "password",
              )
            : await getCachedCloudKey(ownerId, metadata.key_version);
        }
        setCloudAccountMetadata(metadata);
        if (!syncKey) {
          setCloudLocked(true);
          setCloudSyncStatus("local");
          setCloudMessage(
            "This signed-in device needs the account password or recovery code to unlock encrypted history.",
          );
          return;
        }

        cloudKeyRef.current = syncKey;
        setCloudLocked(false);
        await rehydratePermanentCloudMemory(
          syncKey,
          organismRef.current,
        );
        const deviceId = await enrollCloudDevice(ownerId, cloudDeviceLabel());
        cloudDeviceIdRef.current = deviceId;
        let head = await getCloudHead();
        const legacy = await getCloudClient()
          .from("cloud_saves")
          .select("save_data,checksum")
          .eq("owner_id", ownerId)
          .maybeSingle();
        if (legacy.error) throw legacy.error;
        if (legacy.data) {
          if (!head?.revision_id) {
            const legacyChecksum = await checksumJson(legacy.data.save_data);
            if (legacyChecksum !== legacy.data.checksum) {
              throw new Error("The earlier cloud save failed its integrity check.");
            }
            const legacyOrganism = parseSavedOrganism(legacy.data.save_data);
            const migrated = await pushProtectedRevision(
              ownerId,
              syncKey,
              metadata,
              deviceId,
              localMeta,
              "migration",
              {
                organism: legacyOrganism,
                parentRevisionId: null,
                force: true,
              },
            );
            if (migrated?.revision_status === "accepted") {
              head = await getCloudHead();
            }
          }
          if (head?.revision_id) {
            const deletion = await getCloudClient()
              .from("cloud_saves")
              .delete()
              .eq("owner_id", ownerId);
            if (deletion.error) throw deletion.error;
          }
        }
        if (head?.revision_id && !metadata.legacy_migrated_at) {
          const migratedAt = new Date().toISOString();
          const marker = await getCloudClient()
            .from("cloud_account_metadata")
            .update({ legacy_migrated_at: migratedAt })
            .eq("owner_id", ownerId);
          if (marker.error) throw marker.error;
          metadata = { ...metadata, legacy_migrated_at: migratedAt };
          setCloudAccountMetadata(metadata);
        }

        if (!head?.revision_id) {
          await pushProtectedRevision(
            ownerId,
            syncKey,
            metadata,
            deviceId,
            localMeta,
            "migration",
            { parentRevisionId: null, force: true },
          );
          return;
        }

        const headRevision = head?.revision_id
          ? await getCloudRevision(head.revision_id)
          : null;
        if (!headRevision) {
          throw new Error("The cloud head exists but its revision is unavailable.");
        }
        const remoteRaw = await decryptCloudPayload<unknown>(
          headRevision,
          syncKey,
        );
        const remoteOrganism = parseSavedOrganism(remoteRaw);
        const [localChecksum, remoteChecksum] = await Promise.all([
          checksumJson(cloudSafeOrganism(organismRef.current)),
          checksumJson(remoteOrganism),
        ]);

        if (localChecksum === remoteChecksum) {
          localMeta.headRevisionId = head.revision_id;
          localMeta.lastSyncedChecksum = localChecksum;
          localMeta.lastSyncedAt = Date.now();
          localMeta.pendingRevision = undefined;
          writeLocalCloudMeta(localMeta);
          setLastCloudSyncAt(localMeta.lastSyncedAt);
          await syncPermanentMemory(
            ownerId,
            deviceId,
            metadata,
            syncKey,
            localMeta,
          );
          await refreshCloudTimeline(syncKey, head.revision_id);
          setCloudSyncStatus("synced");
          setCloudMessage("Encrypted living history is protected.");
          return;
        }

        const localIsUnchanged =
          localMeta.lastSyncedChecksum === localChecksum;
        if (!hadLocalSaveRef.current || localIsUnchanged) {
          const serverNow = await getCloudServerTime();
          const restored = applyOfflineLife(
            remoteOrganism,
            serverNow,
            new Date(headRevision.created_at).getTime(),
          );
          applyProtectedOrganism(
            restored,
            "Remembering another trusted device",
            "The newest protected revision came home intact.",
            true,
          );
          const restoredChecksum = await checksumJson(restored);
          localMeta.headRevisionId = head.revision_id;
          localMeta.lastSyncedChecksum = restoredChecksum;
          localMeta.lastSyncedAt = Date.now();
          localMeta.pendingRevision = undefined;
          writeLocalCloudMeta(localMeta);
          setLastCloudSyncAt(localMeta.lastSyncedAt);
          await refreshCloudTimeline(syncKey, head.revision_id);
          setCloudSyncStatus("synced");
          return;
        }

        if (localMeta.headRevisionId === head.revision_id) {
          await pushProtectedRevision(
            ownerId,
            syncKey,
            metadata,
            deviceId,
            localMeta,
            "periodic",
          );
          return;
        }

        await pushProtectedRevision(
          ownerId,
          syncKey,
          metadata,
          deviceId,
          localMeta,
          "manual",
          {
            parentRevisionId: localMeta.headRevisionId,
            force: true,
          },
        );
      } catch (error) {
        setCloudSyncStatus(
          typeof navigator !== "undefined" && !navigator.onLine
            ? "offline"
            : "error",
        );
        setCloudMessage(
          error instanceof Error
            ? `${error.message} The local organism remains untouched.`
            : "Encrypted history could not open. The local organism remains untouched.",
        );
      } finally {
        setCloudBusy(false);
      }
    },
    [
      applyProtectedOrganism,
      pushProtectedRevision,
      rehydratePermanentCloudMemory,
      refreshCloudTimeline,
      syncPermanentMemory,
    ],
  );

  const authenticateCloud = useCallback(
    async (
      mode: "create" | "signin",
      email: string,
      password: string,
    ) => {
      if (!cloudConfigured()) return;
      setCloudBusy(true);
      setCloudMessage("");
      cloudAuthInProgressRef.current = true;
      try {
        const cloud = getCloudClient();
        const result =
          mode === "create"
            ? await cloud.auth.signUp({ email, password })
            : await cloud.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (result.data.session) {
          setCloudUser({
            id: result.data.user?.id ?? result.data.session.user.id,
            email: result.data.user?.email ?? email,
          });
          await initializeCloudContinuity(
            result.data.session.user,
            password,
          );
          await refreshCommons();
        } else {
          setCloudMessage(
            "Check your email to finish linking this recovery account.",
          );
        }
      } catch (error) {
        setCloudMessage(
          error instanceof Error ? error.message : "Cloud sign-in failed.",
        );
      } finally {
        cloudAuthInProgressRef.current = false;
        setCloudBusy(false);
      }
    },
    [initializeCloudContinuity, refreshCommons],
  );

  useEffect(() => {
    if (!ready || !cloudConfigured()) return;
    const cloud = getCloudClient();
    let active = true;
    void cloud.auth.getSession().then(({ data }) => {
      if (!active) return;
      const user = data.session?.user;
      setCloudUser(
        user ? { id: user.id, email: user.email ?? null } : null,
      );
      if (user && !cloudAuthInProgressRef.current) {
        void initializeCloudContinuity(user);
      }
      void refreshCommons();
    });
    const {
      data: { subscription },
    } = cloud.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const user = session?.user;
      setCloudUser(
        user ? { id: user.id, email: user.email ?? null } : null,
      );
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryMode(true);
        setHubTab("commons");
        setLifeHubOpen(true);
        setCloudMessage(
          "Choose a new password and prove access to the encrypted save key.",
        );
      } else if (event === "SIGNED_OUT") {
        setPasswordRecoveryMode(false);
      }
      if (user && !cloudAuthInProgressRef.current) {
        window.setTimeout(
          () => void initializeCloudContinuity(user),
          0,
        );
      }
      window.setTimeout(() => void refreshCommons(), 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [initializeCloudContinuity, ready, refreshCommons]);

  const signOutCloud = useCallback(async () => {
    if (!cloudConfigured()) return;
    setCloudBusy(true);
    const ownerId = cloudUser?.id;
    const { error } = await getCloudClient().auth.signOut({ scope: "local" });
    setCloudBusy(false);
    if (error) {
      setCloudMessage(error.message);
      return;
    }
    if (ownerId) {
      localStorage.setItem(
        ownerSlotKey(ownerId),
        JSON.stringify(organismRef.current),
      );
    }
    if (ownerId) await forgetCachedCloudKey(ownerId);
    cloudKeyRef.current = null;
    cloudDeviceIdRef.current = null;
    cloudMetaRef.current = null;
    cloudConflictRef.current = null;
    setCloudUser(null);
    setCloudAccountMetadata(null);
    setCloudLocked(false);
    setRecoveryCode(null);
    sessionStorage.removeItem(RECOVERY_CODE_SESSION_KEY);
    setCloudSyncStatus("local");
    setLastCloudSyncAt(null);
    setCloudSaveHistory([]);
    setCloudConflictSnapshots([]);
    setOwnProfileId(null);
    setFriendships([]);
    setCloudMessage("Signed out here. Local life continues.");
  }, [cloudUser?.id]);

  const publishCloud = useCallback(
    async (name: string, visibility: "private" | "public") => {
      if (!cloudConfigured()) return;
      setCloudBusy(true);
      try {
        const cloud = getCloudClient();
        const {
          data: { user },
          error: userError,
        } = await cloud.auth.getUser();
        if (userError || !user) throw userError ?? new Error("Sign in first.");
        const organism = organismRef.current;
        const current = makeSnapshot(organism, behaviorRef.current);
        const slug = `livi-${Math.abs(organism.seed).toString(36)}-${user.id.slice(0, 5)}`.slice(
          0,
          32,
        );
        const profilePayload = {
          owner_id: user.id,
          slug,
          display_name: name.trim().slice(0, 24) || "Livi",
          visibility,
          phenotype: current.phenotype,
          life_phase: current.lifePhase,
          age_minutes: organism.ageMinutes,
          living_cells: current.living,
          bond: current.bond,
          room_id: organism.equippedRoom,
          equipped_toy: organism.equippedToy,
          achievements: organism.achievements,
          traits: organism.traits,
          updated_at: new Date().toISOString(),
        };
        const profileResult = await cloud
          .from("blob_profiles")
          .upsert(profilePayload, { onConflict: "owner_id" })
          .select("id")
          .single();
        if (profileResult.error) throw profileResult.error;
        setOwnProfileId(profileResult.data.id);
        if (
          cloudKeyRef.current &&
          cloudDeviceIdRef.current &&
          cloudMetaRef.current &&
          cloudAccountMetadata
        ) {
          await pushProtectedRevision(
            user.id,
            cloudKeyRef.current,
            cloudAccountMetadata,
            cloudDeviceIdRef.current,
            cloudMetaRef.current,
            "manual",
            { force: true },
          );
        }
        setCloudMessage(
          visibility === "public"
            ? "Trait-only profile shared; the full life stays encrypted."
            : "Profile is private; encrypted history remains protected.",
        );
        await refreshCommons();
      } catch (error) {
        setCloudMessage(
          error instanceof Error ? error.message : "Cloud save failed.",
        );
      } finally {
        setCloudBusy(false);
      }
    },
    [cloudAccountMetadata, pushProtectedRevision, refreshCommons],
  );

  const restoreCloudRevision = useCallback(
    async (requestedRevisionId?: string) => {
      if (
        !cloudUser ||
        !cloudKeyRef.current ||
        !cloudDeviceIdRef.current ||
        !cloudMetaRef.current ||
        !cloudAccountMetadata
      ) {
        setCloudMessage("Unlock encrypted history before restoring a revision.");
        return;
      }
      setCloudBusy(true);
      continuityOperationRef.current = true;
      preserveLocalRestorePoint(
        organismRef.current,
        "Before cloud-history restore",
      );
      checkpointRef.current = structuredClone(organismRef.current);
      setCheckpointAvailable(true);
      try {
        const targetId =
          requestedRevisionId ?? cloudMetaRef.current.headRevisionId;
        const target = targetId ? await getCloudRevision(targetId) : null;
        if (!target) throw new Error("That protected revision is unavailable.");

        const localChecksum = await checksumJson(
          cloudSafeOrganism(organismRef.current),
        );
        if (localChecksum !== cloudMetaRef.current.lastSyncedChecksum) {
          const preserved = await pushProtectedRevision(
            cloudUser.id,
            cloudKeyRef.current,
            cloudAccountMetadata,
            cloudDeviceIdRef.current,
            cloudMetaRef.current,
            "manual",
            { force: true },
          );
          if (preserved?.revision_status === "conflict") return;
        }

        const organism = normalizeSavedOrganism(
          await decryptCloudPayload<unknown>(target, cloudKeyRef.current),
        );
        const continuous = preserveMonotonicContinuity(
          organism,
          organismRef.current,
        );
        const result = await pushProtectedRevision(
          cloudUser.id,
          cloudKeyRef.current,
          cloudAccountMetadata,
          cloudDeviceIdRef.current,
          cloudMetaRef.current,
          "restore",
          {
            organism: continuous,
            parentRevisionId: cloudMetaRef.current.headRevisionId,
            restoredFromRevisionId: target.revision_id,
            force: true,
          },
        );
        if (result?.revision_status !== "accepted") return;
        applyProtectedOrganism(
          continuous,
          "Remembering a protected turning point",
          `Restored ${new Date(target.created_at).toLocaleString()} as a new revision. Nothing was overwritten.`,
        );
      } catch (error) {
        setCloudMessage(
          error instanceof Error ? error.message : "Cloud restore failed.",
        );
      } finally {
        continuityOperationRef.current = false;
        setCloudBusy(false);
      }
    },
    [
      applyProtectedOrganism,
      cloudAccountMetadata,
      cloudUser,
      pushProtectedRevision,
    ],
  );

  const restoreCloud = useCallback(
    () => restoreCloudRevision(),
    [restoreCloudRevision],
  );

  const restoreCloudVersion = useCallback(
    (revisionId: string) => restoreCloudRevision(revisionId),
    [restoreCloudRevision],
  );

  const loadOlderCloudHistory = useCallback(async () => {
    if (!cloudKeyRef.current) return;
    cloudHistoryLimitRef.current = Math.min(
      cloudHistoryLimitRef.current + 60,
      5_000,
    );
    await refreshCloudTimeline(cloudKeyRef.current);
  }, [refreshCloudTimeline]);

  const resolveCloudConflict = useCallback(
    async (choice: "local" | "cloud" | "both") => {
      const conflict = cloudConflictRef.current;
      if (
        !conflict ||
        !cloudUser ||
        !cloudKeyRef.current ||
        !cloudDeviceIdRef.current ||
        !cloudMetaRef.current ||
        !cloudAccountMetadata
      ) {
        setCloudMessage("That conflict is no longer active.");
        return;
      }
      setCloudBusy(true);
      continuityOperationRef.current = true;
      preserveLocalRestorePoint(
        organismRef.current,
        "Before cloud-conflict merge",
      );
      const selected =
        choice === "cloud"
          ? structuredClone(conflict.cloudOrganism)
          : structuredClone(conflict.localOrganism);
      const organism = preserveMonotonicContinuity(
        selected,
        organismRef.current,
      );
      const result = await pushProtectedRevision(
        cloudUser.id,
        cloudKeyRef.current,
        cloudAccountMetadata,
        cloudDeviceIdRef.current,
        cloudMetaRef.current,
        "merge",
        {
          organism,
          parentRevisionId: conflict.cloudRevision.revision_id,
          mergeParentRevisionId: conflict.localRevision.revision_id,
          force: true,
        },
      );
      if (result?.revision_status === "accepted") {
        applyProtectedOrganism(
          organism,
          choice === "cloud"
            ? "Remembering the protected cloud branch"
            : "Continuing this device's living branch",
          choice === "both"
            ? "Both complete timelines remain in history; this branch continues."
            : "The chosen timeline continues. The other remains restorable.",
        );
        cloudConflictRef.current = null;
        setCloudConflictSnapshots([]);
        setCloudSyncStatus("synced");
      }
      continuityOperationRef.current = false;
      setCloudBusy(false);
    },
    [
      applyProtectedOrganism,
      cloudAccountMetadata,
      cloudUser,
      pushProtectedRevision,
    ],
  );

  const unlockCloudHistory = useCallback(
    async (method: "password" | "recovery", secret: string) => {
      if (!cloudUser) return;
      setCloudBusy(true);
      try {
        const metadata =
          cloudAccountMetadata ?? (await getCloudAccountMetadata());
        if (!metadata) {
          if (method !== "password") {
            throw new Error(
              "Use the account password to create the first encrypted key.",
            );
          }
          await initializeCloudContinuity(cloudUser, secret);
          return;
        }
        const key = await unlockAndCacheCloudKey(
          cloudUser.id,
          secret,
          metadata,
          method,
        );
        cloudKeyRef.current = key;
        setCloudAccountMetadata(metadata);
        setCloudLocked(false);
        await initializeCloudContinuity(cloudUser);
      } catch (error) {
        setCloudLocked(true);
        setCloudMessage(
          error instanceof Error
            ? error.message
            : "Encrypted history could not be unlocked.",
        );
      } finally {
        setCloudBusy(false);
      }
    },
    [cloudAccountMetadata, cloudUser, initializeCloudContinuity],
  );

  const requestCloudPasswordReset = useCallback(async (email: string) => {
    setCloudBusy(true);
    try {
      const { error } = await getCloudClient().auth.resetPasswordForEmail(
        email,
        { redirectTo: window.location.origin },
      );
      if (error) throw error;
      setCloudMessage(
        "Password recovery link sent. The recovery code or previous password will keep every encrypted revision readable.",
      );
    } catch (error) {
      setCloudMessage(
        error instanceof Error
          ? error.message
          : "Password recovery email could not be sent.",
      );
    } finally {
      setCloudBusy(false);
    }
  }, []);

  const completeCloudPasswordRecovery = useCallback(
    async (
      method: "password" | "recovery",
      unlockSecret: string,
      newPassword: string,
    ) => {
      if (!cloudUser) return;
      setCloudBusy(true);
      try {
        const metadata =
          cloudAccountMetadata ?? (await getCloudAccountMetadata());
        if (!metadata) {
          throw new Error("No encrypted keyring exists for this account.");
        }
        await unlockAndCacheCloudKey(
          cloudUser.id,
          unlockSecret,
          metadata,
          method,
        );
        const { error } = await getCloudClient().auth.updateUser({
          password: newPassword,
        });
        if (error) throw error;
        const syncKey = await rewrapCloudKeyPassword(
          cloudUser.id,
          metadata,
          unlockSecret,
          method,
          newPassword,
        );
        cloudKeyRef.current = syncKey;
        setPasswordRecoveryMode(false);
        setCloudLocked(false);
        setCloudMessage(
          "Password changed without changing the private save key. Every revision remains intact.",
        );
        await initializeCloudContinuity(cloudUser);
      } catch (error) {
        setPasswordRecoveryMode(true);
        setCloudMessage(
          error instanceof Error
            ? `${error.message} Keep this page open and try the recovery code.`
            : "Password recovery could not preserve the encrypted key.",
        );
      } finally {
        setCloudBusy(false);
      }
    },
    [cloudAccountMetadata, cloudUser, initializeCloudContinuity],
  );

  const retryCloudSync = useCallback(async () => {
    if (
      !cloudUser ||
      !cloudKeyRef.current ||
      !cloudDeviceIdRef.current ||
      !cloudMetaRef.current ||
      !cloudAccountMetadata
    ) {
      if (cloudUser) await initializeCloudContinuity(cloudUser);
      return;
    }
    await pushProtectedRevision(
      cloudUser.id,
      cloudKeyRef.current,
      cloudAccountMetadata,
      cloudDeviceIdRef.current,
      cloudMetaRef.current,
      "periodic",
      { force: true },
    );
  }, [
    cloudAccountMetadata,
    cloudUser,
    initializeCloudContinuity,
    pushProtectedRevision,
  ]);

  const syncCloudNow = useCallback(
    async (force = false) => {
      if (
        cloudSyncStatus === "conflict" ||
        !cloudUser ||
        !cloudKeyRef.current ||
        !cloudDeviceIdRef.current ||
        !cloudMetaRef.current ||
        !cloudAccountMetadata
      ) {
        return;
      }
      const latestEpisode = organismRef.current.episodicMemories.at(-1);
      const isMilestone =
        latestEpisode &&
        latestEpisode.at > (cloudMetaRef.current.lastSyncedAt ?? 0);
      await pushProtectedRevision(
        cloudUser.id,
        cloudKeyRef.current,
        cloudAccountMetadata,
        cloudDeviceIdRef.current,
        cloudMetaRef.current,
        latestEpisode?.kind === "legacy"
          ? "legacy"
          : isMilestone
            ? "milestone"
            : "periodic",
        { force },
      );
    },
    [
      cloudAccountMetadata,
      cloudSyncStatus,
      cloudUser,
      pushProtectedRevision,
    ],
  );

  useEffect(() => {
    if (!ready || !cloudUser || cloudLocked) return;
    const sync = () => void syncCloudNow();
    const interval = window.setInterval(sync, 5 * 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") sync();
    };
    window.addEventListener("online", sync);
    window.addEventListener("pagehide", sync);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", sync);
      window.removeEventListener("pagehide", sync);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [cloudLocked, cloudUser, ready, syncCloudNow]);

  useEffect(() => {
    if (!cloudUser || cloudLocked || cloudSyncStatus === "conflict") return;
    const timer = window.setTimeout(() => void syncCloudNow(), 2_500);
    return () => window.clearTimeout(timer);
  }, [
    cloudLocked,
    cloudSyncStatus,
    cloudUser,
    snapshot.episodicMemories.length,
    snapshot.generation,
    syncCloudNow,
  ]);

  const persistCreatureNow = useCallback(() => {
    persistLocalOrganism(organismRef.current, localOwnerRef.current);
    void syncCloudNow(true);
  }, [syncCloudNow]);

  const visitCommonsProfile = useCallback(
    async (
      profileId: number,
      gift: "hello" | "nutrient" | "play",
    ) => {
      if (continuityOperationRef.current) return;
      if (!cloudConfigured() || !ownProfileId) {
        setCloudMessage("Publish your own blob before visiting.");
        return;
      }
      setCloudBusy(true);
      const { error } = await getCloudClient().from("blob_visits").insert({
        host_profile_id: profileId,
        visitor_profile_id: ownProfileId,
        gift_type: gift,
      });
      setCloudBusy(false);
      if (error) {
        setCloudMessage(
          error.code === "23505"
            ? "Livi already visited that blob today."
            : error.message,
        );
        return;
      }
      organismRef.current.joy = clamp(organismRef.current.joy + 0.025);
      recordRoutine(organismRef.current, {
        kind: "friend",
        friendId: `commons:${profileId}`,
      });
      behaviorRef.current = "Remembering a Commons visit";
      persistCreatureNow();
      setCloudMessage("Visit delivered. The daily limit is verified by Commons time.");
      refreshProgress("Livi returned from a Commons visit.");
      await refreshCommons();
    },
    [ownProfileId, persistCreatureNow, refreshCommons, refreshProgress],
  );

  const requestCommonsFriend = useCallback(
    async (profileId: number) => {
      if (!cloudConfigured() || !ownProfileId) return;
      setCloudBusy(true);
      const { error } = await getCloudClient()
        .from("blob_friendships")
        .insert({
          requester_profile_id: ownProfileId,
          addressee_profile_id: profileId,
          status: "pending",
        });
      setCloudBusy(false);
      setCloudMessage(
        error
          ? error.code === "23505"
            ? "These blobs already have a friendship signal."
            : error.message
          : "Friendship signal sent.",
      );
      if (!error) await refreshCommons();
    },
    [ownProfileId, refreshCommons],
  );

  const answerCommonsFriend = useCallback(
    async (
      friendshipId: number,
      answer: "accepted" | "declined",
    ) => {
      if (!cloudConfigured()) return;
      setCloudBusy(true);
      const { error } = await getCloudClient()
        .from("blob_friendships")
        .update({ status: answer, updated_at: new Date().toISOString() })
        .eq("id", friendshipId);
      setCloudBusy(false);
      setCloudMessage(
        error
          ? error.message
          : answer === "accepted"
            ? "The blobs are now connected."
            : "Friendship signal declined.",
      );
      if (!error) await refreshCommons();
    },
    [refreshCommons],
  );

  const exportOrganism = useCallback(() => {
    const payload = JSON.stringify(
      {
        format: "livi-organism",
        exportedAt: new Date().toISOString(),
        organism: organismRef.current,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([payload], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `livi-${Math.abs(organismRef.current.seed)
      .toString(16)
      .slice(-6)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setCloudMessage("Local organism file downloaded.");
  }, []);

  const importOrganism = useCallback(
    async (file: File) => {
      continuityOperationRef.current = true;
      try {
        if (file.size > 15_000_000) {
          throw new Error(
            "That recovery file is too large to be a valid LIVI organism.",
          );
        }
        const parsed = JSON.parse(await file.text()) as {
          organism?: unknown;
        };
        const organism = normalizeSavedOrganism(parsed.organism ?? parsed);
        const continuous = preserveMonotonicContinuity(
          organism,
          organismRef.current,
        );
        preserveLocalRestorePoint(
          organismRef.current,
          "Before recovery-file import",
        );
        checkpointRef.current = structuredClone(organismRef.current);
        setCheckpointAvailable(true);

        if (
          cloudUser &&
          cloudKeyRef.current &&
          cloudDeviceIdRef.current &&
          cloudMetaRef.current &&
          cloudAccountMetadata
        ) {
          const preserved = await pushProtectedRevision(
            cloudUser.id,
            cloudKeyRef.current,
            cloudAccountMetadata,
            cloudDeviceIdRef.current,
            cloudMetaRef.current,
            "manual",
            { force: true },
          );
          if (preserved?.revision_status === "conflict") return;
          const imported = await pushProtectedRevision(
            cloudUser.id,
            cloudKeyRef.current,
            cloudAccountMetadata,
            cloudDeviceIdRef.current,
            cloudMetaRef.current,
            "restore",
            {
              organism: continuous,
              parentRevisionId: cloudMetaRef.current.headRevisionId,
              force: true,
            },
          );
          if (imported?.revision_status !== "accepted") return;
        }
        applyProtectedOrganism(
          continuous,
          "Remembering an imported life",
          "Recovery file restored. The prior organism remains in local and cloud history.",
        );
      } catch (error) {
        setCloudMessage(
          error instanceof Error ? error.message : "Import failed.",
        );
      } finally {
        continuityOperationRef.current = false;
      }
    },
    [
      applyProtectedOrganism,
      cloudAccountMetadata,
      cloudUser,
      pushProtectedRevision,
    ],
  );

  const createCheckpoint = useCallback(() => {
    labOrganismRef.current = structuredClone(organismRef.current);
    checkpointRef.current = structuredClone(labOrganismRef.current);
    setCheckpointAvailable(true);
    setToast("Disposable lab clone and checkpoint created.");
  }, []);

  const restoreCheckpoint = useCallback(() => {
    if (continuityOperationRef.current) return;
    if (!checkpointRef.current) return;
    const organism = structuredClone(checkpointRef.current);
    organism.lastSeen = Date.now();
    labOrganismRef.current = organism;
    setToast("Disposable lab clone restored. Your living companion was untouched.");
  }, []);

  const advanceLabTime = useCallback((minutes: number) => {
    if (continuityOperationRef.current) return;
    const organism =
      labOrganismRef.current ??
      (labOrganismRef.current = structuredClone(organismRef.current));
    simulateElapsed(organism, minutes);
    evaluateProgress(organism);
    setToast(
      minutes >= 30 * 1440
        ? "Thirty days passed in the disposable lab clone."
        : "One day passed in the disposable lab clone.",
    );
  }, []);

  const starveLab = useCallback(() => {
    if (continuityOperationRef.current) return;
    const organism =
      labOrganismRef.current ??
      (labOrganismRef.current = structuredClone(organismRef.current));
    organism.cells.forEach((cell, index) => {
      if (!cell.alive) return;
      const distance = Math.hypot(
        (index % GRID) - CENTER,
        Math.floor(index / GRID) - CENTER,
      );
      cell.energy = clamp(cell.energy * (distance > 5 ? 0.08 : 0.25));
      cell.health = clamp(cell.health - (distance > 5 ? 0.16 : 0.06));
    });
    organism.joy = clamp(organism.joy - 0.2);
    setToast("Energy collapsed in the disposable lab clone only.");
  }, []);

  const bloomLab = useCallback(() => {
    if (continuityOperationRef.current) return;
    const organism =
      labOrganismRef.current ??
      (labOrganismRef.current = structuredClone(organismRef.current));
    organism.cells.forEach((cell) => {
      if (!cell.alive) return;
      cell.energy = Math.max(cell.energy, 0.97);
      cell.health = Math.max(cell.health, 0.92);
    });
    for (let tick = 0; tick < 45; tick += 1) metabolize(organism, 0);
    evaluateProgress(organism);
    setToast("The disposable lab clone entered a nutrient bloom.");
  }, []);

  const dormancyLab = useCallback(() => {
    if (continuityOperationRef.current) return;
    const organism =
      labOrganismRef.current ??
      (labOrganismRef.current = structuredClone(organismRef.current));
    organism.cells.forEach((cell, index) => {
      if (index === CENTER * GRID + CENTER) {
        cell.alive = true;
        cell.energy = 0.05;
        cell.health = 0.15;
      } else {
        cell.alive = false;
        cell.energy = 0;
        cell.health = 0;
      }
    });
    setToast("The disposable lab clone now has one dormant core.");
  }, []);

  const administerPulseCapsule = useCallback(() => {
    if (continuityOperationRef.current) return;
    const result = activatePulseCapsule(organismRef.current);
    if (result.ok) {
      behaviorRef.current = "Stabilizing new stem buds";
      playTone("eat");
      persistCreatureNow();
    }
    setToast(result.message);
    setSnapshot(makeSnapshot(organismRef.current, behaviorRef.current));
  }, [persistCreatureNow, playTone]);

  const buyPulseCapsule = useCallback(() => {
    if (continuityOperationRef.current) return;
    const result = purchasePulseCapsule(organismRef.current);
    if (result.ok) persistCreatureNow();
    setToast(result.message);
    setSnapshot(makeSnapshot(organismRef.current, behaviorRef.current));
  }, [persistCreatureNow]);

  const buyLifespanSerum = useCallback(() => {
    if (continuityOperationRef.current) return;
    const result = purchaseLifespanSerum(organismRef.current);
    if (result.ok) persistCreatureNow();
    setToast(result.message);
    setSnapshot(makeSnapshot(organismRef.current, behaviorRef.current));
  }, [persistCreatureNow]);

  const administerLifespanSerum = useCallback(() => {
    if (continuityOperationRef.current) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Give this generation one Monthlight dose? This irreversibly uses the vial and adds exactly 30 days.",
      )
    ) {
      return;
    }
    const result = administerMonthlightSerum(organismRef.current);
    if (result.ok) {
      behaviorRef.current = "Absorbing Monthlight slowly";
      persistCreatureNow();
    }
    setToast(result.message);
    setSnapshot(makeSnapshot(organismRef.current, behaviorRef.current));
  }, [persistCreatureNow]);

  const hatchLegacy = useCallback(() => {
    if (continuityOperationRef.current) return;
    const result = hatchLegacyGeneration(organismRef.current);
    if (result.ok) {
      behaviorRef.current = "Recognizing you through a new body";
      positionRef.current = {
        x: 0.5,
        y: 0.59,
        vx: 0,
        vy: 0,
        targetX: 0.5,
        targetY: 0.59,
        nextWander: performance.now() + 1800,
      };
      playTone("pet");
      persistCreatureNow();
    }
    setToast(result.message);
    setSnapshot(makeSnapshot(organismRef.current, behaviorRef.current));
  }, [persistCreatureNow, playTone]);

  const purchaseItem = useCallback(
    (itemId: string) => {
      if (continuityOperationRef.current) return;
      if (itemId === "pulse-capsule") {
        buyPulseCapsule();
        return;
      }
      if (itemId === "monthlight-serum") {
        buyLifespanSerum();
        return;
      }
      const item = STORE_ITEMS.find(({ id }) => id === itemId);
      const organism = organismRef.current;
      if (!item || organism.ownedItems.includes(itemId)) return;
      if (organism.currency < item.price) {
        setToast(`Livi needs ${item.price - organism.currency} more Motes.`);
        return;
      }
      recordMoteTransaction(
        organism,
        -item.price,
        "store-purchase",
        itemId,
        `store-purchase:${itemId}`,
      );
      organism.ownedItems.push(itemId);
      if (item.category === "room") organism.equippedRoom = itemId;
      if (item.category === "toy") organism.equippedToy = itemId;
      if (item.id === "auto-feeder") {
        organism.lastFeederAt = Date.now() - FEEDER_INTERVAL_MS;
      }
      behaviorRef.current = `Exploring the ${item.name}`;
      persistCreatureNow();
      refreshProgress(`${item.name} joined Livi's little world.`);
    },
    [
      buyLifespanSerum,
      buyPulseCapsule,
      persistCreatureNow,
      refreshProgress,
    ],
  );

  const equipItem = useCallback(
    (itemId: string) => {
      if (continuityOperationRef.current) return;
      const item = STORE_ITEMS.find(({ id }) => id === itemId);
      const organism = organismRef.current;
      if (!item || !organism.ownedItems.includes(itemId)) return;
      if (item.category === "room") organism.equippedRoom = itemId;
      if (item.category === "toy") organism.equippedToy = itemId;
      if (item.category !== "room" && item.category !== "toy") return;
      if (item.category === "room") {
        recordRoutine(organism, { kind: "room", roomId: itemId });
      }
      behaviorRef.current = `Noticing the ${item.name}`;
      persistCreatureNow();
      refreshProgress(`${item.name} equipped.`);
    },
    [persistCreatureNow, refreshProgress],
  );

  const inviteFriend = useCallback(
    (friendId: string) => {
      if (continuityOperationRef.current) return;
      const organism = organismRef.current;
      const friend = organism.friends.find(({ id }) => id === friendId);
      const definition = FRIENDS.find(({ id }) => id === friendId);
      if (!friend || !definition) return;
      const now = Date.now();
      const broughtGift = now - friend.lastVisit >= FEEDER_INTERVAL_MS;
      friend.visits += 1;
      friend.bond = clamp(friend.bond + 0.045);
      friend.lastVisit = now;
      organism.activeFriendId = friendId;
      organism.joy = clamp(organism.joy + 0.04);
      if (broughtGift) {
        recordMoteTransaction(
          organism,
          5,
          "friend-gift",
          friendId,
          `friend-gift:${friendId}:${memoryDay(now)}`,
        );
      }
      recordRoutine(organism, { kind: "friend", friendId }, now);
      behaviorRef.current = `Visiting with ${definition.name}`;
      persistCreatureNow();
      refreshProgress(
        `${definition.name} is visiting${broughtGift ? " and brought 5 Motes" : ""}.`,
      );
    },
    [persistCreatureNow, refreshProgress],
  );

  const vitality = Math.round((snapshot.energy * 0.58 + snapshot.health * 0.42) * 100);
  const activeFriend = FRIENDS.find(({ id }) => id === snapshot.activeFriendId);
  const traitEntries = useMemo(
    () =>
      (Object.entries(snapshot.traits) as [keyof Traits, number][]).filter(
        ([key]) => key !== "growthBias",
      ),
    [snapshot.traits],
  );
  const memoryEpisodes = useMemo<MemoryEpisode[]>(
    () =>
      snapshot.episodicMemories
        .map((memory) => ({
          id: memory.id,
          occurredAt: memory.at,
          ...memoryPresentation(memory),
          detail: memory.summary,
          generation: memory.generation,
        }))
        .sort((left, right) => right.occurredAt - left.occurredAt),
    [snapshot.episodicMemories],
  );
  const routineSummaries = useMemo<RoutineSummary[]>(
    () =>
      snapshot.routineMemories
        .map((routine) => {
          const favoriteToyId = favoriteKey(routine.toyUses);
          const favoriteRoomId = favoriteKey(routine.roomVisits);
          const favoriteFriendId = favoriteKey(routine.friendVisits);
          const calmRatio =
            routine.careMoments > 0
              ? routine.calmMoments / routine.careMoments
              : 0.5;
          const chaoticRatio =
            routine.careMoments > 0
              ? routine.chaoticMoments / routine.careMoments
              : 0;
          const careStyle: RoutineSummary["careStyle"] =
            routine.careMoments === 0
              ? "distant"
              : chaoticRatio > 0.34
                ? "chaotic"
                : routine.plays > routine.feeds + routine.pets
                  ? "playful"
                  : calmRatio > 0.56
                    ? "calm"
                    : "steady";
          return {
            date: routine.day,
            meals: routine.feeds,
            pets: routine.pets,
            plays: routine.plays,
            minutesTogether: Math.max(
              routine.careMoments,
              Math.round(routine.careMoments * 2.5),
            ),
            longestAbsenceMinutes: Math.round(
              routine.longestCareGapMinutes,
            ),
            careStyle,
            favoriteToy: STORE_ITEMS.find(({ id }) => id === favoriteToyId)
              ?.name,
            favoriteRoom: STORE_ITEMS.find(({ id }) => id === favoriteRoomId)
              ?.name,
            favoriteFriend:
              FRIENDS.find(({ id }) => id === favoriteFriendId)?.name ??
              (favoriteFriendId?.startsWith("commons:")
                ? "a Commons friend"
                : undefined),
          };
        })
        .sort((left, right) => right.date.localeCompare(left.date)),
    [snapshot.routineMemories],
  );
  const germination = useMemo<HubGerminationState>(() => {
    const status: HubGerminationState["status"] =
      snapshot.pulseScaffoldCells > 0
        ? "reviving"
        : snapshot.germinationState === "priming" ||
      snapshot.germinationState === "budding"
        ? "germinating"
        : snapshot.germinationState === "dire"
          ? "dire"
          : "stable";
    const message =
      snapshot.pulseScaffoldCells > 0
        ? `${snapshot.pulseScaffoldCells} temporary stem cells are assimilating nutrients (${Math.round(snapshot.pulseScaffoldNutrition * 100)}%). Their protection lasts ${Math.ceil(snapshot.pulseScaffoldProtectionMinutes / 60)} more hours; unfed tissue can still fail.`
        : snapshot.germinationState === "dire"
        ? snapshot.germinationDormancy > 0.65
          ? "The lone seed is deeply dormant after a long neglect. Three slowly assimilated meals will wake it, but budding will take longer."
          : "The surviving core can still recover naturally. Feed it gently; three slowly assimilated meals begin germination."
        : snapshot.germinationState === "priming"
          ? `The core has absorbed ${snapshot.germinationMeals} of ${snapshot.germinationMealsRequired} nourishing meals.`
          : snapshot.germinationState === "budding"
            ? "Enough energy is stored. A real stem-cell bud is forming over several metabolic pulses."
            : snapshot.germinationState === "legacy"
              ? "This life has reached its natural end. Its seed is holding the bond for the next generation."
              : "The cellular field is stable.";
    return {
      livingCells: snapshot.living,
      status,
      progress: snapshot.germinationProgress,
      mealsGiven: snapshot.germinationMeals,
      mealsNeeded: snapshot.germinationMealsRequired,
      message,
      scaffoldCells: snapshot.pulseScaffoldCells,
      scaffoldNutrition: snapshot.pulseScaffoldNutrition,
      scaffoldProtectionMinutes: snapshot.pulseScaffoldProtectionMinutes,
    };
  }, [
    snapshot.germinationMeals,
    snapshot.germinationMealsRequired,
    snapshot.germinationProgress,
    snapshot.germinationDormancy,
    snapshot.germinationState,
    snapshot.living,
    snapshot.pulseScaffoldCells,
    snapshot.pulseScaffoldNutrition,
    snapshot.pulseScaffoldProtectionMinutes,
  ]);
  const vitalInventory = useMemo<VitalInventory>(
    () => ({
      pulseCapsules: snapshot.pulseCapsules,
      freePulseAvailable:
        snapshot.pulseCapsulesUsed === 0 && snapshot.pulseCapsules > 0,
      monthlightSerums: snapshot.lifespanSerums,
      monthlightUses: snapshot.lifespanSerumsUsed,
      monthlightUseCap: MAX_LIFESPAN_SERUM_USES,
      canUseMonthlight: snapshot.canUseLifespanSerum,
      canAcquireMonthlight:
        lifeStats(organismRef.current).naturalProgress >= ELDER_THRESHOLD &&
        snapshot.lifeProgress < 1 &&
        snapshot.bond >= 0.55 &&
        snapshot.lifespanSerums + snapshot.lifespanSerumsUsed <
          MAX_LIFESPAN_SERUM_USES,
      monthlightReason:
        snapshot.bond < 0.55
          ? "Requires a deeply bonded elder life (55% bond)."
          : lifeStats(organismRef.current).naturalProgress < ELDER_THRESHOLD
            ? "Appears only as elder metabolism begins."
            : "Adds exactly 30 days without reversing elderhood.",
    }),
    [
      snapshot.lifespanSerums,
      snapshot.lifespanSerumsUsed,
      snapshot.pulseCapsules,
      snapshot.pulseCapsulesUsed,
      snapshot.bond,
      snapshot.lifeProgress,
    ],
  );
  const generations = useMemo<LegacyGeneration[]>(() => {
    const inheritedTraits = (Object.entries(snapshot.traits) as [
      keyof Traits,
      number,
    ][])
      .sort(([, left], [, right]) => right - left)
      .slice(0, 3)
      .map(([trait]) => traitLabel(trait));
    const remembered = snapshot.episodicMemories.filter(
      ({ generation }) => generation === snapshot.generation,
    ).length;
    const past = snapshot.legacyRecords.map((record) => ({
      generation: record.generation,
      name: `Livi · Generation ${record.generation}`,
      bornAt: record.bornAt,
      endedAt: record.endedAt,
      endCause: "Its natural span closed, leaving a living legacy seed.",
      phenotype: record.phenotype,
      highestBond: record.peakBond,
      achievementCount: record.achievements.length,
      rememberedEpisodes: record.memoryIds.length,
      inheritedTraits: (Object.entries(record.traitsAtBirth) as [
        keyof Traits,
        number,
      ][])
        .sort(([, left], [, right]) => right - left)
        .slice(0, 3)
        .map(([trait]) => traitLabel(trait)),
    }));
    return [
      ...past,
      {
        generation: snapshot.generation,
        name: `Livi · Generation ${snapshot.generation}`,
        bornAt: snapshot.generationStartedAt,
        phenotype: snapshot.phenotype,
        highestBond: snapshot.bond,
        achievementCount: snapshot.achievements.length,
        rememberedEpisodes: remembered,
        inheritedTraits,
      },
    ];
  }, [
    snapshot.achievements.length,
    snapshot.bond,
    snapshot.episodicMemories,
    snapshot.generation,
    snapshot.generationStartedAt,
    snapshot.legacyRecords,
    snapshot.phenotype,
    snapshot.traits,
  ]);
  const legacyTransition = useMemo<LegacyTransition>(() => {
    const inheritedTraits = (Object.entries(snapshot.traits) as [
      keyof Traits,
      number,
    ][])
      .sort(([, left], [, right]) => right - left)
      .slice(0, 3)
      .map(([trait]) => traitLabel(trait));
    const available = snapshot.lifeProgress >= 0.9;
    return {
      available,
      seedReady: snapshot.legacyReady,
      inheritedBond: snapshot.bond * 0.72,
      inheritedAchievements: snapshot.achievements.length,
      inheritedMemories: snapshot.episodicMemories.length,
      inheritedTraits,
      message: snapshot.legacyReady
        ? "A new seed is ready. It will recognize your bond without pretending this body never ended."
        : available
          ? "Senescence is gathering a legacy seed while this generation completes its natural span."
          : "This generation is still becoming itself.",
    };
  }, [
    snapshot.achievements.length,
    snapshot.bond,
    snapshot.episodicMemories.length,
    snapshot.legacyReady,
    snapshot.lifeProgress,
    snapshot.traits,
  ]);

  if (!ready) {
    return (
      <main className="livi-loading" aria-live="polite">
        <span className="livi-loading__core" />
        <p>Waking the organism…</p>
      </main>
    );
  }

  return (
    <main
      className={`livi-shell room-${snapshot.equippedRoom} ${
        cameraActive ? "is-camera" : ""
      }`}
    >
      <video
        ref={videoRef}
        className="camera-feed"
        muted
        playsInline
        aria-hidden="true"
      />
      <div className="habitat" aria-hidden="true">
        <div className="habitat__window" />
        <div className="habitat__shelf habitat__shelf--one" />
        <div className="habitat__shelf habitat__shelf--two" />
        <div className="habitat__floor" />
        <div className="habitat__light" />
        {snapshot.equippedToy ? (
          <div className={`habitat-toy habitat-toy--${snapshot.equippedToy}`} />
        ) : null}
      </div>

      <header className="topbar">
        <button className="brand" onClick={() => setInspectOpen(true)} aria-label="Open Livi biology">
          <span className="brand__mark">LIVI</span>
          <span className="brand__subtitle">living virtual companion</span>
        </button>
        <div className="presence-pill">
          <span className="presence-pill__pulse" />
          {cameraActive ? "AR presence" : "Habitat online"}
        </div>
        <div className="topbar__actions">
          <button
            className={`topbar-cloud topbar-cloud--${cloudSyncStatus}`}
            onClick={() => {
              setHubTab("commons");
              setLifeHubOpen(true);
            }}
            aria-label={
              cloudUser
                ? `Open encrypted cloud continuity. Status: ${cloudSyncStatus}`
                : "Open optional login and cloud continuity"
            }
          >
            <span aria-hidden="true">☁</span>
            {cloudUser
              ? cloudSyncStatus === "synced"
                ? "Protected"
                : cloudSyncStatus
              : "Local"}
          </button>
          <button
            className="topbar-wallet"
            onClick={() => {
              setHubTab("store");
              setLifeHubOpen(true);
            }}
            aria-label={`Open store with ${snapshot.currency} Motes`}
          >
            <span>✦</span>
            {snapshot.currency}
          </button>
          <button
            className="round-button"
            onClick={() => setSoundOn((value) => !value)}
            aria-label={soundOn ? "Mute Livi sounds" : "Turn on Livi sounds"}
          >
            {soundOn ? "◖))" : "◖×"}
          </button>
        </div>
      </header>

      <section className="identity-card" aria-label="Livi identity">
        <span className="eyebrow">YOUR ORGANISM</span>
        <div className="identity-card__title-row">
          <h1>Livi</h1>
          <span className={`state-dot state-dot--${snapshot.stage.toLowerCase().replaceAll(" ", "-")}`} />
        </div>
        <p>{snapshot.phenotype}</p>
        <div className="identity-card__behavior">
          <span>●</span> {snapshot.behavior}
        </div>
      </section>

      <section className="biology-card" aria-label="Living systems">
        <button className="biology-card__header" onClick={() => setInspectOpen(true)}>
          <span>
            <span className="eyebrow">LIVE BIOLOGY</span>
            <strong>{snapshot.stage}</strong>
          </span>
          <span className="biology-card__arrow">↗</span>
        </button>
        <div className="vitality-row">
          <span>Vitality</span>
          <strong>{vitality}%</strong>
        </div>
        <div className="meter">
          <span style={{ width: `${vitality}%` }} />
        </div>
        <button
          className="life-mini"
          onClick={() => {
            setHubTab("achievements");
            setLifeHubOpen(true);
          }}
        >
          <span>{snapshot.lifePhase}</span>
          <i>
            <b style={{ width: `${snapshot.lifeProgress * 100}%` }} />
          </i>
          <strong>{snapshot.lifeRemaining}</strong>
        </button>
        <div className="biology-card__metrics">
          <div>
            <strong>{snapshot.living}</strong>
            <span>living cells</span>
          </div>
          <div>
            <strong>{Math.round(snapshot.energy * 100)}%</strong>
            <span>energy</span>
          </div>
          <div>
            <strong>{Math.round(snapshot.bond * 100)}%</strong>
            <span>bond</span>
          </div>
        </div>
      </section>

      <section className="organism-stage" aria-label="Livi's habitat">
        <div className="field-reticle" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <canvas
          ref={canvasRef}
          className="organism-canvas"
          aria-label="A living translucent organism. Stroke Livi to pet it, or tap elsewhere to place food."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={stopPetting}
          onPointerCancel={stopPetting}
          onPointerLeave={stopPetting}
        />
        {activeFriend ? (
          <div
            className="visiting-friend"
            style={{ "--friend-color": activeFriend.hue } as React.CSSProperties}
            aria-label={`${activeFriend.name} is visiting`}
          >
            <i />
            <i />
            <small>{activeFriend.name}</small>
          </div>
        ) : null}
        <div className="stage-hint">
          <span className="stage-hint__gesture">⌁</span>
          Stroke Livi to pet · tap the room to feed
        </div>
      </section>

      <div className="care-toast" role="status" aria-live="polite">
        <span className="care-toast__core" />
        {toast}
      </div>

      <nav className="care-dock" aria-label="Care actions">
        <button onClick={() => feedAt()} className="care-action">
          <span className="care-action__icon care-action__icon--feed">✦</span>
          <span>Feed</span>
        </button>
        <button onClick={() => pet()} className="care-action care-action--primary">
          <span className="care-action__icon care-action__icon--pet">♡</span>
          <span>Pet</span>
        </button>
        <button onClick={play} className="care-action">
          <span className="care-action__icon care-action__icon--play">◌</span>
          <span>Play</span>
        </button>
        <span className="care-dock__rule" />
        <button
          onClick={toggleCamera}
          className={`care-action ${cameraActive ? "is-active" : ""}`}
        >
          <span className="care-action__icon care-action__icon--ar">⌗</span>
          <span>{cameraActive ? "Exit AR" : "AR room"}</span>
        </button>
        <button
          onClick={() => {
            setHubTab("commons");
            setLifeHubOpen(true);
          }}
          className="care-action"
        >
          <span className="care-action__icon care-action__icon--hub">⌂</span>
          <span>Life Hub</span>
        </button>
      </nav>

      {cameraMessage && <p className="camera-message">{cameraMessage}</p>}

      <button className="biology-tab" onClick={() => setInspectOpen(true)}>
        <span className="biology-tab__cells">⬡</span>
        <span>
          <small>BODY STATE</small>
          {snapshot.living} cells · generation {snapshot.lineage}
        </span>
        <strong>Inspect</strong>
      </button>

      {inspectOpen && (
        <div className="sheet-backdrop" onClick={() => setInspectOpen(false)}>
          <aside
            className="biology-sheet"
            aria-modal="true"
            role="dialog"
            aria-labelledby="biology-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="sheet-close"
              onClick={() => setInspectOpen(false)}
              aria-label="Close biology view"
            >
              ×
            </button>
            <span className="eyebrow">UNDER THE MEMBRANE</span>
            <h2 id="biology-title">Nothing here is cosmetic.</h2>
            <p className="biology-sheet__lede">
              Every visible cell spends energy, exchanges nutrients with its
              neighbors, repairs, divides, or dies. Care changes the organism
              you actually have.
            </p>
            <div className="lifecycle-actions" aria-label="Lifecycle care">
              {snapshot.living <= 1 && !snapshot.legacyReady ? (
                <article className="lifecycle-action lifecycle-action--dire">
                  <div>
                    <small>LONE-SEED GERMINATION</small>
                    <strong>
                      {snapshot.germinationMeals}/{snapshot.germinationMealsRequired}{" "}
                      nourishing meals
                    </strong>
                    <p>
                      Feeding is enough. Once healthy, the core slowly buds the
                      second cell ordinary growth requires.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={administerPulseCapsule}
                    disabled={!snapshot.canUsePulseCapsule}
                  >
                    Pulse revive · {snapshot.pulseCapsules} held
                  </button>
                </article>
              ) : null}
              {snapshot.legacyReady ? (
                <article className="lifecycle-action lifecycle-action--legacy">
                  <div>
                    <small>LEGACY SEED</small>
                    <strong>The body ended. The bond remains.</strong>
                    <p>
                      Hatch a new generation carrying personality, trust,
                      achievements, and remembered care.
                    </p>
                  </div>
                  <button type="button" onClick={hatchLegacy}>
                    Hatch generation {snapshot.generation + 1}
                  </button>
                </article>
              ) : null}
              <article className="lifecycle-action">
                <div>
                  <small>EMERGENCY RESERVE</small>
                  <strong>
                    {snapshot.pulseCapsules} Pulse Capsule
                    {snapshot.pulseCapsules === 1 ? "" : "s"}
                  </strong>
                  <p>The first dose is free. More cost {PULSE_CAPSULE_PRICE} earned Motes.</p>
                </div>
                <button
                  type="button"
                  onClick={buyPulseCapsule}
                  disabled={
                    snapshot.currency < PULSE_CAPSULE_PRICE ||
                    snapshot.pulseCapsules >= MAX_PULSE_CAPSULES_HELD
                  }
                >
                  Hold another · {PULSE_CAPSULE_PRICE} ✦
                </button>
              </article>
              <article className="lifecycle-action">
                <div>
                  <small>MONTHLIGHT SERUM</small>
                  <strong>
                    {snapshot.lifespanExtensionDays} days extended ·{" "}
                    {snapshot.lifespanSerumUsesRemaining} dose cap left
                  </strong>
                  <p>
                    Rare elder medicine. Each earned-Mote dose adds thirty days;
                    no generation can take more than two.
                  </p>
                </div>
                {snapshot.lifespanSerums > 0 ? (
                  <button
                    type="button"
                    onClick={administerLifespanSerum}
                    disabled={!snapshot.canUseLifespanSerum}
                  >
                    Administer held serum
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={buyLifespanSerum}
                    disabled={
                      !vitalInventory.canAcquireMonthlight ||
                      snapshot.currency < LIFESPAN_SERUM_PRICE
                    }
                    title={vitalInventory.monthlightReason}
                  >
                    Acquire · {LIFESPAN_SERUM_PRICE} ✦
                  </button>
                )}
              </article>
            </div>
            <div className="system-grid">
              <article>
                <span className="system-grid__glyph system-grid__glyph--body">⬡</span>
                <div>
                  <small>BODY</small>
                  <strong>{snapshot.living} living cells</strong>
                  <p>Nutrients diffuse locally. High-energy edges can divide.</p>
                </div>
              </article>
              <article>
                <span className="system-grid__glyph system-grid__glyph--mind">⌁</span>
                <div>
                  <small>MIND</small>
                  <strong>{snapshot.behavior}</strong>
                  <p>Simple sensing and inherited traits choose each action.</p>
                </div>
              </article>
              <article>
                <span className="system-grid__glyph system-grid__glyph--bond">♡</span>
                <div>
                  <small>RELATIONSHIP</small>
                  <strong>{Math.round(snapshot.bond * 100)}% bonded</strong>
                  <p>Touch, meals, play, and absence become care history.</p>
                </div>
              </article>
              <article>
                <span className="system-grid__glyph system-grid__glyph--life">◐</span>
                <div>
                  <small>LIFESPAN</small>
                  <strong>{snapshot.lifePhase} · about {snapshot.lifespanDays} days</strong>
                  <p>
                    Age and resilience set the natural span. Elder cells slowly
                    decline into a persistent legacy seed.
                  </p>
                </div>
              </article>
            </div>
            <div className="trait-panel">
              <div className="trait-panel__heading">
                <span>
                  <small>ADAPTIVE PROFILE</small>
                  <strong>{snapshot.phenotype}</strong>
                </span>
                <span>mutates during growth</span>
              </div>
              {traitEntries.map(([key, value]) => (
                <div className="trait" key={key}>
                  <span>{traitLabel(key)}</span>
                  <div>
                    <i style={{ width: `${value * 100}%` }} />
                  </div>
                  <strong>{Math.round(value * 100)}</strong>
                </div>
              ))}
            </div>
            <div className="biology-sheet__footer">
              <span>Age {snapshot.age}</span>
              <span>{snapshot.births} cell births observed</span>
              <span>{snapshot.meals} meals remembered</span>
              <span>{snapshot.lifeRemaining} remaining</span>
            </div>
          </aside>
        </div>
      )}

      <LifeHub
        open={lifeHubOpen}
        tab={hubTab}
        currency={snapshot.currency}
        ownedItems={snapshot.ownedItems}
        equippedRoom={snapshot.equippedRoom}
        equippedToy={snapshot.equippedToy}
        unlockedAchievements={snapshot.achievements}
        friendStates={snapshot.friends}
        activeFriendId={snapshot.activeFriendId}
        lifePhase={snapshot.lifePhase}
        lifespanDays={snapshot.lifespanDays}
        lifeRemaining={snapshot.lifeRemaining}
        feederStatus={snapshot.feederStatus}
        memoryEpisodes={memoryEpisodes}
        routineSummaries={routineSummaries}
        germination={germination}
        vitalInventory={vitalInventory}
        generations={generations}
        legacyTransition={legacyTransition}
        onClose={() => setLifeHubOpen(false)}
        onTab={setHubTab}
        onPurchase={purchaseItem}
        onEquip={equipItem}
        onInvite={inviteFriend}
        onAcquireVitalItem={(itemId) => {
          if (itemId === "pulse-capsule") buyPulseCapsule();
          else buyLifespanSerum();
        }}
        onUseVitalItem={(itemId) => {
          if (itemId === "pulse-capsule") administerPulseCapsule();
          else administerLifespanSerum();
        }}
        onBeginLegacy={hatchLegacy}
        commonsContent={
          <CloudCommons
            configured={cloudConfigured()}
            connectedEmail={cloudUser?.email ?? null}
            busy={cloudBusy}
            message={cloudMessage}
            profiles={commonsProfiles}
            ownProfileId={ownProfileId}
            friendships={friendships}
            syncStatus={cloudSyncStatus}
            lastSyncedAt={lastCloudSyncAt}
            deviceName={cloudDeviceLabel()}
            conflictSnapshots={cloudConflictSnapshots}
            saveHistory={cloudSaveHistory}
            hasMoreHistory={cloudHistoryHasMore}
            cloudLocked={cloudLocked}
            recoveryCode={recoveryCode}
            passwordRecoveryMode={passwordRecoveryMode}
            onAuth={authenticateCloud}
            onRequestPasswordReset={requestCloudPasswordReset}
            onUnlockCloud={unlockCloudHistory}
            onAcknowledgeRecoveryCode={() => {
              sessionStorage.removeItem(RECOVERY_CODE_SESSION_KEY);
              setRecoveryCode(null);
            }}
            onCompletePasswordRecovery={completeCloudPasswordRecovery}
            onSignOut={signOutCloud}
            onPublish={publishCloud}
            onRestore={restoreCloud}
            onRestoreVersion={restoreCloudVersion}
            onLoadOlderHistory={loadOlderCloudHistory}
            onResolveConflict={resolveCloudConflict}
            onRetrySync={retryCloudSync}
            onRefresh={refreshCommons}
            onVisit={visitCommonsProfile}
            onFriend={requestCommonsFriend}
            onAnswerFriend={answerCommonsFriend}
            onExport={exportOrganism}
            onImport={importOrganism}
          />
        }
        labContent={
          <SimulationLab
            checkpointAvailable={checkpointAvailable}
            onCheckpoint={createCheckpoint}
            onRestoreCheckpoint={restoreCheckpoint}
            onAdvance={advanceLabTime}
            onStarve={starveLab}
            onBloom={bloomLab}
            onDormancy={dormancyLab}
          />
        }
      />

      {welcomed && (
        <div className="welcome-backdrop">
          <section className="welcome-card" aria-labelledby="welcome-title">
            <span className="welcome-card__specimen">
              <i />
              <i />
              <i />
              <b />
            </span>
            <span className="eyebrow">NEW SIGNAL DETECTED</span>
            <h2 id="welcome-title">A life is waiting for you.</h2>
            <p>
              Livi begins as a small cluster of real simulated cells. Food becomes
              body. Touch becomes trust. Time leaves a mark.
            </p>
            <div className="welcome-card__facts">
              <span><strong>{snapshot.living}</strong> cells awake</span>
              <span><strong>1</strong> unique seed</span>
              <span><strong>∞</strong> possible forms</span>
            </div>
            <button onClick={welcome}>Meet Livi</button>
            <small>Your organism is saved privately on this device.</small>
          </section>
        </div>
      )}
    </main>
  );
}
