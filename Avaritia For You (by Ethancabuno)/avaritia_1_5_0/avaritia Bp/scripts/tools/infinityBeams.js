import * as MC from "@minecraft/server";
import { EntityDamageCause, Player, system, world } from "@minecraft/server";
import { beamMuzzle, fx } from "./infinityFx.js";
import { isFlaggedAgainst, isPet } from "./dangerFlags.js";

/**
 * Infinity Crossbow - "Devour" skill.
 *
 * Fire a loaded crossbow WHILE SNEAKING:
 *   - A void sphere (particle ptl:void_sphere_beam) flies straight from the muzzle far away, devouring blocks along its path.
 *   - The sphere carves blocks into a tunnel whose radius depends on how long the charge button was held (radiusForHold: +1 block per second held), starting BEAM_START blocks from the shooter (does not break the feet immediately),
 *     lengthForRadius(radius) blocks long (220 at the minimum radius, +10 blocks per +1 radius); the end is rounded off (a hemisphere with the same radius), the sphere shrinks and vanishes at the end point.
 *   - ONE-SHOTS every creature in the tunnel, including other players (except the shooter).
 *     Pets are NOT shot, unless they have attacked the shooter / the shooter's pet (5-minute danger flag, see dangerFlags.js).
 *   On cooldown: nothing fires, the action bar says how long is left; the crossbow keeps its loaded state.
 *
 * Blocks are broken gradually tick by tick with a time budget (does not freeze the game); blocks in unloaded chunks are retried later.
 * Breaks EVERY block (the DEVOUR_KEEP keep-list is empty). All values below are adjustable.
 */

// The Devour path length (including the rounded head) depends on the radius: the minimum radius (BEAM_MIN_RADIUS) is BEAM_LENGTH_BASE blocks long,
// each +1 radius adds BEAM_LENGTH_PER_RADIUS blocks to the flight path length.
const BEAM_LENGTH_BASE = 220;
const BEAM_LENGTH_PER_RADIUS = 10;
const BEAM_RADIUS = 10; // DEFAULT radius (for crossbows loaded in an older version that have no radius data); also the radius of the hemisphere at the end
// Radius depends on how long the charge button is HELD: minimum BEAM_MIN_RADIUS, +1 block per second held, maximum BEAM_MAX_RADIUS.
export const BEAM_MIN_RADIUS = 3;
export const BEAM_MAX_RADIUS = 25;
export const BEAM_RADIUS_PER_SECOND = 1;
export function lengthForRadius(radius) {
  return Math.max(BEAM_LENGTH_BASE - 100, BEAM_LENGTH_BASE + (radius - BEAM_MIN_RADIUS) * BEAM_LENGTH_PER_RADIUS);
}
export function radiusForHold(heldTicks) {
  const r = BEAM_MIN_RADIUS + Math.floor(Math.max(0, heldTicks) / 20) * BEAM_RADIUS_PER_SECOND;
  return Math.min(BEAM_MAX_RADIUS, r);
}
const BEAM_DAMAGE = 1e9; // enough to one-shot anything; if still alive (totem, damage resistance...) then kill() right away
const BEAM_STEP = 2; // each slice is 2 blocks thick
const BEAM_SPEED = 8; // flight and digging speed of the sphere (blocks per tick). This is the MAXIMUM speed; the sphere slows itself down if digging cannot keep up (see CALIBRATE_TICKS). 8 = the whole minimum path takes ~1.4 seconds
const BEAM_BUDGET_MS = 20; // time budget per tick for digging
const BEAM_CATCHUP_BUDGET_MS = 30; // when the hole lags far behind the sphere (> 1 radius): allowed more time to catch up
const ListBlockVolume = MC.ListBlockVolume; // obtained through the namespace: if this API version lacks it, it is undefined and the old method is used (does not break the whole addon)
const FILL_BATCH = 3000; // max number of cells per fillBlocks call
const BEAM_START = 2; // Devour starts carving this far from the shooter (does not break right under the feet)
const BEAM_BEHIND = 0;
const SPHERE_SHRINK = 60; // the sphere shrinks evenly over this many blocks at the end of the path, reaching 0 exactly at the end point
const SKILL_COOLDOWN_TICKS = 200; // 10 seconds

