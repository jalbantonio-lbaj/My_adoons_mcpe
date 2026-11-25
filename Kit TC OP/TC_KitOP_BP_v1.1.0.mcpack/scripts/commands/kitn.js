import { world, system } from "@minecraft/server";
import { isValidPlayer, sendFeedback, facePoint, doubleBase, resolveStructure, reportIssue, formatCoords } from "../core/helpers.js";
import { KITN_FOOTPRINT } from "../core/placement_plan.js";

const PLAIN_ID = "kitop:kit_plain";
const CELLS_X = [{ x: 0, z: 0 }, { x: 1, z: 0 }];

// -- Command: spawn only the normal survival-max gear chest in front of the player.
export function handleKitN(origin) {
  const player = origin.sourceEntity;
  if (!isValidPlayer(player)) return;
  system.run(() => {
    if (!player.isValid) return;
    spawnKitNChest(player);
  });
}

// -- Spawn: one plain double chest with vanilla-max enchants, never overwriting builds.
function spawnKitNChest(player) {
  if (!isValidPlayer(player)) return;
  const dimension = player.dimension;
  if (!dimension) return;
  const structure = resolveStructure(PLAIN_ID);
  if (!structure) {
    player.sendMessage("[TC] Error: KitN chest template is missing from the pack.");
    return;
  }
  const base = doubleBase(dimension, facePoint(player, 2.0), KITN_FOOTPRINT);
  if (!base) {
    sendFeedback(player, "No room in front of you for the KitN chest. Face open ground and try again.");
    return;
  }
  const chest = { x: base.x, y: base.y, z: base.z };
  world.structureManager.place(structure, dimension, base, { includeBlocks: true, includeEntities: false });
  player.playSound("random.chestopen");
  player.playSound("random.levelup");
  sendFeedback(player, "Spawned your KitN chest in front of you. Survival-max gear, take what you need.");
  reportIssue(player, `KitN chest at §b${formatCoords(chest)}§r.`);
}
