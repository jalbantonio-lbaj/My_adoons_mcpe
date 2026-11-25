import * as MC from "@minecraft/server";
import { armorSpeed } from "./armorSpeed.js";
import { scriptFlight } from "./scriptFlight.js";
import { NEON_CHEST_ID, neonTick, neonReset, neonBoost, neonDash, NITRO_NEEDS_SPRINT } from "./neonFlight.js";
import { neonSonicTick } from "./neonSonic.js";

// NOTE: the current API version (@minecraft/server 2.x) no longer has "world.afterEvents.worldInitialize"
// and also no longer needs dynamic properties pre-registered via propertyRegistry.registerString() -
// setDynamicProperty()/getDynamicProperty() can be used directly. The old subscribe code called an event
// that does not exist -> threw a TypeError as soon as this file was imported -> CRASHING the entire script pack
// (every other handler in main.js/blockEvents.js/etc. could not register because the same module
// graph crashed). That code has been removed, the rest of the file does not depend on it.
//
// FIX (log 2026-08-31): "@minecraft/server" >= 2.0.0 REMOVED runCommandAsync() entirely (on both
// Entity and Dimension), leaving only the synchronous runCommand() -> every runCommandAsync() call in this file
// (and other script files) threw "TypeError: not a function" continuously every tick because
// armorEffects() runs in system.runInterval(..., 1). All switched to runCommand().
//
// FIX: the old line "if (player.isFlying) player.triggerEvent('is_flying')" called an entity event
// named "is_flying" but there is NO player.json/component in the pack defining that event
// (only a scoreboard objective with the same name, unrelated) -> triggerEvent with a nonexistent
// event also threw "TypeError: not a function" every time a player flew while wearing the infinity chestplate.
// That line was removed because it had no real effect.
//
// NEW: uses world.beforeEvents.entityHurt to FULLY CANCEL damage (ev.cancel = true) before
// the engine computes it, for players wearing all 4 infinity armor pieces (tag "infinity_armor").
// This differs from the old way (only adding the "immortal" tag + healing/effects) - the old way did not
// truly block damage, it only "compensated" after health was already deducted. beforeEvents runs earlier so it avoids
// everything completely, including knockback/side effects that come with that damage.
//
// MOVED FROM player.json: the original "infinity_boots" disabled fall damage via damage_sensor (cause: fall,
// deals_damage: false). No field lets a script disable fall damage directly -> uses
// this same handler, only cancelling fall damage when the "infinity_boots" tag is present.
MC.world.beforeEvents.entityHurt.subscribe((ev) => {
  const target = ev.hurtEntity;
  if (target?.typeId !== "minecraft:player") return;
  if (target.hasTag("infinity_armor")) {
    ev.cancel = true;
    return;
  }
  if (target.hasTag("infinity_boots") && ev.damageSource?.cause === "fall") {
    ev.cancel = true;
  }
});

// MOVED FROM player.json: the original "infinity_leggings" set knockback_resistance = 500000000 (nearly
// immune to knockback). "minecraft:knockback_resistance" is NOT in the
// EntityComponentTypes of the current Script API (it exists only on the JSON side, getComponent is not exposed) so
// it cannot be "set" directly like health/movement. Replacement solution: right after the player
// takes damage (afterEvents.entityHurt runs AFTER the engine applied the knockback force), if wearing
// infinity_leggings then clearVelocity() to cancel the velocity just applied - nearly equivalent in effect.
MC.world.afterEvents.entityHurt.subscribe((ev) => {
  const target = ev.hurtEntity;
  if (target?.typeId === "minecraft:player" && target.hasTag("infinity_leggings")) {
    try {
      target.clearVelocity();
    } catch (e) {
      console.warn(`[avaritia] clearVelocity error: ${e}`);
    }
  }
});

// runCommand() is now synchronous and CAN throw errors (e.g. world has cheats off) - unlike the old
// runCommandAsync() (errors fell into the promise, not blocking the code after it). Wrapped so that 1 failing
// command does not stop the rest of the tag/effect assignment in armorEffects().
function safeRunCommand(entity, cmd) {
  try {
    entity.runCommand(cmd);
  } catch (e) {
    console.warn(`[avaritia] runCommand error ("${cmd}"): ${e}`);
  }
}

