// 0.6.0 save compatibility: a LIVI saved on the old 35x35 field must load into the new field with every cell and every
// other value intact. Written for one real pet in particular - Jaron's mom's - which has reached the old ~882-cell ceiling.
import assert from "node:assert/strict";
import test from "node:test";
import { __liviTest as life } from "../app/LiviCompanion.tsx";

const OLD_GRID = 35;

function oldSave() {
  const organism = life.createOrganism(424242);
  const cells = [];
  for (let index = 0; index < OLD_GRID * OLD_GRID; index += 1) {
    const x = index % OLD_GRID;
    const y = Math.floor(index / OLD_GRID);
    const alive = (x + y * 3) % 10 < 7 + (index % 3 === 0 ? 1 : 0); // ~882 living, like a full-grown pet
    cells.push({ alive, energy: alive ? 0.5 + (index % 7) / 20 : 0, health: alive ? 0.8 : 0, age: index, phase: index / 10, hue: (index % 9) - 4 });
  }
  organism.cells = cells;
  return JSON.parse(JSON.stringify(organism)); // exactly what localStorage holds
}

test("an old 35x35 save keeps every cell when moved into the larger field", () => {
  const saved = oldSave();
  const before = saved.cells.filter((cell) => cell.alive).length;
  const grid = life.constants.grid;
  const moved = life.migrateCellField(structuredClone(saved));
  assert.equal(moved.cells.length, grid * grid);
  assert.equal(moved.cells.filter((cell) => cell.alive).length, before);
  const offset = (grid - OLD_GRID) / 2;
  for (let y = 0; y < OLD_GRID; y += 1) {
    for (let x = 0; x < OLD_GRID; x += 1) {
      assert.deepEqual(moved.cells[(y + offset) * grid + x + offset], saved.cells[y * OLD_GRID + x]);
    }
  }
});

test("everything else in the save survives hydration unchanged", () => {
  const saved = oldSave();
  const loaded = life.hydrateLifeSystems(life.migrateCellField(structuredClone(saved)));
  for (const key of ["seed", "lineage", "traits", "bond", "joy", "achievements", "friends", "ownedItems"]) {
    if (!(key in saved)) continue;
    if (key === "ownedItems") {
      saved.ownedItems.forEach((item) => assert.ok(loaded.ownedItems.includes(item)));
      continue;
    }
    assert.deepEqual(loaded[key], saved[key], key);
  }
});

test("a pet past 600 cells is given the Wide Meadow", () => {
  const loaded = life.hydrateLifeSystems(life.migrateCellField(oldSave()));
  assert.ok(loaded.ownedItems.includes("meadow-room"));
});

test("friends grow by adding cells, never by reshaping", () => {
  const small = life.friendShape("pip", 12);
  const big = life.friendShape("pip", 60);
  assert.equal(small.length, 12);
  assert.equal(big.length, 60);
  assert.deepEqual(big.slice(0, 12), small);
  assert.ok(life.friendCellCount({ visits: 10, bond: 0.5 }) > life.friendCellCount({ visits: 1, bond: 0.05 }));
});
