import { world, system, EquipmentSlot } from "@minecraft/server";
import { isValidPlayer, sendFeedback, resolveStructure, reportIssue, formatCoords } from "../core/helpers.js";
import { createKitOpPlan, KITOP_UNIT_DEFINITIONS, KITOP_STAND_DEFINITIONS } from "../core/placement_plan.js";

// -- Command: spawn the full KitOP room, then auto-equip gear from the kit chest.
export function handleKitOp(origin, options = {}) {
  const player = origin.sourceEntity;
  if (!isValidPlayer(player)) return;
  system.run(() => {
    if (!player.isValid) return;
    spawnKitOpSet(player, options.rotation ?? 0, options.anchor);
  });
}

// -- Spawn: 11 units on 2 tiers plus 4 armor stands around the player.
function spawnKitOpSet(player, rotation = 0, anchorOverride) {
  if (!isValidPlayer(player)) return;
  const dimension = player.dimension;
  if (!dimension) return;
  const feet = anchorOverride ? {
    x: Math.floor(anchorOverride.x), y: Math.floor(anchorOverride.y), z: Math.floor(anchorOverride.z)
  } : {
    x: Math.floor(player.location.x), y: Math.floor(player.location.y), z: Math.floor(player.location.z)
  };
  const plan = createKitOpPlan(feet, rotation);
  const stats = { units: 0, stands: 0, missing: 0, unloaded: 0, blocked: 0, floorless: 0 };
  let kitSpot = undefined;
  for (const unit of plan.units) {
    const spot = spawnUnit(player, unit.id, unit.location, stats);
    if (!spot) continue;
    stats.units++;
    if (unit.kit) kitSpot = spot;
  }
  for (const stand of plan.stands) {
    if (spawnStand(player, stand.id, stand.location, stats)) stats.stands++;
  }
  const kitAt = kitSpot ?? plan.kitAnchor;
  const kitChest = { x: kitAt.x, y: kitAt.y + 1, z: kitAt.z };
  system.runTimeout(() => {
    if (!player.isValid) return;
    const moved = autoEquipKit(player, kitAt);
    player.playSound("random.chestopen");
    player.playSound("random.levelup");
    if (stats.units < KITOP_UNIT_DEFINITIONS.length || stats.stands < KITOP_STAND_DEFINITIONS.length) {
      reportIssue(player, `KitOP diagnostic: ${stats.units}/${KITOP_UNIT_DEFINITIONS.length} units, ${stats.stands}/${KITOP_STAND_DEFINITIONS.length} stands. Missing template ${stats.missing}, unloaded chunk ${stats.unloaded}, blocked space ${stats.blocked}, no floor ${stats.floorless}. Gear chest at ${formatCoords(kitChest)}.`);
    }
    sendFeedback(player, `KitOP room placed: ${stats.units}/${UNITS.length} units and ${stats.stands}/${STANDS.length} armor stands. Equipped ${moved.armor} armor, moved ${moved.items} items.`);
    reportIssue(player, `Gear chest at §b${formatCoords(kitChest)}§r.`);
  }, 10);
}

// -- Fix: resolve template id in any form, then try nearby heights before giving up.
function spawnUnit(player, structureId, at, stats) {
  const dimension = player.dimension;
  if (!dimension) return undefined;
  const structure = resolveStructure(structureId);
  if (!structure) {
    stats.missing++;
    return undefined;
  }
  if (!dimension.isChunkLoaded(at)) {
    stats.unloaded++;
    return undefined;
  }
  for (const lift of LIFT_OFFSETS) {
    const spot = { x: at.x, y: at.y + lift, z: at.z };
    if (spot.y < dimension.heightRange.min || spot.y + 1 >= dimension.heightRange.max) continue;
    if (!unitClear(dimension, spot)) continue;
    world.structureManager.place(structure, dimension, spot, { includeBlocks: true, includeEntities: false });
    return spot;
  }
  stats.blocked++;
  return undefined;
}

