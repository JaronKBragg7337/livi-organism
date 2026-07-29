import assert from "node:assert/strict";
import test from "node:test";
import { __liviTest as life } from "../app/LiviCompanion.tsx";

function reduceToLoneCore(organism) {
  organism.cells.forEach((cell, index) => {
    const isCore =
      index === life.constants.center * life.constants.grid + life.constants.center;
    cell.alive = isCore;
    cell.energy = isCore ? 0.08 : 0;
    cell.health = isCore ? 0.14 : 0;
  });
  organism.lastObservedLiving = 1;
}

function fundWithMotes(organism, amount) {
  organism.moteTransactions[0].amount = amount;
  life.hydrateLifeSystems(organism);
}

test("three nourishing meals let a lone survivor bud without an item", () => {
  const organism = life.createOrganism(83017);
  reduceToLoneCore(organism);

  const firstMealAt =
    Date.now() -
    (life.constants.seedMealsRequired - 1) *
      life.constants.seedAssimilationMs;
  for (let meal = 0; meal < life.constants.seedMealsRequired; meal += 1) {
    assert.equal(
      life.nourishSeedCore(
        organism,
        firstMealAt + meal * life.constants.seedAssimilationMs,
      ),
      true,
    );
  }
  for (let tick = 0; tick < 20 && life.livingCells(organism) === 1; tick += 1) {
    life.metabolize(organism, 0);
  }

  assert.equal(life.livingCells(organism), 2);
  assert.equal(organism.germination.naturalRecoveries, 1);
  assert.equal(
    organism.episodicMemories.at(-1)?.kind,
    "natural-recovery",
  );
});

test("a lone seed must assimilate meals over time and stale priming decays", () => {
  const organism = life.createOrganism(113);
  reduceToLoneCore(organism);
  const now = Date.UTC(2026, 6, 29, 12);

  life.nourishSeedCore(organism, now);
  life.nourishSeedCore(organism, now + 500);
  life.nourishSeedCore(organism, now + 1_000);
  assert.equal(organism.germination.nourishingMeals, 1);

  life.advanceSeedGermination(
    organism,
    0.1,
    now + life.constants.seedPrimingDecayMs * 2,
  );
  assert.equal(organism.germination.nourishingMeals, 0);
  assert.equal(organism.germination.state, "dire");
});

test("a non-center lone survivor never conjures a second center cell", () => {
  const organism = life.createOrganism(5150);
  organism.cells.forEach((cell) => {
    cell.alive = false;
    cell.energy = 0;
    cell.health = 0;
  });
  const survivorIndex = 2 * life.constants.grid + 2;
  organism.cells[survivorIndex].alive = true;
  organism.cells[survivorIndex].energy = 0.2;
  organism.cells[survivorIndex].health = 0.3;
  organism.lastObservedLiving = 1;

  life.metabolize(organism, 0);
  assert.equal(life.livingCells(organism), 1);
  assert.equal(organism.cells[survivorIndex].alive, true);
  assert.equal(
    organism.cells[
      life.constants.center * life.constants.grid + life.constants.center
    ].alive,
    false,
  );
});

test("long lone-seed neglect deepens recoverable dormancy and is remembered", () => {
  const shortAbsence = life.createOrganism(661);
  const longAbsence = life.createOrganism(661);
  reduceToLoneCore(shortAbsence);
  reduceToLoneCore(longAbsence);

  life.simulateElapsed(shortAbsence, 60);
  life.simulateElapsed(longAbsence, 30 * 24 * 60);

  assert.equal(life.livingCells(shortAbsence), 1);
  assert.equal(life.livingCells(longAbsence), 1);
  assert.ok(
    longAbsence.germination.dormancyDepth >
      shortAbsence.germination.dormancyDepth,
  );
  assert.ok(
    longAbsence.episodicMemories.some(
      ({ kind }) => kind === "long-absence",
    ),
  );
});

