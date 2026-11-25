import * as MC from "@minecraft/server";
import { registerOwner, getShooterId } from "./bowOwner.js";

// FIX (on request): 2 issues reported with the infinity_bow arrow rain effect:
// 1) "Laggy, not smooth when using the bow" - every shot that hits an entity spawns up to
//    WAVE_COUNT(4) * ARROWS_PER_WAVE(36) = 144 heaven_arrow entities at once
//    (spread over several waves). 144 entities with their own collision/physics/emissive shader is
//    a considerable load, and continuous firing (with infinite ammo) easily causes stutter.
//    -> Reduced to WAVE_COUNT=3 * ARROWS_PER_WAVE=20 = 60 arrows/shot, ~60% fewer
//    entities to spawn+simulate.
// 2) "Very low hit rate on creatures despite many arrows" - previously 100% of arrows
//    spawned randomly in the air around the center (relying on the chance that some happen to
//    hit something), which was wasteful, and the count was already reduced in (1). Now: find the
//    real entities within the radius around the center, each entity gets EXACTLY 1
//    arrow aimed straight at it per wave (not a % of the total arrows -
//    a % ratio is easy to miss/fake). IN EACH wave (2, 3...), any entity still
//    alive AND still within the radius continue to get "favored" 1 arrow/wave
//    gets favored like that; whoever died or ran out of the area is dropped. The leftover arrows
//    (ARROWS_PER_WAVE - number of entities being aimed at) still scatter randomly
//    as before to keep the "arrow rain" effect covering the area so it looks good.
const WAVE_COUNT = 3;         // number of arrow rain waves (reduced from 4)
const WAVE_DELAY = 6;         // ticks between each wave (6 ticks ≈ 0.3s)
const ARROWS_PER_WAVE = 20;    // number of arrows per wave (reduced from 36)
const SPAWN_HEIGHT_MIN = 12;  // minimum spawn height above the center
const SPAWN_HEIGHT_MAX = 18;  // maximum spawn height above the center
const SPREAD_MIN = 0.5;       // minimum scatter radius around the center (arrows are "random")
const SPREAD_MAX = 5.5;       // maximum scatter radius around the center (arrows are "random")
const FALL_FORCE = 1.6;       // downward force (impulse.y)
const HOMING_RADIUS = 6;      // radius to search for real entities to aim directly at (re-checked every wave)
const HOMING_JITTER = 0.15;   // small offset around the entity so arrows do not land on the exact same spot
const HOMING_LEAD_TICKS = 12; // "lead the target" using the entity's current velocity (estimated fall ticks)

// Rain arrows fly DIAGONALLY like real arrows: the model rotates to match the flight direction.
//  - yaw (horizontal direction) is set with entity.setRotation -> the engine rotates the model by yaw automatically
//  - pitch (downward tilt) is passed via the property avaritia:tilt (0 = horizontal, 90 = straight
//    down) so the client-side animation rotates the model. avaritia:spin stays 0.
// Arrows stuck in the ground keep their angle, so they stick in at a slant matching the flight direction.
const LEAN_MIN = 15;          // degrees, deviation angle from vertical for randomly scattered arrows
const LEAN_MAX = 50;
const LEAD_FACTOR = 0.6;      // compensates the spawn position so diagonal arrows still fall around the center
const YAW_OFFSET = 0;         // degrees, adjust if the model faces backward/off from the flight direction (try 180)

