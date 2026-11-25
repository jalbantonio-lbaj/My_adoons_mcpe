// NEON HALO - supersonic flight effects + wall phasing (fighter-jet style).
//
// Works on the real flight speed of the player (blocks per tick), so every source counts: the first double tap
// (nitro), stacked taps, the sprint launch, the ever-growing boost from neonFlight.js ...
//
//   tier 1  VAPOR_SPEED   horizontal-ish launch fast enough -> white VAPOR CONE trailing behind (expanding rings of mist)
//   tier 2  SHOCK_SPEED   faster -> SHOCK COLLAR (a bright ring of condensation around the body, perpendicular to the
//                         flight direction) + denser cone + a sonic boom the moment the tier is reached
//   tier 3  PHASE_SPEED   faster still -> when an obstacle is in the flight path the player switches to SPECTATOR
//                         (flies through the wall at the same speed, steerable with the camera) and is switched back to
//                         the original game mode (survival / adventure) as soon as the way is clear. Flight resumes.
//
// Rough guide with the default neon numbers: 1 double tap ~ 3.9 b/tick, 2 taps ~ 5.7, 3 taps ~ 8. Change the three
// thresholds below to taste (blocks per tick, 1 b/tick = 20 blocks per second).
import * as MC from "@minecraft/server";
const { world, system } = MC;
import { isScriptFlying, setScriptPhasing, scriptFlightResume } from "./scriptFlight.js";

const VAPOR_SPEED = 3.0;     // tier 1: vapor cone
const SHOCK_SPEED = 4.5;     // tier 2: shock collar + sonic boom
const PHASE_SPEED = 6.5;     // tier 3: noclip through obstacles
const TIER_HYSTERESIS = 0.9; // a tier is only left when the speed drops below threshold x this (no flicker)
const MAX_PITCH_RATIO = 0.65; // vapor / shock only for a launch that is mostly horizontal: |vy| / speed below this

// ---- phasing ----
const PHASE_LOOK_MIN = 3;    // obstacle look-ahead = peak speed x 2.5 blocks, clamped to this range
const PHASE_LOOK_MAX = 14;
const PHASE_MIN_TICKS = 4;   // stay in spectator at least this long (no flip-flop on thin walls)
const PHASE_FLOOR = 2.0;     // speed never drops below this while phasing (so the player always gets out of the rock)
const PHASE_DECAY = 0.985;   // per tick
const PHASE_GAIN = 0.6;      // share of the velocity difference corrected per tick while phasing
const PHASE_COOLDOWN = 15;   // ticks after leaving the wall before a new phase may start
const PHASE_TAG = "halo_phase";          // survives a /reload so the player is never stuck in spectator
const PHASE_GM_KEY = "halo:phase_gm";    // the game mode the player had BEFORE the phase ("survival" / "adventure" / "creative"): it is restored exactly

// ---- particles ----
const PUFF = "halo:sonic_puff";
const BOOM_COOLDOWN = 40;

const states = new Map();
world.afterEvents.playerLeave.subscribe((ev) => states.delete(ev.playerId));

function stateOf(id) {
  let s = states.get(id);
  if (!s) {
    s = { tier: 0, peak: 0, dir: null, lastPos: null, phase: false, phaseTicks: 0, phaseSpeed: 0, origGm: "survival", cooldown: 0, boomAt: -9999 };
    states.set(id, s);
  }
  return s;
}

// ---------------------------------------------------------------- helpers
function gmOf(player) {
  try { return String(player.getGameMode()).toLowerCase(); } catch { return ""; }
}
function setGm(player, gm) {
  try {
    player.setGameMode(gm === "spectator" ? MC.GameMode.Spectator : gm === "adventure" ? MC.GameMode.Adventure : gm === "creative" ? MC.GameMode.Creative : MC.GameMode.Survival);
  } catch {
    try {
      player.runCommand("gamerule sendcommandfeedback false");
      player.runCommand(`gamemode ${gm} @s`);
      player.runCommand("gamerule sendcommandfeedback true");
    } catch { /* ignore */ }
  }
}

