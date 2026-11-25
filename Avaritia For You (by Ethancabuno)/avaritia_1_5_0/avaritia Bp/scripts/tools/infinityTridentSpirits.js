import { EntityDamageCause, Player, system, world } from "@minecraft/server";
import { fx, guardFx, hitFx } from "./infinityFx.js";
import "./dangerFlags.js"; // mechanism for flagging harmful players / pets
import { isPet } from "./dangerFlags.js";

/**
 * Infinity Trident - "Spectral Armory" skill (spirit tridents)
 *
 *  - FIRST QUICK TAP: summons 8 tridents floating in a fan shape behind the player.
 *  - QUICK TAP when spirit tridents already exist: command an immediate attack
 *      1) a creature is being aimed at  -> all fly into that creature;
 *      2) otherwise take the creatures near the AIM POINT (one target per trident, wrapping around if short);
 *      3) still none -> each trident flies to the monster nearest the player.
 *  - AUTOMATIC (no command needed): any trident that is ready dives at hostile monsters / whoever just hit the player;
 *    (when a pet attacks they only GUARD, not retaliate; a player / pet that attacks gets a 5-minute danger flag for the crossbow's Devour);
 *    when the player is about to take damage, one trident (even one mid-dash) will BLOCK the hit (cancel the damage), dart out to shield
 *    in front and then dash straight at the attacker's coordinates to counterattack. Each trident has its own 1-second block cooldown.
 *  - IDLE: standing still for ~2 seconds, all 8 tridents fly in circles, dancing (3 dances that change automatically); moving / a monster appearing returns them to the fan.
 *  - QUICK TAP while Sneaking: recall (dismiss) the spirit tridents. They vanish after 90 seconds or when you die/leave the game.
 *
 * The 1-tick update loop ONLY runs while someone has spirit tridents.
 */

const SPIRIT_ID = "avaritia:infinity_trident_spirit";
const SPIRIT_COUNT = 8;
const DURATION_TICKS = 20 * 90;

const ORBIT_RADIUS = 2.4;
const FAN_DEGREES = 160;
const FOLLOW_LERP = 0.35;
const SNAP_DISTANCE = 14;

const DASH_SPEED = 2.8;
const DASH_MAX_TICKS = 40;
const RETURN_SPEED = 2.2;
const HIT_RANGE = 1.8;
const ATTACK_DAMAGE = 400;
const ATTACK_KNOCKBACK = 1.2;

const AUTO_RANGE = 14;
const AUTO_SCAN_EVERY = 5;
const AUTO_COOLDOWN = 20;
const GUARD_COOLDOWN = 20; // each trident can block 1 hit per second
const GUARD_HOLD_TICKS = 8; // time spent holding the guard pose (showing the shield) before counterattacking
const GUARD_DISTANCE = 1.6; // the blocking trident stands this far from the player, on the attacker's side
const GUARD_SIZE = 1.8; // radius of the glowing shield
const RECENT_ATTACKER_TICKS = 120;

// ----- Idle animation: when the player stands still the spirit tridents fly in circles, dancing -----
const IDLE_SPEED = 0.04; // player velocity below this = standing still
const IDLE_AFTER_TICKS = 40; // standing still this many ticks then starts dancing
const IDLE_BLEND_UP = 1 / 30; // rate of gradual transition from fan to dance (smooth, no jerking)
const IDLE_BLEND_DOWN = 1 / 10; // when the player moves, return to the fan faster
const DANCE_PATTERNS = 3;
const DANCE_PATTERN_TICKS = 160; // each dance lasts this long, then changes to another dance

const COMMAND_RANGE = 40;
const AIM_RADIUS = 10;

const UNBLOCKABLE = new Set(
  [EntityDamageCause.void, EntityDamageCause.suicide, EntityDamageCause.none].filter((c) => c !== undefined),
);

/** playerId -> { player, spirits: [{ entity, idx, state, target, readyAt, cooldown, dashTicks }], expiresAt } */
const sets = {};
const recentAttackers = {}; // playerId -> { entity, tick }
let loopJob;

