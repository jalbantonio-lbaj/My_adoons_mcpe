import { system, Direction, StructureRotation } from "@minecraft/server";
import { isValidPlayer, reportIssue, doubleBase } from "../core/helpers.js";
import {
  getInventoryFreePreviewStructure,
  placeInventoryFreePreview
} from "../core/preview_structures.js";
import { handleKitN } from "./kitn.js";
import { createKitNPlan, rotateOffset } from "../core/placement_plan.js";

const KITN_TEMPLATE = "kitop:kit_plain";
const MAX_TARGET_DISTANCE = 8;
const UPDATE_INTERVAL = 5;
const MAX_SESSION_TICKS = 6000;
const STRUCTURE_ROTATIONS = [
  StructureRotation.None,
  StructureRotation.Rotate90,
  StructureRotation.Rotate180,
  StructureRotation.Rotate270
];
const sessions = new Map();

function sameStates(a, b) {
  const left = a.getAllStates();
  const right = b.getAllStates();
  const keys = Object.keys(left).sort();
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => left[key] === right[key]);
}

function isEmptyContainer(block) {
  const inventory = block.getComponent("minecraft:inventory")?.container;
  if (!inventory) return true;
  for (let i = 0; i < inventory.size; i++) {
    if (inventory.getItem(i)) return false;
  }
  return true;
}

function getTarget(player, rotation) {
  const hit = player.getBlockFromViewDirection({
    maxDistance: MAX_TARGET_DISTANCE,
    includeLiquidBlocks: false,
    includePassableBlocks: false
  });
  if (!hit?.block?.isValid) return undefined;

  let normal;
  switch (hit.face) {
    case Direction.Up: normal = { x: 0, y: 1, z: 0 }; break;
    case Direction.Down: normal = { x: 0, y: -1, z: 0 }; break;
    case Direction.North: normal = { x: 0, y: 0, z: -1 }; break;
    case Direction.South: normal = { x: 0, y: 0, z: 1 }; break;
    case Direction.East: normal = { x: 1, y: 0, z: 0 }; break;
    case Direction.West: normal = { x: -1, y: 0, z: 0 }; break;
    default: return undefined;
  }

  const p = hit.block.location;
  const target = {
    x: Math.floor(p.x + normal.x),
    y: Math.floor(p.y + normal.y),
    z: Math.floor(p.z + normal.z)
  };
  const footprintDirection = rotateOffset(1, 0, rotation);
  if (footprintDirection.x * normal.x + footprintDirection.z * normal.z < 0) {
    target.x += normal.x;
    target.z += normal.z;
  }
  return target;
}

function targetKey(location, rotation) {
  return location ? `${location.x},${location.y},${location.z}|${rotation}` : "";
}

function getPreviewCells(structure, dimension, anchor, rotation) {
  const size = structure.size;
  const cells = [];
  for (let x = 0; x < size.x; x++) {
    for (let y = 0; y < size.y; y++) {
      for (let z = 0; z < size.z; z++) {
        if (!structure.getBlockPermutation({ x, y, z })) continue;
        const offset = rotateOffset(x, z, rotation);
        const location = {
          x: anchor.x + offset.x,
          y: anchor.y + y,
          z: anchor.z + offset.z
        };
        const placed = dimension.getBlock(location);
        if (!placed?.isValid || placed.isAir) continue;
        cells.push({ location, permutation: placed.permutation });
      }
    }
  }
  return cells;
}

function resolvePlacementBase(dimension, target, rotation) {
  const footprint = createKitNPlan({ x: 0, y: 0, z: 0 }, rotation).cells
    .map(({ x, z }) => ({ x, z }));
  return doubleBase(dimension, target, footprint);
}

function isFootprintClear(dimension, anchor, rotation) {
  const cells = createKitNPlan(anchor, rotation).cells;
  for (const at of cells) {
    if (at.y < dimension.heightRange.min || at.y >= dimension.heightRange.max) return false;
    if (!dimension.isChunkLoaded(at)) return false;
    const block = dimension.getBlock(at);
    if (!block?.isValid || !block.isAir) return false;
  }
  return true;
}

// Never clear a preview block that changed or now contains player items.
function removePreview(session) {
  if (!session.cells.length) {
    session.anchor = undefined;
    session.anchorKey = "";
    return true;
  }

  let safe = true;
  for (const cell of session.cells) {
    const block = session.dimension.getBlock(cell.location);
    if (!block?.isValid || block.isAir) continue;
    if (block.typeId !== cell.permutation.type.id ||
        !sameStates(block.permutation, cell.permutation) ||
        !isEmptyContainer(block)) {
      safe = false;
      continue;
    }
    block.setType("minecraft:air");
  }

  session.cells = [];
  session.anchor = undefined;
  session.anchorKey = "";
  return safe;
}

function finishSession(player, session, reason, confirm = false) {
  if (sessions.get(player.id) !== session) return;
  if (session.interval !== undefined) system.clearRun(session.interval);
  const safe = removePreview(session);
  sessions.delete(player.id);

  if (confirm && !safe) {
    reportIssue(player, "KitN preview changed or contains items. Confirmation stopped; changed blocks were preserved.");
    return;
  }
  if (confirm) {
    handleKitN(
      { sourceEntity: player },
      { base: session.confirmAnchor, rotation: session.rotation }
    );
    reportIssue(player, "KitN preview confirmed.");
  } else if (!safe) {
    reportIssue(player, "KitN preview ended. A modified or filled preview chest was preserved.");
  } else if (reason) {
    player.sendMessage(`[TC] KitN preview ${reason}.`);
  }
}