// -- Check: the 2x2 cell has free air one block above its base.
function unitClear(dimension, at) {
  for (let lx = 0; lx < 2; lx++) {
    for (let lz = 0; lz < 2; lz++) {
      const top = { x: at.x + lx, y: at.y + 1, z: at.z + lz };
      if (!dimension.isChunkLoaded(top)) return false;
      const block = dimension.getBlock(top);
      if (!block?.isValid || !block.isAir) return false;
    }
  }
  return true;
}

// -- Spawn: one armor stand; resolve id first so a missing template is reported.
function spawnStand(player, structureId, at, stats) {
  const dimension = player.dimension;
  if (!dimension) return false;
  const structure = resolveStructure(structureId);
  if (!structure) {
    stats.missing++;
    return false;
  }
  const spot = standBase(dimension, at);
  if (!spot) {
    stats.floorless++;
    return false;
  }
  world.structureManager.place(structure, dimension, spot, { includeBlocks: true, includeEntities: true });
  return true;
}

// -- Position: 2-high air cell with solid floor for an armor stand.
function standBase(dimension, point) {
  const base = { x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z) };
  for (const dy of [0, -1, -2, -3, 1]) {
    const at = { x: base.x, y: base.y + dy, z: base.z };
    const above = { x: base.x, y: base.y + dy + 1, z: base.z };
    const below = { x: base.x, y: base.y + dy - 1, z: base.z };
    if (at.y < dimension.heightRange.min || at.y + 2 >= dimension.heightRange.max) continue;
    if (!dimension.isChunkLoaded(at) || !dimension.isChunkLoaded(above)) continue;
    const block = dimension.getBlock(at);
    const head = dimension.getBlock(above);
    const floor = dimension.getBlock(below);
    if (!block?.isValid || !block.isAir) continue;
    if (!head?.isValid || !head.isAir) continue;
    if (!floor?.isValid || floor.isAir || floor.isLiquid) continue;
    return at;
  }
  return undefined;
}

// -- Equip: wear armor from both kit chest halves, move fitting items if room.
function autoEquipKit(player, kitAt) {
  const result = { armor: 0, items: 0 };
  const dimension = player.dimension;
  if (!dimension) return result;
  const equippable = player.getComponent("minecraft:equippable");
  const playerContainer = player.getComponent("minecraft:inventory")?.container;
  if (!playerContainer || !playerContainer.isValid) return result;
  for (const half of [{ x: kitAt.x, y: kitAt.y + 1, z: kitAt.z }, { x: kitAt.x + 1, y: kitAt.y + 1, z: kitAt.z }]) {
    const block = dimension.getBlock(half);
    const container = block?.isValid ? block.getComponent("minecraft:inventory")?.container : undefined;
    if (!container || !container.isValid) continue;
    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (!item) continue;
      const slot = armorSlot(item.typeId);
      if (slot !== undefined && equippable && equippable.getEquipment(slot) === undefined) {
        container.setItem(i, undefined);
        equippable.setEquipment(slot, item);
        result.armor++;
        continue;
      }
      container.setItem(i, undefined);
      const remainder = playerContainer.addItem(item);
      if (remainder && remainder.amount > 0) container.setItem(i, remainder);
      else result.items++;
    }
  }
  return result;
}

// -- Map: armor item type to its equipment slot, undefined for other items.
function armorSlot(typeId) {
  if (typeof typeId !== "string") return undefined;
  if (typeId.endsWith("_helmet") || typeId === "minecraft:turtle_helmet") return EquipmentSlot.Head;
  if (typeId.endsWith("_chestplate") || typeId === "minecraft:elytra") return EquipmentSlot.Chest;
  if (typeId.endsWith("_leggings")) return EquipmentSlot.Legs;
  if (typeId.endsWith("_boots")) return EquipmentSlot.Feet;
  return undefined;
}