// Harmful effects wiped EVERY TICK (0-tick delay) while wearing the FULL infinity set.
const HARMFUL_EFFECTS = [
  "poison", "fatal_poison", "wither", "hunger", "blindness", "mining_fatigue", "bad_omen", "slowness",
  "weakness", "levitation", "nausea", "darkness", "infested", "oozing", "weaving", "wind_charged",
  "raid_omen", "trial_omen",
];
// The helmet alone makes you immune to these (also wiped every tick).
const HELMET_IMMUNE_EFFECTS = ["blindness", "darkness"];
function stripEffects(player, list) {
  for (const id of list) {
    try {
      if (player.getEffect(id)) player.removeEffect(id);
    } catch (e) {
      // unknown effect id on this game version / player is leaving: ignore
    }
  }
}

// WINGS + HEALTH LOCK - NO LONGER USES entities/player.json (the minecraft:player override file was deleted).
//   - Wings: the RP side computes "in the air" itself via Molang (query.is_on_ground + time since leaving the ground, see
//     attachables/avaritia/armor/player_render/chestplate.player.json) -> no script/event needed.
//   - Health lock with the full set: damage is already fully cancelled in beforeEvents.entityHurt above (tag infinity_armor),
//     the function below only restores full health every tick to be safe (e.g. health deducted by sources that do not go through entityHurt).
function updateFullSetMarker(player, hasFullSet) {
  if (!hasFullSet) return;
  try {
    const health = player.getComponent("minecraft:health");
    if (health && health.currentValue < health.effectiveMax) health.resetToMaxValue();
  } catch (e) {
    // player just left / is dying
  }
}

// OPTIMIZATION: armorEffects() is called again every tick for every player (see main.js), and previously
// EVERY addEffect()/removeEffect() command (helmet: 2, boots: 2, chest: 11 removeEffect, full set: 2
// -> up to 17 commands/tick/player) ran identically every tick even though the equipment had not changed at all. Since
// EFFECT_DURATION is already 12000 ticks (10 minutes, see the comment below) there is no need to add
// again every tick - only re-add periodically (early enough to never expire even with lag/dropped ticks) OR
// as soon as the armor set just changed (some piece put on/taken off). Reduces ~17 commands/tick to ~17 commands every
// EFFECT_REFRESH_INTERVAL ticks -> sharply cuts the work the script does each tick, avoiding accumulated
// delay when the network lags (many add/removeEffect commands queued at once make dropped ticks more likely).
const EFFECT_REFRESH_INTERVAL = 200; // 10 seconds - short enough compared to EFFECT_DURATION (12000 ticks) to
// always refresh before the original effect can expire, even with lag/dozens of dropped ticks in a row.
const prevEquipState = new Map(); // playerId -> "1010" (helmet/chest/legs/boots)
const nextEffectRefreshTick = new Map(); // playerId -> next tick at which add/removeEffect is allowed again

function equipStateKey(hasHelmet, hasChest, hasLegs, hasBoots) {
  return (hasHelmet ? "1" : "0") + (hasChest ? "1" : "0") + (hasLegs ? "1" : "0") + (hasBoots ? "1" : "0");
}

// true if: (a) the equipment just changed (any infinity piece put on/taken off) -> must apply IMMEDIATELY, do not
// wait for the interval, or (b) the periodic refresh is due.
function isEffectRefreshDue(player, equipKey) {
  const changed = prevEquipState.get(player.id) !== equipKey;
  const due = (nextEffectRefreshTick.get(player.id) ?? 0) <= MC.system.currentTick;
  return changed || due;
}
function markEffectRefreshed(player, equipKey) {
  prevEquipState.set(player.id, equipKey);
  nextEffectRefreshTick.set(player.id, MC.system.currentTick + EFFECT_REFRESH_INTERVAL);
}

