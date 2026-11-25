// SCRIPT FLIGHT (fallback): for worlds where "ability @s mayfly" does not work (Minecraft Education toggle OFF).
// Same feel as creative flight: while wearing the infinity chestplate, jump, then press jump AGAIN in the air
// to start flying; press jump twice again to land. Jump (hold) = up, sneak = down, movement keys = direction.
// The sprint "launch" (armorSpeed.js) is untouched: it simply treats a script-flying player like a really flying one.
// If the mayfly command works (checked once per login) this module does nothing and vanilla flight is used.
import { world } from "@minecraft/server";

const DOUBLE_TAP_TICKS = 10;  // window for the second jump press
const CRUISE = 0.7;           // blocks/tick horizontal (vanilla creative flight is ~0.545, raised a bit because script flight felt slower in game). With the FULL armor it is multiplied by
                              // FLY_NORMAL_MULTIPLIER (armorEffects.js) via the flyMult argument, exactly like the flying_speed attribute does when mayfly works.
                              // The sprint launch (armorSpeed.js) adds on top of this in both modes
const CLIMB_RATIO = 1.0;      // up/down speed = this x the normal horizontal flight speed (1.0 = same as flying sideways)
const SMOOTHING = 0.18;       // share of the remaining speed difference closed every tick (higher = snappier)
const DEADZONE = 0.1;         // ignore stick / touch noise
const STRAFE_SIGN = -1;       // if flying sideways is mirrored in game, change this to 1
const SLOW_FALL_TICKS = 12000; // 10 minutes: long on purpose so the effect icon does not blink; it is removed as soon as flying stops
const SLOW_FALL_AMP = 1;      // slow falling level (a higher level may not change anything in Bedrock; kept to test)
const LAUNCH_MULT = 2.5;      // sprint launch (full armor) = this x the normal flight speed, so it is always faster than normal flying
const DASH_KICK_RATIO = 0.8;  // nitro: instant speed kick = this x the cruise speed (with nitro included), along the look direction
const DASH_TICKS = 12;        // nitro: ticks of automatic forward flight after the kick, even with no key pressed
const HOVER_LIFT = 0.01;      // constant upward push EVERY tick while hovering = the gravity left under slow falling, so the player never starts sinking
                              // (raise it if the player still sinks slowly, lower it if the player floats up slowly)
const HOVER_DEADZONE = 0.3;   // only if the player has still drifted this many blocks below the hold height ...
const HOVER_MAX_FIX = 0.03;   // ... add at most this much extra push (tiny and gradual, so there is no up/down jerk)

const states = new Map(); // player.id -> state
const modes = new Map();  // player.id -> "ability" | "script"

function stateOf(id) {
  let s = states.get(id);
  if (!s) {
    s = { active: false, jumpHeld: false, tap: 0, vx: 0, vy: 0, vz: 0, slow: false, holdY: undefined, dashLeft: 0, phase: false };
    states.set(id, s);
  }
  return s;
}

world.afterEvents.playerLeave.subscribe((ev) => {
  states.delete(ev.playerId);
  modes.delete(ev.playerId);
});

/** true while the player is flying through this script (used by armorSpeed.js and wingFlight.js) */
export function isScriptFlying(player) {
  return states.get(player.id)?.active === true;
}

/** neonSonic.js: while the player is phasing through walls (spectator) this module must not touch the player at all
 *  (no landing, no velocity wipe). The flight state stays "active" so the boost keeps growing and the wings keep animating. */
export function setScriptPhasing(player, on) {
  const s = stateOf(player.id);
  s.phase = !!on;
  if (on) { s.tap = 0; s.jumpHeld = true; }
}
export function isScriptPhasing(player) {
  return states.get(player.id)?.phase === true;
}
/** back to survival after a phase: continue flying with the given velocity (no stop, no jerk) */
export function scriptFlightResume(player, vx, vy, vz) {
  const s = stateOf(player.id);
  s.phase = false;
  s.active = true;
  s.vx = vx; s.vy = vy; s.vz = vz;
  s.holdY = undefined;
  s.dashLeft = 0;
  s.tap = 0;
  s.jumpHeld = true; // the jump key may still be held: do not count it as a fresh press
}

function flightMode(player) {
  let m = modes.get(player.id);
  if (m) return m;
  try {
    const r = player.runCommand("ability @s mayfly true");
    // some versions do not throw when the command fails: count the successes too
    m = r && r.successCount > 0 ? "ability" : "script";
  } catch {
    m = "script";
  }
  modes.set(player.id, m);
  return m;
}

