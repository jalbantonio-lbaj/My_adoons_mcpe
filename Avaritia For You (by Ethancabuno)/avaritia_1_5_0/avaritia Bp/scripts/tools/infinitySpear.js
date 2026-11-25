import { world, system, EntityDamageCause, EquipmentSlot } from "@minecraft/server";

/**
 * Infinity Spear (avaritia:infinity_spear) - cosmic spear.
 *
 * 1) DAMAGE PER HIT:
 *      damage = 100 x (closing speed) x (RANDOM %)
 *    - Each hit rolls a random % from MIN_RATIO (10%) to MAX_RATIO (100%). NOT multiplied by the target's max health
 *      so it is no longer a one-shot by formula: damage depends only on the lunge speed and the random number.
 *    - Closing speed = the real speed (blocks/second) the player approaches the target, taking the maximum
 *      over the last few ticks. Lunge speed INCREASES while the button is held so later hits hurt more.
 *    - A standing stab still counts at least MIN_SPEED (set to 0 to require lunging).
 *    - Added on top of the item's base damage (minecraft:damage = 50), bypassing armor by forcing a health subtraction.
 *    - Does not hit tamed creatures / yourself, respects the "immortal" tag (like infinity_sword).
 *
 * 2) LUNGE WHILE HOLDING THE SPEAR USE BUTTON (right click) - via IMPULSE, NOT teleport:
 *    - Every tick pushes the player (applyImpulse, like armorSpeed.js; if the API does not accept it for players
 *      it switches to applyKnockback) along the 3D look direction. The target velocity starts at LUNGE_SPEED_START
 *      then INCREASES by LUNGE_ACCEL every tick (the longer held, the faster) up to the cap LUNGE_SPEED_MAX.
 *    - STILL HOLDING the button keeps lunging. RELEASING the button midway, switching items, or RUNNING OUT OF LUNGE
 *      (LUNGE_MAX_TICKS) stops the lunge and brakes; the next lunge is only possible after LUNGE_COOLDOWN_TICKS.
 *    - With a target in view: steers straight at the target, the target is IMMOBILIZED (Slowness 255 + position lock).
 *      On arrival it brakes and stabs. If the target dies it switches to another target / the look direction.
 *    - Every creature touched during the lunge (radius CONTACT_RADIUS) takes a hit, each one
 *      spaced LUNGE_REHIT_TICKS ticks apart.
 *    - EVERY block in the way is destroyed (no drops), and Slow Falling is applied at the end to prevent fall deaths.
 */

const SPEAR_ID = "avaritia:infinity_spear";

// ----- Damage formula -----
const DAMAGE_MULT = 100;
const MIN_RATIO = 0.1;
const MAX_RATIO = 1.0;
const MIN_SPEED = 1; // blocks/second
const SPEED_WINDOW = 6;
const MAX_STEP = 8; // displacement > 8 blocks/tick = teleport, discard the speed sample
const STRIKE_DEDUPE_TICKS = 4; // prevents counting the same hit twice (vanilla hit + hit from the lunge)

// ----- Lunge (impulse) -----
const LUNGE_COOLDOWN_TICKS = 0; // 0 = no cooldown, you can lunge again immediately after a lunge ends
const LUNGE_SPEED_START = 3.0; // velocity at the start of the lunge, blocks/tick (3 = 60 blocks/second)
const LUNGE_ACCEL = 0.1; // each tick the button is held, the target velocity increases by this much (faster and faster)
const LUNGE_SPEED_MAX = 6.0; // velocity cap, blocks/tick (6 = 120 blocks/second)
const LUNGE_MAX_TICKS = 40; // 1 lunge: hold the button at most this many ticks (~60 blocks), then it stops
const LUNGE_GAIN = 0.5; // each tick closes 50% of the gap between current and target velocity (smooth, no jumps)
const BRAKE_GAIN = 0.8; // brake factor when reaching the target / when the lunge ends
const BRAKE_TICKS = 6; // after it ends, keep braking for this many ticks
const PUSH_CAP = 3.0; // maximum push strength per tick
const AIM_DISTANCE = 96;
const CONTACT_RADIUS = 3.0; // touching a creature within this radius (measured from the middle of the body) = stab
const LUNGE_REHIT_TICKS = 8; // the same target must be at least this many ticks apart before being stabbed again
const FREEZE_EXTRA_TICKS = 40;
const RELEASE_TICKS = 20; // after it ends, the target stays locked for this many more ticks
const SLOW_FALL_TICKS = 200;

