// NEON HALO CHESTPLATE - flight that keeps getting faster the longer you fly.
//
// How it works (the rest of the flight code is the existing infinity-armor system, reused):
//   - The chestplate gives flight exactly like the infinity chestplate (armorEffects.js / scriptFlight.js).
//   - Its flying speed multiplier starts at NEON_START_MULT, which is HIGHER than the infinity full set
//     (FLY_NORMAL_MULTIPLIER = 2.5 in armorEffects.js), and is then multiplied by a "boost" that only goes up
//     while the player is flying.
//   - The boost has NO upper limit, but the faster it already is, the slower it grows:
//         d(boost)/dt = GROWTH_PER_SECOND / boost^SLOWDOWN_POWER
//     With the defaults (power 2) this gives  boost = (1 + 3 * GROWTH_PER_SECOND * t)^(1/3):
//         x2  after ~30 s    x3  after ~1m50    x5  after ~9 min    x10 after ~71 min    x20 after ~9.5 hours
//     Raise SLOWDOWN_POWER for a slower late game, lower it (min 0 = steady linear growth) for a faster one.
//   - Landing (not flying for GRACE_TICKS) resets the boost to x1 (= the starting speed above).
import { world, system } from "@minecraft/server";
import { isScriptFlying } from "./scriptFlight.js";

export const NEON_CHEST_ID = "halo:neon_chestplate";

export const NEON_START_MULT = 3.5;   // starting flight speed multiplier (infinity full set = 2.5)
// (the sprint-launch strength vs the infinity armor, NEON_SPRINT_RATIO, is set in armorSpeed.js)
const GROWTH_PER_SECOND = 0.078;      // base acceleration (boost units per second at boost = 1)
const SLOWDOWN_POWER = 2;             // how strongly a higher speed slows the acceleration (see formula above)
const GRACE_TICKS = 20;               // 1 second not flying before the boost resets (so a quick landing blip is forgiven)
const SHOW_ACTIONBAR = true;          // show the current speed above the hotbar while flying
// NITRO (double-tap jump while flying): each double tap adds a burst on top of the boost; it fades out over a few seconds.
// Tapping again before it fades STACKS (and each tap in a quick chain adds a bit more), so more taps = more speed.
const NITRO_PER_TAP = 0.6;           // each double tap adds this much to the speed multiplier (x1 + nitro)
const NITRO_CHAIN_BONUS = 0.25;      // every tap in a quick chain adds this much more than the previous one
const NITRO_CHAIN_TICKS = 30;        // taps closer together than this (1.5 s) count as one chain
const NITRO_DECAY = 0.98;            // per tick; 0.98 = half of the nitro is gone after ~1.7 s
export const NITRO_NEEDS_SPRINT = true; // nitro (double-tap jump) only works in FAST flight = while holding sprint. false = nitro works in any flight
const MAX_NITRO = Infinity;          // "more taps = more speed" without limit; set a number to cap it
const MAX_BOOST = Infinity;           // "unlimited". Set a number (e.g. 30) if very high speeds make the game rubber-band

const states = new Map(); // player.id -> { boost, idle, nitro, chain, lastDash }

world.afterEvents.playerLeave.subscribe((ev) => states.delete(ev.playerId));

function stateOf(id) {
  let s = states.get(id);
  if (!s) { s = { boost: 1, idle: 0, nitro: 0, chain: 0, lastDash: -9999 }; states.set(id, s); }
  return s;
}

/** current boost (>= 1) of the player; 1 when not wearing the chestplate */
export function neonBoost(player) {
  return states.get(player.id)?.boost ?? 1;
}

/** call once per tick while the neon chestplate is worn. Returns the flying speed multiplier to apply right now. */
export function neonTick(player) {
  const s = stateOf(player.id);
  let flying = false;
  try { flying = !!player.isFlying; } catch { /* ignore */ }
  if (!flying && isScriptFlying(player)) flying = true;

  s.nitro = s.nitro > 0.01 ? s.nitro * NITRO_DECAY : 0;
  if (flying) {
    s.idle = 0;
    s.boost += (GROWTH_PER_SECOND / 20) / Math.pow(s.boost, SLOWDOWN_POWER);
    if (s.boost > MAX_BOOST) s.boost = MAX_BOOST;
  } else if (++s.idle > GRACE_TICKS) {
    s.boost = 1;
    s.nitro = 0;
  }

  if (flying && SHOW_ACTIONBAR && system.currentTick % 10 === 0) {
    try {
      const nitroTxt = s.nitro > 0.05 ? ` §6NITRO +${Math.round(s.nitro * 100)}%` : "";
      player.onScreenDisplay.setActionBar(`§bNeon Halo §7| Flight speed: §fx${(NEON_START_MULT * s.boost * (1 + s.nitro)).toFixed(2)}${nitroTxt}`);
    } catch { /* ignore */ }
  }
  return NEON_START_MULT * s.boost * (1 + s.nitro);
}

/** called by scriptFlight.js when the player double-taps jump while flying with the neon chestplate.
 *  Adds a (stacking) nitro burst and returns the new total speed multiplier, used for the instant kick. */
export function neonDash(player) {
  const s = stateOf(player.id);
  const now = system.currentTick;
  s.chain = now - s.lastDash <= NITRO_CHAIN_TICKS ? s.chain + 1 : 1;
  s.lastDash = now;
  s.nitro = Math.min(MAX_NITRO, s.nitro + NITRO_PER_TAP * (1 + NITRO_CHAIN_BONUS * (s.chain - 1)));
  return NEON_START_MULT * s.boost * (1 + s.nitro);
}

/** call when the chestplate is not worn (clears the stored boost) */
export function neonReset(player) {
  if (states.has(player.id)) states.delete(player.id);
}