// blocks that never stop the player (plants, decoration, fire...) - everything else that is not air / liquid is an obstacle
const NO_COLLISION = /(^|:)(short_grass|tall_grass|tallgrass|double_plant|fern|large_fern|deadbush|dead_bush|seagrass|kelp|kelp_plant|vine|.*_vines|.*sapling|.*flower|.*tulip|.*orchid|.*allium|.*azure_bluet|.*cornflower|.*lily_of_the_valley|poppy|dandelion|torchflower|pitcher_plant|wither_rose|torch|.*_torch|redstone_wire|rail|.*_rail|.*carpet|snow_layer|.*_button|lever|.*_sign|.*banner|web|cobweb|sugar_cane|reeds|.*mushroom|.*roots|sweet_berry_bush|.*fire|eternal_fire.*|light_block|structure_void|pink_petals|wildflowers|leaf_litter|glow_lichen|sculk_vein|tripwire.*|string|.*pressure_plate|bush|firefly_bush|cave_vines.*|weeping_vines|twisting_vines|spore_blossom|frogspawn|turtle_egg|.*coral_fan.*|.*coral_wall_fan|.*coral)$/;
function isObstacle(block) {
  if (!block) return false;
  try {
    if (block.isAir || block.isLiquid) return false;
  } catch { /* ignore */ }
  return !NO_COLLISION.test(block.typeId);
}
function blockAt(dim, x, y, z) {
  try { return dim.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) }); } catch { return undefined; }
}

const BODY_Y = [0.3, 1.0, 1.65];
/** is there an obstacle along the path from the player in direction d, within `len` blocks? */
function blockedAhead(player, d, len) {
  const dim = player.dimension;
  const p = player.location;
  for (let t = 0.6; t <= len; t += 0.75) {
    for (const hy of BODY_Y) {
      if (isObstacle(blockAt(dim, p.x + d.x * t, p.y + hy + d.y * t, p.z + d.z * t))) return true;
    }
  }
  return false;
}
/** is the space the player body occupies right now free of solid blocks (and loaded)? */
function bodyClear(player) {
  const dim = player.dimension;
  const p = player.location;
  for (const hy of [0.1, 0.9, 1.7]) {
    for (const ox of [0, -0.35, 0.35]) {
      for (const oz of (ox === 0 ? [0] : [-0.35, 0.35])) {
        const b = blockAt(dim, p.x + ox, p.y + hy, p.z + oz);
        if (b === undefined) return false; // unloaded chunk: not safe to leave spectator yet
        if (isObstacle(b)) return false;
      }
    }
  }
  return true;
}

function norm3(v) {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l, z: v.z / l } : null;
}
function basisOf(d) {
  // two unit vectors perpendicular to d
  let ux, uy, uz;
  if (Math.abs(d.y) > 0.95) { ux = 0; uy = d.z; uz = -d.y; } // cross(d, x-axis)
  else { ux = -d.z; uy = 0; uz = d.x; }                      // cross(d, y-axis)
  const l = Math.hypot(ux, uy, uz) || 1;
  const u = { x: ux / l, y: uy / l, z: uz / l };
  const v = { x: d.y * u.z - d.z * u.y, y: d.z * u.x - d.x * u.z, z: d.x * u.y - d.y * u.x };
  return [u, v];
}

/** a ring of mist puffs perpendicular to d. radial: outward speed (blocks/s), r0: ring radius */
function ring(dim, c, d, o) {
  const [u, v] = basisOf(d);
  const n = o.n;
  const a0 = Math.random() * Math.PI * 2;
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rx = u.x * ca + v.x * sa, ry = u.y * ca + v.y * sa, rz = u.z * ca + v.z * sa;
    try {
      const map = new MC.MolangVariableMap();
      map.setFloat("variable.dx", rx); map.setFloat("variable.dy", ry); map.setFloat("variable.dz", rz);
      map.setFloat("variable.sp", o.sp);
      map.setFloat("variable.drag", o.drag ?? 1.5);
      map.setFloat("variable.life", o.life);
      map.setFloat("variable.s", o.size * (0.85 + Math.random() * 0.3));
      map.setFloat("variable.a", o.alpha);
      map.setFloat("variable.cr", o.rgb[0]); map.setFloat("variable.cg", o.rgb[1]); map.setFloat("variable.cb", o.rgb[2]);
      dim.spawnParticle(PUFF, { x: c.x + rx * o.r0, y: c.y + ry * o.r0, z: c.z + rz * o.r0 }, map);
    } catch { return; } // particle missing / chunk unloaded: stop quietly
  }
}