// ----- Breaking blocks -----
const BREAK_RADIUS = 1; // breaks a 3x3-wide area around the player
const BREAK_HEIGHT = 2; // from the feet up to +2 (3 blocks tall)
const BREAK_STEP = 0.5;
const MAX_BREAK_PER_CALL = 1500;
const UNBREAKABLE = new Set(); // fill in block typeIds to keep, for example "minecraft:bedrock"

// ----- Other -----
const HIT_PLAYERS = true;
const SHOW_ACTIONBAR = true;
const HIT_PARTICLE = "fad:void_sparks_rainbow";

/** playerId -> { last, vels } (velocity in blocks/second per tick) */
const history = new Map();
/** targetId -> tick of the most recent hit */
const lastStrike = new Map();
const lastLunge = new Map();
/** playerId -> lunge state */
const lunges = new Map();
/** targetId -> { expire, location, dimId } */
const frozen = new Map();

function heldSpear(player) {
  const equip = player.getComponent("minecraft:equippable");
  if (!equip) return false;
  const item = equip.getEquipment(EquipmentSlot.Mainhand);
  return !!item && item.typeId === SPEAR_ID;
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return "∞";
  if (n >= 1e9) return n.toExponential(2).replace("e+", "e");
  return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function canTarget(player, entity) {
  try {
    if (!entity?.isValid || entity.id === player.id) return false;
    if (entity.hasTag("immortal")) return false;
    if (entity.getComponent("minecraft:is_tamed")) return false;
    if (!HIT_PLAYERS && entity.typeId === "minecraft:player") return false;
    const h = entity.getComponent("minecraft:health");
    return !!h && h.currentValue > 0;
  } catch {
    return false;
  }
}

function isAlive(entity) {
  try {
    if (!entity?.isValid) return false;
    const h = entity.getComponent("minecraft:health");
    return !!h && h.currentValue > 0;
  } catch {
    return false;
  }
}

// ===================== Speed measurement =====================

system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    const pos = player.location;
    const h = history.get(player.id);
    if (!h) {
      history.set(player.id, { last: { x: pos.x, y: pos.y, z: pos.z }, vels: [] });
      continue;
    }
    const dx = pos.x - h.last.x;
    const dy = pos.y - h.last.y;
    const dz = pos.z - h.last.z;
    h.last = { x: pos.x, y: pos.y, z: pos.z };
    if (Math.hypot(dx, dy, dz) > MAX_STEP) {
      h.vels.length = 0;
      continue;
    }
    h.vels.push({ x: dx * 20, y: dy * 20, z: dz * 20 });
    if (h.vels.length > SPEED_WINDOW) h.vels.shift();
  }
  if (now % 200 === 0) {
    for (const [id, t] of lastStrike) if (now - t > 40) lastStrike.delete(id);
  }
}, 1);

world.afterEvents.playerLeave.subscribe((ev) => {
  history.delete(ev.playerId);
  lunges.delete(ev.playerId);
  lastLunge.delete(ev.playerId);
  braking.delete(ev.playerId);
});

