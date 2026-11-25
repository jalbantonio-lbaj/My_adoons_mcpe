import { world, system, ItemStack } from '@minecraft/server'

const SKULLFIRE_ID = "avaritia:skullfire_sword";
const WITHER_SKULL = "minecraft:wither_skeleton_skull";
world.afterEvents.entityDie.subscribe((event) => {
  try {
    const victim = event.deadEntity;
    if (!victim) return;
    const vtype = victim.typeId;
    if (vtype !== "minecraft:skeleton") return;
    const src = event.damageSource;
    let killer = null;
    try { killer = src.damagingEntity; } catch (_) {}
    if (!killer) return;
    if (killer.typeId !== "minecraft:player") return;
    let held = null;
    try {
      const eq = killer.getComponent("minecraft:equippable");
      held = eq ? eq.getEquipment("Mainhand") : null;
    } catch (_) {}
    if (!held || held.typeId !== SKULLFIRE_ID) return;
    const dim = victim.dimension;
    const loc = victim.location;
    try { dim.spawnItem(new ItemStack(WITHER_SKULL, 1), loc); } catch (_) {}
  } catch (_) {}
});