test("foreground and offline lone-seed dormancy use the same elapsed-time rule", () => {
  const foreground = life.createOrganism(667);
  const offline = life.createOrganism(667);
  reduceToLoneCore(foreground);
  reduceToLoneCore(offline);

  for (let tick = 0; tick < 4_500; tick += 1) {
    life.advanceDormancyForElapsed(foreground, 0.8 / 60);
    foreground.ageMinutes += 0.8 / 60;
  }
  life.simulateElapsed(offline, 60, offline.lastSeen + 60 * 60_000);

  assert.ok(
    Math.abs(
      foreground.germination.dormancyDepth -
        offline.germination.dormancyDepth,
    ) < 1e-12,
  );
});

test("malformed and future-dated seed state hydrates to a recoverable finite life", () => {
  const damaged = life.createOrganism(668);
  reduceToLoneCore(damaged);
  damaged.germination = {
    state: "budding",
    nourishingMeals: Number.NEGATIVE_INFINITY,
    progress: Number.NaN,
    enteredAt: Number.POSITIVE_INFINITY,
    lastNourishedAt: Date.now() + 24 * 60 * 60_000,
    naturalRecoveries: -4,
    dormancyDepth: Number.POSITIVE_INFINITY,
  };
  const repaired = life.hydrateLifeSystems(damaged);
  assert.equal(repaired.germination.nourishingMeals, 0);
  assert.equal(repaired.germination.progress, 0);
  assert.equal(repaired.germination.lastNourishedAt, 0);
  assert.ok(Number.isFinite(repaired.germination.dormancyDepth));
  life.advanceSeedGermination(repaired);
  assert.equal(repaired.germination.state, "dire");
  assert.equal(life.nourishSeedCore(repaired), true);
});

test("the initial free Pulse Capsule creates scaffold and a remembered scar", () => {
  const organism = life.createOrganism(91);
  reduceToLoneCore(organism);
  assert.equal(organism.pulseCapsules, 1);

  const result = life.activatePulseCapsule(organism);
  assert.equal(result.ok, true);
  assert.equal(organism.pulseCapsules, 0);
  assert.equal(life.livingCells(organism), 4);
  assert.equal(
    organism.cells.filter(({ origin }) => origin === "pulse-scaffold").length,
    3,
  );
  assert.equal(organism.revivalScars.length, 1);
  assert.equal(
    organism.episodicMemories.at(-1)?.kind,
    "pulse-revival",
  );
  assert.equal(life.activatePulseCapsule(organism).ok, false);
  assert.equal(life.nourishPulseScaffolds(organism, 0.6), 3);
  assert.equal(life.nourishPulseScaffolds(organism, 0.6), 0);
  assert.equal(
    new Set(
      organism.cells
        .filter(({ scaffoldScarId }) => scaffoldScarId)
        .map(({ hue }) => hue),
    ).size,
    3,
  );
});

test("Pulse cannot become a hidden lifespan extension", () => {
  const organism = life.createOrganism(992);
  reduceToLoneCore(organism);
  organism.ageMinutes = life.lifeStats(organism).lifespanDays * 0.93 * 1440;

  const result = life.activatePulseCapsule(organism);
  assert.equal(result.ok, false);
  assert.equal(organism.pulseCapsules, 1);
  assert.equal(life.livingCells(organism), 1);
});

test("malformed Pulse scaffold data cannot create immortal imported tissue", () => {
  const organism = life.createOrganism(993);
  reduceToLoneCore(organism);
  life.activatePulseCapsule(organism);
  const scaffold = organism.cells.find(
    ({ origin }) => origin === "pulse-scaffold",
  );
  scaffold.scaffoldUntilAgeMinutes = Number.POSITIVE_INFINITY;
  scaffold.scaffoldNutrients = Number.NaN;
  scaffold.scaffoldScarId = "missing-scar";
  const repaired = life.hydrateLifeSystems(organism);
  const repairedCell = repaired.cells.find(
    (cell) => cell.phase === scaffold.phase,
  );
  assert.equal(repairedCell.origin, "natural");
  assert.equal(repairedCell.scaffoldUntilAgeMinutes, 0);
  assert.equal(repairedCell.scaffoldNutrients, 0);
});