function closingSpeed(player, target) {
  const p = player.location;
  const t = target.location;
  let ux = t.x - p.x;
  let uy = t.y - p.y;
  let uz = t.z - p.z;
  const len = Math.hypot(ux, uy, uz);
  if (len < 0.01) {
    const d = player.getViewDirection();
    ux = d.x;
    uy = d.y;
    uz = d.z;
  } else {
    ux /= len;
    uy /= len;
    uz /= len;
  }

  const tv = target.getVelocity();
  const samples = [...(history.get(player.id)?.vels ?? [])];
  const pv = player.getVelocity();
  samples.push({ x: pv.x * 20, y: pv.y * 20, z: pv.z * 20 });

  let best = 0;
  for (const v of samples) {
    const closing = (v.x - tv.x * 20) * ux + (v.y - tv.y * 20) * uy + (v.z - tv.z * 20) * uz;
    if (closing > best) best = closing;
  }
  return Math.max(MIN_SPEED, best);
}

// ===================== Attacks =====================

function rollRatio() {
  return MIN_RATIO + Math.random() * (MAX_RATIO - MIN_RATIO);
}

function strike(player, target) {
  if (!canTarget(player, target)) return false;

  const now = system.currentTick;
  if (now - (lastStrike.get(target.id) ?? -Infinity) < STRIKE_DEDUPE_TICKS) return false;
  lastStrike.set(target.id, now);

  const health = target.getComponent("minecraft:health");
  const ratio = rollRatio();
  const speed = closingSpeed(player, target); // real speed, including while lunging by impulse
  const damage = DAMAGE_MULT * speed * ratio; // 100 x speed x random % (not multiplied by max health), no cap
  const hpBefore = health.currentValue;
  const location = target.location;
  const dimension = target.dimension;

  // cause = magic so the entityHurt handler below skips this hit (no infinite loop);
  // still sets damagingEntity = the player so it counts as a kill / drops loot as if the player killed it.
  try {
    target.applyDamage(damage, { cause: EntityDamageCause.magic, damagingEntity: player });
  } catch {
    /* go on to the forced health subtraction below */
  }

  // Armor / damage resistance / i-frames may swallow part of it -> force a direct health subtraction to make up the difference.
  if (target.isValid && health.currentValue > 0) {
    const expected = Math.max(0, hpBefore - damage);
    if (health.currentValue > expected) {
      try {
        health.setCurrentValue(expected);
      } catch {
        /* ignore */
      }
    }
  }

  try {
    dimension.spawnParticle(HIT_PARTICLE, { x: location.x, y: location.y + 1, z: location.z });
  } catch {
    /* a missing particle must not break the attack */
  }

  if (SHOW_ACTIONBAR) {
    try {
      player.onScreenDisplay.setActionBar(
        `§d✦ Cosmic Lunge §7| §f${Math.round(ratio * 100)}% §8x §f${speed.toFixed(1)} b/s §8x §f${DAMAGE_MULT} §7= §c${formatNumber(damage)}`
      );
    } catch {
      /* ignore */
    }
  }
  return true;
}

world.afterEvents.entityHurt.subscribe((ev) => {
  try {
    const src = ev.damageSource;
    if (!src || src.cause === EntityDamageCause.magic) return; // magic = the spear's own bonus hit
    if (src.damagingProjectile) return;
    const attacker = src.damagingEntity;
    if (!attacker || attacker.typeId !== "minecraft:player") return;
    if (!heldSpear(attacker)) return;
    strike(attacker, ev.hurtEntity);
  } catch (e) {
    console.warn(e);
  }
});

// ===================== Breaking blocks =====================

function breakBlockAt(dimension, x, y, z) {
  try {
    const block = dimension.getBlock({ x, y, z });
    if (!block || block.isAir || block.isLiquid) return false;
    if (UNBREAKABLE.has(block.typeId)) return false;
    block.setType("minecraft:air");
    return true;
  } catch {
    return false; // chunk not loaded / outside the height limits
  }
}

