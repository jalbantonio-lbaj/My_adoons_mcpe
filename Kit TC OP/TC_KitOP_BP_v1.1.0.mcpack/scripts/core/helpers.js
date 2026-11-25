import { world, Player } from "@minecraft/server";

// -- Check: entity is an online player with a valid object.
export function isValidPlayer(entity) {
  if (!entity) return false;
  if (!(entity instanceof Player)) return false;
  return entity.isValid === true;
}

// -- Feedback: single prefixed chat line, skippable via tc:pref_feedback false.
export function sendFeedback(player, message) {
  if (!isValidPlayer(player)) return;
  if (player.getDynamicProperty("tc:pref_feedback") === false) return;
  player.sendMessage(`[TC] ${message}`);
}

// -- Fix: resolve a template by namespaced, bare, or slash-form identifier.
export function resolveStructure(id) {
  if (typeof id !== "string" || !id) return undefined;
  const manager = world.structureManager;
  if (!manager) return undefined;
  const bare = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  const candidates = [id, bare, id.replace(":", "/")];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const structure = manager.get(candidate);
    if (structure) return structure;
  }
  return undefined;
}

// -- Diagnostic: bypass the feedback toggle so a failed setup is always visible.
export function reportIssue(player, message) {
  if (!isValidPlayer(player)) return;
  player.sendMessage(`[TC] ${message}`);
}

// -- Format: compact X/Y/Z text for a chat coordinate hint.
export function formatCoords(point) {
  if (!point) return "unknown";
  return `${Math.floor(point.x)}, ${Math.floor(point.y)}, ${Math.floor(point.z)}`;
}

// -- Position: point 2 blocks in front of the player's eyes.
export function facePoint(player, distance) {
  const head = player.getHeadLocation();
  const view = player.getViewDirection();
  const dimension = player.dimension;
  return {
    x: head.x + view.x * distance,
    y: Math.max(dimension.heightRange.min + 1, Math.min(dimension.heightRange.max - 2, head.y + view.y * distance - 0.45)),
    z: head.z + view.z * distance
  };
}

// -- Position: anchor for a 2-cell chest. Prefers solid floor under the anchor,
// falls back to a floating spot so open air never reports "no room".
export function doubleBase(dimension, point, cells) {
  const base = { x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z) };
  const dys = [0, -1, -2, -3, -4, -5, 1, 2];
  for (const dy of dys) {
    const at = { x: base.x, y: base.y + dy, z: base.z };
    const below = { x: at.x, y: at.y - 1, z: at.z };
    if (!inRangeLoaded(dimension, at)) continue;
    if (!allAir(dimension, base, dy, cells)) continue;
    const floor = dimension.getBlock(below);
    if (!floor?.isValid || floor.isAir || floor.isLiquid) continue;
    return { x: base.x, y: base.y + dy, z: base.z };
  }
  for (const dy of dys) {
    const at = { x: base.x, y: base.y + dy, z: base.z };
    if (!inRangeLoaded(dimension, at)) continue;
    if (!allAir(dimension, base, dy, cells)) continue;
    return { x: base.x, y: base.y + dy, z: base.z };
  }
  return undefined;
}

// -- Check: location inside height limits with a loaded chunk.
function inRangeLoaded(dimension, at) {
  if (at.y < dimension.heightRange.min || at.y + 1 >= dimension.heightRange.max) return false;
  if (!dimension.isChunkLoaded(at)) return false;
  return true;
}

// -- Check: every chest cell at this height is air.
function allAir(dimension, base, dy, cells) {
  for (const c of cells) {
    const block = dimension.getBlock({ x: base.x + c.x, y: base.y + dy, z: base.z + c.z });
    if (!block?.isValid || !block.isAir) return false;
  }
  return true;
}
