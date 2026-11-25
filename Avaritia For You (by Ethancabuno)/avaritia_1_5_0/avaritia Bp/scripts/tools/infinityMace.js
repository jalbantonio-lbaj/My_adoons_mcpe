import { world, system, EntityDamageCause, MolangVariableMap } from "@minecraft/server";

/**
 * Infinity Mace (merged from Raiyon's "More Maces + Infinity")
 *
 *      bonusDamage = 100 * 2^(5 * blocksFallen)
 *
 * Changes from the original when merging into Avaritia:
 *  - Item id:   infinity:mace           -> avaritia:infinity_mace
 *  - Component: more_maces:addon        -> avaritia:infinity_mace
 *  - Particle:  more_maces:hit_particle -> a Kamui-style space swirl effect
 *    (bright point + spiral, see SPACE_ORB_PARTICLE_LAYERS below)
 *  - Components are registered with system.beforeEvents.startup (like blockEvents.js),
 *    because @minecraft/server 2.x no longer has world.beforeEvents.worldInitialize.
 *
 * Thanks to the id containing "avaritia:infinity", main.js automatically applies keepOnDeath + immunity
 * (all_immunity / fire_immunity) to the dropped item as well, like the other Infinity gear.
 *
 * Extra mechanics (every time the mace lands a hit, whether or not it is a falling hit):
 *  - The victim is rooted: Slowness 255 for 20 seconds (particle shown).
 *  - The victim is a "pull center": every creature within 6 blocks (except the mace holder)
 *    is pulled CLOSER to the center by some distance (not flying straight into it) and gets a weaker Slowness
 *    (amplifier 2) for 10 seconds.
 *
 * (The terrain-breaking crater skill was removed: the mace no longer destroys blocks.)
 *
 * SKILL (use / right click while holding the mace):
 *  - Creates 1 pulling vortex (particle + continuous pull for 20 seconds) at the aimed point, pulling every living
 *    creature within 13 blocks (except the user). Unlimited uses, each use
 *    0.7 seconds apart. Adjust in the "Skill" section below (SKILL_*).
 *  - This vortex used to spawn from the falling bonus hit; it is now fully separated into a skill. To make the
 *    falling hit also create a vortex as before, set VORTEX_ON_HIT = true.
 */

const INFINITY_MACE_ID = "avaritia:infinity_mace";

// "Kamui" effect (like Obito using the Sharingan): 1 bright point at the center, the surrounding space
// is twisted and sucked into that point. See avaritia Rp/particles/default/:
//   space_orb_core.json    - bright point at the center
//   kamui_spiral.json      - long spiral light streaks winding into the center, spinning faster the closer they get
//   kamui_fragment.json    - small fragments dragged along in the same direction
// All 3 run on their own for 20 seconds (matching the root duration) then turn off - adjust "active_time" in each .json file if needed, so
// it only needs to be called once per hit.
// Choose the effect used on hit (change ACTIVE_EFFECT, all of them are already in the addon):
//   "void"          - bright point + translucent BLACK streaks spinning inward, see-through (like Hollow Purple),
//                     random purple/black color  <- currently used
//   "void_rainbow"  - same as above but cycles through 7 rainbow colors red -> purple then reverses, looping forever
//   "kamui"         - bright Kamui-style spiral (purple)
//   "kamui_rainbow" - Kamui cycling through 7 colors
const ACTIVE_EFFECT = "void";
const EFFECT_LAYERS = {
  void: ["fad:space_orb_core", "fad:void_glow", "fad:void_lines", "fad:void_lines_far", "fad:void_sparks"],
  void_rainbow: [
    "fad:space_orb_core_rainbow",
    "fad:void_glow_rainbow",
    "fad:void_lines_rainbow",
    "fad:void_lines_far_rainbow",
    "fad:void_sparks_rainbow",
  ],
  kamui: ["fad:space_orb_core", "fad:kamui_spiral", "fad:kamui_fragment"],
  kamui_rainbow: ["fad:space_orb_core_rainbow", "fad:kamui_spiral_rainbow", "fad:kamui_fragment_rainbow"],
};
const SPACE_ORB_PARTICLE_LAYERS = EFFECT_LAYERS[ACTIVE_EFFECT] ?? EFFECT_LAYERS.void;