/** Breaks blocks (2R+1) x (2R+1) x (H+1) sweeping along the line segment a -> b. */
function breakAlong(dimension, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy, dz) / BREAK_STEP));
  const seen = new Set();
  let budget = MAX_BREAK_PER_CALL;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const cx = a.x + dx * t;
    const cy = a.y + dy * t;
    const cz = a.z + dz * t;
    for (let ox = -BREAK_RADIUS; ox <= BREAK_RADIUS; ox++) {
      for (let oz = -BREAK_RADIUS; oz <= BREAK_RADIUS; oz++) {
        for (let oy = 0; oy <= BREAK_HEIGHT; oy++) {
          const bx = Math.floor(cx + ox);
          const by = Math.floor(cy + oy);
          const bz = Math.floor(cz + oz);
          const key = bx + "," + by + "," + bz;
          if (seen.has(key)) continue;
          seen.add(key);
          if (breakBlockAt(dimension, bx, by, bz) && --budget <= 0) return;
        }
      }
    }
  }
}

// ===================== Immobilizing the target =====================

function freezeTarget(target, ticks) {
  const now = system.currentTick;
  frozen.set(target.id, {
    expire: now + ticks,
    location: { x: target.location.x, y: target.location.y, z: target.location.z },
    dimId: target.dimension.id,
  });
  try {
    target.addEffect("slowness", ticks, { amplifier: 255, showParticles: false });
  } catch {
    /* entity cannot receive effects -> its position is still locked below */
  }
  try {
    target.clearVelocity();
  } catch {
    /* ignore */
  }
}

// ===================== Lunge =====================

function findTarget(player) {
  let hits = [];
  try {
    hits = player.getEntitiesFromViewDirection({ maxDistance: AIM_DISTANCE, ignoreBlockCollision: true });
  } catch {
    try {
      hits = player.getEntitiesFromViewDirection({ maxDistance: AIM_DISTANCE });
    } catch {
      /* no aim ray */
    }
  }
  return hits.find((h) => canTarget(player, h.entity))?.entity;
}

function bodyCenter(entity) {
  const l = entity.location;
  return { x: l.x, y: l.y + 0.9, z: l.z };
}

function normalize(x, y, z) {
  const len = Math.hypot(x, y, z);
  if (len < 0.0001) return undefined;
  return { x: x / len, y: y / len, z: z / len };
}

/** Pushes the player by a vector (blocks/tick). applyImpulse first, if that fails applyKnockback. */
let impulseWorks = true;
function pushPlayer(player, dx, dy, dz) {
  const len = Math.hypot(dx, dy, dz);
  if (len > PUSH_CAP) {
    const k = PUSH_CAP / len;
    dx *= k;
    dy *= k;
    dz *= k;
  }
  if (impulseWorks) {
    try {
      player.applyImpulse({ x: dx, y: dy, z: dz });
      return;
    } catch {
      impulseWorks = false; // API rejects it for players -> use knockback
    }
  }
  player.applyKnockback({ x: dx, z: dz }, dy);
}

/** Damps the current velocity to 0 by the gain factor. */
function brakePlayer(player, gain) {
  const v = player.getVelocity();
  pushPlayer(player, -v.x * gain, -v.y * gain, -v.z * gain);
}

/** playerId -> number of ticks left to brake after the lunge ended */
const braking = new Map();

function startLunge(player) {
  const now = system.currentTick;
  if (lunges.has(player.id)) return;
  if (now - (lastLunge.get(player.id) ?? -Infinity) < LUNGE_COOLDOWN_TICKS) return;
  braking.delete(player.id);

  const p = player.location;
  const L = {
    start: now,
    endTick: now + LUNGE_MAX_TICKS,
    holding: true,
    age: 0,
    speed: LUNGE_SPEED_START,
    targetId: undefined,
    hit: new Map(), // targetId -> tick of the most recent stab during this lunge
  };
  const target = findTarget(player);
  if (target) {
    L.targetId = target.id;
    freezeTarget(target, LUNGE_MAX_TICKS + FREEZE_EXTRA_TICKS);
  }
  try {
    player.addEffect("slow_falling", SLOW_FALL_TICKS, { amplifier: 0, showParticles: false });
  } catch {
    /* ignore */
  }
  lunges.set(player.id, L);

  try {
    player.dimension.spawnParticle(HIT_PARTICLE, { x: p.x, y: p.y + 1, z: p.z });
    player.dimension.playSound("mace.heavy_smash_ground", p, { volume: 1, pitch: 0.8 });
  } catch {
    /* the effect is optional */
  }
}