// ----- Utilities -----
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function aimPoint(e) {
  try {
    if (typeof e.getHeadLocation === "function") return e.getHeadLocation();
  } catch {
    // use the normal position
  }
  return { x: e.location.x, y: e.location.y + 1, z: e.location.z };
}

function isLiving(e) {
  try {
    if (!e || !e.isValid) return false;
    const h = e.getComponent("minecraft:health");
    return !!h && h.currentValue > 0;
  } catch {
    return false;
  }
}

function isValidTarget(e, player) {
  try {
    if (!isLiving(e) || e.id === player.id || e.typeId === SPIRIT_ID) return false;
    if (e instanceof Player) return false;
    if (isPet(e)) return false; // pets are never targets
    return true;
  } catch {
    return false;
  }
}

function hostilesNear(player, center, radius) {
  let list = [];
  try {
    list = player.dimension.getEntities({ location: center, maxDistance: radius, families: ["monster"] });
  } catch {
    return [];
  }
  return list.filter((e) => isValidTarget(e, player)).sort((a, b) => dist(a.location, center) - dist(b.location, center));
}

function recentAttackerOf(player) {
  const rec = recentAttackers[player.id];
  if (!rec || system.currentTick - rec.tick > RECENT_ATTACKER_TICKS) return undefined;
  return isValidTarget(rec.entity, player) ? rec.entity : undefined;
}

/** Position of fan slot number idx behind the player. */
function slotFor(player, idx, n, tick) {
  const dir = player.getViewDirection();
  const flat = Math.hypot(dir.x, dir.z) || 1;
  const fx = dir.x / flat, fz = dir.z / flat;
  const rx = -fz, rz = fx; // right of the player
  const t = n <= 1 ? 0 : idx / (n - 1) - 0.5;
  const ang = t * ((FAN_DEGREES * Math.PI) / 180);
  const back = Math.cos(ang) * ORBIT_RADIUS * 0.9;
  const side = Math.sin(ang) * ORBIT_RADIUS * 1.3;
  const p = player.location;
  const bob = Math.sin((tick + idx * 7) / 8) * 0.15;
  return {
    x: p.x - fx * back + rx * side,
    y: p.y + 1.3 + (0.8 - Math.abs(t) * 1.4) + bob,
    z: p.z - fz * back + rz * side,
  };
}

/**
 * Dance position of trident number idx. There are 3 dances, changing automatically over time:
 *  0 = circle around the player; 1 = opposing spiral (even/odd tridents rotate in opposite directions, rising and falling like waves);
 *  2 = a fast-spinning crown above the head.
 */
function danceFor(player, idx, n, t, pattern) {
  const p = player.location;
  const base = (idx / n) * Math.PI * 2;
  let ang, r, y;
  if (pattern === 0) {
    ang = base + t * 0.06;
    r = 2.6;
    y = p.y + 1.4 + Math.sin(t / 10 + idx) * 0.25;
  } else if (pattern === 1) {
    const dir = idx % 2 === 0 ? 1 : -1;
    ang = base + dir * t * 0.08;
    r = 2.2 + 0.6 * Math.sin(t / 15);
    y = p.y + 1.4 + Math.sin(t / 12 + idx * (Math.PI / 4)) * 1.1;
  } else {
    ang = base + t * 0.12;
    r = 1.5 + 0.25 * Math.sin(t / 7 + idx);
    y = p.y + 2.6 + Math.sin(t / 8 + idx) * 0.3;
  }
  return { x: p.x + Math.cos(ang) * r, y, z: p.z + Math.sin(ang) * r };
}

/** Angles (pitch, yaw) so the trident tip points along the vector (dx, dy, dz). */
function anglesFrom(dx, dy, dz) {
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: (-Math.asin(dy / len) * 180) / Math.PI, y: (Math.atan2(-dx, dz) * 180) / Math.PI };
}

