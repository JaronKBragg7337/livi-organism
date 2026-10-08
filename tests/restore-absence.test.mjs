// 0.6.1: a restore must never invent time away. Written for one real pet - Jaron's mom's - that had ~1800 living cells,
// was tended every morning and night, and was suddenly left with 47 after being "away for 8 days" it never had.
import assert from "node:assert/strict";
import test from "node:test";
import { __liviTest as life } from "../app/LiviCompanion.tsx";

const DAY = 24 * 3_600_000;
const NOW = Date.UTC(2026, 9, 7, 14, 0, 0);

// A big, healthy, daily-fed body (~1800 living cells on the 51x51 field).
function tendedLivi(lastSeen) {
  const organism = life.createOrganism(777);
  const grid = life.constants.grid;
  const center = life.constants.center;
  organism.cells = organism.cells.map((cell, index) => {
    const x = (index % grid) - center;
    const y = Math.floor(index / grid) - center;
    const alive = x * x + y * y <= 24 * 24; // ~1800 cells
    return { ...cell, alive, energy: alive ? 0.7 : 0, health: alive ? 0.95 : 0 };
  });
  organism.lastSeen = lastSeen;
  organism.lastCare = lastSeen;
  organism.ageMinutes = 40 * 1440; // well into Mature, no age drain
  return organism;
}

const saved = (organism) => structuredClone(organism);
const absenceMemories = (organism) => organism.episodicMemories.filter(({ kind }) => kind === "long-absence");

test("setup: the tended body is large and the old restore path really did destroy it", () => {
  const staleHead = tendedLivi(NOW - 8 * DAY);
  const before = life.livingCells(staleHead);
  assert.ok(before > 1700 && before < 1900, `expected ~1800 cells, got ${before}`);
  // What 0.6.0 did: time since the head revision was WRITTEN counted as time away.
  const old = life.applyOfflineLife(saved(staleHead), NOW, NOW - 8 * DAY);
  assert.ok(life.livingCells(old) < before * 0.5, `old behaviour should collapse the body, kept ${life.livingCells(old)}`);
  assert.equal(absenceMemories(old).length, 1);
});

test("a stale cloud head does not kill a daily-tended Livi when this device has a local save", () => {
  const staleHead = tendedLivi(NOW - 8 * DAY);
  const before = life.livingCells(staleHead);
  const restored = life.applyRestoredLife(saved(staleHead), {
    now: NOW,
    backupSavedAt: NOW - 8 * DAY,
    localLastSeen: NOW - 20 * 60_000, // cared for 20 minutes ago
    localSyncedAt: NOW - 8 * DAY,
    hadLocalSave: true,
  });
  assert.equal(life.livingCells(restored), before);
  assert.equal(absenceMemories(restored).length, 0);
});

test("with no local save at all, an old backup is capped and never writes a false long-absence memory", () => {
  const staleHead = tendedLivi(NOW - 8 * DAY);
  const before = life.livingCells(staleHead);
  const restored = life.applyRestoredLife(saved(staleHead), {
    now: NOW,
    backupSavedAt: NOW - 8 * DAY,
    hadLocalSave: false,
  });
  assert.ok(life.livingCells(restored) >= before * 0.99, `kept ${life.livingCells(restored)} of ${before}`);
  assert.equal(absenceMemories(restored).length, 0);
  assert.ok(NOW - restored.lastSeen <= 1_000 + 12 * 3_600_000 || restored.lastSeen === NOW);
});

test("restore absence is measured from the newest trustworthy sign of presence", () => {
  const base = { now: NOW, hadLocalSave: true };
  assert.equal(life.resolveRestoreLastSeen({ ...base, backupSavedAt: NOW - 8 * DAY, localLastSeen: NOW - 60_000 }), NOW - 60_000);
  assert.equal(life.resolveRestoreLastSeen({ ...base, backupLastSeen: NOW - 9 * DAY, backupSavedAt: NOW - 8 * DAY, localSyncedAt: NOW - 2 * 3_600_000 }), NOW - 2 * 3_600_000);
  // a local clock "from the future" or a freshly created organism is not evidence
  assert.equal(life.resolveRestoreLastSeen({ now: NOW, hadLocalSave: false, backupSavedAt: NOW - 8 * DAY, localLastSeen: NOW }), NOW - 12 * 3_600_000);
  assert.equal(life.resolveRestoreLastSeen({ ...base, backupSavedAt: NOW - 3_600_000, localLastSeen: NOW + DAY }), NOW - 3_600_000);
});

test("real absence is still real: no care evidence for 8 days still costs the body and is remembered", () => {
  const staleHead = tendedLivi(NOW - 8 * DAY);
  const before = life.livingCells(staleHead);
  const restored = life.applyRestoredLife(saved(staleHead), {
    now: NOW,
    backupSavedAt: NOW - 8 * DAY,
    localLastSeen: NOW - 8 * DAY, // this device also last saw it 8 days ago
    hadLocalSave: true,
  });
  assert.ok(life.livingCells(restored) < before);
  assert.equal(absenceMemories(restored).length, 1);
});

test("a stale localStorage copy is never aged forward over a fresher IndexedDB copy", () => {
  const stale = JSON.stringify(tendedLivi(NOW - 8 * DAY));
  const fresh = tendedLivi(NOW - 60_000);
  const freshText = JSON.stringify(fresh);
  const picked = life.pickFreshestSave(stale, freshText);
  assert.equal(picked.lastSeen, fresh.lastSeen);
  assert.equal(life.pickFreshestSave(stale, "not json").lastSeen, NOW - 8 * DAY);
  assert.equal(life.pickFreshestSave(null, undefined, ""), null);
});