function finishLunge(player, lunge, now) {
  lunges.delete(player.id);
  lastLunge.set(player.id, now);
  braking.set(player.id, BRAKE_TICKS);
  try {
    player.addEffect("slow_falling", SLOW_FALL_TICKS, { amplifier: 0, showParticles: false });
  } catch {
    /* ignore */
  }
  const f = lunge.targetId ? frozen.get(lunge.targetId) : undefined;
  if (f) f.expire = Math.min(f.expire, now + RELEASE_TICKS);
}

/** Stabs every creature touching the player (each one spaced LUNGE_REHIT_TICKS ticks apart). */
function strikeNearby(player, L, now) {
  const pv = player.getVelocity();
  const reach = CONTACT_RADIUS + Math.hypot(pv.x, pv.y, pv.z); // when lunging fast, sweep wider according to the distance covered in 1 tick
  const c = bodyCenter(player);
  let near = [];
  try {
    near = player.dimension.getEntities({ location: c, maxDistance: reach + 1.5 });
  } catch {
    return;
  }
  for (const e of near) {
    if (!canTarget(player, e)) continue;
    const ec = bodyCenter(e);
    if (Math.hypot(ec.x - c.x, ec.y - c.y, ec.z - c.z) > reach) continue;
    if (now - (L.hit.get(e.id) ?? -Infinity) < LUNGE_REHIT_TICKS) continue;
    L.hit.set(e.id, now);
    strike(player, e);
  }
}

function tickLunge(player, L, now) {
  // stop: button released, lunge used up, or no longer holding the spear
  if (!L.holding || now >= L.endTick || !heldSpear(player)) {
    finishLunge(player, L, now);
    return;
  }

  const pos = player.location;
  const eye = { x: pos.x, y: pos.y + 0.9, z: pos.z };
  const vel = player.getVelocity();
  const stopDist = CONTACT_RADIUS + Math.hypot(vel.x, vel.y, vel.z) * 1.5; // when lunging fast, brake earlier

  // target: keep the old target if still alive, otherwise find a new one along the aim ray
  let target;
  if (L.targetId) {
    try {
      target = world.getEntity(L.targetId);
    } catch {
      /* ignore */
    }
    if (!isAlive(target)) {
      const f = frozen.get(L.targetId);
      if (f) f.expire = Math.min(f.expire, now + 1);
      L.targetId = undefined;
      target = undefined;
    }
  }
  if (!target) {
    target = findTarget(player);
    if (target) {
      L.targetId = target.id;
      freezeTarget(target, L.endTick - now + FREEZE_EXTRA_TICKS);
    }
  }

  // lunge direction: straight at the target, otherwise along the current 3D look direction
  let dir;
  let brake = false;
  if (target) {
    const c = bodyCenter(target);
    const dx = c.x - eye.x;
    const dy = c.y - eye.y;
    const dz = c.z - eye.z;
    dir = normalize(dx, dy, dz);
    if (Math.hypot(dx, dy, dz) <= stopDist) brake = true; // arrived: brake + stab
  }
  if (!dir) {
    const v = player.getViewDirection();
    dir = normalize(v.x, v.y, v.z) ?? { x: 0, y: 0, z: 1 };
  }

  L.speed = Math.min(LUNGE_SPEED_MAX, L.speed + LUNGE_ACCEL); // the longer it is held, the faster it gets
  if (brake) {
    pushPlayer(player, -vel.x * BRAKE_GAIN, -vel.y * BRAKE_GAIN, -vel.z * BRAKE_GAIN);
  } else {
    pushPlayer(
      player,
      (dir.x * L.speed - vel.x) * LUNGE_GAIN,
      (dir.y * L.speed - vel.y) * LUNGE_GAIN,
      (dir.z * L.speed - vel.z) * LUNGE_GAIN
    );
    // break blocks ahead so it is not stopped
    breakAlong(player.dimension, pos, {
      x: pos.x + dir.x * (L.speed + 1.5),
      y: pos.y + dir.y * (L.speed + 1.5),
      z: pos.z + dir.z * (L.speed + 1.5),
    });
  }

  strikeNearby(player, L, now);

  // applyImpulse silently does nothing for players -> switch to applyKnockback
  L.age++;
  if (L.age === 4 && impulseWorks && !brake && Math.hypot(vel.x, vel.y, vel.z) < 0.05) {
    impulseWorks = false;
  }

  try {
    player.dimension.spawnParticle(HIT_PARTICLE, { x: pos.x, y: pos.y + 1, z: pos.z });
  } catch {
    /* ignore */
  }
}