// The old "ground smash" effect (2 particles smash_ground_particle + smash_ground_particle_center, shooting debris
// of the block underfoot). They take color/texture from the block under the entity so they must be spawned via the entity
// avaritia:mace_hit_particle (a client entity that runs the 2 animations smash + smashCenter itself and then disappears).
// Set to false to turn it off.
const SMASH_EFFECT_ENABLED = true;
const SMASH_ENTITY_ID = "avaritia:mace_hit_particle";

function spawnSmashEffect(dimension, location) {
  if (!SMASH_EFFECT_ENABLED) return;
  let ground = location;
  try {
    // If the victim is flying (Wither, Ender Dragon...), lower the impact point to the ground below.
    const below = dimension.getBlockBelow?.(location, { maxDistance: 32 });
    if (below) ground = { x: location.x, y: below.location.y + 1, z: location.z };
  } catch {
    /* use the feet position if no block below can be found */
  }
  try {
    dimension.spawnEntity(SMASH_ENTITY_ID, ground);
  } catch {
    /* if the entity is missing, skip it, do not break the rest */
  }
}

// The vortex center is placed in the middle of the creature's body instead of at its feet.
function getBodyCenter(entity) {
  const location = entity.location;
  try {
    const head = entity.getHeadLocation?.();
    if (head) return { x: location.x, y: (location.y + head.y) / 2, z: location.z };
  } catch {
    /* use the feet position if the head cannot be read */
  }
  return location;
}

// Only spawns the vortex particle (without the ground smash effect) at center.
function spawnSpaceOrbParticles(dimension, center) {
  // Each time a different "color seed" -> purple / indigo-black tones vary per vortex
  // (the particle reads variable.hit_seed; in addition each particle also randomizes its own shade).
  let molang;
  try {
    molang = new MolangVariableMap();
    molang.setFloat("variable.hit_seed", Math.random());
  } catch {
    molang = undefined;
  }

  for (const particleId of SPACE_ORB_PARTICLE_LAYERS) {
    try {
      dimension.spawnParticle(particleId, center, molang);
    } catch {
      /* 1 failing layer (for example a missing particle file) must not break the remaining layers */
    }
  }
}

// Must fall at least this many blocks measured from the peak of the jump
// (0.5 so that going down stairs/slabs does not count as a fall).
const MIN_FALL_DISTANCE = 0.5;
// The first sample after leaving the ground is lower than the edge by ~0.08, so a fall of exactly 3 blocks measures 2.92.
// This tolerance lets it still count as 3.
const FALL_EPSILON = 0.1;
// Number of ticks after landing during which the fall that just ended is still counted.
const LANDING_GRACE_TICKS = 4;

// ---- Root + pull (adjust values here) ----
const VICTIM_SLOW_TICKS = 20 * 20; // 20 seconds
const VICTIM_SLOW_AMPLIFIER = 255; // same as /effect <target> slowness 20 255 true
const NEARBY_SLOW_TICKS = 10 * 20; // 10 seconds
const NEARBY_SLOW_AMPLIFIER = 2; // same as /effect <target> slowness 10 2 true
const PULL_RADIUS = 10; // pull radius around the victim (blocks) - original 6
const PULL_STRENGTH_PER_BLOCK = 0.16; // the farther from the center, the stronger the pull...
const PULL_MIN_STRENGTH = 0.35; // ...but always clamped within this range
const PULL_MAX_STRENGTH = 1.1;
const PULL_LIFT = 0.3; // lift slightly so they "fly" closer instead of dragging along the ground
// Players can only be pulled with applyKnockback (weaker than impulse) so this multiplier is applied.
const PLAYER_PULL_MULTIPLIER = 1.8;
const PULL_MIN_DISTANCE = 1.5; // already next to the center: no more pulling (only Slowness applies)
const PULL_PLAYERS = true; // false = do not pull/slow other players
const PULL_SKIP_TYPES = new Set(["minecraft:armor_stand"]);

