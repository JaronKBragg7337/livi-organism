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
  checksumJson,
  cloudConfigured,
  getCloudClient,
  type CommonsFriendship,
  type CommonsProfile,
} from "./cloud";
import {
  ACHIEVEMENTS,
  FEEDER_INTERVAL_MS,
  FRIENDS,
  STORE_ITEMS,
  type BlobFriendState,
  type HubTab,
} from "./lifeData";

const GRID = 35;
const CENTER = Math.floor(GRID / 2);
const MAX_LIVING = Math.floor(GRID * GRID * 0.72);
const STORAGE_KEY = "livi-organism-v1";
const WELCOME_KEY = "livi-welcomed-v1";

type Cell = {
  alive: boolean;
  energy: number;
  health: number;
  age: number;
  phase: number;
  hue: number;
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
  seed: number;
  cells: Cell[];
  traits: Traits;
  bond: number;
  trust: number;
  joy: number;
  ageMinutes: number;
  meals: number;
  touches: number;
  births: number;
  lineage: number;
  lastSeen: number;
  lastCare: number;
  currency: number;
  ownedItems: string[];
  equippedRoom: string;
  equippedToy: string | null;
  achievements: string[];
  friends: BlobFriendState[];
  activeFriendId: string | null;
  lastFeederAt: number;
  playCount: number;
  lastPlayRewardAt: number;
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

  return {
    version: 1,
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
    joy: 0.62,
    ageMinutes: 0,
    meals: 0,
    touches: 0,
    births: 0,
    lineage: 1,
    lastSeen: Date.now(),
    lastCare: Date.now(),
    currency: 60,
    ownedItems: [],
    equippedRoom: "atrium",
    equippedToy: null,
    achievements: [],
    friends: [],
    activeFriendId: null,
    lastFeederAt: Date.now(),
    playCount: 0,
    lastPlayRewardAt: 0,
  };
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

function hydrateLifeSystems(organism: Organism) {
  organism.currency ??= 60;
  organism.ownedItems ??= [];
  organism.equippedRoom ??= "atrium";
  organism.equippedToy ??= null;
  organism.achievements ??= [];
  organism.friends ??= [];
  organism.activeFriendId ??= null;
  organism.lastFeederAt ??= Date.now();
  organism.playCount ??= 0;
  organism.lastPlayRewardAt ??= 0;
  return organism;
}

function lifeStats(organism: Organism) {
  const lifespanDays = Math.round(120 + organism.traits.resilience * 180);
  const ageDays = organism.ageMinutes / 1440;
  const progress = ageDays / lifespanDays;
  const lifePhase =
    progress < 0.04
      ? "Hatchling"
      : progress < 0.25
        ? "Young"
        : progress < 0.65
          ? "Mature"
          : progress < 1
            ? "Elder"
            : "Legacy seed";
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
    lifespanDays,
    lifePhase,
    lifeRemaining,
    progress: clamp(progress),
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
      organism.currency += achievement.reward;
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

  return {
    living,
    energy,
    health,
    bond: organism.bond,
    stage,
    behavior,
    phenotype: phenotypeName(organism.traits, organism.seed),
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
    lifePhase: life.lifePhase,
    lifespanDays: life.lifespanDays,
    lifeRemaining: life.lifeRemaining,
    lifeProgress: life.progress,
    feederStatus: feederStatus(organism),
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

function simulateElapsed(organism: Organism, elapsedMinutes: number) {
  const elapsedHours = Math.max(0, elapsedMinutes / 60);
  const drain = elapsedHours * (0.009 + organism.traits.appetite * 0.004);
  organism.cells.forEach((cell, index) => {
    if (!cell.alive) return;
    const oldEnergy = cell.energy;
    cell.energy = clamp(cell.energy - drain);
    const deficit = Math.max(0, drain - oldEnergy);
    cell.health = clamp(
      cell.health - deficit * (1.15 - organism.traits.resilience * 0.45),
    );
    if (
      cell.health < 0.08 &&
      index !== CENTER * GRID + CENTER &&
      Math.random() < clamp(elapsedHours / 72, 0, 0.72)
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
    organism.cells.forEach((cell) => {
      if (cell.alive) cell.health = clamp(cell.health - ageDrain);
    });
  }

  if (livingCells(organism) < 4) {
    const core = organism.cells[CENTER * GRID + CENTER];
    core.alive = true;
    core.energy = Math.max(core.energy, 0.04);
    core.health = Math.max(core.health, 0.14);
  }
  organism.lastSeen = Date.now();
  return organism;
}

function applyOfflineLife(organism: Organism) {
  const elapsedMinutes = clamp(
    (Date.now() - (organism.lastSeen || Date.now())) / 60_000,
    0,
    96 * 60,
  );
  if (elapsedMinutes < 1.2) return organism;

  return simulateElapsed(organism, elapsedMinutes);
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

function normalizeSavedOrganism(value: unknown) {
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
  return applyOfflineLife(
    hydrateLifeSystems(migrateCellField(value as Organism)),
  );
}

function metabolize(organism: Organism, movementCost: number) {
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
    if (cell.energy > 0.42) {
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
    if (
      cell.health < 0.035 &&
      index !== CENTER * GRID + CENTER &&
      Math.random() < 0.12
    ) {
      cell.alive = false;
      cell.energy = 0;
      cell.health = 0;
    }
  });

  if (meanEnergy > 0.67 && living < MAX_LIVING) {
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
        organism.traits[trait] = clamp(
          organism.traits[trait] + (Math.random() - 0.5) * 0.035,
          0.08,
          0.96,
        );
      }
    }
  }

  if (livingCells(organism) < 4) {
    const core = organism.cells[CENTER * GRID + CENTER];
    core.alive = true;
    core.energy = Math.max(core.energy, 0.035);
    core.health = Math.max(core.health, 0.12);
  }

  organism.ageMinutes += 0.8 / 60;
  const life = lifeStats(organism);
  if (life.progress > 0.78) {
    const ageDrain =
      life.progress >= 1 ? 0.0018 : (life.progress - 0.78) * 0.0022;
    organism.cells.forEach((cell, index) => {
      if (!cell.alive || index === CENTER * GRID + CENTER) return;
      cell.health = clamp(cell.health - ageDrain);
    });
  }
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
  const [commonsProfiles, setCommonsProfiles] = useState<CommonsProfile[]>([]);
  const [friendships, setFriendships] = useState<CommonsFriendship[]>([]);
  const [ownProfileId, setOwnProfileId] = useState<number | null>(null);
  const [checkpointAvailable, setCheckpointAvailable] = useState(false);

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
      const organism = loadOrganism();
      organismRef.current = organism;
      setSnapshot(makeSnapshot(organism, "Noticing you"));
      setWelcomed(localStorage.getItem(WELCOME_KEY) !== "yes");
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
      void refreshCommons();
    });
    const {
      data: { subscription },
    } = cloud.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const user = session?.user;
      setCloudUser(
        user ? { id: user.id, email: user.email ?? null } : null,
      );
      window.setTimeout(() => void refreshCommons(), 0);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [ready, refreshCommons]);

  useEffect(() => {
    if (!ready) return;
    const save = () => {
      organismRef.current.lastSeen = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(organismRef.current));
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
      const now = performance.now();
      if (now - lastPetRef.current < 145) return;
      lastPetRef.current = now;
      const organism = organismRef.current;
      organism.bond = clamp(organism.bond + 0.0065);
      organism.trust = clamp(organism.trust + 0.005);
      organism.joy = clamp(organism.joy + 0.012);
      organism.touches += 1;
      if (organism.touches % 12 === 0) organism.currency += 1;
      organism.lastCare = Date.now();
      behaviorRef.current =
        organism.traits.sociability > 0.58 ? "Leaning into your touch" : "Accepting touch";
      heartsRef.current.push({
        id: heartIdRef.current++,
        x: x ?? positionRef.current.x,
        y: y ?? positionRef.current.y - 0.08,
        born: performance.now(),
      });
      playTone("pet");
      refreshProgress();
    },
    [playTone, refreshProgress],
  );

  const play = useCallback(() => {
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
      organism.currency += 3;
      organism.lastPlayRewardAt = now;
    }
    organism.lastCare = Date.now();
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
      organism.meals += 1;
      organism.currency += 2;
      organism.joy = clamp(organism.joy + 0.035);
      organism.trust = clamp(organism.trust + 0.004);
      organism.lastCare = Date.now();
      behaviorRef.current = "Digesting";
      playTone("eat");
      refreshProgress("Nutrients entered the core. +2 Motes.");
    },
    [playTone, refreshProgress],
  );

  useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(() => {
      const motion = Math.hypot(positionRef.current.vx, positionRef.current.vy) * 120;
      metabolize(organismRef.current, clamp(motion, 0, 1));
      refreshProgress();
    }, 800);
    return () => window.clearInterval(interval);
  }, [ready, refreshProgress]);

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
            : organism.traits.curiosity > 0.6
              ? "Exploring the room"
              : "Drifting";
      }

      const speed =
        (0.12 + organism.traits.locomotion * 0.12) *
        clamp(mean.energy * 1.3, 0.08, 1);
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
        if (distance < Math.max(42, Math.sqrt(mean.living) * 5.8)) {
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

  const authenticateCloud = useCallback(
    async (
      mode: "create" | "signin",
      email: string,
      password: string,
    ) => {
      if (!cloudConfigured()) return;
      setCloudBusy(true);
      setCloudMessage("");
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
          setCloudMessage("Cloud recovery is connected.");
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
        setCloudBusy(false);
      }
    },
    [refreshCommons],
  );

  const signOutCloud = useCallback(async () => {
    if (!cloudConfigured()) return;
    setCloudBusy(true);
    const { error } = await getCloudClient().auth.signOut({ scope: "local" });
    setCloudBusy(false);
    if (error) {
      setCloudMessage(error.message);
      return;
    }
    setCloudUser(null);
    setOwnProfileId(null);
    setFriendships([]);
    setCloudMessage("Signed out here. Local life continues.");
  }, []);

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
        const saveData = JSON.parse(JSON.stringify(organism)) as Organism;
        const checksum = await checksumJson(saveData);
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
        const [profileResult, saveResult] = await Promise.all([
          cloud
            .from("blob_profiles")
            .upsert(profilePayload, { onConflict: "owner_id" })
            .select("id")
            .single(),
          cloud.from("cloud_saves").upsert(
            {
              owner_id: user.id,
              save_version: 1,
              save_data: saveData,
              checksum,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "owner_id" },
          ),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (saveResult.error) throw saveResult.error;
        setOwnProfileId(profileResult.data.id);
        setCloudMessage(
          visibility === "public"
            ? "Livi is backed up and visible in the Commons."
            : "Private cloud recovery saved.",
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
    [refreshCommons],
  );

  const restoreCloud = useCallback(async () => {
    if (!cloudConfigured()) return;
    setCloudBusy(true);
    try {
      const cloud = getCloudClient();
      const {
        data: { user },
        error: userError,
      } = await cloud.auth.getUser();
      if (userError || !user) throw userError ?? new Error("Sign in first.");
      const { data, error } = await cloud
        .from("cloud_saves")
        .select("save_data,checksum,updated_at")
        .eq("owner_id", user.id)
        .single();
      if (error) throw error;
      const checksum = await checksumJson(data.save_data);
      if (checksum !== data.checksum) {
        throw new Error("Cloud recovery checksum did not match.");
      }
      const organism = normalizeSavedOrganism(data.save_data);
      organismRef.current = organism;
      behaviorRef.current = "Remembering this device";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(organism));
      setSnapshot(makeSnapshot(organism, behaviorRef.current));
      setCloudMessage(
        `Cloud life restored from ${new Date(data.updated_at).toLocaleString()}.`,
      );
      setToast("Livi remembers the cloud recovery point.");
    } catch (error) {
      setCloudMessage(
        error instanceof Error ? error.message : "Cloud restore failed.",
      );
    } finally {
      setCloudBusy(false);
    }
  }, []);

  const visitCommonsProfile = useCallback(
    async (
      profileId: number,
      gift: "hello" | "nutrient" | "play",
    ) => {
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
      behaviorRef.current = "Remembering a Commons visit";
      setCloudMessage("Visit delivered. The daily limit is verified by Commons time.");
      refreshProgress("Livi returned from a Commons visit.");
      await refreshCommons();
    },
    [ownProfileId, refreshCommons, refreshProgress],
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

  const importOrganism = useCallback(async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as {
        organism?: unknown;
      };
      const organism = normalizeSavedOrganism(parsed.organism ?? parsed);
      organismRef.current = organism;
      behaviorRef.current = "Remembering an imported life";
      localStorage.setItem(STORAGE_KEY, JSON.stringify(organism));
      setSnapshot(makeSnapshot(organism, behaviorRef.current));
      setCloudMessage("Organism file restored locally.");
      setToast("Livi recognizes this recovered body.");
    } catch (error) {
      setCloudMessage(
        error instanceof Error ? error.message : "Import failed.",
      );
    }
  }, []);

  const createCheckpoint = useCallback(() => {
    checkpointRef.current = structuredClone(organismRef.current);
    setCheckpointAvailable(true);
    setToast("Simulation checkpoint created.");
  }, []);

  const restoreCheckpoint = useCallback(() => {
    if (!checkpointRef.current) return;
    const organism = structuredClone(checkpointRef.current);
    organism.lastSeen = Date.now();
    organismRef.current = organism;
    behaviorRef.current = "Recovered from a lab checkpoint";
    setSnapshot(makeSnapshot(organism, behaviorRef.current));
    setToast("Checkpoint restored.");
  }, []);

  const advanceLabTime = useCallback((minutes: number) => {
    const organism = simulateElapsed(organismRef.current, minutes);
    behaviorRef.current =
      minutes >= 30 * 1440 ? "Feeling a month pass" : "Feeling a day pass";
    evaluateProgress(organism);
    setSnapshot(makeSnapshot(organism, behaviorRef.current));
    setToast(
      minutes >= 30 * 1440
        ? "Thirty simulated days passed."
        : "One simulated day passed.",
    );
  }, []);

  const starveLab = useCallback(() => {
    const organism = organismRef.current;
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
    behaviorRef.current = "Enduring a starvation pulse";
    setSnapshot(makeSnapshot(organism, behaviorRef.current));
    setToast("Energy collapsed unevenly across the body.");
  }, []);

  const bloomLab = useCallback(() => {
    const organism = organismRef.current;
    organism.cells.forEach((cell) => {
      if (!cell.alive) return;
      cell.energy = Math.max(cell.energy, 0.97);
      cell.health = Math.max(cell.health, 0.92);
    });
    for (let tick = 0; tick < 45; tick += 1) metabolize(organism, 0);
    behaviorRef.current = "Blooming under laboratory nutrients";
    evaluateProgress(organism);
    setSnapshot(makeSnapshot(organism, behaviorRef.current));
    setToast("A nutrient bloom drove real edge-cell division.");
  }, []);

  const dormancyLab = useCallback(() => {
    const organism = organismRef.current;
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
    behaviorRef.current = "Dormant in a legacy seed";
    setSnapshot(makeSnapshot(organism, behaviorRef.current));
    setToast("Only the recoverable nutrient core remains.");
  }, []);

  const purchaseItem = useCallback(
    (itemId: string) => {
      const item = STORE_ITEMS.find(({ id }) => id === itemId);
      const organism = organismRef.current;
      if (!item || organism.ownedItems.includes(itemId)) return;
      if (organism.currency < item.price) {
        setToast(`Livi needs ${item.price - organism.currency} more Motes.`);
        return;
      }
      organism.currency -= item.price;
      organism.ownedItems.push(itemId);
      if (item.category === "room") organism.equippedRoom = itemId;
      if (item.category === "toy") organism.equippedToy = itemId;
      if (item.id === "auto-feeder") {
        organism.lastFeederAt = Date.now() - FEEDER_INTERVAL_MS;
      }
      behaviorRef.current = `Exploring the ${item.name}`;
      refreshProgress(`${item.name} joined Livi's little world.`);
    },
    [refreshProgress],
  );

  const equipItem = useCallback(
    (itemId: string) => {
      const item = STORE_ITEMS.find(({ id }) => id === itemId);
      const organism = organismRef.current;
      if (!item || !organism.ownedItems.includes(itemId)) return;
      if (item.category === "room") organism.equippedRoom = itemId;
      if (item.category === "toy") organism.equippedToy = itemId;
      if (item.category !== "room" && item.category !== "toy") return;
      behaviorRef.current = `Noticing the ${item.name}`;
      refreshProgress(`${item.name} equipped.`);
    },
    [refreshProgress],
  );

  const inviteFriend = useCallback(
    (friendId: string) => {
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
      if (broughtGift) organism.currency += 5;
      behaviorRef.current = `Visiting with ${definition.name}`;
      refreshProgress(
        `${definition.name} is visiting${broughtGift ? " and brought 5 Motes" : ""}.`,
      );
    },
    [refreshProgress],
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
        onClose={() => setLifeHubOpen(false)}
        onTab={setHubTab}
        onPurchase={purchaseItem}
        onEquip={equipItem}
        onInvite={inviteFriend}
        commonsContent={
          <CloudCommons
            configured={cloudConfigured()}
            connectedEmail={cloudUser?.email ?? null}
            busy={cloudBusy}
            message={cloudMessage}
            profiles={commonsProfiles}
            ownProfileId={ownProfileId}
            friendships={friendships}
            onAuth={authenticateCloud}
            onSignOut={signOutCloud}
            onPublish={publishCloud}
            onRestore={restoreCloud}
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
