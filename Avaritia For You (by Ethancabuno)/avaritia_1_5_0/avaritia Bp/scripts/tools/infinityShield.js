import {
  EntityDamageCause,
  EntityEquippableComponent,
  EntityOnFireComponent,
  EquipmentSlot,
  InputButton,
  Player,
  system,
  world,
} from "@minecraft/server";
import { shieldNovaExplosion } from "./infinityFx.js";

/**
 * Infinity Shield (avaritia:infinity_shield)
 *
 * Based on Alien-Edds' Shield template + fixes from PR #1 (JuanLuci):
 *  - Blocking state uses the playerButtonInput event (Sneak) + playerHotbarSelectedSlotChange, but always re-reads the real
 *    isSneaking on the next tick (the touch Sneak button is a toggle). Swinging the arm does NOT interrupt blocking.
 *  - The block animation stops immediately with stopBlockAnimation (stopExpression "return true;"),
 *    the running animation name is stored per player.
 *  - Fire damage immunity for 40 ticks after each block (fills the gap from extinguishFire running 1 tick late).
 *  - playerLeave cleans every map and cancels pending timeouts.
 *
 * Unlike a regular shield (this is Infinity gear):
 *  - No durability, no cooldown, never disabled by axes/vindicators/wardens
 *    => no need for a cooldown cache.
 *  - Blocks from EVERY direction (no need to face the enemy) while holding Sneak.
 *  - Nova Burst SKILL: all blocked damage is accumulated (NO limit). Release Sneak = unleash it as an explosion around you
 *    (damage = accumulated x2, radius = accumulated/10 blocks, unlimited, the shockwave is displayed large according to the radius, does not hit other players).
 *  - Melee reflect: the attacker is knocked back and takes back damage = blocked damage x reflect_multiplier.
 *  - PROJECTILE reflect (like the Retaliation of Ignis armor): a projectile about to hit the blocking player is REVERSED RIGHT BEFORE
 *    IT HITS — that same projectile (keeping its variant, color, data; including projectiles from other addons) changes owner to
 *    the player and flies back at the shooter, correcting its direction piece by piece like Ignis. A 1-tick scan loop runs ONLY
 *    while someone is blocking, and turns itself off when nobody is.
 *    Fallback: if a projectile still gets through (too fast) or explosion damage has no source, a copy of the
 *    same type is spawned and fired back (the old way).
 *
 * Parameters in the item (components -> avaritia:infinity_shield):
 *   block (sound), delay (seconds before blocking takes effect), knockback {x, y}, reflect_multiplier.
 */

const SHIELD_ID = "avaritia:infinity_shield";
const COMPONENT_ID = "avaritia:infinity_shield";
const FIRE_IMMUNITY_TICKS = 40;
const MIN_REFLECT_DAMAGE = 4;

// Never blocks these damage types (avoids an "immortal" shield against /kill, falling into the void...).
const UNBLOCKABLE_CAUSES = new Set([
  EntityDamageCause.void,
  EntityDamageCause.suicide,
  EntityDamageCause.none,
].filter((c) => c !== undefined));

const FIRE_CAUSES = new Set([
  EntityDamageCause.fire,
  EntityDamageCause.fireTick,
  EntityDamageCause.lava,
].filter((c) => c !== undefined));

// ----- Projectile reflection -----
const REFLECT_TAG = "avaritia:shield_reflected"; // projectile fired back by the shield: next time it is only blocked, not reflected again (anti ping-pong)
const PROJECTILE_BLACKLIST = new Set(["avaritia:infinity_trident_thrown"]); // carries its own item data, not cloned
const MIN_PROJECTILE_SPEED = 1.2;
const MAX_PROJECTILE_SPEED = 4;
const RECENT_PROJECTILE_TICKS = 10; // recently exploded projectiles are used for damage with no source
const REFLECT_COOLDOWN_TICKS = 2; // at most 1 reflected shot every 2 ticks per player (prevents a machine gun from filling the world)
const HOMING_INTERVAL = 4;
const HOMING_MAX_TICKS = 100;
const HOMING_MIN_DISTANCE = 2;