function applyFlightPose(arrow, dir) {
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1;
  const horiz = Math.sqrt(dir.x * dir.x + dir.z * dir.z);
  const tilt = Math.max(0, Math.min(90, Math.atan2(-dir.y, horiz) * (180 / Math.PI)));
  const yaw = horiz > 1e-6 ? Math.atan2(-dir.x, dir.z) * (180 / Math.PI) : 0;
  try {
    arrow.setRotation({ x: tilt, y: yaw + YAW_OFFSET });
  } catch (e) {}
  arrow.setProperty("avaritia:tilt", tilt);
  arrow.setProperty("avaritia:spin", 0);
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function distance2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isRainRoot(projectile) {
  // only the original arrow (rain === true) triggers rain; child arrows (rain === false) do not
  return !!projectile && projectile.typeId === "avaritia:heaven_arrow" && projectile.getProperty("avaritia:rain") === true;
}

// Find real entities (excluding items/xp_orb/arrows/inanimate objects) nearby
// the arrow rain center, to use as "direct aim" targets.
function findNearbyTargets(dimension, center, ownerId) {
  try {
    return dimension.getEntities({
      location: center,
      maxDistance: HOMING_RADIUS,
      excludeFamilies: ["inanimate"],
      excludeTypes: ["item", "xp_orb", "avaritia:heaven_arrow", "avaritia:heaven_arrow_rain"]
    }).filter((entity) => {
      try {
        if (entity.id === ownerId) return false; // do not aim at the shooter
        return entity.isValid();
      } catch (e) {
        return false;
      }
    });
  } catch (e) {
    return [];
  }
}

function spawnArrowRain(dimension, center, owner) {
  const targets = findNearbyTargets(dimension, center, owner?.id);
  for (let wave = 0; wave < WAVE_COUNT; wave++) {
    MC.system.runTimeout(() => {
      // every wave re-checks: still alive AND still within HOMING_RADIUS
      // of the center (not just checking alive as before) - an entity that runs out of
      // the area midway is no longer favored/aimed at.
      const liveTargets = targets.filter((entity) => {
        try {
          if (!entity.isValid()) return false;
          return distance2D(entity.location, center) <= HOMING_RADIUS;
        } catch (e) {
          return false;
        }
      });
      // EXACTLY 1 arrow/entity/wave, not computed by %. If there are more entities than the arrows
      // left in the wave, truncate (prioritizing entities at the start of the list).
      const homingCount = Math.min(ARROWS_PER_WAVE, liveTargets.length);

      for (let i = 0; i < ARROWS_PER_WAVE; i++) {
        let spawnPos;
        let impulse;

        if (i < homingCount) {
          const target = liveTargets[i];
          let aimPoint = target.location;
          try {
            const vel = target.getVelocity();
            aimPoint = {
              x: target.location.x + vel.x * HOMING_LEAD_TICKS,
              y: target.location.y + vel.y * HOMING_LEAD_TICKS,
              z: target.location.z + vel.z * HOMING_LEAD_TICKS
            };
          } catch (e) {}
          spawnPos = {
            x: aimPoint.x + randomRange(-HOMING_JITTER, HOMING_JITTER),
            y: center.y + randomRange(SPAWN_HEIGHT_MIN, SPAWN_HEIGHT_MAX),
            z: aimPoint.z + randomRange(-HOMING_JITTER, HOMING_JITTER)
          };
          // falls almost straight down to hit the target
          impulse = { x: randomRange(-0.04, 0.04), y: -FALL_FORCE, z: randomRange(-0.04, 0.04) };
        } else {
          // expected random landing point around the center, flying diagonally in a random direction
          const angle = Math.random() * Math.PI * 2;
          const radius = randomRange(SPREAD_MIN, SPREAD_MAX);
          const landX = center.x + Math.cos(angle) * radius;
          const landZ = center.z + Math.sin(angle) * radius;
          const height = randomRange(SPAWN_HEIGHT_MIN, SPAWN_HEIGHT_MAX);
          const lean = randomRange(LEAN_MIN, LEAN_MAX) * (Math.PI / 180);
          const heading = Math.random() * Math.PI * 2;
          const hx = Math.cos(heading);
          const hz = Math.sin(heading);
          const sideSpeed = FALL_FORCE * Math.tan(lean);
          const backOff = height * Math.tan(lean) * LEAD_FACTOR;
          spawnPos = {
            x: landX - hx * backOff,
            y: center.y + height,
            z: landZ - hz * backOff
          };
          impulse = { x: hx * sideSpeed, y: -FALL_FORCE, z: hz * sideSpeed };
        }

        try {
          // a separate entity (its runtime is NOT minecraft:arrow) so it cannot be picked up,
          // and it also does not trigger nested rain because isRainRoot only accepts heaven_arrow
          const arrow = dimension.spawnEntity("avaritia:heaven_arrow_rain", spawnPos);
          registerOwner(arrow, owner);
          applyFlightPose(arrow, impulse);
          arrow.applyImpulse(impulse);
        } catch (e) {}
      }
    }, wave * WAVE_DELAY);
  }
}

function resolveOwner(projectile, source) {
  const id = getShooterId(projectile, source);
  if (!id) return undefined;
  try { return MC.world.getEntity(id); } catch (e) { return undefined; }
}

// Hit a mob -> trigger arrow rain around the mob's position
MC.world.afterEvents.projectileHitEntity.subscribe((event) => {
  const projectile = event.projectile;
  if (!isRainRoot(projectile)) return;

  const hitInfo = event.getEntityHit();
  let target;
  try { target = hitInfo?.entity && hitInfo.entity.isValid ? hitInfo.entity : undefined; } catch { target = undefined; }
  const center = target ? target.location : event.location;
  const dimension = target ? target.dimension : event.dimension;
  if (!center || !dimension) return;

  spawnArrowRain(dimension, center, resolveOwner(projectile, event.source));
});

// Hit a block/ground -> this was missing before, so shooting the ground did not trigger rain
MC.world.afterEvents.projectileHitBlock.subscribe((event) => {
  const projectile = event.projectile;
  if (!isRainRoot(projectile)) return;

  const center = event.location;
  const dimension = event.dimension;
  if (!center || !dimension) return;

  spawnArrowRain(dimension, center, resolveOwner(projectile, event.source));
});