test("restoring an older body cannot refund the free Pulse dose or erase its scar", () => {
  const current = life.createOrganism(730);
  reduceToLoneCore(current);
  const olderRevision = structuredClone(current);
  assert.equal(life.activatePulseCapsule(current).ok, true);

  const restored = life.preserveMonotonicContinuity(
    olderRevision,
    current,
  );
  assert.equal(restored.pulseCapsulesUsed, 1);
  assert.equal(restored.pulseCapsules, 0);
  assert.equal(restored.revivalScars.length, 1);
  assert.ok(
    restored.episodicMemories.some(
      ({ kind }) => kind === "pulse-revival",
    ),
  );
});

test("Monthlight costs earned Motes and is capped at two thirty-day doses", () => {
  const organism = life.createOrganism(451);
  fundWithMotes(organism, 1_000);
  organism.bond = 0.8;
  organism.ageMinutes = life.lifeStats(organism).lifespanDays * 0.9 * 1440;

  for (let dose = 0; dose < life.constants.maxLifespanSerumUses; dose += 1) {
    assert.equal(life.purchaseLifespanSerum(organism).ok, true);
    assert.equal(life.administerMonthlightSerum(organism).ok, true);
  }
  assert.equal(
    organism.lifespanExtensionDays,
    life.constants.lifespanSerumDays *
      life.constants.maxLifespanSerumUses,
  );
  assert.equal(life.purchaseLifespanSerum(organism).ok, false);
});

test("a consumed Monthlight dose cannot be cloned by restoring its held revision", () => {
  const organism = life.createOrganism(452);
  fundWithMotes(organism, 1_000);
  organism.bond = 0.8;
  organism.ageMinutes = organism.naturalLifespanDays * 0.9 * 1440;
  assert.equal(life.purchaseLifespanSerum(organism).ok, true);
  const held = structuredClone(organism);
  assert.equal(life.administerMonthlightSerum(organism).ok, true);

  const restored = life.preserveMonotonicContinuity(held, organism);
  assert.equal(restored.lifespanSerums, 0);
  assert.equal(restored.lifespanSerumsUsed, 1);
  assert.equal(restored.lifespanExtensionDays, 30);
});

test("two same-millisecond Monthlight purchases remain distinct and fully paid", () => {
  const organism = life.createOrganism(454);
  fundWithMotes(organism, 1_000);
  organism.bond = 0.8;
  organism.ageMinutes = organism.naturalLifespanDays * 0.9 * 1440;
  const originalNow = Date.now;
  Date.now = () => 1_900_000_000_000;
  try {
    assert.equal(life.purchaseLifespanSerum(organism).ok, true);
    assert.equal(life.purchaseLifespanSerum(organism).ok, true);
  } finally {
    Date.now = originalNow;
  }
  assert.equal(organism.currency, 640);
  assert.equal(organism.lifespanSerums, 2);
  assert.equal(new Set(organism.serumDoseRecords.map(({ id }) => id)).size, 2);
});

test("Monthlight never reverses elderhood or reopens terminal Pulse", () => {
  const organism = life.createOrganism(453);
  fundWithMotes(organism, 1_000);
  organism.bond = 0.8;
  organism.ageMinutes = organism.naturalLifespanDays * 0.93 * 1440;
  reduceToLoneCore(organism);
  assert.equal(life.activatePulseCapsule(organism).ok, false);
  assert.equal(life.purchaseLifespanSerum(organism).ok, true);
  assert.equal(life.administerMonthlightSerum(organism).ok, true);
  assert.match(life.lifeStats(organism).lifePhase, /Elder/);
  assert.equal(life.activatePulseCapsule(organism).ok, false);
});