// ---- (new) Splash damage: every time the mace lands a hit, every creature within SPLASH_RADIUS around the victim
// immediately takes damage = exactly the damage of that hit (fall damage 100*2^(5*blocks) if falling, otherwise SPLASH_BASE_DAMAGE).
const SPLASH_RADIUS = 5; // block
const SPLASH_BASE_DAMAGE = 70; // non-falling hit: use the item's base damage (minecraft:damage = 70)
const SPLASH_HIT_PLAYERS = true; // false = splash damage does not hit other players

// ---- Freeze flying creatures (Wither, Ender Dragon, flying mobs from other addons...) ----
const FLYING_FREEZE_TICKS = 20 * 20; // 20 seconds completely motionless
// Detects "flying creatures" by the minecraft:can_fly component (Wither, Ender Dragon,
// Ghast... all have this component). If a mob from another addon does not declare
// this component (some custom entity addons forget it), add its typeId to the set below.
const FLYING_TYPE_WHITELIST = new Set([
  "minecraft:wither",
  "minecraft:ender_dragon",
]);

// entityId -> { expireTick, location, dimensionId }
const frozenFlyers = new Map();

function isFlyingEntity(entity) {
  if (FLYING_TYPE_WHITELIST.has(entity.typeId)) return true;

  try {
    if (entity.hasComponent("minecraft:can_fly")) return true;
  } catch {
    /* ignore */
  }

  // Custom mobs that "cannot walk" usually do NOT have movement.basic
  // and use movement.fly/hover/generic/glide to move -> almost certainly
  // a flying-only mob, even if the addon author forgot to add the can_fly component.
  try {
    const hasWalk = entity.hasComponent("minecraft:movement.basic");
    const hasFlyMove =
      entity.hasComponent("minecraft:movement.fly") ||
      entity.hasComponent("minecraft:movement.hover") ||
      entity.hasComponent("minecraft:movement.generic") ||
      entity.hasComponent("minecraft:movement.glide");
    if (!hasWalk && hasFlyMove) return true;
  } catch {
    /* ignore */
  }

  return false;
}

function freezeFlyingEntity(entity) {
  try {
    frozenFlyers.set(entity.id, {
      expireTick: system.currentTick + FLYING_FREEZE_TICKS,
      location: entity.location,
      dimensionId: entity.dimension.id,
    });
    entity.clearVelocity();
  } catch {
    /* ignore if the entity does not support it */
  }
}

// Keep the frozen position every tick: clear velocity + pull back to the spot if flying AI still
// tries to move (Wither/Ender Dragon have active flying AI, clearVelocity alone is not enough).
system.runInterval(() => {
  const now = system.currentTick;
  for (const [id, data] of frozenFlyers) {
    if (now >= data.expireTick) {
      frozenFlyers.delete(id);
      continue;
    }
    const entity = world.getEntity(id);
    if (!entity || !isEntityValid(entity)) {
      frozenFlyers.delete(id);
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
      frozenFlyers.delete(id);
    }
  }
}, 1);


function holdingMace(player) {
  try {
    return player.getComponent("minecraft:equippable")?.getEquipment("Mainhand")?.typeId === INFINITY_MACE_ID;
  } catch {
    return false;
  }
}

/** Number of blocks fallen as computed by getBlocksFallen, for the fall that just ended. */
function fallBlocks(distance) {
  if (distance < MIN_FALL_DISTANCE) return 0;
  return Math.max(1, Math.floor(distance + FALL_EPSILON));
}

// playerId -> { peakY, landed, landTick, landY }
const fallState = new Map();

function isEntityValid(entity) {
  try {
    // isValid is a method in some API versions and a property in others -> support both.
    const v = entity.isValid;
    return typeof v === "function" ? entity.isValid() : v !== false;
  } catch {
    return false;
  }
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const player of world.getPlayers()) {
    if (player.isFlying || player.isGliding) {
      fallState.delete(player.id);
      continue;
    }

    const y = player.location.y;
    const state = fallState.get(player.id);

    if (player.isOnGround) {
      if (!state) continue;
      if (!state.landed) {
        state.landed = true;
        state.landTick = now;
        state.landY = y;
      } else if (now - state.landTick > LANDING_GRACE_TICKS) {
        fallState.delete(player.id);
      }
      continue;
    }

    if (!state || state.landed) {
      // Just left the ground (jumped or stepped off an edge): start a new fall.
      fallState.set(player.id, { peakY: y, landed: false, landTick: 0, landY: y });
    } else if (y > state.peakY) {
      state.peakY = y;
    }
  }
}, 1);