const WHITE = [1, 1, 1];
const ICE = [0.75, 0.93, 1];
const NEON = [0.55, 0.85, 1];

function boom(player, c, d, big) {
  const dim = player.dimension;
  ring(dim, { x: c.x + d.x * 1.5, y: c.y + d.y * 1.5, z: c.z + d.z * 1.5 }, d,
    { n: big ? 20 : 16, r0: 0.9, sp: big ? 22 : 16, drag: 2.2, life: 0.65, size: big ? 1.7 : 1.4, alpha: 0.7, rgb: ICE });
  try { dim.playSound("mob.warden.sonic_boom", c, { volume: big ? 1.2 : 0.9, pitch: big ? 1.1 : 1.3 }); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- main tick
/** call once per tick for every player (armorEffects.js). hasNeon = the neon chestplate is worn right now */
export function neonSonicTick(player, hasNeon) {
  const id = player.id;
  let st = states.get(id);

  // after a /reload the state is gone but the tag is still on the player: carry on with the phase (or clean up)
  if ((!st || !st.phase) && player.hasTag(PHASE_TAG)) {
    st = stateOf(id);
    if (gmOf(player) === "spectator") {
      let gm = "survival";
      try { const g = player.getDynamicProperty(PHASE_GM_KEY); if (g === "adventure" || g === "creative" || g === "survival") gm = g; } catch { /* ignore */ }
      st.phase = true; st.phaseTicks = 0; st.origGm = gm; st.phaseSpeed = PHASE_SPEED * 0.5;
      setScriptPhasing(player, true);
    } else {
      try { player.removeTag(PHASE_TAG); } catch { /* ignore */ }
    }
  }
  if (st?.phase) { phaseTick(player, st); return; }

  if (!hasNeon) { if (st) states.delete(id); return; }
  st = st ?? stateOf(id);

  const gm = gmOf(player);
  const flying = ((gm === "survival" || gm === "adventure") && isScriptFlying(player)) || (gm === "creative" && !!player.isFlying);
  if (!flying) { st.tier = 0; st.peak = 0; st.lastPos = null; return; }

  const vel = player.getVelocity();
  const sp3 = Math.hypot(vel.x, vel.y, vel.z);
  const sph = Math.hypot(vel.x, vel.z);
  const dirNow = norm3(vel);
  if (dirNow && sp3 > 1) st.dir = dirNow;
  st.peak = Math.max(sp3, st.peak * 0.9);
  if (st.cooldown > 0) st.cooldown--;

  const flat = sp3 > 0 && Math.abs(vel.y) <= MAX_PITCH_RATIO * sp3;
  const tierOld = st.tier;
  let tier = 0;
  const hy = (th, t) => (tierOld >= t ? th * TIER_HYSTERESIS : th);
  if (flat && sph >= hy(VAPOR_SPEED, 1)) tier = 1;
  if (flat && sph >= hy(SHOCK_SPEED, 2)) tier = 2;
  st.tier = tier;

  const pos = player.location;
  if (tier > 0 && st.dir) {
    const now = system.currentTick;
    const d = st.dir;
    const dim = player.dimension;
    if (tier === 2 && tierOld < 2 && now - st.boomAt > BOOM_COOLDOWN) {
      st.boomAt = now;
      boom(player, { x: pos.x, y: pos.y + 0.9, z: pos.z }, d, false);
    }
    // shock collar: a ring of condensation around the body, a little behind the camera, sticks to the player
    if (tier === 2) {
      ring(dim, { x: pos.x - d.x * 0.6, y: pos.y + 0.9 - d.y * 0.6, z: pos.z - d.z * 0.6 }, d,
        { n: 9, r0: 1.5, sp: 0, life: 0.14, size: 0.95, alpha: 0.75, rgb: ICE });
    }
    // vapor cone: rings of mist left behind on the way travelled this tick, expanding outward into a cone
    const last = st.lastPos ?? pos;
    const traveled = Math.min(14, Math.hypot(pos.x - last.x, pos.y - last.y, pos.z - last.z));
    const maxRings = tier === 2 ? 4 : 3;
    const spacing = Math.max(1.4, traveled / maxRings);
    const rings = Math.min(maxRings, Math.floor(traveled / spacing) + 1);
    for (let i = 0; i < rings; i++) {
      const back = 1.0 + i * spacing;
      ring(dim, { x: pos.x - d.x * back, y: pos.y + 0.9 - d.y * back, z: pos.z - d.z * back }, d, tier === 2
        ? { n: 7, r0: 0.5, sp: 5, life: 0.85, size: 1.1, alpha: 0.6, rgb: ICE }
        : { n: 6, r0: 0.45, sp: 3.5, life: 0.8, size: 0.9, alpha: 0.5, rgb: WHITE });
    }
  }
  st.lastPos = { x: pos.x, y: pos.y, z: pos.z };

  // tier 3: fast enough and something is in the way -> phase through it
  if (st.peak >= PHASE_SPEED && st.cooldown === 0 && st.dir) {
    const look = Math.max(PHASE_LOOK_MIN, Math.min(PHASE_LOOK_MAX, st.peak * 2.5));
    if (blockedAhead(player, st.dir, look)) engage(player, st, gm);
  }
}

function engage(player, st, gm) {
  st.phase = true;
  st.phaseTicks = 0;
  st.phaseSpeed = Math.max(st.peak, PHASE_SPEED);
  st.origGm = gm; // exactly the mode the player was in
  try { player.addTag(PHASE_TAG); player.setDynamicProperty(PHASE_GM_KEY, st.origGm); } catch { /* ignore */ }
  setScriptPhasing(player, true);
  setGm(player, "spectator");
  const p = player.location;
  boom(player, { x: p.x, y: p.y + 0.9, z: p.z }, st.dir ?? { x: 0, y: 0, z: 1 }, true);
}

function phaseTick(player, st) {
  // somebody switched the game mode by hand (command, other addon): stop driving, just clean up
  if (gmOf(player) !== "spectator") {
    abortPhase(player, st);
    return;
  }
  st.phaseTicks++;
  const view = norm3(player.getViewDirection()) ?? st.dir ?? { x: 0, y: 0, z: 1 };
  st.phaseSpeed = Math.max(PHASE_FLOOR, st.phaseSpeed * PHASE_DECAY);
  const now = player.getVelocity();
  try {
    player.applyImpulse({
      x: (view.x * st.phaseSpeed - now.x) * PHASE_GAIN,
      y: (view.y * st.phaseSpeed - now.y) * PHASE_GAIN,
      z: (view.z * st.phaseSpeed - now.z) * PHASE_GAIN,
    });
  } catch { /* ignore */ }

  // glowing trail so the phase is visible
  const p = player.location;
  ring(player.dimension, { x: p.x - view.x * 1.2, y: p.y + 0.9 - view.y * 1.2, z: p.z - view.z * 1.2 }, view,
    { n: 6, r0: 0.7, sp: 2, life: 0.5, size: 0.8, alpha: 0.5, rgb: NEON });

  if (st.phaseTicks < PHASE_MIN_TICKS) return;
  // out of the wall when the body is free AND the way ahead is free for a moment
  let minY = -64;
  try { minY = player.dimension.heightRange.min; } catch { /* ignore */ }
  if (p.y < minY + 2) return; // never leave spectator below the world
  if (!bodyClear(player)) return;
  const exitLook = Math.max(2, Math.min(8, st.phaseSpeed * 1.5));
  if (blockedAhead(player, view, exitLook)) return;
  disengage(player, st);
}

function disengage(player, st) {
  const v = player.getVelocity();
  setGm(player, st.origGm);
  try { player.removeTag(PHASE_TAG); } catch { /* ignore */ }
  if (st.origGm === "survival" || st.origGm === "adventure" || st.origGm === "creative") scriptFlightResume(player, v.x, v.y, v.z); // neon chestplate uses script flight in every mode
  else setScriptPhasing(player, false);
  st.phase = false;
  st.cooldown = PHASE_COOLDOWN;
  st.peak = Math.hypot(v.x, v.y, v.z);
  st.lastPos = null;
}

function abortPhase(player, st) {
  setScriptPhasing(player, false);
  try { player.removeTag(PHASE_TAG); } catch { /* ignore */ }
  st.phase = false;
  st.cooldown = PHASE_COOLDOWN;
  st.peak = 0;
  st.lastPos = null;
}
