/**
 * Speed zones: cube-shaped areas in which the Avaritia machines (Neutron Collector, Neutronium
 * Compressor, Record Furnace) run `mult` times faster. mult 0 pauses them. Zones are stored in a
 * world dynamic property so they survive restarts.
 */
import { world } from "@minecraft/server";

const KEY = "avaritia:timeZones";
export const SPEEDS = [0, 2, 4, 8, 16, 32, 64];

let zones = null;
let stopInfo = null; // active time stop {dim, x, y, z, r}  (r = 0 -> whole dimension)
const cache = new Map(); // "dim|x,y,z" -> multiplier (cleared whenever zones change)

function load() {
  if (zones) return zones;
  try { zones = JSON.parse(world.getDynamicProperty(KEY) ?? "[]"); } catch { zones = []; }
  if (!Array.isArray(zones)) zones = [];
  return zones;
}

function save() {
  try { world.setDynamicProperty(KEY, JSON.stringify(zones)); } catch { /* ignore */ }
  cache.clear();
}

export const getZones = () => load();

/** Called by the Infinity Clock while time is stopped (null to clear): machines in range are paused. */
export function setTimeStop(info) {
  stopInfo = info;
  cache.clear();
}

export function addZone(z) {
  load();
  const zone = { id: Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), ...z };
  zones.push(zone);
  save();
  return zone;
}

export function updateZone(id, patch) {
  load();
  const z = zones.find((q) => q.id === id);
  if (!z) return undefined;
  Object.assign(z, patch);
  save();
  return z;
}

export function removeZone(id) {
  load();
  zones = zones.filter((q) => q.id !== id);
  save();
}

export function inZone(z, dimId, x, y, z2) {
  return z.dim === dimId && Math.max(Math.abs(x - z.x), Math.abs(y - z.y), Math.abs(z2 - z.z)) <= z.r;
}

/** Multiplier for a machine block: 1 = normal, 0 = paused. If zones overlap, a paused one wins, otherwise the fastest. */
export function zoneMultiplier(block) {
  const list = load();
  const dimId = block.dimension.id;
  if (stopInfo && stopInfo.dim === dimId &&
      (stopInfo.r === 0 || Math.max(Math.abs(block.x - stopInfo.x), Math.abs(block.y - stopInfo.y), Math.abs(block.z - stopInfo.z)) <= stopInfo.r)) return 0;
  if (!list.length) return 1;
  const key = `${dimId}|${block.x},${block.y},${block.z}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let best = 1, paused = false, any = false;
  for (const z of list) {
    if (!inZone(z, dimId, block.x, block.y, block.z)) continue;
    any = true;
    if (z.mult === 0) paused = true;
    else if (z.mult > best) best = z.mult;
  }
  const m = any ? (paused ? 0 : best) : 1;
  cache.set(key, m);
  return m;
}
