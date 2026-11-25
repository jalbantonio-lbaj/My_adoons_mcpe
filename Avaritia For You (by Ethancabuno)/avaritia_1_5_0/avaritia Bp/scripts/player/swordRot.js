// Sends the player's screen rotation (yaw + pitch) to the infinity sword attachable,
// so the first-person texture scrolling effect follows the screen rotation.
// Uses the same approach as the wings: Player.playAnimation + stopExpression assigning v.bp_avaritia_rot.
import { world, system } from "@minecraft/server";

const SWORD_ID = "avaritia:infinity_sword";
const last = new Map(); // player.id -> last value sent

function send(player, value, yaw, pitch) {
  const rnd = (Math.random() * 1e6) << 0;
  try {
    player.playAnimation("animation.avaritia.wing_signal", {
      controller: "avaritia_sword_rot_" + rnd,
      stopExpression: `v.bp_avaritia_rot=${value}; v.bp_sw_yaw=${yaw}; v.bp_sw_pitch=${pitch}; return 0;`
    });
  } catch (e) {}
}

system.runInterval(() => {
  for (const player of world.getAllPlayers()) {
    const inv = player.getComponent("inventory")?.container;
    const held = inv?.getItem(player.selectedSlotIndex);
    if (held?.typeId !== SWORD_ID) { last.delete(player.id); continue; }
    const r = player.getRotation();
    const value = Math.round((r.y + r.x) * 2) / 2; // 0.5 degree step
    const yaw = Math.round(r.y * 4) / 4;           // 0.25 degree step
    const pitch = Math.round(r.x * 4) / 4;
    const key = yaw + "|" + pitch;
    if (last.get(player.id) === key) continue;
    last.set(player.id, key);
    send(player, value, yaw, pitch);
  }
}, 1);

world.afterEvents.playerLeave.subscribe((e) => last.delete(e.playerId));