function updateSession(player, session) {
  if (!isValidPlayer(player) || !player.isValid) {
    if (session.interval !== undefined) system.clearRun(session.interval);
    removePreview(session);
    sessions.delete(session.playerId);
    return;
  }

  session.elapsed += UPDATE_INTERVAL;
  if (session.elapsed >= MAX_SESSION_TICKS) {
    finishSession(player, session, "expired");
    return;
  }
  if (player.dimension.id !== session.dimensionId) {
    finishSession(player, session, "cancelled after dimension change");
    return;
  }

  const inventory = player.getComponent("minecraft:inventory")?.container;
  const held = inventory?.getItem(player.selectedSlotIndex);
  if (held?.typeId !== "tc:kit_selector") {
    finishSession(player, session, "cancelled because Kit Selector is no longer held");
    return;
  }

  let target;
  try {
    target = getTarget(player, session.rotation);
  } catch {
    target = undefined;
  }

  if (!target) {
    if (session.cells.length && !removePreview(session)) {
      finishSession(player, session, "stopped because the preview was modified");
      return;
    }
    player.onScreenDisplay.setActionBar("KitN preview: aim at a block face within 8 blocks");
    return;
  }

  const base = resolvePlacementBase(session.dimension, target, session.rotation);
  if (!base) {
    if (session.cells.length && !removePreview(session)) {
      finishSession(player, session, "stopped because the previous preview was modified");
      return;
    }
    player.onScreenDisplay.setActionBar("KitN preview: no safe space at this target");
    return;
  }
  target = base;

  const key = targetKey(target, session.rotation);
  if (key === session.anchorKey) {
    player.onScreenDisplay.setActionBar(
      "KitN | /tc:preview_rotate_left  /tc:preview_rotate_right  /tc:preview_confirm  /tc:preview_cancel"
    );
    return;
  }

  if (session.cells.length && !removePreview(session)) {
    finishSession(player, session, "stopped because the previous preview was modified");
    return;
  }

  if (!isFootprintClear(session.dimension, target, session.rotation)) {
    player.onScreenDisplay.setActionBar("KitN preview: target obstructed or chunk not loaded");
    return;
  }

  try {
    placeInventoryFreePreview(
      KITN_TEMPLATE,
      session.dimension,
      target,
      STRUCTURE_ROTATIONS[session.rotation]
    );
    session.cells = getPreviewCells(
      session.structure,
      session.dimension,
      target,
      session.rotation
    );
    if (!session.cells.length) throw new Error("Preview template contains no placeable blocks.");
    session.anchor = target;
    session.anchorKey = key;
    player.onScreenDisplay.setActionBar(
      "KitN | /tc:preview_rotate_left  /tc:preview_rotate_right  /tc:preview_confirm  /tc:preview_cancel"
    );
  } catch (error) {
    finishSession(player, session, "failed while placing preview");
    reportIssue(player, `KitN preview error: ${String(error)}`);
  }
}

export function startKitNPreview(player) {
  if (!isValidPlayer(player)) return false;
  const previous = sessions.get(player.id);
  if (previous) finishSession(player, previous, "replaced");

  let structure;
  try {
    structure = getInventoryFreePreviewStructure(KITN_TEMPLATE);
    const size = structure.size;
    if (size.x !== 2 || size.y !== 1 || size.z !== 1) {
      throw new Error(`Unexpected KitN template size: ${size.x}x${size.y}x${size.z}`);
    }
  } catch (error) {
    reportIssue(player, `KitN preview unavailable: ${String(error)}`);
    return false;
  }

  const session = {
    playerId: player.id,
    dimension: player.dimension,
    dimensionId: player.dimension.id,
    structure,
    anchor: undefined,
    confirmAnchor: undefined,
    anchorKey: "",
    rotation: 0,
    cells: [],
    elapsed: 0,
    interval: undefined
  };
  sessions.set(player.id, session);
  reportIssue(
    player,
    "KitN preview started. Aim at a block face. Use /tc:preview_rotate_left or /tc:preview_rotate_right, then /tc:preview_confirm or /tc:preview_cancel."
  );
  session.interval = system.runInterval(() => updateSession(player, session), UPDATE_INTERVAL);
  return true;
}

export function rotateKitNPreview(player, direction) {
  const session = sessions.get(player.id);
  if (!session) {
    reportIssue(player, "You do not have an active KitN preview.");
    return false;
  }
  if (!Number.isInteger(direction)) return false;
  session.rotation = (session.rotation + direction + 4) % 4;
  session.anchor = undefined;
  session.anchorKey = "";
  reportIssue(player, `KitN preview rotation: ${session.rotation * 90} degrees.`);
  return true;
}

export function confirmKitNPreview(player) {
  const session = sessions.get(player.id);
  if (!session) {
    reportIssue(player, "You do not have an active KitN preview.");
    return false;
  }
  if (!session.anchor) {
    reportIssue(player, "Aim at a clear target before confirming the KitN preview.");
    return false;
  }
  session.confirmAnchor = { ...session.anchor };
  finishSession(player, session, "", true);
  return true;
}

export function cancelKitNPreview(player) {
  const session = sessions.get(player.id);
  if (!session) {
    reportIssue(player, "You do not have an active KitN preview.");
    return false;
  }
  finishSession(player, session, "cancelled");
  return true;
}
