import { world, system } from "@minecraft/server";

/**
 * ALL entities that act as machines (Compressor, Neutron Collector, Record Furnace, Altar): every tick remove every
 * effect, keeping only "invisibility" (immunity, invisible). If missing, re-apply it.
 */
const MACHINE_ENTITY_TYPES = [
  "avaritia:compressor_container",
  "avaritia:neutron_collector_container",
  "avaritia:record_furnace_container",
  "avaritia:infinity_chest_container",
  "avaritia:altar"
];
const KEEP_EFFECT = "invisibility";
const INVISIBILITY_DURATION_TICKS = 1000000;
const DIMENSIONS = ["overworld", "nether", "the_end"];

function cleanEffects(entity) {
  let hasInvis = false;
  for (const eff of entity.getEffects()) {
    if (eff.typeId === KEEP_EFFECT || eff.typeId === "minecraft:" + KEEP_EFFECT) {
      hasInvis = true;
      continue;
    }
    try { entity.removeEffect(eff.typeId); } catch (e) {}
  }
  if (!hasInvis) {
    try { entity.addEffect(KEEP_EFFECT, INVISIBILITY_DURATION_TICKS, { amplifier: 0, showParticles: false }); } catch (e) {}
  }
}

system.runInterval(() => {
  for (const dimId of DIMENSIONS) {
    let dimension;
    try { dimension = world.getDimension(dimId); } catch (e) { continue; }
    for (const type of MACHINE_ENTITY_TYPES) {
      let list;
      try { list = dimension.getEntities({ type }); } catch (e) { continue; }
      for (const entity of list) {
        try {
          if (!entity.isValid) continue;
          cleanEffects(entity);
        } catch (e) {}
      }
    }
  }
}, 1);