test("same-generation restore cannot erase terminal senescence", () => {
  const current = life.createOrganism(455);
  const older = structuredClone(current);
  current.ageMinutes = current.naturalLifespanDays * 0.93 * 1440;
  life.metabolize(current, 0);
  assert.equal(current.terminalSenescenceStarted, true);

  const restored = life.preserveMonotonicContinuity(older, current);
  assert.equal(restored.terminalSenescenceStarted, true);
  reduceToLoneCore(restored);
  assert.equal(life.activatePulseCapsule(restored).ok, false);
});

test("two concurrent Monthlight purchases preserve both doses and both debits", () => {
  const base = life.createOrganism(456);
  fundWithMotes(base, 1_000);
  base.bond = 0.8;
  base.ageMinutes = base.naturalLifespanDays * 0.9 * 1440;
  const left = structuredClone(base);
  const right = structuredClone(base);
  assert.equal(life.purchaseLifespanSerum(left).ok, true);
  assert.equal(life.purchaseLifespanSerum(right).ok, true);

  const merged = life.preserveMonotonicContinuity(left, right);
  assert.equal(merged.lifespanSerums, 2);
  assert.equal(merged.currency, 640);
  assert.equal(
    merged.moteTransactions.filter(({ kind }) => kind === "serum-purchase")
      .length,
    2,
  );
});

test("three concurrent Monthlight purchases cap at two and refund one paid dose", () => {
  const base = life.createOrganism(457);
  fundWithMotes(base, 1_000);
  base.bond = 0.8;
  base.ageMinutes = base.naturalLifespanDays * 0.9 * 1440;
  const branches = [0, 1, 2].map(() => structuredClone(base));
  branches.forEach((branch) => {
    assert.equal(life.purchaseLifespanSerum(branch).ok, true);
  });

  const merged = life.preserveMonotonicContinuity(
    life.preserveMonotonicContinuity(branches[0], branches[1]),
    branches[2],
  );
  assert.equal(merged.lifespanSerums, 2);
  assert.equal(merged.currency, 640);
  assert.equal(
    merged.moteTransactions.filter(({ kind }) => kind === "serum-refund")
      .length,
    1,
  );
  assert.equal(
    merged.serumDoseRecords.filter(({ voidedAt }) => Boolean(voidedAt)).length,
    1,
  );
});

test("malformed serum records cannot mint medicine or Motes", () => {
  const organism = life.createOrganism(458);
  fundWithMotes(organism, 60);
  const now = Date.now();
  organism.serumDoseRecords = [0, 1, 2].map((index) => ({
    id: `forged-${index}`,
    generation: organism.lineage,
    generationId: organism.generationId,
    purchasedAt: now,
    usedAt: null,
    voidedAt: null,
    moteCost: life.constants.lifespanSerumPrice,
    acquisition: "purchased",
  }));

  life.hydrateLifeSystems(organism);
  assert.equal(organism.lifespanSerums, 0);
  assert.equal(organism.currency, 60);
  assert.equal(
    organism.moteTransactions.filter(({ kind }) => kind === "serum-refund")
      .length,
    0,
  );
  assert.ok(organism.serumDoseRecords.every(({ voidedAt }) => Boolean(voidedAt)));
});

test("Monthlight acquisition begins exactly at the elder threshold", () => {
  const organism = life.createOrganism(459);
  fundWithMotes(organism, 1_000);
  organism.bond = 0.8;
  organism.ageMinutes =
    organism.naturalLifespanDays *
      (life.constants.elderThreshold - 0.00001) *
      1440;
  assert.equal(life.purchaseLifespanSerum(organism).ok, false);
  organism.ageMinutes =
    organism.naturalLifespanDays * life.constants.elderThreshold * 1440;
  assert.equal(life.purchaseLifespanSerum(organism).ok, true);
});