world.afterEvents.playerLeave.subscribe((event) => {
  fallState.delete(event.playerId);
  lastSkillTick.delete(event.playerId);
});

function getBlocksFallen(player) {
  const state = fallState.get(player.id);
  if (!state) return 0;

  let distance;
  if (!state.landed) {
    // Still in the air: measure from the peak to the current position.
    const y = player.location.y;
    distance = Math.max(state.peakY, y) - y;
  } else {
    if (system.currentTick - state.landTick > LANDING_GRACE_TICKS) return 0;
    distance = state.peakY - state.landY;
  }

  if (distance < MIN_FALL_DISTANCE) return 0;
  // Every real fall counts as at least 1 block; larger falls count in whole blocks.
  return Math.max(1, Math.floor(distance + FALL_EPSILON));
}

function getBonusDamage(itemId, blocksFallen) {
  if (blocksFallen < 1) return 0;

  if (itemId === INFINITY_MACE_ID) {
    // 100 * 2^(5 * blocksFallen) — unlimited, exactly like the original.
    return 100 * Math.pow(2, 5 * blocksFallen);
  }

  return 0;
}

function splashDamage(attacker, victim, damage) {
  let nearby;
  try {
    nearby = victim.dimension.getEntities({ location: getBodyCenter(victim), maxDistance: SPLASH_RADIUS });
  } catch {
    return;
  }
  for (const e of nearby) {
    try {
      if (e.id === victim.id || e.id === attacker.id) continue;
      if (!isEntityValid(e) || PULL_SKIP_TYPES.has(e.typeId)) continue;
      if (!SPLASH_HIT_PLAYERS && e.typeId === "minecraft:player") continue;
      if (e.hasTag("immortal") || e.getComponent("minecraft:is_tamed")) continue;
      const h = e.getComponent("minecraft:health");
      if (!h || h.currentValue <= 0) continue;
      e.applyDamage(damage, { cause: EntityDamageCause.entityAttack, damagingEntity: attacker });
    } catch {
      /* one faulty entity must not break the whole hit */
    }
  }
}

function addSlowness(entity, ticks, amplifier) {
  try {
    entity.addEffect("slowness", ticks, { amplifier, showParticles: true });
  } catch {
    /* entity cannot receive effects (not a living creature...) -> ignore */
  }
}

/**
 * Pulls the entity along the unit direction (ux, uz).
 *  - Mobs (including Warden, Ender Dragon... with knockback_resistance = 1): use applyImpulse,
 *    which adds straight to velocity so it is NOT blocked by knockback resistance.
 *  - Players: applyImpulse is unusable -> applyKnockback({x, z}, vertical)
 *    (API 2.x signature, x/z already multiplied by strength like combatHit.js).
 */
function pullToward(entity, ux, uz, strength) {
  if (entity.typeId !== "minecraft:player") {
    try {
      entity.applyImpulse({ x: ux * strength, y: PULL_LIFT, z: uz * strength });
      return;
    } catch {
      /* entity type does not accept impulse -> try knockback below */
    }
  }
  const force = strength * (entity.typeId === "minecraft:player" ? PLAYER_PULL_MULTIPLIER : 1);
  entity.applyKnockback({ x: ux * force, z: uz * force }, PULL_LIFT);
}

