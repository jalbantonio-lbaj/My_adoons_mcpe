// Same trick as the "Weapons Add-On": while a custom tool is in the main hand in FIRST PERSON, the vanilla
// right-arm swing is pinned with animation.avaritia_wp.vanilla_revert, so the only swing you see is the
// item's own animation (fpp / fpp_attack in the attachable). It does NOT touch player.entity.json.
//
// Two /playanimation commands share one controller name and flip between "none" <-> "vanilla_revert"
// by themselves (stop expressions), so they only have to be started once per spawn.
// If another addon sets v.actions_and_stuff (ANS player animation) this backs off and lets that addon do the arm.
import { world, system } from "@minecraft/server";

const TOOLS = ["infinity_axe", "infinity_hammer", "infinity_hoe", "infinity_mace", "infinity_pickaxe",
  "infinity_scythe", "infinity_shovel", "skullfire_sword"];
const HOLDING = `q.is_item_name_any('slot.weapon.mainhand', 0, ${TOOLS.map((n) => `'avaritia:${n}'`).join(", ")})`;
const CTRL = "ctrl.avaritia_wp.vanilla_revert";
const REVERT = "animation.avaritia_wp.vanilla_revert";
const NONE = "animation.avaritia_wp.none";

const pending = new Set();   // players that still need the controller started
const holdingTool = new Map(); // player id -> was holding a tool on the previous check

function start(player) {
  try {
    player.runCommand(`playanimation @s ${REVERT} ${NONE} 0.0 "(v.actions_and_stuff ?? 0) || !v.is_first_person || !${HOLDING}" ${CTRL}`);
    player.runCommand(`playanimation @s ${NONE} ${REVERT} 0.0 "!(v.actions_and_stuff ?? 0) && v.is_first_person && ${HOLDING}" ${CTRL}`);
    return true;
  } catch {
    return false;
  }
}

try {
  world.afterEvents.playerSpawn.subscribe((e) => pending.add(e.player.id));
} catch { /* ignore */ }
world.afterEvents.playerLeave.subscribe((e) => pending.delete(e.playerId));

// Start it once the player is really in the world (same wait as the original addon: after the first movement).
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    if (!pending.has(player.id)) continue;
    const v = player.getVelocity();
    if (player.isSprinting || player.isSneaking || player.isJumping || v.x !== 0 || v.y !== 0 || v.z !== 0) {
      if (start(player)) pending.delete(player.id);
    }
  }
}, 10);

// Players already online when the pack loads
system.runTimeout(() => { for (const p of world.getAllPlayers()) pending.add(p.id); }, 40);

// Standing still after joining: the controller above may not be running yet (it waits for the first movement).
// So every time a tool is picked up (switched to), start it again. Same controller name = it simply replaces itself.
const TOOL_IDS = new Set(TOOLS.map((n) => `avaritia:${n}`));
system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    let now = false;
    try {
      const inv = player.getComponent("inventory")?.container;
      now = TOOL_IDS.has(inv?.getItem(player.selectedSlotIndex)?.typeId ?? "");
    } catch { now = false; }
    const before = holdingTool.get(player.id) ?? false;
    holdingTool.set(player.id, now);
    if (now && !before) {
      start(player);
      system.runTimeout(() => { if (player.isValid) start(player); }, 10); // second push a moment later, in case the first one was too early
    }
  }
}, 2);
world.afterEvents.playerLeave.subscribe((e) => holdingTool.delete(e.playerId));