test("an unused paid serum is carried into the legacy seed without extending it", () => {
  const organism = life.createOrganism(460);
  fundWithMotes(organism, 1_000);
  organism.bond = 0.8;
  organism.ageMinutes = organism.naturalLifespanDays * 0.9 * 1440;
  assert.equal(life.purchaseLifespanSerum(organism).ok, true);
  reduceToLoneCore(organism);
  organism.ageMinutes = (organism.naturalLifespanDays + 1) * 1440;

  assert.equal(life.hatchLegacyGeneration(organism).ok, true);
  assert.equal(organism.lifespanSerums, 1);
  assert.equal(organism.lifespanSerumsUsed, 0);
  assert.equal(organism.lifespanExtensionDays, 0);
  const carried = organism.serumDoseRecords.find(
    ({ generationId, voidedAt }) =>
      generationId === organism.generationId && !voidedAt,
  );
  assert.equal(carried?.acquisition, "inherited");
  assert.equal(carried?.moteCost, 0);
  assert.ok(carried?.parentDoseId);
});

test("legacy hatching resets the body while preserving relationship history", () => {
  const organism = life.createOrganism(8128);
  organism.bond = 0.8;
  organism.trust = 0.74;
  organism.achievements.push("first-meal");
  life.recordRoutine(organism, { kind: "feed" }, Date.UTC(2026, 6, 29, 12));
  reduceToLoneCore(organism);
  organism.ageMinutes = (life.lifeStats(organism).lifespanDays + 1) * 1440;
  const previousTraits = { ...organism.traits };

  const result = life.hatchLegacyGeneration(organism);
  assert.equal(result.ok, true);
  assert.equal(organism.lineage, 2);
  assert.equal(organism.ageMinutes, 0);
  assert.equal(life.livingCells(organism), 1);
  assert.ok(organism.bond >= 0.18 && organism.bond < 0.8);
  assert.ok(organism.achievements.includes("first-meal"));
  assert.equal(organism.routineMemories.length, 1);
  assert.equal(organism.legacyRecords.length, 1);
  assert.notDeepEqual(organism.traits, previousTraits);
  assert.ok(organism.episodicMemories.some(({ kind }) => kind === "legacy"));
});

test("restoring an ancestor cannot relabel its body as a newer generation", () => {
  const organism = life.createOrganism(8130);
  reduceToLoneCore(organism);
  organism.ageMinutes = (life.lifeStats(organism).lifespanDays + 1) * 1440;
  const ancestor = structuredClone(organism);
  assert.equal(life.hatchLegacyGeneration(organism).ok, true);
  const generationTwoId = organism.generationId;

  const restored = life.preserveMonotonicContinuity(ancestor, organism);
  assert.equal(restored.generationId, generationTwoId);
  assert.equal(restored.lineage, 2);
  assert.equal(restored.ageMinutes, 0);
  assert.equal(life.hatchLegacyGeneration(restored).ok, false);
});

test("routine care compacts to one daily summary without losing counts", () => {
  const organism = life.createOrganism(777);
  const morning = Date.UTC(2026, 6, 29, 8);
  life.recordRoutine(organism, { kind: "feed" }, morning);
  life.recordRoutine(organism, { kind: "pet" }, morning + 30 * 60_000);
  life.recordRoutine(
    organism,
    { kind: "play", toyId: "prism-ball" },
    morning + 60 * 60_000,
  );

  const compacted = life.compactRoutineMemories(organism.routineMemories);
  assert.equal(compacted.length, 1);
  assert.deepEqual(
    {
      feeds: compacted[0].feeds,
      pets: compacted[0].pets,
      plays: compacted[0].plays,
      toyUses: compacted[0].toyUses["prism-ball"],
    },
    { feeds: 1, pets: 1, plays: 1, toyUses: 1 },
  );
});