// --- Hide the health / hunger / armor / air bars when wearing ALL 4 Infinity pieces (like the Divine Sword) ---
// Uses the official API player.onScreenDisplay.setHudVisibility (does not touch the JSON UI);
// if the game version lacks this API, falls back to the /hud command. Only called when the state changes
// + repeated every 20 ticks so the HUD does not reappear after death/respawn/dimension change.
const hudHidden = new Map(); // player.id -> true while the HUD is hidden by the armor
const HUD_REAPPLY_TICKS = 20;
function setArmorHud(player, hide) {
  try {
    const sd = player.onScreenDisplay;
    const E = MC.HudElement, V = MC.HudVisibility;
    if (sd && typeof sd.setHudVisibility === "function" && E && V) {
      sd.setHudVisibility(hide ? V.Hide : V.Reset, [E.Health, E.Hunger, E.Armor, E.AirBubbles]);
      return;
    }
  } catch (e) {}
  const verb = hide ? "hide" : "reset";
  for (const el of ["health", "hunger", "armor", "air_bubbles"]) {
    try { player.runCommand(`hud @s ${verb} ${el}`); } catch (e) {}
  }
}
function updateArmorHud(player, hasFullSet) {
  const was = hudHidden.get(player.id) === true;
  if (hasFullSet) {
    if (!was || MC.system.currentTick % HUD_REAPPLY_TICKS === 0) {
      setArmorHud(player, true);
      hudHidden.set(player.id, true);
    }
  } else if (was) {
    setArmorHud(player, false);
    hudHidden.delete(player.id);
  }
}
MC.world.afterEvents.playerLeave.subscribe((ev) => hudHidden.delete(ev.playerId));