function place(spirit, loc, player, options) {
  try {
    if (!spirit.entity.isValid) return;
    const opts = {};
    if (spirit.entity.dimension.id !== player.dimension.id) opts.dimension = player.dimension;
    // No rotation / facingLocation is passed: the entity's rotation always stays 0, the tip direction is decided only by properties.
    spirit.entity.teleport(loc, opts);

    let rot = options.rotation;
    if (!rot && options.facingLocation) {
      const f = options.facingLocation;
      rot = anglesFrom(f.x - loc.x, f.y - loc.y, f.z - loc.z);
    }
    if (rot) {
      spirit.entity.setProperty("avaritia:spirit_pitch", rot.x);
      spirit.entity.setProperty("avaritia:spirit_yaw", rot.y);
    }
  } catch {
    // entity just disappeared
  }
}

function setLoop() {
  if (loopJob === undefined) loopJob = system.runInterval(tickAll, 1);
}

// ----- Summon / recall -----
function summon(player) {
  const tick = system.currentTick;
  const spirits = [];
  for (let i = 0; i < SPIRIT_COUNT; i++) {
    const slot = slotFor(player, i, SPIRIT_COUNT, tick);
    try {
      const entity = player.dimension.spawnEntity(SPIRIT_ID, slot);
      if (!entity || !entity.isValid) continue; // faulty entity definition / removed right when spawned
      entity.setRotation({ x: 0, y: 0 }); // the entity does not rotate itself; the trident tip rotates via a bone in the model
      const r0 = player.getRotation();
      entity.setProperty("avaritia:spirit_pitch", r0.x);
      entity.setProperty("avaritia:spirit_yaw", r0.y);
      spirits.push({ entity, idx: i, state: "orbit", target: undefined, readyAt: tick + 10 + i * 2, guardReadyAt: tick + 5, cooldown: AUTO_COOLDOWN, dashTicks: 0 });
    } catch {
      // could not spawn
    }
  }
  if (spirits.length === 0) return;
  sets[player.id] = { player, spirits, expiresAt: tick + DURATION_TICKS };
  try {
    player.dimension.playSound("item.trident.return", player.location, { volume: 1.2, pitch: 1.3 });
    player.onScreenDisplay.setActionBar("§bSpirit Tridents summoned §7(quick tap to command, Sneak + tap to recall)");
  } catch {
    // ignore
  }
  setLoop();
}

function dismiss(playerId) {
  const set = sets[playerId];
  delete sets[playerId];
  delete recentAttackers[playerId];
  if (!set) return;
  for (const s of set.spirits) {
    try {
      if (s.entity.isValid) {
        fx(s.entity.dimension, "avaritia:nova_flash", s.entity.location, { radius: 0.8 });
        s.entity.remove();
      }
    } catch {
      // already gone
    }
  }
}

// ----- Commanding -----
function pickCommandTargets(player) {
  const eye = player.getHeadLocation();
  const dir = player.getViewDirection();

  // 1) creature being aimed at
  try {
    for (const hit of player.getEntitiesFromViewDirection({ maxDistance: COMMAND_RANGE })) {
      if (isValidTarget(hit.entity, player)) return { all: hit.entity, list: [] };
    }
  } catch {
    // none
  }

  // 2) creatures near the aim point
  let point;
  try {
    const hit = player.getBlockFromViewDirection({ maxDistance: COMMAND_RANGE });
    if (hit) {
      const l = hit.block.location;
      point = { x: l.x + 0.5, y: l.y + 1, z: l.z + 0.5 };
    }
  } catch {
    // no block
  }
  if (!point) point = { x: eye.x + dir.x * 25, y: eye.y + dir.y * 25, z: eye.z + dir.z * 25 };
  let near = [];
  try {
    near = player.dimension
      .getEntities({ location: point, maxDistance: AIM_RADIUS })
      .filter((e) => isValidTarget(e, player))
      .sort((a, b) => dist(a.location, point) - dist(b.location, point));
  } catch {
    // ignore
  }
  if (near.length) return { list: near };

  // 3) monsters near the player
  const around = hostilesNear(player, player.location, AUTO_RANGE * 1.5);
  const prio = recentAttackerOf(player);
  if (prio) around.unshift(prio);
  return { list: around };
}

function launch(spirit, target) {
  spirit.state = "dash";
  spirit.target = target;
  spirit.dashTicks = 0;
}

