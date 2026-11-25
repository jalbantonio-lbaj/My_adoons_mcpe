import * as MC from "@minecraft/server";

// Native "minecraft:food" is not used for cosmic_meatballs / ultimate_stew
// (they are block_placer items so the slot icon can be animated).
// This replicates eating manually: instant hunger/saturation
// top-off (approximating the original absurdly high nutrition values, which
// were meant to fill hunger completely) + item consumption + sound, then the
// existing bonus buffs.

MC.world.afterEvents.itemUse.subscribe((event) => {
  const player = event.source;
  const item = event.itemStack;
  if (!(player instanceof MC.Player)) return;

  const id = item.typeId;
  if (id !== "avaritia:ultimate_stew" && id !== "avaritia:cosmic_meatballs") return;

  // Instant "full hunger" approximation (original nutrition values were
  // 1000 / 100 - both far beyond the 20-point hunger cap, i.e. "always fill
  // completely"). A short, high-amplifier saturation burst tops off both
  // hunger and saturation almost immediately.
  player.addEffect("saturation", 20, { amplifier: 20, showParticles: false });

  // Eating sound/feedback (no native "eat" animation without
  // minecraft:use_animation, so this is the only chew/consume feedback).
  player.playSound("random.eat", { location: player.location });

  if (id === "avaritia:ultimate_stew") {
    player.addEffect("regeneration", 9600, { amplifier: 2 });
    player.addEffect("resistance", 9600, { amplifier: 1 });
    player.addEffect("saturation", 12000, { amplifier: 2 });
    player.addEffect("absorption", 2400, { amplifier: 4 });
  }
  if (id === "avaritia:cosmic_meatballs") {
    player.addEffect("resistance", 2400, { amplifier: 1 });
    player.addEffect("strength", 2400, { amplifier: 3 });
    player.addEffect("speed", 1200, { amplifier: 2 });
    player.addEffect("haste", 1200, { amplifier: 2 });
  }

  // Consume 1 from the stack (native minecraft:food normally does this).
  MC.system.run(() => {
    const inv = player.getComponent("minecraft:inventory");
    if (!inv || !inv.container) return;
    const slot = player.selectedSlotIndex;
    const current = inv.container.getItem(slot);
    if (!current || current.typeId !== id) return;
    if (current.amount <= 1) {
      inv.container.setItem(slot, undefined);
    } else {
      current.amount -= 1;
      inv.container.setItem(slot, current);
    }
  });
});