// ----- Skill: Nova Burst (accumulates blocked damage, release Sneak to explode) -----
const NOVA_MIN_CHARGE = 5; // below this, releasing Sneak does not explode
const MIN_CHARGE_PER_HIT = 4; // each block accumulates at least 4 (even when the read damage = 0)
const DEFLECT_CHARGE = 10; // every reflected projectile also adds charge
const USING_ITEM_EXPIRE_TICKS = 60; // the "using another item" flag expires on its own (in case the stop event is missed)
const POSE_REASSERT_TICKS = 5; // re-assert the blocking pose periodically while blocking
const NOVA_MAX_CHARGE = Infinity; // no limit on accumulated amount
const NOVA_BASE_RADIUS = 0;
const NOVA_RADIUS_PER_CHARGE = 1 / 10; // radius = accumulated damage / 10 (+1 block per 10 damage)
const NOVA_MAX_RADIUS = Infinity; // no radius limit
const NOVA_DAMAGE_MULT = 2;
const NOVA_MAX_DAMAGE = Infinity; // no damage limit
const NOVA_KNOCKBACK = 3;
const NOVA_PULSES = 10; // after the first blast, the number of additional continuous damage pulses
const NOVA_PULSE_INTERVAL = 5; // ticks between 2 pulses (5 ticks = 0.25 seconds)
const NOVA_PULSE_RATIO = 0.5; // each continuous pulse = 50% of the first hit's damage
const NOVA_EXCLUDED_TYPES = [
  // Only excludes things that cannot be damaged. Other players, armor stands, every mob get hit.
  "minecraft:item",
  "minecraft:xp_orb",
  "minecraft:lightning_bolt",
  "minecraft:falling_block",
  "avaritia:infinity_trident_spirit",
];
const DEFLECT_SCAN_RADIUS = 10;
const MIN_DEFLECT_SPEED = 0.3; // projectiles that are stuck/stationary are not reflected
const DEFLECT_EXCLUDED_TYPES = [
  "minecraft:player",
  "minecraft:item",
  "minecraft:xp_orb",
  "minecraft:armor_stand",
  "minecraft:lightning_bolt",
  "minecraft:falling_block",
  "avaritia:infinity_trident_spirit",
];

// ----- Per-player state -----
const blockReadyAt = {}; // tick from which blocking takes effect (after "delay")
const animations = {}; // name of the animation the player is currently running
const usingItem = {}; // tick when using ANOTHER item started (eating, drawing a bow...) -> temporarily not blocking; expires on its own after USING_ITEM_EXPIRE_TICKS
const recentlyBlocked = {}; // tick of the most recent block (fire immunity window)
const cancelledEffects = {}; // cancels effects attached to the hit that was just blocked (e.g. slowness)
const recentProjectile = {}; // projectile that just hit/exploded near a blocking player: { typeId, velocity, shooter, tick }
const lastReflectTick = {};
const shieldCharge = {}; // damage blocked so far, accumulated for Nova Burst
let reflecting = false; // prevents recursion when the reflected hit lands on a player who is also holding a shield
let deflectJob; // projectile scan loop: only runs while someone is blocking

// ----- Utilities -----
function getParams(item) {
  try {
    const comp = item.getComponent(COMPONENT_ID);
    return comp?.customComponentParameters?.params ?? {};
  } catch {
    return {};
  }
}

/** Is the player using another item (eating, drawing a bow...)? The flag expires on its own so it can never get stuck permanently. */
function isUsingOtherItem(player) {
  const since = usingItem[player.id];
  if (since === undefined) return false;
  if (system.currentTick - since > USING_ITEM_EXPIRE_TICKS) {
    delete usingItem[player.id];
    return false;
  }
  return true;
}

/** Shield being held: offhand takes priority, then the main hand. */
function getHeldShield(player) {
  const equippable = player.getComponent(EntityEquippableComponent.componentId);
  if (!equippable) return undefined;
  const offhand = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
  const offItem = offhand.getItem();
  if (offItem && offItem.typeId === SHIELD_ID) {
    return { item: offItem, slot: offhand, hand: "off_hand" };
  }
  const mainhand = equippable.getEquipmentSlot(EquipmentSlot.Mainhand);
  const mainItem = mainhand.getItem();
  if (mainItem && mainItem.typeId === SHIELD_ID) {
    return { item: mainItem, slot: mainhand, hand: "main_hand" };
  }
  return undefined;
}