/** Roots the victim + pulls surrounding creatures toward the victim. */
function applyLockAndPull(attacker, victim) {
  const center = victim.location; // taken before damage/movement is applied
  addSlowness(victim, VICTIM_SLOW_TICKS, VICTIM_SLOW_AMPLIFIER);

  let nearby;
  try {
    nearby = victim.dimension.getEntities({ location: center, maxDistance: PULL_RADIUS });
  } catch {
    return;
  }

  for (const entity of nearby) {
    try {
      if (entity.id === victim.id || entity.id === attacker.id) continue;
      if (!isEntityValid(entity)) continue;
      if (PULL_SKIP_TYPES.has(entity.typeId)) continue;
      if (!PULL_PLAYERS && entity.typeId === "minecraft:player") continue;
      // Only living creatures (not items, xp orbs, arrows... which have no health component).
      if (!entity.getComponent("minecraft:health")) continue;

      const dx = center.x - entity.location.x;
      const dz = center.z - entity.location.z;
      const dist = Math.hypot(dx, dz);

      if (dist > PULL_MIN_DISTANCE) {
        // Pulls part of the way toward the center: strength proportional to distance, clamped min/max.
        const strength = Math.min(
          PULL_MAX_STRENGTH,
          Math.max(PULL_MIN_STRENGTH, dist * PULL_STRENGTH_PER_BLOCK)
        );
        pullToward(entity, dx / dist, dz / dist, strength);
      }

      addSlowness(entity, NEARBY_SLOW_TICKS, NEARBY_SLOW_AMPLIFIER);
    } catch {
      /* one faulty entity must not break the whole hit */
    }
  }
}

// ---- Continuous pull toward the vortex center until the particle disappears ----
// Each hit with the effect (particle) creates 1 "vortex center" that stays in place where the particle is; every living creature
// within the radius is gradually pulled toward the center for VORTEX_TICKS ticks and then released when the particle fades.
// The victim (already rooted) and the mace holder are not pulled.
const VORTEX_TICKS = 20 * 20; // MUST match "active_time" (20 seconds) in the particle files
const VORTEX_INTERVAL = 2; // pull every 2 ticks
const VORTEX_RADIUS = PULL_RADIUS; // pull radius (blocks)
const VORTEX_STRENGTH_PER_BLOCK = 0.06; // strength per pull proportional to distance, clamped min/max
const VORTEX_MIN_STRENGTH = 0.12;
const VORTEX_MAX_STRENGTH = 0.45;
const VORTEX_STOP_DISTANCE = 0.8; // already next to the center: no more pulling (still slowed)
const VORTEX_LIFT = 0.04; // lift slightly so they do not drag along the ground
// Maximum number of vortex centers running at once. Continuous skill use (0.7s each, each vortex lives 20s) needs ~29 vortexes
// for 1 player so 64 is set so that no vortex is cut off early. Lower this number if the machine struggles.
const VORTEX_MAX_COUNT = 64;
// Does the falling hit create a vortex like the old version? false = vortexes come only from the skill.
const VORTEX_ON_HIT = false;
const VORTEX_SKIP_TYPES = new Set([...PULL_SKIP_TYPES, "avaritia:mace_hit_particle"]);

// { dimensionId, center, expireTick, ownerId, victimId, radius }
const vortices = [];

function startVortex(owner, victim, center, radius = VORTEX_RADIUS) {
  try {
    vortices.push({
      dimensionId: owner.dimension.id,
      center: { x: center.x, y: center.y, z: center.z },
      expireTick: system.currentTick + VORTEX_TICKS,
      ownerId: owner.id,
      victimId: victim?.id,
      radius,
    });
    while (vortices.length > VORTEX_MAX_COUNT) vortices.shift();
  } catch {
    /* ignore if no vortex center could be created */
  }
}

function pullIntoVortex(entity, ux, uy, uz, strength) {
  if (entity.typeId !== "minecraft:player") {
    try {
      entity.applyImpulse({ x: ux * strength, y: uy * strength * 0.6 + VORTEX_LIFT, z: uz * strength });
      return;
    } catch {
      /* entity type does not accept impulse -> try knockback below */
    }
  }
  const f = strength * (entity.typeId === "minecraft:player" ? PLAYER_PULL_MULTIPLIER : 1);
  entity.applyKnockback({ x: ux * f, z: uz * f }, VORTEX_LIFT + Math.max(uy, 0) * strength);
}