// Ticking areas keep chunks along the path loaded (no more getting stuck waiting for chunks). Several areas load in parallel for speed.
const AREA_PREFIX = "avaritia_devour_";
const AREA_SEGMENT = 44; // each ticking area covers about this many blocks of the path (≤ ~36 chunks/area, ~5 areas for the whole path)
const AREA_START_AREAS = 2; // only this many initial areas (~88 blocks) need to finish loading before firing; later areas load in parallel while digging
const AREA_LOAD_TIMEOUT_TICKS = 60; // wait at most 3 seconds, then fire anyway (the unloaded part will wait as before)
const CALIBRATE_TICKS = 6; // the first few ticks only dig (no sphere yet) to MEASURE the real digging speed, then the sphere flies at that speed
const MIN_SPEED_PER_SEC = 20; // the sphere never flies slower than this (blocks/second)
let beamCounter = 0;

const EXCLUDED_TYPES = [
  "minecraft:item",
  "minecraft:xp_orb",
  "minecraft:armor_stand",
  "minecraft:lightning_bolt",
  "avaritia:infinity_trident_spirit",
];

export const UNBREAKABLE = new Set([
  "minecraft:bedrock",
  "minecraft:barrier",
  "minecraft:end_portal_frame",
  "minecraft:end_portal",
  "minecraft:end_gateway",
  "minecraft:command_block",
  "minecraft:chain_command_block",
  "minecraft:repeating_command_block",
  "minecraft:structure_block",
  "minecraft:jigsaw",
  "minecraft:border_block",
  "minecraft:allow",
  "minecraft:deny",
]);

// Blocks Devour does NOT break. Leave EMPTY = break every block (including bedrock, barrier, command blocks, End portal frames...).
// To keep a block, add its typeId, for example "minecraft:bedrock". (UNBREAKABLE above is still used for the crossbow's regular block-piercing bullets.)
const DEVOUR_KEEP = new Set();

const skillCooldown = {};

/** Make sure the target dies: set health = 0 -> kill() -> if still alive then remove() (players cannot be removed, so teleport them below the bottom of the world/void to die). */
export function finishOff(e) {
  try {
    if (!e || !e.isValid) return;
    const alive = () => {
      try {
        if (!e.isValid) return false;
        const h = e.getComponent("minecraft:health");
        return !!h && h.currentValue > 0;
      } catch {
        return false;
      }
    };
    if (!alive()) return;
    // Fall into the void: teleport below the bottom of the dimension (100 blocks below the floor) to take void damage.
    const toVoid = () => {
      try {
        const min = e.dimension.heightRange.min;
        const l = e.location;
        e.teleport({ x: l.x, y: min - 100, z: l.z });
      } catch {
        // ignore
      }
    };
    // 1) set health to 0
    try {
      const h = e.getComponent("minecraft:health");
      if (h) h.setCurrentValue(0);
    } catch {
      // try another way below
    }
    if (!alive()) return;
    // 2) kill()
    try {
      e.kill();
    } catch {
      // try another way below
    }
    if (!alive()) return;
    // 3) still alive: player -> teleport to the void; other creatures -> remove(), if that fails teleport to the void
    if (e instanceof Player) {
      toVoid();
      if (alive()) {
        try {
          e.runCommand("kill @s");
        } catch {
          // ignore
        }
      }
      return;
    }
    try {
      e.remove();
    } catch {
      toVoid();
    }
  } catch {
    // ignore
  }
}

