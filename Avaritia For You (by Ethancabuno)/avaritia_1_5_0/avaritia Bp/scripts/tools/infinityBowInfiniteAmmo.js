import * as MC from "@minecraft/server";

// infinity_bow needs to declare a valid "ammunition" type so the draw/shoot mechanism
// (minecraft:shooter) works reliably in survival. Using minecraft:arrow directly
// would make the engine prefer vanilla's built-in normal arrow-shooting behavior,
// OVERRIDING the projectile_entity config (avaritia:heaven_arrow) ->
// firing a normal arrow instead of heaven_arrow. So use
// avaritia:heaven_arrow_ammo (a separate item with no competing projectile
// behavior) as the ammunition - only to satisfy the "has ammo" condition; the shape
// of what flies out is still decided by projectile_entity.
//
// Every tick: if a player is holding infinity_bow but has no
// heaven_arrow_ammo left in their inventory, automatically "load" 1 so minecraft:shooter always finds
// ammo when drawing the bow - effectively free shooting, without carrying anything real.

MC.system.runInterval(() => {
  for (const player of MC.world.getAllPlayers()) {
    const equippable = player.getComponent("minecraft:equippable");
    if (!equippable) continue;

    const mainhand = equippable.getEquipment(MC.EquipmentSlot.Mainhand);
    if (!mainhand || mainhand.typeId !== "infinity_bow:bow") continue;

    if (player.getGameMode && player.getGameMode() === MC.GameMode.creative) continue; // creative already shoots for free

    const inv = player.getComponent("minecraft:inventory");
    if (!inv || !inv.container) continue;

    const container = inv.container;
    let hasAmmo = false;
    for (let i = 0; i < container.size; i++) {
      const stack = container.getItem(i);
      if (stack && stack.typeId === "avaritia:heaven_arrow_ammo") {
        hasAmmo = true;
        break;
      }
    }

    if (!hasAmmo) {
      container.addItem(new MC.ItemStack("avaritia:heaven_arrow_ammo", 1));
    }
  }
}, 1);