function delayTicks(item) {
  const sec = getParams(item).delay;
  return typeof sec === "number" ? Math.max(0, Math.round(sec * 20)) : 0;
}

// ----- Block animation -----
// Plays the 3rd-person blocking pose (arm + shield) on the player, same as the Shield template.
// Animations are defined in RP/animations/avaritia_shield.animation.json:
//   animation.avaritia_shield.player.shield_block_main_hand / shield_block_off_hand
function stopBlockAnimation(player) {
  const current = animations[player.id];
  if (current) {
    try {
      player.playAnimation(current, { blendOutTime: 0, stopExpression: "return true;" });
    } catch {
      // player just left / animation unavailable
    }
  }
  delete animations[player.id];
}

function startBlockAnimation(player, hand) {
  const anim = `animation.avaritia_shield.player.shield_block_${hand}`;
  if (animations[player.id] === anim) return;
  if (animations[player.id]) stopBlockAnimation(player);
  animations[player.id] = anim;
  try {
    player.playAnimation(anim, { blendOutTime: 99999, stopExpression: "q.is_sneaking" });
  } catch {
    delete animations[player.id];
  }
}

/** Start blocking: set the "delay" mark and turn on the animation (if holding a shield and Sneaking). */
function startBlocking(player) {
  const shield = getHeldShield(player);
  if (!shield) return;
  blockReadyAt[player.id] = system.currentTick + delayTicks(shield.item);
  ensureDeflectLoop();
  if (player.isSneaking && !isUsingOtherItem(player)) startBlockAnimation(player, shield.hand);
}

/** Sync the blocking state with the actual crouch state + shield currently held. */
function syncBlocking(player) {
  try {
    if (!player.isValid) return;
    if (player.isSneaking && getHeldShield(player)) {
      if (blockReadyAt[player.id] === undefined) startBlocking(player);
      else if (!animations[player.id] && !isUsingOtherItem(player)) startBlockAnimation(player, getHeldShield(player).hand);
    } else {
      stopBlocking(player);
    }
  } catch {
    // player just left
  }
}

/** Adds blocked damage to the Nova Burst accumulator; returns the current accumulated amount. */
function addCharge(player, amount) {
  const gain = Math.max(Number(amount) || 0, MIN_CHARGE_PER_HIT);
  const now = Math.min(NOVA_MAX_CHARGE, (shieldCharge[player.id] ?? 0) + gain);
  shieldCharge[player.id] = now;
  return now;
}

function showCharge(player, charge) {
  try {
    player.onScreenDisplay.setActionBar(`§bNova: ${Math.round(charge)} §7(release Sneak to detonate)`);
  } catch {
    // player just left
  }
}

/** Explosion visuals: uses the shield's own custom particles (avaritia:snova_*), sized by radius. */
function novaVisual(dim, loc, radius) {
  shieldNovaExplosion(dim, loc, radius);
}

/** Deals GUARANTEED damage: applyDamage first, and if invulnerability frames / damage_sensor / armor swallow it, subtract health directly to make up the difference. */
function forceDamage(entity, amount, source) {
  const health = entity.getComponent("minecraft:health");
  const before = health ? health.currentValue : 0;
  try {
    entity.applyDamage(amount, source);
  } catch {
    // ignore, go on to the direct health subtraction step
  }
  if (!health) return;
  try {
    const after = health.currentValue;
    if (after <= 0) return;
    const missing = amount - (before - after);
    if (missing > 0.01) {
      const left = after - missing;
      if (left <= 0) {
        health.setCurrentValue(0);
        entity.kill();
      } else {
        health.setCurrentValue(left);
      }
    }
  } catch {
    // entity is gone
  }
}