system.runInterval(() => {
  if (vortices.length === 0) return;
  const now = system.currentTick;

  for (let i = vortices.length - 1; i >= 0; i--) {
    const v = vortices[i];
    if (now >= v.expireTick) {
      vortices.splice(i, 1);
      continue;
    }

    let nearby;
    try {
      nearby = world.getDimension(v.dimensionId).getEntities({
        location: v.center,
        maxDistance: v.radius,
      });
    } catch {
      vortices.splice(i, 1);
      continue;
    }

    for (const entity of nearby) {
      try {
        if (entity.id === v.ownerId || entity.id === v.victimId) continue;
        if (!isEntityValid(entity)) continue;
        if (VORTEX_SKIP_TYPES.has(entity.typeId)) continue;
        if (!PULL_PLAYERS && entity.typeId === "minecraft:player") continue;
        if (!entity.getComponent("minecraft:health")) continue;

        // Rooting: extends a short Slowness every round (no potion particles to reduce visual clutter).
        try {
          entity.addEffect("slowness", 20, { amplifier: NEARBY_SLOW_AMPLIFIER, showParticles: false });
        } catch {
          /* if it cannot receive effects, skip */
        }

        const loc = entity.location;
        const dx = v.center.x - loc.x;
        const dy = v.center.y - loc.y;
        const dz = v.center.z - loc.z;
        const dist = Math.hypot(dx, dy, dz);
        if (dist <= VORTEX_STOP_DISTANCE) continue;

        const strength = Math.min(
          VORTEX_MAX_STRENGTH,
          Math.max(VORTEX_MIN_STRENGTH, dist * VORTEX_STRENGTH_PER_BLOCK)
        );
        pullIntoVortex(entity, dx / dist, dy / dist, dz / dist, strength);
      } catch {
        /* one faulty entity must not break the whole vortex loop */
      }
    }
  }
}, VORTEX_INTERVAL);

// ---- SKILL: use (right click) the mace -> create a pulling vortex ----
// Unlimited uses, only waiting SKILL_COOLDOWN_TICKS between 2 uses.
// Counts the cooldown itself in ticks (does not use minecraft:cooldown because it conflicts with the item's durability).
const SKILL_COOLDOWN_TICKS = 14; // 0.7 seconds
const SKILL_VORTEX_RADIUS = 13; // pull radius (blocks)
// Where the vortex spawns: "aim" = the aimed point (creature / block / or in front if aiming at the sky),
// "self" = right at the user.
const SKILL_CENTER_MODE = "aim";
const SKILL_AIM_DISTANCE = 20; // maximum aim distance (blocks)
const SKILL_FALLBACK_DISTANCE = 6; // when aiming at empty space it spawns this far from the eyes
const SKILL_SOUND = "mob.endermen.portal";

// playerId -> tick of the most recent skill use
const lastSkillTick = new Map();

function isLivingTarget(entity) {
  try {
    return !!entity.getComponent("minecraft:health") && !VORTEX_SKIP_TYPES.has(entity.typeId);
  } catch {
    return false;
  }
}

function getSkillCenter(player) {
  if (SKILL_CENTER_MODE === "self") {
    const loc = player.location;
    return { x: loc.x, y: loc.y + 1, z: loc.z };
  }

  const head = player.getHeadLocation();
  const dir = player.getViewDirection();

  // Nearest creature on the aim ray.
  let entityHit;
  try {
    entityHit = player
      .getEntitiesFromViewDirection({ maxDistance: SKILL_AIM_DISTANCE })
      .find((h) => h.entity.id !== player.id && isLivingTarget(h.entity));
  } catch {
    /* ignore, try block */
  }

  // First block on the aim ray: spawns in the empty cell next to the face that was hit (not buried inside the block).
  let blockCenter;
  let blockDistance = Infinity;
  try {
    const hit = player.getBlockFromViewDirection({
      maxDistance: SKILL_AIM_DISTANCE,
      includeLiquidBlocks: false,
      includePassableBlocks: false,
    });
    if (hit?.block) {
      const b = hit.block.location;
      const n = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[
        hit.face
      ] ?? [0, 0, 0];
      blockCenter = {
        x: b.x + 0.5 + n[0],
        y: b.y + 0.5 + n[1] + (n[1] > 0 ? 0.5 : 0), // top face: raised to body height
        z: b.z + 0.5 + n[2],
      };
      blockDistance = Math.hypot(blockCenter.x - head.x, blockCenter.y - head.y, blockCenter.z - head.z);
    }
  } catch {
    /* ignore, use the fallback */
  }

  if (entityHit && entityHit.distance <= blockDistance) return getBodyCenter(entityHit.entity);
  if (blockCenter) return blockCenter;
  return {
    x: head.x + dir.x * SKILL_FALLBACK_DISTANCE,
    y: head.y + dir.y * SKILL_FALLBACK_DISTANCE,
    z: head.z + dir.z * SKILL_FALLBACK_DISTANCE,
  };
}