function stop(player, s) {
  // flying stopped: drop the slow falling we gave right away
  if (s.slow) { try { player.removeEffect("slow_falling"); } catch { /* ignore */ } s.slow = false; }
  s.active = false;
  s.tap = 0;
  s.vx = s.vy = s.vz = 0;
  s.dashLeft = 0;
  s.holdY = undefined;
  try { player.clearVelocity(); } catch { /* ignore */ }
}

/** call once per tick for each player (armorEffects.js does it right before armorSpeed) */
/** opts (neon chestplate): { launch: sprint launch allowed, forceScript: always use script flight (never vanilla mayfly),
 *  onDoubleTap: function(player) -> speed multiplier; when set, double-tapping jump WHILE FLYING calls it (nitro) instead of landing } */
export function scriptFlight(player, hasChest, flyMult = 1, opts = {}) {
  const s = stateOf(player.id);
  if (s.phase) return; // phasing through walls (neonSonic.js drives the player)

  // soft landing: the slow falling we gave is removed once the feet touch the ground
  if (!s.active && s.slow && player.isOnGround) {
    try { player.removeEffect("slow_falling"); } catch { /* ignore */ }
    s.slow = false;
  }

  let gm = "";
  try { gm = String(player.getGameMode()).toLowerCase(); } catch { /* ignore */ }
  const canFly = hasChest && (gm === "survival" || gm === "adventure" || (gm === "creative" && !!opts.forceScript)); // neon chestplate: script flight (and nitro) in creative too
  let gliding = false;
  let inWater = false;
  try {
    gliding = !!player.isGliding;
    inWater = !!(player.isInWater || player.isSwimming);
  } catch { /* ignore */ }

  if (!canFly || gliding || inWater) {
    if (s.active) stop(player, s);
    s.jumpHeld = false;
    s.tap = 0;
    return;
  }
  if (!opts.forceScript && flightMode(player) !== "script") return; // real mayfly flight works: nothing to do

  let jump = false;
  let sneak = false;
  try { jump = !!player.isJumping; } catch { /* ignore */ }
  try { sneak = !!player.isSneaking; } catch { /* ignore */ }

  // creative + neon chestplate: the player may already be flying with vanilla creative flight -> take that flight over,
  // so a double tap while flying is nitro (like survival) and not just "land"
  if (gm === "creative" && opts.forceScript && !s.active && !player.isOnGround) {
    let vanillaFly = false;
    try { vanillaFly = !!player.isFlying; } catch { /* ignore */ }
    if (vanillaFly) s.active = true;
  }

  let dashMult = 0;
  const fresh = jump && !s.jumpHeld;
  s.jumpHeld = jump;
  if (fresh) {
    if (s.tap > 0) {
      if (s.active) {                                // double tap while flying -> land (neon chestplate: nitro dash instead)
        if (opts.onDoubleTap) {
          // nitro only in FAST flight mode (= holding sprint while flying); otherwise the double tap does nothing
          let sprinting = false;
          try { sprinting = !!player.isSprinting; } catch { /* ignore */ }
          if (!opts.nitroNeedsSprint || sprinting) dashMult = opts.onDoubleTap(player) || 0;
        }
        else stop(player, s);
      }
      else if (!player.isOnGround) s.active = true; // double tap in the air -> fly
      s.tap = 0;
    } else {
      s.tap = DOUBLE_TAP_TICKS;
    }
  } else if (s.tap > 0) {
    s.tap--;
  }

  if (s.active && player.isOnGround) { stop(player, s); return; }
  if (!s.active) return;

  // direction: movement keys relative to the yaw of the camera
  let strafe = 0;
  let ahead = 0;
  try {
    const m = player.inputInfo.getMovementVector();
    strafe = STRAFE_SIGN * (Number(m.x) || 0);
    ahead = Number(m.y) || 0;
  } catch { /* no input info: the sprint launch still moves the player */ }
  const mag = Math.hypot(strafe, ahead);
  if (mag < DEADZONE) { strafe = 0; ahead = 0; }
  const norm = mag > 1 ? 1 / mag : 1;

  let yaw = 0;
  try { yaw = (player.getRotation().y * Math.PI) / 180; } catch { /* ignore */ }
  const fx = -Math.sin(yaw), fz = Math.cos(yaw);   // forward on the ground plane
  const rx = -Math.cos(yaw), rz = -Math.sin(yaw);  // right-hand side

  let tx = (rx * strafe + fx * ahead) * norm * CRUISE * flyMult;
  let tz = (rz * strafe + fz * ahead) * norm * CRUISE * flyMult;
  const normal = CRUISE * flyMult;           // normal horizontal speed right now (includes the full-armor multiplier)
  const climb = normal * CLIMB_RATIO;
  let ty = sneak ? -climb : jump ? climb : 0;

  // sprint launch (full infinity armor): armorSpeed.js skips its own impulse while script flying; the launch is made
  // here instead, as a TARGET velocity along the look direction, so horizontal and vertical behave the same way
  // (before, the horizontal launch was wiped every tick by this function while the vertical one piled up)
  let launching = false;
  try { launching = !!player.isSprinting && (opts.launch || player.hasTag("infinity_armor")); } catch { /* ignore */ }
  if (launching) {
    try {
      const v = player.getViewDirection();
      const vl = Math.hypot(v.x, v.y, v.z) || 1;
      const sp = normal * LAUNCH_MULT;
      tx = (v.x / vl) * sp;
      tz = (v.z / vl) * sp;
      ty = Math.max(-climb, Math.min(climb, (v.y / vl) * sp));
    } catch { /* ignore */ }
  }

  // nitro dash (neon chestplate): instant kick along the look direction, then a short auto-forward so it feels like a racing boost
  if (dashMult > 0) {
    try {
      const v = player.getViewDirection();
      const vl = Math.hypot(v.x, v.y, v.z) || 1;
      const kick = CRUISE * dashMult * DASH_KICK_RATIO;
      s.vx += (v.x / vl) * kick;
      s.vy += (v.y / vl) * kick;
      s.vz += (v.z / vl) * kick;
      s.dashLeft = DASH_TICKS;
    } catch { /* ignore */ }
  }
  if (s.dashLeft > 0) {
    s.dashLeft--;
    if (!launching && strafe === 0 && ahead === 0) {
      try {
        const v = player.getViewDirection();
        const vl = Math.hypot(v.x, v.y, v.z) || 1;
        tx = (v.x / vl) * normal; tz = (v.z / vl) * normal;
        ty = Math.max(-climb, Math.min(climb, (v.y / vl) * normal));
      } catch { /* ignore */ }
    }
  }

  s.vx += (tx - s.vx) * SMOOTHING;
  s.vz += (tz - s.vz) * SMOOTHING;
  s.vy += (ty - s.vy) * SMOOTHING;

  try {
    // no player.json here to switch gravity off, so slow falling keeps the player hovering
    // only (re)apply it when it is missing or about to run out, so the icon never restarts or blinks
    let sf = null;
    try { sf = player.getEffect("slow_falling"); } catch { /* ignore */ }
    if (!sf || sf.duration < 600 || sf.amplifier !== SLOW_FALL_AMP) {
      player.addEffect("slow_falling", SLOW_FALL_TICKS, { amplifier: SLOW_FALL_AMP, showParticles: false });
    }
    s.slow = true;
    // extra hover layer: ONLY when no key is pressed, no launch, and the player is already almost still.
    // clearVelocity() wipes the leftover gravity every tick, so there is no sinking / bobbing and no guessed HOVER_LIFT.
    // Any movement, climb, descend or launch skips this block and runs the normal code below, unchanged.
    if (!launching && ty === 0 && strafe === 0 && ahead === 0) {
      const v = player.getVelocity();
      if (Math.hypot(v.x, v.z) < 0.15 && Math.abs(v.y) < 0.1) {
        if (s.holdY === undefined) s.holdY = player.location.y;
        s.vx = s.vy = s.vz = 0;
        player.clearVelocity();
        const drop = s.holdY - player.location.y;
        if (drop > HOVER_DEADZONE) {
          player.applyImpulse({ x: 0, y: Math.min(HOVER_MAX_FIX, drop * 0.1), z: 0 });
        }
        return;
      }
    }
    const now = player.getVelocity();
    let iy;
    const y = player.location.y;
    if (!launching && ty === 0 && Math.abs(s.vy) < 0.03) {
      // hovering: cancel gravity BEFORE it can pull the player down (a constant push every tick) instead of waiting
      // for the player to sink and then pushing back, which is what made it jerk up and down. The hold height is only
      // a very gentle safety net for slow drift.
      if (s.holdY === undefined) s.holdY = y;
      const sunk = s.holdY - y;
      iy = HOVER_LIFT + (sunk > HOVER_DEADZONE ? Math.min(HOVER_MAX_FIX, (sunk - HOVER_DEADZONE) * 0.1) : 0);
      s.vy = 0;
    } else {
      s.holdY = y; // moving up/down: the hold height follows the player
      iy = s.vy - now.y;
    }
    player.applyImpulse({ x: s.vx - now.x, y: iy, z: s.vz - now.z });
  } catch { /* ignore */ }
}