/** One Nova damage pulse: every entity within the HORIZONTAL radius (any height) takes the full damage, except the shield's owner. */
function novaDamagePulse(player, center, radius, damage, knock) {
  const dim = player.dimension;
  let minY = -64;
  let maxY = 320;
  try {
    minY = dim.heightRange.min;
    maxY = dim.heightRange.max;
  } catch {
    // use the default value
  }
  const r = Number.isFinite(radius) ? radius : 100000;
  let list;
  try {
    list = dim.getEntities({
      location: { x: center.x - r, y: minY, z: center.z - r },
      volume: { x: r * 2, y: maxY - minY, z: r * 2 },
      excludeTypes: NOVA_EXCLUDED_TYPES,
    });
  } catch {
    return;
  }
  reflecting = true; // Nova hits must not trigger other players' shield reflection
  try {
    for (const e of list) {
      if (e.id === player.id) continue;
      try {
        const loc = e.location;
        const dx = loc.x - center.x;
        const dz = loc.z - center.z;
        const len = Math.hypot(dx, dz);
        if (len > r) continue;
        forceDamage(e, damage, { cause: EntityDamageCause.entityExplosion, damagingEntity: player });
        if (knock && e.isValid) e.applyKnockback({ x: (dx / (len || 1)) * NOVA_KNOCKBACK, z: (dz / (len || 1)) * NOVA_KNOCKBACK }, 0.8);
      } catch {
        // target takes no damage / knockback
      }
    }
  } finally {
    reflecting = false;
  }
}

/** Nova Burst skill: releasing Sneak (or switching hands) unleashes all accumulated damage as an explosion around you. */
function releaseNova(player) {
  const charge = shieldCharge[player.id];
  delete shieldCharge[player.id];
  if (!charge || charge < NOVA_MIN_CHARGE) return;
  try {
    const radius = Math.min(NOVA_MAX_RADIUS, NOVA_BASE_RADIUS + charge * NOVA_RADIUS_PER_CHARGE);
    const damage = Math.min(NOVA_MAX_DAMAGE, charge * NOVA_DAMAGE_MULT);
    const loc = player.location;
    const dim = player.dimension;
    dim.playSound("random.explode", loc, { volume: Math.min(4, 1 + radius / 12), pitch: Math.max(0.5, 1.2 - radius / 60) });
    novaVisual(dim, loc, radius);
    // First hit: explodes immediately. Then deals CONTINUOUS damage for NOVA_PULSES more pulses.
    novaDamagePulse(player, loc, radius, damage, true);
    let pulses = 0;
    const job = system.runInterval(() => {
      pulses++;
      try {
        if (pulses > NOVA_PULSES || !player.isValid) {
          system.clearRun(job);
          return;
        }
        novaDamagePulse(player, player.location, radius, damage * NOVA_PULSE_RATIO, false);
      } catch {
        system.clearRun(job);
      }
    }, NOVA_PULSE_INTERVAL);
    player.onScreenDisplay.setActionBar(`§bNova Burst! §7(${Math.round(damage)} damage, ${Math.round(radius)} block radius)`);
  } catch {
    // player just left
  }
}

function stopBlocking(player) {
  releaseNova(player);
  delete blockReadyAt[player.id];
  stopBlockAnimation(player);
}

function isBlocking(player) {
  if (!player.isSneaking || isUsingOtherItem(player)) return false;
  if (!getHeldShield(player)) return false;
  let readyAt = blockReadyAt[player.id];
  if (readyAt === undefined) {
    // Missed the Sneak event (e.g. the touch toggle button): start blocking right away, with no delay.
    readyAt = system.currentTick;
    blockReadyAt[player.id] = readyAt;
    ensureDeflectLoop();
  }
  return readyAt <= system.currentTick;
}

