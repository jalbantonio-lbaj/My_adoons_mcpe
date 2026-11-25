import { world } from "@minecraft/server";
import { isScriptFlying } from "./scriptFlight.js";

// SELF-CONTAINED IN AVARITIA (no longer depends on the "speed and noclip" pack):
// previously the running/flying speed when wearing the full infinity armor was linked via the tag
// "infinity_armor" to the fly.js script of the speed_and_noclip pack. Now that logic is moved
// entirely here so avaritia runs independently - installing only avaritia is enough to get the
// speed-boost effect, without having to also install the speed_and_noclip pack.
//
// Mechanism: whenever the player holds the sprint button AND is wearing all 4 infinity armor
// pieces (tag "infinity_armor" attached/removed by armorEffects.js), accumulate an amount
// of "momentum" each tick then applyImpulse along the camera direction (view
// direction) - while walking it only pushes along the horizontal plane (x,z), while actually
// flying (isFlying) it also pushes along the y axis so looking up/down + holding sprint
// flies diagonally up/down fast along the look direction, not just straight ahead.

const FULL_ARMOR_TAG = "infinity_armor";
// Neon Halo chestplate: only boosts the sprint launch WHILE FLYING, at NEON_SPRINT_RATIO x the infinity armor, times
// the ever-growing boost from neonFlight.js (passed in as neonBoost; 0 = not wearing the neon chestplate).
const NEON_SPRINT_RATIO = 1.4;

// The speed thresholds used specifically for the armor effect (same unit as Bedrock's applyImpulse,
// not blocks/second). These apply ONLY while holding the sprint button (sprint) - normal
// flight (no sprint) already has its own multiplier via the "minecraft:flying_speed" attribute
// in armorEffects.js, unrelated to these numbers.
//
// ON REQUEST: flying + holding the sprint button is still TOO FAST -> split the reduction factor for
// "in the air" (AIR_SPRINT_REDUCTION) from "on the ground" (GROUND_SPRINT_REDUCTION) so
// the flying part can be cut sharply without touching the walking-run speed (the running part stays unchanged as in
// the previous adjustment, reduced by 30%). The "base" thresholds (BASE_*) are kept as-is for easy re-tuning later.
const BASE_MAX_SPEED_GROUND = 1.1;   // speed cap when running on the ground (base level)
const BASE_MAX_SPEED_AIR = 1.6;      // speed cap when jumping / flying (base level)
const BASE_ACCEL_GROUND = 0.18;      // acceleration per tick when running on the ground (base level)
const BASE_ACCEL_AIR = 0.12;         // acceleration per tick when jumping / flying (base level)
const BASE_START_BOOST = 0.05;       // initial boost right when sprint is pressed (base level)

const GROUND_SPRINT_REDUCTION = 0.15; // 70% = 30% reduction (unchanged from last time)
const AIR_SPRINT_REDUCTION = 0.5;   // was 0.2: sprint launch in the air x2.5 (it felt too slow)

const MAX_SPEED_GROUND = BASE_MAX_SPEED_GROUND * GROUND_SPRINT_REDUCTION;
const MAX_SPEED_AIR = BASE_MAX_SPEED_AIR * AIR_SPRINT_REDUCTION;
const ACCEL_GROUND = BASE_ACCEL_GROUND * GROUND_SPRINT_REDUCTION;
const ACCEL_AIR = BASE_ACCEL_AIR * AIR_SPRINT_REDUCTION;
const STOP_THRESHOLD = 0.03;    // below this threshold + not sprinting -> treated as standing still, reset to 0
const START_BOOST_GROUND = BASE_START_BOOST * GROUND_SPRINT_REDUCTION;
const START_BOOST_AIR = BASE_START_BOOST * AIR_SPRINT_REDUCTION;

const sprintMomentum = new Map();
const prevSprintState = new Map();

world.afterEvents.playerLeave.subscribe((ev) => {
  sprintMomentum.delete(ev.playerId);
  prevSprintState.delete(ev.playerId);
});

