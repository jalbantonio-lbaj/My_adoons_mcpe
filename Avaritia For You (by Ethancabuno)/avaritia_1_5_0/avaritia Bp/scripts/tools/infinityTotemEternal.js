import { world, system, EntityComponentTypes, EquipmentSlot } from "@minecraft/server";

/**
 * Totem of Eternal Rebirth (avaritia:infinity_totem)
 * Logic ported from the Totem Forge totem (no attachable, no player.json):
 *  - lethal damage is cancelled in world.beforeEvents.entityHurt, then the totem pops
 *    (revive health, effects, sound, particles, on-screen pop animation, chat message)
 *  - main hand or off-hand both work, off-hand wins
 *  - right-click with the totem in the main hand swaps it into the off-hand (fast equip)
 *  - 8-tick protection after a pop so one hit chain cannot trigger it twice
 * Unlike the vanilla totem, this one is NOT consumed (CONSUME = false).
 */

const TOTEM_ID = "avaritia:infinity_totem";
const DISPLAY_NAME = "Totem of Eternal Rebirth";
const POP_CODE = '__tf_pop__:["avaritia_eternal","pop_1"]'; // must match $flag in ui/hud_screen.json
const POP_DURATION_MS = 2340; // must match the pop flipbook length
const POP_COOLDOWN_TICKS = 8;
const REVIVE_HEALTH = 4;
const REGEN_TICKS = 900;
const ABSORPTION_TICKS = 100;
const FIRE_RES_TICKS = 800;
const CONSUME = false; // set true to behave like a normal one-use totem
const CHAT_ENABLED = true;
const CHAT_TEMPLATE = "{player} used a {totem}";
const FAST_EQUIP = true;

const cooldowns = new Map();
const lastSwapTick = new Map();

const key = (p) => p.id ?? p.name;
const onCooldown = (p) => system.currentTick < (cooldowns.get(key(p)) ?? 0);
const armCooldown = (p) => cooldowns.set(key(p), system.currentTick + POP_COOLDOWN_TICKS);

// ---------- fast equip (main hand -> off-hand on use) ----------
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (!FAST_EQUIP) return;
  if (player?.typeId !== "minecraft:player" || itemStack?.typeId !== TOTEM_ID) return;
  if (onCooldown(player)) return;
  const k = key(player);
  if (system.currentTick - (lastSwapTick.get(k) ?? -Infinity) < 4) return;
  try {
    const eq = player.getComponent(EntityComponentTypes.Equippable);
    if (!eq) return;
    const main = eq.getEquipment(EquipmentSlot.Mainhand);
    const off = eq.getEquipment(EquipmentSlot.Offhand);
    if (!main || main.typeId !== TOTEM_ID) return;
    if (eq.setEquipment(EquipmentSlot.Mainhand, off) === false) return;
    try {
      if (eq.setEquipment(EquipmentSlot.Offhand, main) === false) {
        eq.setEquipment(EquipmentSlot.Mainhand, main);
        return;
      }
    } catch (error) {
      eq.setEquipment(EquipmentSlot.Mainhand, main);
      throw error;
    }
    lastSwapTick.set(k, system.currentTick);
  } catch (error) {
    console.warn("[Eternal Totem] fast equip failed: " + error);
  }
});

// ---------- totem lookup ----------
function findTotem(player) {
  try {
    const eq = player.getComponent(EntityComponentTypes.Equippable);
    if (!eq) return null;
    for (const slot of [EquipmentSlot.Offhand, EquipmentSlot.Mainhand]) {
      const stack = eq.getEquipment(slot);
      if (stack?.typeId === TOTEM_ID) return { eq, slot, stack };
    }
  } catch {
    // ignore
  }
  return null;
}

function consumeEquipped(found) {
  if (!CONSUME) return;
  const stack = found.stack;
  if (!stack || (stack.amount ?? 1) <= 1) {
    found.eq.setEquipment(found.slot);
    return;
  }
  const clone = stack.clone();
  clone.amount = (clone.amount ?? 1) - 1;
  found.eq.setEquipment(found.slot, clone);
}

function playParticles(player) {
  const loc = player.location;
  const x = Number(loc.x).toFixed(2);
  const y = Number(loc.y + 1).toFixed(2);
  const z = Number(loc.z).toFixed(2);
  for (let i = 0; i < 4; i++) {
    system.runTimeout(() => {
      try { player.dimension.runCommand("particle minecraft:totem_particle " + x + " " + y + " " + z); } catch { /* ignore */ }
    }, i);
  }
}

function activate(player, expectedSlot) {
  try {
    const found = findTotem(player);
    // re-read on the writable tick; never touch a different item if equipment changed
    if (!found || found.slot !== expectedSlot) return;

    consumeEquipped(found);
    const hp = player.getComponent(EntityComponentTypes.Health);
    if (hp) hp.setCurrentValue(Math.min(hp.effectiveMax, Math.max(1, REVIVE_HEALTH)));

    if (REGEN_TICKS > 0) player.addEffect("regeneration", REGEN_TICKS, { amplifier: 1, showParticles: true });
    if (ABSORPTION_TICKS > 0) player.addEffect("absorption", ABSORPTION_TICKS, { amplifier: 1, showParticles: true });
    if (FIRE_RES_TICKS > 0) player.addEffect("fire_resistance", FIRE_RES_TICKS, { amplifier: 0, showParticles: true });

    player.onScreenDisplay.setTitle(POP_CODE, {
      fadeInDuration: 0,
      stayDuration: Math.max(1, Math.ceil(POP_DURATION_MS / 50)),
      fadeOutDuration: 0,
    });
    try { player.dimension.playSound("random.totem", player.location); } catch { /* ignore */ }
    playParticles(player);

    if (CHAT_ENABLED) {
      const msg = CHAT_TEMPLATE.replace(/{player}/g, player.name).replace(/{totem}/g, DISPLAY_NAME);
      try { world.sendMessage(msg); } catch { /* ignore */ }
    }
  } catch (e) {
    console.warn("[Eternal Totem] activation failed: " + e);
  }
}

// ---------- cancel lethal damage ----------
world.beforeEvents.entityHurt.subscribe((event) => {
  try {
    const player = event.hurtEntity;
    if (player?.typeId !== "minecraft:player") return;
    if (onCooldown(player)) {
      event.cancel = true;
      return;
    }
    const found = findTotem(player);
    if (!found) return;
    const health = player.getComponent(EntityComponentTypes.Health);
    const damage = Number(event.damage);
    if (!health || !Number.isFinite(damage) || damage < health.currentValue) return;
    event.cancel = true;
    armCooldown(player);
    const slot = found.slot;
    system.run(() => activate(player, slot));
  } catch (e) {
    console.warn("[Eternal Totem] hurt handler failed: " + e);
  }
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => {
  cooldowns.delete(playerId);
  lastSwapTick.delete(playerId);
});
