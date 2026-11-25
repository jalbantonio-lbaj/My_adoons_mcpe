import { world, system, StructureRotation } from "@minecraft/server";
import { isValidPlayer, sendFeedback, facePoint, doubleBase, resolveStructure, reportIssue, formatCoords } from "../core/helpers.js";
import { createKitNPlan } from "../core/placement_plan.js";

const PLAIN_ID = "kitop:kit_plain";


// -- Command: spawn only the normal survival-max gear chest in front of the player.
export function handleKitN(origin, options = {}) {
  const player = origin.sourceEntity;
  if (!isValidPlayer(player)) return;
  system.run(() => {
    if (!player.isValid) return;
    spawnKitNChest(player, options);
  });
}

// -- Spawn: one plain double chest with vanilla-max enchants, never overwriting builds.
function spawnKitNChest(player, options = {}) {
  if (!isValidPlayer(player)) return;
  const dimension = player.dimension;
  if (!dimension) return;
  const structure = resolveStructure(PLAIN_ID);
  if (!structure) {
    player.sendMessage("[TC] Error: KitN chest template is missing from the pack.");
    return;
  }
  const rotation = ((options.rotation ?? 0) % 4 + 4) % 4;
  const footprint = createKitNPlan({ x: 0, y: 0, z: 0 }, rotation).cells
    .map(({ x, z }) => ({ x, z }));
  const base = doubleBase(dimension, options.base ?? facePoint(player, 2.0), footprint);
  if (!base) {
    sendFeedback(player, "No room in front of you for the KitN chest. Face open ground and try again.");
    return;
  }
  const chest = { x: base.x, y: base.y, z: base.z };
  const rotationByTurns = [
    StructureRotation.None,
    StructureRotation.Rotate90,
    StructureRotation.Rotate180,
    StructureRotation.Rotate270
  ];
  world.structureManager.place(structure, dimension, base, {
    includeBlocks: true,
    includeEntities: false,
    rotation: rotationByTurns[rotation]
  });
  player.playSound("random.chestopen");
  player.playSound("random.levelup");
  sendFeedback(player, "Spawned your KitN chest in front of you. Survival-max gear, take what you need.");
  reportIssue(player, `KitN chest at §b${formatCoords(chest)}§r.`);
}