function castVortexSkill(player) {
  const center = getSkillCenter(player);
  spawnSpaceOrbParticles(player.dimension, center);
  startVortex(player, undefined, center, SKILL_VORTEX_RADIUS);
  try {
    player.dimension.playSound(SKILL_SOUND, center, { volume: 1, pitch: 0.7 });
  } catch {
    /* sound is optional */
  }
}

world.afterEvents.itemUse.subscribe((event) => {
  try {
    const player = event.source;
    if (!player || player.typeId !== "minecraft:player") return;
    if (event.itemStack?.typeId !== INFINITY_MACE_ID) return;

    const now = system.currentTick;
    const last = lastSkillTick.get(player.id) ?? -Infinity;
    if (now - last < SKILL_COOLDOWN_TICKS) return;
    lastSkillTick.set(player.id, now);

    castVortexSkill(player);
  } catch (err) {
    console.warn(`avaritia:infinity_mace skill error: ${err}`);
  }
});

system.beforeEvents.startup.subscribe((initEvent) => {
  initEvent.itemComponentRegistry.registerCustomComponent("avaritia:infinity_mace", {
    onHitEntity(event) {
      try {
        const { attackingEntity, hitEntity, itemStack } = event;
        if (!attackingEntity || attackingEntity.typeId !== "minecraft:player") return;
        if (!itemStack || !hitEntity || !isEntityValid(hitEntity)) return;

        // Root + pull run on EVERY hit (before returning because there is no falling bonus).
        applyLockAndPull(attackingEntity, hitEntity);

        // Flying creatures (Wither, Ender Dragon, flying mobs from other addons...) stand completely
        // still for 20 seconds instead of just Slowness (Slowness cannot stop flight).
        if (isFlyingEntity(hitEntity)) {
          freezeFlyingEntity(hitEntity);
        }

        const blocksFallen = getBlocksFallen(attackingEntity);
        const bonusDamage = getBonusDamage(itemStack.typeId, blocksFallen);

        // (new) splash damage runs on EVERY hit, immediately
        splashDamage(attackingEntity, hitEntity, bonusDamage > 0 ? bonusDamage : SPLASH_BASE_DAMAGE);

        if (bonusDamage <= 0) return;

        hitEntity.applyDamage(bonusDamage, {
          cause: EntityDamageCause.entityAttack,
          damagingEntity: attackingEntity,
        });

        // Use up the fall so the next hit does not reuse it.
        fallState.delete(attackingEntity.id);

        // The ground smash effect is unchanged; the pulling vortex has been separated into a skill (see castVortexSkill).
        spawnSmashEffect(attackingEntity.dimension, hitEntity.location);
        if (VORTEX_ON_HIT) {
          const vortexCenter = getBodyCenter(hitEntity);
          spawnSpaceOrbParticles(attackingEntity.dimension, vortexCenter);
          startVortex(attackingEntity, hitEntity, vortexCenter);
        }

        try {
          attackingEntity.dimension.playSound("mace.heavy_smash_ground", hitEntity.location);
        } catch {
          /* sound is optional, ignore if missing */
        }
      } catch (err) {
        console.warn(`avaritia:infinity_mace onHitEntity error: ${err}`);
      }
    },
  });
});