/**
 * Call this function every tick for each player (it is already called in armorEffects.js,
 * right after the part that attaches/removes the infinity_armor tag, so there is no need to import/loop it again).
 */
export function armorSpeed(player, neonBoost = 0) {
  const id = player.id;
  const neon = neonBoost > 0 && !player.hasTag(FULL_ARMOR_TAG);
  const scale = neon ? NEON_SPRINT_RATIO * neonBoost : 1;

  // Not wearing the full armor -> nothing special, clear all momentum so that if the player was
  // running fast and takes off the armor midway, the speed drops back to normal immediately,
  // with no extra "carry-over" for a few ticks.
  if (!player.hasTag(FULL_ARMOR_TAG) && !neon) {
    sprintMomentum.set(id, 0);
    prevSprintState.set(id, player.isSprinting);
    return;
  }

  let speed = sprintMomentum.get(id) ?? 0;

  const vel = player.getVelocity();
  const view = player.getViewDirection();

  let isFlying = false;
  try { isFlying = !!player.isFlying; } catch { isFlying = false; }
  if (!isFlying && isScriptFlying(player)) isFlying = true; // script flight (no mayfly) uses the same 3D launch

  const isOnGround = player.isOnGround;
  const isInLiquid = player.isInWater || player.isSwimming;
  const isSprinting = player.isSprinting;
  const prevSprint = prevSprintState.get(id) ?? false;
  const canMove = !isInLiquid && (!neon || isFlying); // neon chestplate: no sprint boost on the ground

  // Compute the current speed: include the y axis while flying, otherwise flying straight up/down would
  // always be treated as "standing still" and be reset to 0 midway.
  const currentSpeed = isFlying
    ? Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2)
    : Math.sqrt(vel.x ** 2 + vel.z ** 2);

  const isTrulyIdle = currentSpeed < STOP_THRESHOLD && !isSprinting;

  if (isTrulyIdle && isOnGround) {
    sprintMomentum.set(id, 0);
    prevSprintState.set(id, isSprinting);
    return;
  }

  if (!prevSprint && isSprinting && canMove) {
    speed += isFlying ? START_BOOST_AIR * scale : START_BOOST_GROUND;
  }

  if (isSprinting && canMove) {
    if (isFlying) {
      // Flying + holding sprint = flies even faster, using the "air" cap.
      speed += ACCEL_AIR * scale;
      if (speed > MAX_SPEED_AIR * scale) speed = MAX_SPEED_AIR * scale;
    } else if (isOnGround) {
      speed += ACCEL_GROUND;
      if (speed > MAX_SPEED_GROUND) speed = MAX_SPEED_GROUND;
    } else {
      speed += ACCEL_AIR;
      if (speed > MAX_SPEED_AIR) speed = MAX_SPEED_AIR;
    }
  } else {
    speed = 0;
  }

  sprintMomentum.set(id, speed);
  prevSprintState.set(id, isSprinting);

  if (speed <= 0.001) return;

  if (isFlying) {
    if (isScriptFlying(player)) return; // script flight makes its own launch (scriptFlight.js)
    // Push along the normalized 3D look vector (x,y,z), so looking up/down
    // then holding sprint flies diagonally up/down along the camera direction instead of
    // only going straight along the horizontal plane.
    const len3 = Math.sqrt(vel.x ** 2 + vel.y ** 2 + vel.z ** 2);
    if (len3 < 0.001) return;

    const viewLen = Math.sqrt(view.x ** 2 + view.y ** 2 + view.z ** 2) || 1;

    player.applyImpulse({
      x: (view.x / viewLen) * speed,
      y: (view.y / viewLen) * speed,
      z: (view.z / viewLen) * speed
    });
  } else {
    // Walking / running on the ground or jumping: only push along the horizontal plane (x,z),
    // without touching the y axis so normal gravity / jump force is not disturbed.
    const len = Math.sqrt(vel.x ** 2 + vel.z ** 2);
    if (len < 0.001) return;

    player.applyImpulse({
      x: view.x * speed,
      y: 0,
      z: view.z * speed
    });
  }
}