// ----- Projectile reflection (like the Retaliation of Ignis armor) -----
function unitDir(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

function aimPoint(entity) {
  try {
    if (typeof entity.getHeadLocation === "function") return entity.getHeadLocation();
  } catch {
    // use the normal position
  }
  const l = entity.location;
  return { x: l.x, y: l.y + 1, z: l.z };
}

function isAlive(entity) {
  try {
    if (!entity || !entity.isValid) return false;
    const health = entity.getComponent("minecraft:health");
    return !(health && health.currentValue <= 0);
  } catch {
    return false;
  }
}

/** Reads the projectile's info (typeId, velocity, shooter). undefined = not a reflectable projectile. */
function readProjectileInfo(projectile, shooter) {
  try {
    if (!projectile || !projectile.isValid) return undefined;
    if (PROJECTILE_BLACKLIST.has(projectile.typeId)) return undefined;
    if (projectile.hasTag(REFLECT_TAG)) return { reflectedAlready: true };
    if (!projectile.getComponent("minecraft:projectile")) return undefined;
    let velocity = { x: 0, y: 0, z: 0 };
    try {
      velocity = projectile.getVelocity();
    } catch {
      // could not read velocity: use the default speed below
    }
    return { typeId: projectile.typeId, velocity, shooter };
  } catch {
    return undefined;
  }
}

/** Steers the projectile piece by piece toward the target (like Ignis' applyStepHoming). */
function homeTowards(projectile, target, speed) {
  let elapsed = 0;
  const job = system.runInterval(() => {
    elapsed += HOMING_INTERVAL;
    if (!projectile.isValid || elapsed >= HOMING_MAX_TICKS || !isAlive(target)) {
      system.clearRun(job);
      return;
    }
    try {
      const cur = projectile.location;
      const aim = aimPoint(target);
      const dist = Math.hypot(aim.x - cur.x, aim.y - cur.y, aim.z - cur.z);
      if (dist < HOMING_MIN_DISTANCE) {
        system.clearRun(job);
        return;
      }
      const d = unitDir(cur, aim);
      projectile.clearVelocity();
      projectile.applyImpulse({ x: d.x * speed, y: d.y * speed, z: d.z * speed });
    } catch {
      system.clearRun(job);
    }
  }, HOMING_INTERVAL);
}

/** Reverses the very projectile about to hit the blocking player (no copy is spawned). */
function tryDeflect(player, entity) {
  try {
    if (!entity.isValid || entity.id === player.id) return;
    if (PROJECTILE_BLACKLIST.has(entity.typeId) || entity.hasTag(REFLECT_TAG)) return;
    const comp = entity.getComponent("minecraft:projectile");
    if (!comp) return;
    const v = entity.getVelocity();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed < MIN_DEFLECT_SPEED) return;
    const owner = comp.owner;
    if (owner && owner.id === player.id) return;

    const pos = entity.location;
    const pl = player.location;
    const dx = pl.x - pos.x, dy = pl.y + 1 - pos.y, dz = pl.z - pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > Math.max(4, speed * 2)) return; // only reflect when it is about to arrive
    if (v.x * dx + v.y * dy + v.z * dz <= 0) return; // flying away

    const shooter = owner && owner.isValid && owner.id !== player.id ? owner : undefined;
    const newSpeed = Math.min(MAX_PROJECTILE_SPEED, Math.max(MIN_PROJECTILE_SPEED, speed));
    const dir = shooter ? unitDir(pos, aimPoint(shooter)) : { x: -v.x / speed, y: -v.y / speed, z: -v.z / speed };

    comp.owner = player;
    entity.addTag(REFLECT_TAG);
    entity.clearVelocity();
    comp.shoot({ x: dir.x * newSpeed, y: dir.y * newSpeed, z: dir.z * newSpeed });
    if (shooter) homeTowards(entity, shooter, newSpeed);
    player.dimension.playSound("item.shield.block", player.location);
    showCharge(player, addCharge(player, DEFLECT_CHARGE));
  } catch {
    // projectile is gone / its owner cannot be changed
  }
}

function deflectTick() {
  if (Object.keys(blockReadyAt).length === 0) {
    system.clearRun(deflectJob);
    deflectJob = undefined;
    return;
  }
  for (const player of world.getAllPlayers()) {
    if (blockReadyAt[player.id] === undefined || !isBlocking(player)) continue;
    // Periodically re-assert the blocking pose in case the first animation play was missed.
    if (system.currentTick % POSE_REASSERT_TICKS === 0) {
      const held = getHeldShield(player);
      if (held) startBlockAnimation(player, held.hand); // no-op if the same pose is already playing
    }
    let nearby;
    try {
      nearby = player.dimension.getEntities({
        location: player.location,
        maxDistance: DEFLECT_SCAN_RADIUS,
        excludeTypes: DEFLECT_EXCLUDED_TYPES,
      });
    } catch {
      continue;
    }
    for (const entity of nearby) tryDeflect(player, entity);
  }
}

function ensureDeflectLoop() {
  if (deflectJob === undefined) deflectJob = system.runInterval(deflectTick, 1);
}