/** Quick tap with the trident: summon / command / (Sneak) recall. */
export function handleTridentTap(player) {
  const set = sets[player.id];
  if (player.isSneaking) {
    if (set) {
      dismiss(player.id);
      player.onScreenDisplay.setActionBar("§7Spirit Tridents recalled");
    }
    return;
  }
  if (!set) {
    summon(player);
    return;
  }

  const tick = system.currentTick;
  const ready = set.spirits.filter((s) => s.state === "orbit" && s.readyAt <= tick && s.entity.isValid);
  if (ready.length === 0) {
    player.onScreenDisplay.setActionBar("§7Spirit Tridents are recharging...");
    return;
  }
  const picked = pickCommandTargets(player);
  if (picked.all) {
    ready.forEach((s) => {
      s.cooldown = AUTO_COOLDOWN;
      launch(s, picked.all);
    });
  } else if (picked.list.length) {
    ready.forEach((s, i) => {
      s.cooldown = AUTO_COOLDOWN;
      launch(s, picked.list[i % picked.list.length]);
    });
  } else {
    player.onScreenDisplay.setActionBar("§7No target");
    return;
  }
  player.dimension.playSound("item.trident.throw", player.location, { volume: 1, pitch: 1.4 });
}

// ----- Automatic blocking -----
// Each trident has its OWN "block cooldown" (guardReadyAt), independent of whether it is hovering or dashing
// to attack, so as long as one trident is off cooldown the hit is still blocked (previously it had to be an idle trident).
world.beforeEvents.entityHurt.subscribe((data) => {
  const player = data.hurtEntity;
  if (!(player instanceof Player)) return;
  const set = sets[player.id];
  if (!set) return;

  const attacker = data.damageSource.damagingEntity;
  const tick = system.currentTick;
  if (attacker && attacker.id !== player.id && attacker.typeId !== SPIRIT_ID) {
    recentAttackers[player.id] = { entity: attacker, tick };
  }
  if (UNBLOCKABLE.has(data.damageSource.cause)) return;

  // Prefer a hovering trident; if none, take any trident whose block cooldown is finished.
  const guards = set.spirits.filter((s) => s.guardReadyAt <= tick && s.entity.isValid);
  const spirit = guards.find((s) => s.state === "orbit") ?? guards[0];
  if (!spirit) return;

  let attackerLoc;
  try {
    attackerLoc = attacker?.location ?? data.damageSource.damagingProjectile?.location;
  } catch {
    // could not read the position
  }
  data.cancel = true;
  spirit.guardReadyAt = tick + GUARD_COOLDOWN;
  system.run(() => {
    try {
      if (!player.isValid || !spirit.entity.isValid) return;
      player.dimension.playSound("item.shield.block", player.location);

      // Counterattack target: whoever just hit, or if none (e.g. an explosion) the nearest monster.
      // Pets (anyone's) attacking: ONLY GUARD, do not retaliate and do not turn to attack other monsters.
      const petAttacker = !!attacker && isPet(attacker);
      let target = attacker && isValidTarget(attacker, player) ? attacker : undefined;
      if (!target && !petAttacker) target = hostilesNear(player, player.location, AUTO_RANGE)[0];

      const pl = player.location;
      let aim;
      if (target) aim = aimPoint(target);
      else if (attackerLoc) aim = { x: attackerLoc.x, y: attackerLoc.y + 0.5, z: attackerLoc.z };
      else {
        const v = player.getViewDirection();
        aim = { x: pl.x + v.x * 5, y: pl.y + 1.2 + v.y * 5, z: pl.z + v.z * 5 };
      }
      const dx = aim.x - pl.x, dz = aim.z - pl.z;
      const len = Math.hypot(dx, dz) || 1;
      const guardPos = { x: pl.x + (dx / len) * GUARD_DISTANCE, y: pl.y + 1.2, z: pl.z + (dz / len) * GUARD_DISTANCE };

      // Enter the GUARD pose: the trident darts out to shield the attacker's side, its tip pointing at the attacker, a glowing shield appears.
      place(spirit, guardPos, player, { facingLocation: aim });
      guardFx(player.dimension, guardPos, GUARD_SIZE);
      const now = system.currentTick;
      spirit.state = "guard";
      spirit.target = target;
      spirit.guardAim = aim;
      spirit.guardStart = now;
      spirit.guardUntil = now + GUARD_HOLD_TICKS;
      spirit.dashTicks = 0;
    } catch {
      // ignore
    }
  });
});

