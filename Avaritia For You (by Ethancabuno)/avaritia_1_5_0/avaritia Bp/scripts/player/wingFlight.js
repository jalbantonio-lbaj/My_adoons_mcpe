// Sends the "is flying" signal from the script to the wings attachable (chestplate.player.json)
// NO player.json needed: uses Player.playAnimation + stopExpression to assign the
// variable v.bp_avaritia_fly on the player, the attachable reads it back via parent_setup.
import { world, system, EquipmentSlot } from "@minecraft/server";
import { isScriptFlying } from "./scriptFlight.js";

const WING_CHEST_IDS = new Set(["avaritia:infinity_chestplate", "halo:neon_chestplate"]); // both wing chestplates share the same "is flying" signal
const lastSent = new Map(); // player.id -> { v: 0|1, tick: number }
let tickNow = 0;

function sendFly(player, value) {
  const rnd = (Math.random() * 1e6) << 0;
  try {
    player.playAnimation("animation.avaritia.wing_signal", {
      controller: "avaritia_wing_signal_" + rnd,
      stopExpression: `v.bp_avaritia_fly=${value.toFixed(1)}; return 0;`
    });
  } catch (e) {}
}

system.runInterval(() => {
  tickNow += 2;
  for (const player of world.getAllPlayers()) {
    const chest = player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Chest);
    const wearing = !!chest && WING_CHEST_IDS.has(chest.typeId);
    const flying = wearing && (player.isFlying || player.isGliding || isScriptFlying(player));
    const want = flying ? 1 : 0;
    const prev = lastSent.get(player.id);
    // sent when the state changes, or re-sent every ~5 seconds in case the player rejoins/changes dimension
    if (!prev || prev.v !== want || tickNow - prev.tick > 100) {
      sendFly(player, want);
      lastSent.set(player.id, { v: want, tick: tickNow });
    }
  }
}, 2);

world.afterEvents.playerLeave.subscribe((e) => lastSent.delete(e.playerId));