/** Fallback: spawn the same type of projectile that hit you and fire it back at the shooter. */
function reflectProjectile(player, info) {
  const tick = system.currentTick;
  if (tick - (lastReflectTick[player.id] ?? -999) < REFLECT_COOLDOWN_TICKS) return;
  lastReflectTick[player.id] = tick;

  const v = info.velocity;
  const origSpeed = Math.hypot(v.x, v.y, v.z);
  const speed = Math.min(MAX_PROJECTILE_SPEED, Math.max(MIN_PROJECTILE_SPEED, origSpeed || 2));
  const head = player.getHeadLocation();
  const shooter = info.shooter && info.shooter.isValid && info.shooter.id !== player.id ? info.shooter : undefined;

  let dir;
  if (shooter) dir = unitDir(head, aimPoint(shooter));
  else if (origSpeed > 0.001) dir = { x: -v.x / origSpeed, y: -v.y / origSpeed, z: -v.z / origSpeed }; // flies back along its old path
  else dir = player.getViewDirection();

  const origin = { x: head.x + dir.x * 1.2, y: head.y + dir.y * 1.2, z: head.z + dir.z * 1.2 };
  let proj;
  try {
    proj = player.dimension.spawnEntity(info.typeId, origin);
  } catch {
    return; // this projectile type cannot be spawned with spawnEntity
  }
  try {
    proj.addTag(REFLECT_TAG);
    const comp = proj.getComponent("minecraft:projectile");
    const velocity = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
    if (comp) {
      comp.owner = player;
      comp.shoot(velocity);
    } else {
      proj.clearVelocity();
      proj.applyImpulse(velocity);
    }
    if (shooter) homeTowards(proj, shooter, speed);
  } catch {
    // projectile was destroyed right when it spawned
  }
}

// Remembers projectiles that just hit/exploded near a blocking player, for explosion damage with no damagingProjectile.
function noteProjectileHit(data) {
  try {
    if (Object.keys(blockReadyAt).length === 0) return;
    const proj = data.projectile;
    const info = readProjectileInfo(proj, data.source);
    if (!info || info.reflectedAlready) return;
    const tick = system.currentTick;
    for (const pl of proj.dimension.getPlayers({ location: proj.location, maxDistance: 8 })) {
      if (blockReadyAt[pl.id] !== undefined) recentProjectile[pl.id] = { ...info, tick };
    }
  } catch {
    // projectile is gone
  }
}
world.afterEvents.projectileHitEntity.subscribe(noteProjectileHit);
world.afterEvents.projectileHitBlock.subscribe(noteProjectileHit);

// ----- Control events (replacing runInterval) -----
world.afterEvents.playerButtonInput.subscribe((data) => {
  if (data.button !== InputButton.Sneak) return;
  const player = data.player;
  // On touch the Sneak button is a toggle: Pressed and Released can arrive back to back while
  // the player is STILL crouching. So do not trust Pressed/Released; read the real state on the next tick.
  system.run(() => syncBlocking(player));
});

// Hotbar slot changed: if no longer holding the shield, stop the animation; if newly holding a shield while Sneaking, turn it on again.
world.afterEvents.playerHotbarSelectedSlotChange.subscribe((data) => {
  const player = data.player;
  system.run(() => {
    try {
      const shield = getHeldShield(player);
      if (!shield) {
        stopBlocking(player);
      } else if (player.isSneaking && blockReadyAt[player.id] === undefined) {
        startBlocking(player);
      }
    } catch {
      // player has left
    }
  });
});

world.afterEvents.itemStartUse.subscribe((data) => {
  if (data.itemStack?.typeId === SHIELD_ID) return; // the shield itself does not count as "using another item"
  usingItem[data.source.id] = system.currentTick;
  stopBlockAnimation(data.source);
});
world.afterEvents.itemCompleteUse.subscribe((data) => {
  delete usingItem[data.source.id];
});
world.afterEvents.itemStopUse.subscribe((data) => {
  delete usingItem[data.source.id];
});
world.afterEvents.itemReleaseUse.subscribe((data) => {
  delete usingItem[data.source.id];
});