function norm(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/** Beam shape: a cylinder from the muzzle to (length - radius) + a hemisphere at the end (the projectile's head). */
function makeShape(origin, dir, length, radius) {
  const capT = Math.max(0, length - radius);
  const cap = { x: origin.x + dir.x * capT, y: origin.y + dir.y * capT, z: origin.z + dir.z * capT };
  return (x, y, z, margin = 0) => {
    const rr = (radius + margin) * (radius + margin);
    const dx = x - origin.x, dy = y - origin.y, dz = z - origin.z;
    const proj = dx * dir.x + dy * dir.y + dz * dir.z;
    if (proj < -BEAM_BEHIND) return false;
    if (proj <= capT) return dx * dx + dy * dy + dz * dz - proj * proj <= rr;
    const cx = x - cap.x, cy = y - cap.y, cz = z - cap.z;
    return cx * cx + cy * cy + cz * cz <= rr;
  };
}

function pointAt(origin, dir, d) {
  return { x: origin.x + dir.x * d, y: origin.y + dir.y * d, z: origin.z + dir.z * d };
}

function removeAreas(ids, dim) {
  let tm;
  try {
    tm = world.tickingAreaManager;
  } catch {
    tm = undefined; // API unavailable: areas were created via commands
  }
  for (const id of ids) {
    if (tm) {
      try {
        tm.removeTickingArea(id);
      } catch {
        // already removed
      }
    }
    // Fallback: for areas created via the tickingarea command (or when the API removal fails), remove them by command so NONE are left behind holding chunks forever.
    if (dim) {
      try {
        dim.runCommand(`tickingarea remove ${id}`);
      } catch {
        // already removed
      }
    }
  }
}

// Clean up leftover ticking areas from a previous session (game closed mid-shot).
system.run(() => {
  try {
    const tm = world.tickingAreaManager;
    for (const a of tm.getAllTickingAreas()) {
      if (typeof a.identifier === "string" && a.identifier.startsWith(AREA_PREFIX)) tm.removeTickingArea(a.identifier);
    }
  } catch {
    // ignore
  }
});

/**
 * Creates parallel ticking areas along the path, then calls onReady(ids) once they have finished loading (or the wait timed out).
 * Prefers world.tickingAreaManager; if unavailable, uses the tickingarea command (preload).
 */
function preloadPath(dim, origin, dir, radius, length, onReady) {
  const beamId = ++beamCounter;
  const pad = radius + 2;
  const ids = [];
  let tm;
  try {
    tm = world.tickingAreaManager;
  } catch {
    tm = undefined;
  }
  let i = 0;
  const seg = Math.max(AREA_SEGMENT, Math.ceil(length / 6)); // the longer the path, the longer each ticking area is so the allowed area count is not exceeded
  for (let d0 = 0; d0 < length; d0 += seg, i++) {
    const a = pointAt(origin, dir, d0);
    const b = pointAt(origin, dir, Math.min(length, d0 + seg));
    const from = { x: Math.floor(Math.min(a.x, b.x) - pad), y: Math.floor(origin.y), z: Math.floor(Math.min(a.z, b.z) - pad) };
    const to = { x: Math.floor(Math.max(a.x, b.x) + pad), y: Math.floor(origin.y), z: Math.floor(Math.max(a.z, b.z) + pad) };
    const id = `${AREA_PREFIX}${beamId}_${i}`;
    let made = false;
    let full = false; // no room left for ticking areas: skip this area (that part will wait for loading as before)
    if (tm) {
      try {
        if (tm.hasCapacity({ dimension: dim, from, to }) === false) {
          full = true;
        } else {
          const p = tm.createTickingArea(id, { dimension: dim, from, to });
          if (p && typeof p.catch === "function") p.catch(() => {});
          made = true;
        }
      } catch {
        made = false; // API error: try the tickingarea command below
      }
    }
    if (!made && !full) {
      try {
        dim.runCommand(`tickingarea add ${from.x} ${from.y} ${from.z} ${to.x} ${to.y} ${to.z} ${id} true`);
        made = true;
      } catch {
        made = false;
      }
    }
    if (made) ids.push(id);
  }

  const startD = Math.min(length, AREA_START_AREAS * seg);
  const sampleLoaded = () => {
    for (let d = 0; d <= startD; d += 16) {
      for (const off of [-radius, 0, radius]) {
        try {
          const p = pointAt(origin, dir, d);
          if (!dim.getBlock({ x: Math.floor(p.x + off), y: Math.floor(origin.y), z: Math.floor(p.z + off) })) return false;
        } catch {
          return false;
        }
      }
    }
    return true;
  };
  const areasLoaded = () => {
    if (!tm) return true;
    for (const id of ids.slice(0, AREA_START_AREAS)) {
      try {
        const ta = tm.getTickingArea(id);
        if (!ta || ta.isFullyLoaded === false) return false;
      } catch {
        // could not read the state: rely on sampleLoaded
      }
    }
    return true;
  };

  let waited = 0;
  const poll = system.runInterval(() => {
    waited += 2;
    if ((areasLoaded() && sampleLoaded()) || waited >= AREA_LOAD_TIMEOUT_TICKS) {
      system.clearRun(poll);
      onReady(ids);
    }
  }, 2);
}

const STALL_RETRY_TICKS = 10; // slice hit an unloaded chunk: the hole + sphere stand and wait, retrying once every this many ticks
const STALL_MAX_TICKS = 240; // stuck on a chunk for at most 12 seconds; beyond that, CANCEL entirely (previously 3 minutes => prolonged lag, holding the ticking area)
const MAX_LIFETIME_TICKS = 900; // safety stop: one shot lives at most 45 seconds no matter what happens

function runBeam(dim, owner, origin, dir, radius) {
  const length = lengthForRadius(radius);
  const inside = makeShape(origin, dir, length, radius);
  const half = BEAM_STEP / 2 + 0.3;
  const hit = new Set();
  // REAL height limits of the dimension (Nether 0..127, End 0..255, Overworld -64..319). Cells outside this range
  // make getBlock fail -> the slice is treated as "not loaded" forever -> the hole gets stuck permanently.
  let hMin = -64;
  let hMax = 319;
  try {
    hMin = dim.heightRange.min;
    hMax = dim.heightRange.max - 1;
  } catch {
    // use the Overworld default
  }
  let t = 0;

  // Clear the whole slice with fillBlocks (native, much faster than getBlock + setType cell by cell). Skips air cells and
  // blocks that cannot be broken via blockFilter. Returns false if digging is not finished (chunk not loaded).
  const FILL_FILTER = { excludeTypes: ["minecraft:air", ...DEVOUR_KEEP] };
  let fastFill = true;
  function carve(p) {
    const R = radius + 1;
    const x0 = Math.floor(p.x - R), x1 = Math.floor(p.x + R);
    const y0 = Math.max(hMin, Math.floor(p.y - R)), y1 = Math.min(hMax, Math.floor(p.y + R));
    const z0 = Math.floor(p.z - R), z1 = Math.floor(p.z + R);
    const cells = [];
    // Optimization: instead of scanning the whole (2R+1)^3 box, only scan the 2 secondary axes and precompute the range of cells inside the slice's thickness
    // on the main axis (the axis with the largest |direction|). Same result as the old method (all conditions are still checked), but ~10 times fewer loop iterations.
    const dv = [dir.x, dir.y, dir.z];
    const pv = [p.x, p.y, p.z];
    const lo = [x0, y0, z0];
    const hi = [x1, y1, z1];
    const dom = Math.abs(dv[0]) >= Math.abs(dv[1]) && Math.abs(dv[0]) >= Math.abs(dv[2]) ? 0 : Math.abs(dv[1]) >= Math.abs(dv[2]) ? 1 : 2;
    const ia = (dom + 1) % 3;
    const ib = (dom + 2) % 3;
    const dd = dv[dom];
    const idx = [0, 0, 0];
    for (let u = lo[ia]; u <= hi[ia]; u++) {
      for (let v = lo[ib]; v <= hi[ib]; v++) {
        const rest = (u + 0.5 - pv[ia]) * dv[ia] + (v + 0.5 - pv[ib]) * dv[ib];
        let t0 = (-half - rest) / dd;
        let t1 = (half - rest) / dd;
        if (t0 > t1) {
          const tmp = t0;
          t0 = t1;
          t1 = tmp;
        }
        const w0 = Math.max(lo[dom], Math.floor(pv[dom] + t0 - 0.5) - 1);
        const w1 = Math.min(hi[dom], Math.ceil(pv[dom] + t1 - 0.5) + 1);
        for (let w = w0; w <= w1; w++) {
          idx[ia] = u;
          idx[ib] = v;
          idx[dom] = w;
          const cx = idx[0] + 0.5, cy = idx[1] + 0.5, cz = idx[2] + 0.5;
          const proj = (cx - p.x) * dir.x + (cy - p.y) * dir.y + (cz - p.z) * dir.z;
          if (proj < -half || proj >= half) continue;
          if (!inside(cx, cy, cz, 0.25)) continue;
          cells.push({ x: idx[0], y: idx[1], z: idx[2] });
        }
      }
    }
    if (cells.length === 0) return true;

    if (fastFill) {
      try {
        for (let i = 0; i < cells.length; i += FILL_BATCH) {
          dim.fillBlocks(new ListBlockVolume(cells.slice(i, i + FILL_BATCH)), "minecraft:air", { blockFilter: FILL_FILTER });
        }
        return true;
      } catch (e) {
        if (!(e instanceof TypeError || e instanceof ReferenceError)) return false; // chunk not loaded: retry later
        fastFill = false; // fillBlocks/ListBlockVolume API unusable: switch to the old method
      }
    }

    // Old method (fallback): cell by cell.
    let complete = true;
    for (const c of cells) {
      try {
        const b = dim.getBlock(c);
        if (!b) {
          complete = false;
          continue;
        }
        if (b.isAir || DEVOUR_KEEP.has(b.typeId)) continue;
        b.setType("minecraft:air");
      } catch {
        complete = false;
      }
    }
    return complete;
  }

  // Digs + damages one slice. Returns false if some blocks could not be dug yet (chunk not loaded).
  function slice(p) {
    try {
      for (const e of dim.getEntities({ location: p, maxDistance: radius + BEAM_STEP + 3, excludeTypes: EXCLUDED_TYPES })) {
        if (hit.has(e.id)) continue;
        if (owner && e.id === owner.id) continue; // do not shoot yourself
        // Other players: can be shot. Pets: NO, unless carrying a danger flag (5 minutes) against the shooter.
        if (isPet(e) && !(owner && isFlaggedAgainst(e, owner.id))) continue;
        const l = e.location;
        if (!inside(l.x, l.y + 0.9, l.z, 1.5)) continue;
        hit.add(e.id);
        try {
          const src = owner && owner.isValid ? { cause: EntityDamageCause.entityAttack, damagingEntity: owner } : { cause: EntityDamageCause.entityAttack };
          e.applyDamage(BEAM_DAMAGE, src);
        } catch {
          // target takes no damage
        }
        // True one-shot: if still alive after the hit then kill(); if still alive (damage immunity) then remove() right away.
        finishOff(e);
        system.runTimeout(() => finishOff(e), 2); // re-check: totem / resurrection / delayed damage immunity
      }
    } catch {
      // chunk not loaded
    }
    return carve(p);
  }

  const at = (d) => pointAt(origin, dir, d);

  // The digging cursor t. If a slice cannot be dug yet (chunk not loaded), t stands still, waits for the chunk to load, then digging continues.
  let stalledAt = -1; // tick when it got stuck (-1 = not stuck)
  let lastTry = 0;

  // Void sphere (ptl:void_sphere_beam): the script spawns EXACTLY ONE particle for the whole flight path, never removing/respawning it midway.
  // The particle flies in a steady straight line along the firing direction and shrinks itself at the end of the path using a Molang formula (p0, v, len, shrink), living exactly
  // until it shrinks to 0. Digging chases the sphere's position computed from the real clock (Date.now), in step with the particle on the client,
  // so the hole always stays inside the sphere even when the server lags.
  // If stuck on a chunk: the old sphere keeps flying the remaining distance (the unloaded area is not visible), and when digging can continue, ONE new sphere is spawned
  // exactly at the head of the hole.
  const MAX_SPEED_PER_SEC = BEAM_SPEED * 20;
  let sphereV = MAX_SPEED_PER_SEC; // blocks/second; re-measured after the calibration phase
  let calibrating = true;
  let calStart = 0;
  let calTicks = 0;
  let sphereP0 = 0;
  let sphereT0 = Date.now();
  function launchSphere(p0) {
    sphereP0 = p0;
    sphereT0 = Date.now();
    if (p0 >= length) return;
    fx(dim, "ptl:void_sphere_beam", at(p0), {
      p0,
      v: sphereV,
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
      r: radius,
      len: length,
      shrink: SPHERE_SHRINK,
      life: (length - p0) / sphereV + 0.05,
    });
  }

  let areaIds = [];
  let finished = false;
  const startTick = system.currentTick;
  function finish(reason) {
    if (finished) return;
    finished = true;
    try {
      system.clearRun(job);
    } catch {
      // ignore
    }
    removeAreas(areaIds, dim);
    try {
      if (owner && owner.isValid) owner.onScreenDisplay.setActionBar(reason ? `§cDevour stopped: ${reason}` : "§7Devour ended");
    } catch {
      // ignore
    }
  }

  let first = true;
  let job = -1;
  const begin = () => {
    job = system.runInterval(() => {
    if (system.currentTick - startTick > MAX_LIFETIME_TICKS) {
      finish("timed out");
      return;
    }
    if (first) {
      first = false;
      beamMuzzle(dim, origin); // flash at the muzzle on the very first tick
      // Sphere not released yet: dig the first few ticks to measure the real digging speed (see the calibration block below).
      calStart = Date.now();
      sphereP0 = 0;
      sphereT0 = calStart;
    }
    if (stalledAt >= 0) {
      const now = system.currentTick;
      if (now - stalledAt > STALL_MAX_TICKS) {
        finish("chunk could not be loaded");
        return;
      }
      if (now - lastTry < STALL_RETRY_TICKS) return;
      lastTry = now;
      if (!carve(at(t))) {
        return;
      }
      stalledAt = -1;
      t += BEAM_STEP;
      launchSphere(t); // digging can continue: the new sphere appears exactly at the head of the hole
    }
    const target = Math.min(length, sphereP0 + ((Date.now() - sphereT0) * sphereV) / 1000);
    const started = Date.now();
    const budget = target - t > radius ? BEAM_CATCHUP_BUDGET_MS : BEAM_BUDGET_MS; // if it lags far behind the sphere, use extra time to catch up
    while (t <= length && t <= target) {
      if (!slice(at(t))) {
        stalledAt = system.currentTick;
        lastTry = stalledAt;
        break;
      }
      t += BEAM_STEP;
      if (Date.now() - started > budget) break;
    }
    if (calibrating) {
      if (stalledAt >= 0) {
        calibrating = false; // stuck on a chunk: the sphere will be released once digging can continue
      } else if (++calTicks >= CALIBRATE_TICKS || t > length) {
        calibrating = false;
        const achieved = t / Math.max(0.05, (Date.now() - calStart) / 1000); // blocks/second actually dug
        sphereV = achieved >= MAX_SPEED_PER_SEC * 0.95 ? MAX_SPEED_PER_SEC : Math.min(MAX_SPEED_PER_SEC, Math.max(MIN_SPEED_PER_SEC, achieved * 0.9));
        if (t <= length) launchSphere(t);
      }
    }
    if (stalledAt < 0 && t > length) finish();
    }, 1);
  };

  try {
    if (owner && owner.isValid) owner.onScreenDisplay.setActionBar(`§bDevour: radius ${radius} blocks, length ${length} blocks`);
  } catch {
    // ignore
  }
  preloadPath(dim, origin, dir, radius, length, (ids) => {
    areaIds = ids;
    begin();
  });
}

/** Use the skill. Returns true if it fired (to skip the normal shot). */
export function fireEnergyBeams(player, radius = BEAM_RADIUS) {
  radius = Math.max(1, Math.min(BEAM_MAX_RADIUS, Math.round(radius)));
  const now = system.currentTick;
  const readyAt = skillCooldown[player.id] ?? 0;
  const say = (msg) => {
    try {
      player.onScreenDisplay.setActionBar(msg);
    } catch {
      // ignore
    }
  };
  if (now < readyAt) {
    say(`§7Devour cooldown: ${Math.ceil((readyAt - now) / 20)}s`);
    return false;
  }

  const dim = player.dimension;
  const eye = player.getHeadLocation();
  const dir = norm(player.getViewDirection());
  const origin = { x: eye.x + dir.x * BEAM_START, y: eye.y + dir.y * BEAM_START, z: eye.z + dir.z * BEAM_START };

  runBeam(dim, player, origin, dir, radius); // the sphere flies along with the head of the hole, the whole path is not pre-drawn

  skillCooldown[player.id] = now + SKILL_COOLDOWN_TICKS;
  try {
    dim.playSound("mob.warden.sonic_boom", player.location, { volume: 4, pitch: 0.6 });
    dim.playSound("random.explode", player.location, { volume: 4, pitch: 0.6 });
  } catch {
    // ignore
  }
  return true;
}
