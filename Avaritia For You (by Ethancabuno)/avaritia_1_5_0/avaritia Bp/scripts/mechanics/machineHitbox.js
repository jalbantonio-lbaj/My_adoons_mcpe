import { world, system } from "@minecraft/server";
import { isIndicatorItem } from "./recordFurnaceUI.js";

/**
 * Machine hitbox switching (same idea as the Furnaces Chests add-on):
 *  - Normal: the invisible container entity covers the WHOLE block (1x1) and the block's selection box
 *    is shrunk (state avaritia:fake_selection = true), so the entity is always hit first -> UI opens
 *    from any spot on the block.
 *  - Sneaking near the machine: the entity hitbox becomes 0x0 and the block selection is restored, so
 *    the block can be hit and broken normally. Standing up switches back.
 *  - Safety net: an entity whose block is gone (explosion, piston, creative, other add-on) spills its
 *    items and is removed.
 */
const MACHINES = {
  "avaritia:altar": "avaritia:dire_crafting_table",
  "avaritia:neutron_collector_container": "avaritia:neutron_collector",
  "avaritia:compressor_container": "avaritia:neutronium_compressor",
  "avaritia:record_furnace_container": "avaritia:record_furnace",
  "avaritia:infinity_chest_container": "avaritia:infinity_chest"
};
const STATE = "avaritia:fake_selection";
const SCAN_RANGE = 10;
const SNEAK_RANGE = 7;
const TAG_INIT = "av_hb";
const TAG_OFF = "av_hb_off";
const offEntities = new Map();

function blockOf(entity) {
  try {
    return entity.dimension.getBlock({
      x: Math.floor(entity.location.x),
      y: Math.floor(entity.location.y + 0.01),
      z: Math.floor(entity.location.z)
    });
  } catch (e) { return undefined; }
}

function spillAndRemove(entity) {
  try {
    const inv = entity.getComponent("minecraft:inventory");
    const container = inv && inv.container;
    if (container) {
      const isFurnace = entity.typeId === "avaritia:record_furnace_container";
      for (let i = 0; i < container.size; i++) {
        const item = container.getItem(i);
        if (!item) continue;
        if (isFurnace && isIndicatorItem(item)) continue;
        entity.dimension.spawnItem(item, entity.location);
      }
    }
  } catch (e) {}
  try { entity.remove(); } catch (e) {}
}

function applyMode(entity, off) {
  const init = entity.hasTag(TAG_INIT);
  if (!init || entity.hasTag(TAG_OFF) !== off) {
    try { entity.triggerEvent(off ? "avaritia:remove_collision" : "avaritia:add_collision"); } catch (e) {}
    if (!init) entity.addTag(TAG_INIT);
    if (off) entity.addTag(TAG_OFF); else entity.removeTag(TAG_OFF);
  }
  if (off) offEntities.set(entity.id, entity); else offEntities.delete(entity.id);

  const block = blockOf(entity);
  if (block && block.typeId === MACHINES[entity.typeId]) {
    try {
      if (block.permutation.getState(STATE) !== !off) {
        block.setPermutation(block.permutation.withState(STATE, !off));
      }
    } catch (e) {}
  }
}

system.runInterval(() => {
  const players = world.getAllPlayers();
  const sneakers = players.filter((p) => { try { return p.isSneaking; } catch (e) { return false; } });
  const seen = new Set();

  for (const player of players) {
    let dim;
    try { dim = player.dimension; } catch (e) { continue; }
    for (const type of Object.keys(MACHINES)) {
      let list;
      try { list = dim.getEntities({ type, location: player.location, maxDistance: SCAN_RANGE }); } catch (e) { continue; }
      for (const entity of list) {
        try {
          if (!entity.isValid || seen.has(entity.id)) continue;
          seen.add(entity.id);

          const block = blockOf(entity);
          if (block && block.typeId !== MACHINES[type]) {
            offEntities.delete(entity.id);
            spillAndRemove(entity);
            continue;
          }

          const off = sneakers.some((p) => {
            try {
              if (p.dimension.id !== entity.dimension.id) return false;
              const dx = p.location.x - entity.location.x;
              const dy = p.location.y - entity.location.y;
              const dz = p.location.z - entity.location.z;
              return dx * dx + dy * dy + dz * dz <= SNEAK_RANGE * SNEAK_RANGE;
            } catch (e) { return false; }
          });
          applyMode(entity, off);
        } catch (e) {}
      }
    }
  }

  // Entities switched off whose players moved away / stopped sneaking out of scan range -> restore.
  for (const [id, entity] of offEntities) {
    if (seen.has(id)) continue;
    try {
      if (entity.isValid) applyMode(entity, false);
    } catch (e) {}
    offEntities.delete(id);
  }
}, 2);