system.runInterval(() => {
  const now = system.currentTick;

  // --- lunge (impulse) ---
  for (const [id, L] of lunges) {
    let player;
    try {
      player = world.getEntity(id);
    } catch {
      /* ignore */
    }
    if (!player?.isValid) {
      lunges.delete(id);
      continue;
    }
    try {
      tickLunge(player, L, now);
    } catch (e) {
      console.warn(`avaritia:infinity_spear lunge error: ${e}`);
      lunges.delete(id);
    }
  }

  // --- braking after the lunge ends ---
  for (const [id, left] of braking) {
    let player;
    try {
      player = world.getEntity(id);
    } catch {
      /* ignore */
    }
    if (!player?.isValid || left <= 0 || lunges.has(id)) {
      braking.delete(id);
      continue;
    }
    try {
      brakePlayer(player, BRAKE_GAIN);
    } catch {
      /* ignore */
    }
    braking.set(id, left - 1);
  }

  // --- keeping the target immobilized ---
  for (const [id, data] of frozen) {
    let entity;
    try {
      entity = world.getEntity(id);
    } catch {
      /* ignore */
    }
    if (!entity?.isValid) {
      frozen.delete(id);
      continue;
    }
    if (now >= data.expire) {
      frozen.delete(id);
      try {
        entity.removeEffect("slowness");
      } catch {
        /* ignore */
      }
      continue;
    }
    try {
      entity.clearVelocity();
      const loc = entity.location;
      const dx = loc.x - data.location.x;
      const dy = loc.y - data.location.y;
      const dz = loc.z - data.location.z;
      if (dx * dx + dy * dy + dz * dz > 0.01) {
        entity.teleport(data.location, { dimension: entity.dimension });
      }
    } catch {
      frozen.delete(id);
    }
  }
}, 1);

// ===================== Activation when using the spear =====================

function onUse(event) {
  try {
    const player = event.source;
    if (!player || player.typeId !== "minecraft:player") return;
    if (event.itemStack?.typeId !== SPEAR_ID) return;
    startLunge(player);
  } catch (e) {
    console.warn(`avaritia:infinity_spear use error: ${e}`);
  }
}

world.afterEvents.itemUse.subscribe(onUse);
// itemStartUse runs right when the right mouse button starts being held; the cooldown in startLunge prevents double activation.
world.afterEvents.itemStartUse?.subscribe(onUse);

// Releasing the use button (or switching items) midway -> stops the lunge on the next tick.
function onRelease(event) {
  try {
    const player = event.source;
    if (!player || player.typeId !== "minecraft:player") return;
    const L = lunges.get(player.id);
    if (L) L.holding = false;
  } catch (e) {
    console.warn(`avaritia:infinity_spear release error: ${e}`);
  }
}

world.afterEvents.itemStopUse?.subscribe(onRelease);
world.afterEvents.itemReleaseUse?.subscribe(onRelease);