export function armorEffects(player) {
  const equipment = player.getComponent("minecraft:equippable");
  if (!equipment) return;


  const hasHelmet = equipment.getEquipment(MC.EquipmentSlot.Head)?.typeId == "avaritia:infinity_helmet";
  const hasChest = equipment.getEquipment(MC.EquipmentSlot.Chest)?.typeId == "avaritia:infinity_chestplate";
  const hasLegs = equipment.getEquipment(MC.EquipmentSlot.Legs)?.typeId == "avaritia:infinity_leggings";
  const hasBoots = equipment.getEquipment(MC.EquipmentSlot.Feet)?.typeId == "avaritia:infinity_boots";
  // Neon Halo chestplate (halo:neon_chestplate): flight that gets faster the longer you fly (neonFlight.js)
  const hasNeonChest = equipment.getEquipment(MC.EquipmentSlot.Chest)?.typeId == NEON_CHEST_ID;
  const gm = player.getGameMode();
  const equipKey = equipStateKey(hasHelmet, hasChest, hasLegs, hasBoots);
  const effectRefreshDue = isEffectRefreshDue(player, equipKey);

  // A piece was just taken off -> remove the effect it granted (the effects last 10 minutes otherwise).
  const prevKey = prevEquipState.get(player.id);
  if (prevKey && prevKey !== equipKey) {
    if (prevKey[0] === "1" && !hasHelmet) stripEffects(player, ["night_vision", "water_breathing"]);
    if (prevKey[2] === "1" && !hasLegs) stripEffects(player, ["jump_boost"]);
    if (prevKey[3] === "1" && !hasBoots) stripEffects(player, ["speed"]);
    if (prevKey === "1111") stripEffects(player, ["saturation", "fire_resistance"]);
  }

  let dataRaw = player.getDynamicProperty("data.avaritiaArmor");
  let data = {};
  try {
    data = dataRaw ? JSON.parse(dataRaw) : {};
  } catch {
    data = {};
  }
  if (typeof data.fly != "boolean") data.fly = false;
  if (typeof data.resetSurv != "boolean") data.resetSurv = false;
  if (typeof data.resetAdv != "boolean") data.resetAdv = false;

  // NOTE: the "/ability" command (mayfly) is only recognized by the engine when the world has the experimental toggle
  // "Minecraft Education features" enabled - a limit of Bedrock itself, not an addon bug. If it is off,
  // the "ability @s mayfly ..." commands below will report syntax errors (edge-triggered so it only reports on
  // state change, not every tick). To really fly in Survival/Adventure that toggle must be turned on.
  if (gm == "creative") {
    if (!player.hasTag("avaritia.flyTrue")) {
      safeRunCommand(player, "ability @s mayfly true");
      player.addTag("avaritia.flyTrue");
    }
  } else if ((gm == "survival" || gm == "adventure") && player.hasTag("avaritia.flyTrue")) {
    safeRunCommand(player, "ability @s mayfly false");
    player.removeTag("avaritia.flyTrue");
  }
  // FIX (effect flickering off during lag): addEffect() takes duration in TICKS (20 ticks = 1 second), previously
  // "5" was set = 0.25 seconds - armorEffects() refreshes every tick so normally it was fine, but whenever
  // lag/1 dropped tick happened the effect expired before it could be re-granted -> the icon flickered off then came back. Changed
  // to 10 minutes (12000 ticks) as a wide buffer, still refreshing every tick as before so no other
  // behavior changes, it just tolerates lag/skipped ticks without losing the effect midway.
  const EFFECT_DURATION = 12000; // 10 minutes
  // HELMET: night vision (see in the dark) + immune to Blindness and Darkness (wiped every tick).
  if (hasHelmet) {
    stripEffects(player, HELMET_IMMUNE_EFFECTS);
    if (effectRefreshDue) {
      player.addEffect("water_breathing", EFFECT_DURATION, { amplifier: 9, showParticles: false });
      player.addEffect("night_vision", EFFECT_DURATION, { amplifier: 0, showParticles: false });
    }
  }
  // NEW: high jump + fast running when wearing infinity_boots. amplifier starts at 0
  // so "level 5 effect" (Jump Boost V / Speed V in game) = amplifier: 4. If you
  // meant the raw amplifier number = 5 (displayed as "...VI"), change 4 -> 5 on the 2 lines below.
  // BOOTS: fast running (Speed V).   LEGGINGS: high jump (Jump Boost V).
  if (hasBoots && effectRefreshDue) {
    player.addEffect("speed", EFFECT_DURATION, { amplifier: 4, showParticles: false });
  }
  if (hasLegs && effectRefreshDue) {
    player.addEffect("jump_boost", EFFECT_DURATION, { amplifier: 4, showParticles: false });
  }
  if (hasChest) {
    // CHESTPLATE: clears the bad effects as before (every refresh interval; the full set clears them every tick).
    if (effectRefreshDue) {
      player.removeEffect("poison");
      player.removeEffect("fatal_poison");
      player.removeEffect("wither");
      player.removeEffect("hunger");
      player.removeEffect("blindness");
      player.removeEffect("mining_fatigue");
      player.removeEffect("bad_omen");
      player.removeEffect("slowness");
      player.removeEffect("weakness");
      player.removeEffect("levitation");
      player.removeEffect("nausea");
      player.removeEffect("darkness");
    }
    if (!data.fly) safeRunCommand(player, "ability @s mayfly true");
    data.fly = true;
  } else if (data.fly) {
    data.fly = false;
    safeRunCommand(player, "ability @s mayfly false");

    if (gm == "survival") {
      data.resetSurv = true;
      safeRunCommand(player, "gamemode adventure @s");
    } else if (gm == "adventure") {
      data.resetAdv = true;
      safeRunCommand(player, "gamemode survival @s");
    }
  }
  if (data.resetSurv && gm == "adventure") {
    safeRunCommand(player, "gamemode survival @s");
    data.resetSurv = false;
  }
  if (data.resetAdv && gm == "survival") {
    safeRunCommand(player, "gamemode adventure @s");
    data.resetAdv = false;
  }
  player.setDynamicProperty("data.avaritiaArmor", JSON.stringify(data));

  const hasFullSet = hasHelmet && hasChest && hasLegs && hasBoots;
  // FULL SET: every harmful effect is removed instantly, every tick (0-tick delay).
  if (hasFullSet) stripEffects(player, HARMFUL_EFFECTS);
  if (hasFullSet) player.addTag("infinity_armor");
  if (player.hasTag("infinity_armor")) {
    player.addTag("immortal");
    if (effectRefreshDue) {
      player.addEffect("saturation", EFFECT_DURATION, { amplifier: 0, showParticles: false });
      player.addEffect("fire_resistance", EFFECT_DURATION, { amplifier: 5, showParticles: false });
    }
    if (!hasFullSet) {
      player.removeTag("infinity_armor");
      player.removeTag("immortal");
    }
  }
  // Health lock with the full set (does not use player.json): see updateFullSetMarker above.
  updateFullSetMarker(player, hasFullSet);
  updateArmorHud(player, hasFullSet);

  // MOVED FROM player.json: tag "infinity_leggings" (knockback resistance - handled in
  // afterEvents.entityHurt above) and "infinity_boots" (fall damage immunity - handled in
  // beforeEvents.entityHurt above). Only needs to toggle the tag on/off according to the current equipment each tick.
  if (hasLegs) player.addTag("infinity_leggings");
  else player.removeTag("infinity_leggings");

  if (hasBoots) player.addTag("infinity_boots");
  else player.removeTag("infinity_boots");

  // NEW: normal flying (without holding the sprint button) is faster when wearing the FULL infinity armor.
  // Uses the "minecraft:flying_speed" attribute directly (unlike the removed block below - that block
  // set an arbitrary FIXED number, while this one TAKES the engine's original defaultValue and multiplies it so
  // it is always proportionally correct even if the engine changes the default). "Holding the sprint button" (sprint) does NOT
  // touch this attribute - that part is handled separately by armorSpeed.js (extra impulse,
  // see details in that file).
  // Increased from 1.5 (+50%) to 2.5 (+150%) on request "increase it even more". To make it faster/slower
  // edit the number 2.5 on the line below directly.
  const FLY_NORMAL_MULTIPLIER = 2.5;
  // Neon Halo chestplate: starts at NEON_START_MULT (> 2.5) and keeps growing while flying (neonFlight.js)
  let neonMult = 0;
  if (hasNeonChest) neonMult = neonTick(player); else neonReset(player);
  const flyingSpeedAttr = player.getComponent("minecraft:flying_speed");
  if (flyingSpeedAttr) {
    try {
      if (hasFullSet) {
        const base = flyingSpeedAttr.defaultValue ?? 0.05;
        flyingSpeedAttr.setCurrentValue(base * FLY_NORMAL_MULTIPLIER);
      } else {
        flyingSpeedAttr.resetToDefaultValue();
      }
    } catch (e) {
      console.warn(`[avaritia] set flying_speed error: ${e}`);
    }
  }

  // NOTE: minecraft:movement/underwater_movement/lava_movement (walking/swimming/lava wading)
  // are NO LONGER set directly here - "walking faster normally" now comes from the
  // Speed V effect (see the hasBoots block above), and "holding the sprint button" (sprint) is handled by armorSpeed.js
  // separately via impulse. Only minecraft:flying_speed is still touched (the block right
  // above) because that is the only way to get a smooth, jitter-free "normal flight +50%" feel.
  if (effectRefreshDue) markEffectRefreshed(player, equipKey);

  scriptFlight(player, hasChest || hasNeonChest, hasFullSet ? FLY_NORMAL_MULTIPLIER : (neonMult > 0 ? neonMult : 1), { launch: hasNeonChest, forceScript: hasNeonChest, nitroNeedsSprint: NITRO_NEEDS_SPRINT, onDoubleTap: hasNeonChest ? neonDash : null }); // double-tap-jump flight when "ability mayfly" is unavailable. Neon chestplate: ALWAYS script flight (double tap in flight = nitro, not landing)
  armorSpeed(player, hasNeonChest && !hasFullSet ? neonBoost(player) : 0);
  // Neon Halo chestplate: vapor cone / shock collar at high speed, phase through walls when faster still (neonSonic.js)
  neonSonicTick(player, hasNeonChest);
};