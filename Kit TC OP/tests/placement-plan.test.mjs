import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createKitOpPlan,
  createKitNPlan,
  rotateOffset
} from "../TC_KitOP_BP_v1.1.0.mcpack/scripts/core/placement_plan.js";

test("zero-turn KitOP plan exactly preserves original offsets and structure IDs", () => {
  const plan = createKitOpPlan({ x: 100, y: 64, z: -50 }, 0);
  assert.equal(plan.units.length, 11);
  assert.equal(plan.stands.length, 4);
  assert.deepEqual(plan.units[0], {
    id: "kitop:kitop_chest_s",
    kit: true,
    location: { x: 99, y: 64, z: -53 }
  });
  assert.equal(plan.stands[0].id, "kitop:stand_netherite_315");
  assert.deepEqual(plan.kitAnchor, { x: 99, y: 64, z: -53 });
});

test("quarter-turn rotation transforms coordinates and cardinal structure IDs", () => {
  const plan = createKitOpPlan({ x: 0, y: 70, z: 0 }, 1);
  assert.deepEqual(rotateOffset(-1, -3, 1), { x: 3, z: -1 });
  assert.equal(plan.units[0].id, "kitop:kitop_chest_w");
  assert.deepEqual(plan.units[0].location, { x: 3, y: 70, z: -1 });
  assert.equal(plan.stands[0].id, "kitop:stand_netherite_45");
});

test("KitN footprint rotates as one two-cell structure", () => {
  const plan = createKitNPlan({ x: 8, y: 65, z: 12 }, 1);
  assert.deepEqual(plan.cells, [
    { x: 8, y: 65, z: 12 },
    { x: 8, y: 65, z: 13 }
  ]);
});


test("KitN footprint positions are stable for all four quarter-turns", () => {
  assert.deepEqual(createKitNPlan({ x: 10, y: 64, z: 20 }, 0).cells, [
    { x: 10, y: 64, z: 20 },
    { x: 11, y: 64, z: 20 }
  ]);
  assert.deepEqual(createKitNPlan({ x: 10, y: 64, z: 20 }, 1).cells, [
    { x: 10, y: 64, z: 20 },
    { x: 10, y: 64, z: 21 }
  ]);
  assert.deepEqual(createKitNPlan({ x: 10, y: 64, z: 20 }, 2).cells, [
    { x: 10, y: 64, z: 20 },
    { x: 9, y: 64, z: 20 }
  ]);
  assert.deepEqual(createKitNPlan({ x: 10, y: 64, z: 20 }, 3).cells, [
    { x: 10, y: 64, z: 20 },
    { x: 10, y: 64, z: 19 }
  ]);
});

test("rotation accepts negative and wrapped quarter-turns", () => {
  assert.deepEqual(rotateOffset(1, 0, -1), { x: 0, z: -1 });
  assert.deepEqual(rotateOffset(1, 0, 5), { x: 0, z: 1 });
  assert.throws(() => rotateOffset(1, 0, 1.5), TypeError);
});

test("all rotated KitOP template IDs exist in the behavior pack", () => {
  const directory = resolve("Kit TC OP/TC_KitOP_BP_v1.1.0.mcpack/structures/kitop");
  const available = new Set(readdirSync(directory));
  for (let rotation = 0; rotation < 4; rotation++) {
    const plan = createKitOpPlan({ x: 0, y: 64, z: 0 }, rotation);
    for (const entry of [...plan.units, ...plan.stands]) {
      const file = entry.id.split(":")[1] + ".mcstructure";
      assert.ok(available.has(file), `Missing rotation template: ${file}`);
    }
  }
});