// ----- Blocking damage -----
world.beforeEvents.entityHurt.subscribe((data) => {
  if (reflecting) return;
  const player = data.hurtEntity;
  if (!(player instanceof Player)) return;

  const cause = data.damageSource.cause;
  if (UNBLOCKABLE_CAUSES.has(cause)) return;

  const tick = system.currentTick;
  const blocking = isBlocking(player);

  // Fire immunity window after blocking: extinguishFire runs 1 tick late so one burn tick could slip through.
  if (FIRE_CAUSES.has(cause)) {
    const last = recentlyBlocked[player.id];
    if (blocking || (last !== undefined && tick - last < FIRE_IMMUNITY_TICKS)) {
      data.cancel = true;
    }
    return;
  }

  if (!blocking) return;

  const shield = getHeldShield(player);
  if (!shield) return;

  const params = getParams(shield.item);
  const attacker = data.damageSource.damagingEntity;
  const blockedDamage = data.damage;
  const hadFire = player.getComponent(EntityOnFireComponent.componentId) !== undefined;
  const playerId = player.id;
  const playerLoc = player.location;
  const attackerLoc = attacker?.location ?? data.damageSource.damagingProjectile?.location;

  // Projectile: prefer the projectile that dealt damage; if none (e.g. an explosion) use the one that recently exploded nearby.
  let projectileInfo = readProjectileInfo(data.damageSource.damagingProjectile, attacker);
  if (!projectileInfo) {
    const rec = recentProjectile[playerId];
    if (rec && tick - rec.tick <= RECENT_PROJECTILE_TICKS && !attacker) projectileInfo = rec;
  }

  recentlyBlocked[playerId] = tick;
  cancelledEffects[playerId] = true;
  data.cancel = true;
  const chargeNow = addCharge(player, blockedDamage);

  system.run(() => {
    delete cancelledEffects[playerId];
    try {
      if (!hadFire && player.getComponent(EntityOnFireComponent.componentId)) player.extinguishFire();
      if (params.block) player.dimension.playSound(params.block, player.location);
      showCharge(player, chargeNow);

      // Projectile: fire back exactly that projectile type (projectiles fired by the shield are only blocked).
      if (projectileInfo) {
        if (!projectileInfo.reflectedAlready) reflectProjectile(player, projectileInfo);
        return;
      }

      // Melee reflect: only when the attacker is a creature (not the environment).
      if (!attacker || data.damageSource.damagingProjectile) return;
      if (attacker.id === playerId) return;

      // Knockback
      if (params.knockback && attackerLoc) {
        const dx = attackerLoc.x - playerLoc.x;
        const dz = attackerLoc.z - playerLoc.z;
        const total = Math.abs(dx) + Math.abs(dz) || 1;
        const force = params.knockback.x ?? 0;
        try {
          attacker.applyKnockback({ x: (dx / total) * force, z: (dz / total) * force }, params.knockback.y ?? 0.1);
        } catch {
          // target takes no knockback
        }
      }

      // Reflect damage
      const mult = typeof params.reflect_multiplier === "number" ? params.reflect_multiplier : 2;
      const reflected = Math.max(blockedDamage, MIN_REFLECT_DAMAGE) * mult;
      if (reflected > 0) {
        reflecting = true;
        try {
          attacker.applyDamage(reflected, { cause: EntityDamageCause.entityAttack, damagingEntity: player });
        } finally {
          reflecting = false;
        }
      }
    } catch {
      // attacker is gone / player left
    }
  });
});

// Cancel effects (slowness, weakness...) attached to the hit that was just blocked within the same tick.
world.beforeEvents.effectAdd.subscribe((data) => {
  if (!cancelledEffects[data.entity.id]) return;
  data.cancel = true;
});

// ----- Component registration + cleanup -----
system.beforeEvents.startup.subscribe((initEvent) => {
  initEvent.itemComponentRegistry.registerCustomComponent(COMPONENT_ID, {});
});

world.afterEvents.playerLeave.subscribe((data) => {
  const id = data.playerId;
  delete blockReadyAt[id];
  delete animations[id];
  delete usingItem[id];
  delete recentlyBlocked[id];
  delete cancelledEffects[id];
  delete recentProjectile[id];
  delete lastReflectTick[id];
  delete shieldCharge[id];
});
