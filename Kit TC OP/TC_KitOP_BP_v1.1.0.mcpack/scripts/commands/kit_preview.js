import { system, Direction } from "@minecraft/server";
import { isValidPlayer, reportIssue, doubleBase } from "../core/helpers.js";
import { createKitOpPlan, createKitNPlan } from "../core/placement_plan.js";
import { handleKitOp } from "./kitop.js";
import { handleKitN } from "./kitn.js";

const MAX_DISTANCE = 8;
const TICK_RATE = 4;
const sessions = new Map();

function targetFromView(player) {
  const hit = player.getBlockFromViewDirection({
    maxDistance: MAX_DISTANCE,
    includeLiquidBlocks: false,
    includePassableBlocks: false
  });
  if (!hit?.block?.isValid) return undefined;
  const normals = {
    [Direction.Up]: { x: 0, y: 1, z: 0 },
    [Direction.Down]: { x: 0, y: -1, z: 0 },
    [Direction.North]: { x: 0, y: 0, z: -1 },
    [Direction.South]: { x: 0, y: 0, z: 1 },
    [Direction.East]: { x: 1, y: 0, z: 0 },
    [Direction.West]: { x: -1, y: 0, z: 0 }
  };
  const n = normals[hit.face];
  if (!n) return undefined;
  return {
    x: Math.floor(hit.block.location.x + n.x),
    y: Math.floor(hit.block.location.y + n.y),
    z: Math.floor(hit.block.location.z + n.z)
  };
}

function safeKitNBase(dimension, target, rotation) {
  const footprint = createKitNPlan({ x: 0, y: 0, z: 0 }, rotation).cells
    .map(({ x, z }) => ({ x, z }));
  return doubleBase(dimension, target, footprint);
}

function pointKey(p, r) { return p ? `${p.x},${p.y},${p.z}:${r}` : ""; }

function drawBox(dimension, origin, size) {
  const step = 0.5;
  const max = { x: origin.x + size.x, y: origin.y + size.y, z: origin.z + size.z };
  const axes = ["x", "y", "z"];
  for (const axis of axes) {
    const other = axes.filter(v => v !== axis);
    for (const a of [0, size[other[0]]]) {
      for (const b of [0, size[other[1]]]) {
        for (let d = 0; d <= size[axis] + 0.001; d += step) {
          const p = { x: origin.x, y: origin.y, z: origin.z };
          p[axis] += d;
          p[other[0]] += a;
          p[other[1]] += b;
          try { dimension.spawnParticle("minecraft:endrod", p); } catch {}
        }
      }
    }
  }
}

function buildPlan(session, anchor) {
  if (session.kind === "KitN") {
    return createKitNPlan(anchor, session.rotation).cells.map(p => ({
      origin: p, size: { x: 1, y: 1, z: 1 }
    }));
  }
  const plan = createKitOpPlan(anchor, session.rotation);
  return [
    ...plan.units.map(unit => ({ origin: unit.location, size: { x: 2, y: 2, z: 2 } })),
    ...plan.stands.map(stand => ({ origin: stand.location, size: { x: 1, y: 2, z: 1 } }))
  ];
}

function draw(session) {
  if (!session.anchor) return;
  const boxes = buildPlan(session, session.anchor);
  for (const box of boxes) drawBox(session.dimension, box.origin, box.size);
}

function getAnchor(player, session) {
  if (session.locked && session.anchor) return session.anchor;
  const target = targetFromView(player);
  if (!target) return undefined;
  if (session.kind === "KitN") return safeKitNBase(session.dimension, target, session.rotation);
  return target;
}

function stop(player, session, confirm) {
  if (session.interval !== undefined) system.clearRun(session.interval);
  sessions.delete(player.id);
  if (confirm) {
    if (session.kind === "KitN") {
      handleKitN({ sourceEntity: player }, { base: session.anchor, rotation: session.rotation });
    } else {
      handleKitOp({ sourceEntity: player }, { anchor: session.anchor, rotation: session.rotation });
    }
    reportIssue(player, `${session.kind} placement confirmed.`);
  } else {
    reportIssue(player, `${session.kind} preview cancelled.`);
  }
}

function tick(player, session) {
  if (!isValidPlayer(player) || !player.isValid || player.dimension.id !== session.dimensionId) {
    if (session.interval !== undefined) system.clearRun(session.interval);
    sessions.delete(session.playerId);
    return;
  }
  const held = player.getComponent("minecraft:inventory")?.container
    ?.getItem(player.selectedSlotIndex);
  if (held?.typeId !== "tc:kit_selector") {
    stop(player, session, false);
    return;
  }
  if (session.locked) {
    if (!session.anchor) return;
    draw(session);
    player.onScreenDisplay.setActionBar(
      `${session.kind} PREVIEW FIJADA | /tc:preview_rotate_left | /tc:preview_rotate_right | /tc:preview_confirm | /tc:preview_cancel`
    );
    return;
  }
  const next = getAnchor(player, session);
  if (!next) {
    session.anchor = undefined;
    player.onScreenDisplay.setActionBar("Vista previa: apunta a una cara de bloque a 8 bloques o menos");
    return;
  }
  const key = pointKey(next, session.rotation);
  if (key !== session.key) {
    session.anchor = next;
    session.key = key;
  }
  draw(session);
  player.onScreenDisplay.setActionBar(
    `${session.kind} PREVIEW | /tc:preview_lock para fijar | /tc:preview_rotate_left | /tc:preview_rotate_right | /tc:preview_confirm | /tc:preview_cancel`
  );
}

export function startKitPreview(player, kind) {
  if (!isValidPlayer(player) || !["KitN", "KitOP"].includes(kind)) return false;
  const old = sessions.get(player.id);
  if (old) stop(player, old, false);
  const session = {
    playerId: player.id,
    kind,
    dimension: player.dimension,
    dimensionId: player.dimension.id,
    rotation: 0,
    anchor: undefined,
    key: "",
    locked: false,
    interval: undefined
  };
  sessions.set(player.id, session);
  reportIssue(player, `${kind} ghost preview started. Aim at a block, then use /tc:preview_lock to fix it.`);
  session.interval = system.runInterval(() => tick(player, session), TICK_RATE);
  return true;
}

export function togglePreviewLock(player) {
  const session = sessions.get(player.id);
  if (!session) return false;
  if (!session.anchor) {
    reportIssue(player, "Aim at a valid block face before fixing the preview.");
    return false;
  }
  session.locked = !session.locked;
  reportIssue(player, session.locked ? "Preview fixed in place." : "Preview tracking resumed.");
  return true;
}

export function rotatePreview(player, amount) {
  const session = sessions.get(player.id);
  if (!session || !Number.isInteger(amount)) return false;
  session.rotation = (session.rotation + amount + 4) % 4;
  session.key = "";
  if (!session.locked) session.anchor = undefined;
  reportIssue(player, `Preview rotation: ${session.rotation * 90} degrees.`);
  return true;
}

export function confirmPreview(player) {
  const session = sessions.get(player.id);
  if (!session?.anchor) {
    reportIssue(player, "No valid preview position to confirm.");
    return false;
  }
  stop(player, session, true);
  return true;
}

export function cancelPreview(player) {
  const session = sessions.get(player.id);
  if (!session) return false;
  stop(player, session, false);
  return true;
}