// ----- Update loop -----
function tickAll() {
  const ids = Object.keys(sets);
  if (ids.length === 0) {
    system.clearRun(loopJob);
    loopJob = undefined;
    return;
  }
  const tick = system.currentTick;

  for (const id of ids) {
    const set = sets[id];
    const player = set.player;
    if (!player.isValid || tick > set.expiresAt) {
      dismiss(id);
      continue;
    }
    set.spirits = set.spirits.filter((s) => s.entity.isValid);
    if (set.spirits.length === 0) {
      dismiss(id);
      continue;
    }

    // Updates the "dance" level: standing still long enough raises it gradually, moving lowers it quickly.
    let moving = false;
    try {
      const v = player.getVelocity();
      moving = Math.hypot(v.x, v.y, v.z) > IDLE_SPEED;
    } catch {
      moving = true;
    }
    if (moving) {
      set.idleTicks = 0;
      set.blend = Math.max(0, (set.blend ?? 0) - IDLE_BLEND_DOWN);
    } else {
      set.idleTicks = (set.idleTicks ?? 0) + 1;
      if (set.idleTicks > IDLE_AFTER_TICKS) set.blend = Math.min(1, (set.blend ?? 0) + IDLE_BLEND_UP);
    }
    const blend = set.blend ?? 0;
    const danceT = Math.max(0, (set.idleTicks ?? 0) - IDLE_AFTER_TICKS);
    const pattern = Math.floor(danceT / DANCE_PATTERN_TICKS) % DANCE_PATTERNS;

    const busyTargets = new Set(set.spirits.filter((s) => s.state === "dash" && s.target).map((s) => s.target.id));
    const rot = player.getRotation();

    for (const s of set.spirits) {
      const slot = slotFor(player, s.idx, SPIRIT_COUNT, tick);
      const cur = s.entity.location;

      if (s.state === "orbit") {
        // follows the fan slot, tip pointing forward
        let goal = slot;
        let facing;
        if (blend > 0.01) {
          // Idle animation: gradually blends from the fan slot to the dance position; the trident tip points along the flight direction.
          const d0 = danceFor(player, s.idx, SPIRIT_COUNT, danceT, pattern);
          const d1 = danceFor(player, s.idx, SPIRIT_COUNT, danceT + 3, pattern);
          goal = { x: slot.x + (d0.x - slot.x) * blend, y: slot.y + (d0.y - slot.y) * blend, z: slot.z + (d0.z - slot.z) * blend };
          const dir = player.getViewDirection();
          const fwd = { x: cur.x + dir.x * 5, y: cur.y + dir.y * 5, z: cur.z + dir.z * 5 };
          facing = { x: fwd.x + (d1.x - fwd.x) * blend, y: fwd.y + (d1.y - fwd.y) * blend, z: fwd.z + (d1.z - fwd.z) * blend };
        }
        const farAway = dist(cur, goal) > SNAP_DISTANCE || s.entity.dimension.id !== player.dimension.id;
        const next = farAway
          ? goal
          : { x: cur.x + (goal.x - cur.x) * FOLLOW_LERP, y: cur.y + (goal.y - cur.y) * FOLLOW_LERP, z: cur.z + (goal.z - cur.z) * FOLLOW_LERP };
        if (facing) place(s, next, player, { facingLocation: facing });
        else place(s, next, player, { rotation: { x: rot.x, y: rot.y } });

        // automatically attacks monsters that are nearby
        if (s.readyAt <= tick && tick % AUTO_SCAN_EVERY === (s.idx % AUTO_SCAN_EVERY)) {
          let candidates = hostilesNear(player, player.location, AUTO_RANGE);
          const prio = recentAttackerOf(player);
          if (prio && !candidates.includes(prio)) candidates.unshift(prio);
          const free = candidates.filter((e) => !busyTargets.has(e.id));
          const target = (free.length ? free : candidates)[0];
          if (target) {
            s.cooldown = AUTO_COOLDOWN;
            launch(s, target);
            busyTargets.add(target.id);
          }
        }
      } else if (s.state === "guard") {
        // Holds the guard pose on the attacker's side (following the player), glows, then counterattacks.
        if (isValidTarget(s.target, player)) s.guardAim = aimPoint(s.target);
        const aim = s.guardAim ?? { x: cur.x, y: cur.y, z: cur.z + 1 };
        const pl = player.location;
        const gx = aim.x - pl.x, gz = aim.z - pl.z;
        const glen = Math.hypot(gx, gz) || 1;
        const gp = { x: pl.x + (gx / glen) * GUARD_DISTANCE, y: pl.y + 1.2, z: pl.z + (gz / glen) * GUARD_DISTANCE };
        place(s, gp, player, { facingLocation: aim });
        if ((tick - s.guardStart) % 2 === 0) fx(s.entity.dimension, "avaritia:guard_glow", gp, { size: GUARD_SIZE });
        if (tick >= s.guardUntil) {
          if (isValidTarget(s.target, player)) {
            s.cooldown = GUARD_COOLDOWN;
            launch(s, s.target); // counterattack: dashes exactly to the attacker's coordinates
          } else {
            s.state = "return";
            s.readyAt = tick + GUARD_COOLDOWN;
          }
        }
      } else if (s.state === "dash") {
        s.dashTicks++;
        if (!isValidTarget(s.target, player) || s.dashTicks > DASH_MAX_TICKS) {
          s.state = "return";
          s.readyAt = tick + s.cooldown;
          continue;
        }
        const aim = aimPoint(s.target);
        const d = dist(cur, aim);
        if (d <= HIT_RANGE) {
          try {
            s.target.applyDamage(ATTACK_DAMAGE, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
            const dx = s.target.location.x - player.location.x;
            const dz = s.target.location.z - player.location.z;
            const len = Math.hypot(dx, dz) || 1;
            s.target.applyKnockback({ x: (dx / len) * ATTACK_KNOCKBACK, z: (dz / len) * ATTACK_KNOCKBACK }, 0.3);
            hitFx(s.target.dimension, aim);
            s.target.dimension.playSound("item.trident.hit", aim);
          } catch {
            // target takes no damage
          }
          s.state = "return";
          s.readyAt = tick + s.cooldown;
          continue;
        }
        const step = Math.min(DASH_SPEED, d);
        place(s, { x: cur.x + ((aim.x - cur.x) / d) * step, y: cur.y + ((aim.y - cur.y) / d) * step, z: cur.z + ((aim.z - cur.z) / d) * step }, player, {
          facingLocation: aim,
        });
      } else {
        // return: flies back to the fan slot
        const d = dist(cur, slot);
        if (d <= 1) {
          s.state = "orbit";
          s.target = undefined;
          continue;
        }
        const step = Math.min(RETURN_SPEED, d);
        place(s, { x: cur.x + ((slot.x - cur.x) / d) * step, y: cur.y + ((slot.y - cur.y) / d) * step, z: cur.z + ((slot.z - cur.z) / d) * step }, player, {
          facingLocation: slot,
        });
      }
    }
  }
}

// ----- Cleanup -----
world.afterEvents.playerLeave.subscribe((data) => dismiss(data.playerId));
world.afterEvents.entityDie.subscribe((data) => {
  if (data.deadEntity instanceof Player) dismiss(data.deadEntity.id);
});

// "Orphaned" entities left over after the world reloads (the script lost its state).
system.runTimeout(() => {
  for (const dimId of ["overworld", "nether", "the_end"]) {
    try {
      for (const e of world.getDimension(dimId).getEntities({ type: SPIRIT_ID })) e.remove();
    } catch {
      // chunk not loaded: the entity's 120-second timer will clean it up on its own
    }
  }
}, 40);
