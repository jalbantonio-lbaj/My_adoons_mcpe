import { world, system } from "@minecraft/server";

/**
 * ===== UTILITYCRAFT (DoriosLib) COMPATIBILITY =====
 * This file is STANDALONE, it does not modify the old machine files. Without UtilityCraft everything
 * here still runs normally (a scriptevent nobody receives is harmless).
 *
 * UtilityCraft (3.6.0) recognizes an "item container" through 3 things:
 *   1) entity with the family "dorios:container"      (added in entities/*.json)
 *   2) block with the tag "dorios:item"               (added in blocks/*.json)
 *      -> pipes/hoppers then connect to the block
 *   3) input/output slot configuration of the entity, sent via the scriptevent
 *      "dorios_container:set_config" (the entity is the sourceEntity)
 *      -> pipes can only pump items into INPUT slots and pull items from OUTPUT slots,
 *         without touching the hidden UI slots (progress/burning) of the UI.
 *
 * Slot configuration table:
 *   Neutronium Compressor : in [0]      out [1]
 *   Neutron Collector     : in []       out [0]
 *   Record Furnace        : in [0,1]    out [2]   (slots 3,4 are hidden UI slots)
 */
const SET_CONFIG_EVENT = "dorios_container:set_config";
const RESEND_INTERVAL_TICKS = 1200; // resend every ~60s in case UtilityCraft loads late
const SCAN_INTERVAL_TICKS = 20;
const SORT_INTERVAL_TICKS = 10;
const START_DELAY_TICKS = 60;
const DIMENSIONS = ["overworld", "nether", "the_end"];

const MACHINES = {
  "avaritia:compressor_container": { input: [0], output: [1] },
  "avaritia:neutron_collector_container": { input: [], output: [0] },
  "avaritia:record_furnace_container": { input: [0, 1], output: [2] },
  "avaritia:infinity_chest_container": { input: Array.from({ length: 1054 }, (_, i) => i), output: Array.from({ length: 1054 }, (_, i) => i) }
};

const RF_TYPE = "avaritia:record_furnace_container";
const RF_DISC_SLOT = 0;
const RF_FUEL_SLOT = 1;
const RF_FUEL_ID = "avaritia:starfuel";

const lastSent = new Map(); // entityId -> tick the config was sent

function getContainer(entity) {
  try {
    const c = entity.getComponent("minecraft:inventory")?.container;
    return c && c.isValid !== false ? c : undefined;
  } catch (e) {
    return undefined;
  }
}

function sendConfig(entity, def) {
  const inv = getContainer(entity);
  if (!inv) return false;
  const size = inv.size;
  const cfg = {
    version: 1,
    type: "simple",
    inputConfig: def.input.filter((s) => s < size),
    outputConfig: def.output.filter((s) => s < size)
  };
  try {
    entity.runCommand(`scriptevent ${SET_CONFIG_EVENT} ${JSON.stringify(cfg)}`);
    return true;
  } catch (e) {
    return false;
  }
}

function isMusicDisc(item) {
  if (!item) return false;
  if (item.typeId.includes("music_disc")) return true;
  try {
    if (item.hasTag("minecraft:music_disc")) return true;
  } catch (e) {}
  return false;
}

function moveInto(inv, from, to) {
  const src = inv.getItem(from);
  if (!src) return;
  const dst = inv.getItem(to);
  if (!dst) {
    inv.setItem(to, src);
    inv.setItem(from, undefined);
    return;
  }
  if (!dst.isStackableWith(src)) return;
  const room = dst.maxAmount - dst.amount;
  if (room <= 0) return;
  const mv = Math.min(room, src.amount);
  dst.amount += mv;
  inv.setItem(to, dst);
  if (mv >= src.amount) {
    inv.setItem(from, undefined);
  } else {
    src.amount -= mv;
    inv.setItem(from, src);
  }
}

/**
 * UtilityCraft's pipes pump items into the "first slot with room", so Star Fuel may
 * fall into the disc slot (slot 0) and a music disc into the fuel slot (slot 1). This function
 * re-sorts them: slot 0 only holds discs, slot 1 only holds Star Fuel.
 */
function sortRecordFurnace(entity) {
  const inv = getContainer(entity);
  if (!inv || inv.size < 3) return;
  const a = inv.getItem(RF_DISC_SLOT);
  const b = inv.getItem(RF_FUEL_SLOT);
  if (a && a.typeId === RF_FUEL_ID && b && isMusicDisc(b)) {
    inv.setItem(RF_DISC_SLOT, b);
    inv.setItem(RF_FUEL_SLOT, a);
    return;
  }
  if (a && a.typeId === RF_FUEL_ID) moveInto(inv, RF_DISC_SLOT, RF_FUEL_SLOT);
  else if (b && isMusicDisc(b)) moveInto(inv, RF_FUEL_SLOT, RF_DISC_SLOT);
}

function forEachMachineEntity(fn) {
  for (const dimId of DIMENSIONS) {
    let dimension;
    try {
      dimension = world.getDimension(dimId);
    } catch (e) {
      continue;
    }
    for (const type in MACHINES) {
      let list;
      try {
        list = dimension.getEntities({ type });
      } catch (e) {
        continue;
      }
      for (const entity of list) {
        try {
          if (entity.isValid) fn(entity, type);
        } catch (e) {}
      }
    }
  }
}

system.runInterval(() => {
  if (system.currentTick < START_DELAY_TICKS) return;
  const now = system.currentTick;
  forEachMachineEntity((entity, type) => {
    const last = lastSent.get(entity.id);
    if (last !== undefined && now - last < RESEND_INTERVAL_TICKS) return;
    if (sendConfig(entity, MACHINES[type])) lastSent.set(entity.id, now);
  });
}, SCAN_INTERVAL_TICKS);

system.runInterval(() => {
  if (system.currentTick < START_DELAY_TICKS) return;
  let dimension;
  for (const dimId of DIMENSIONS) {
    try {
      dimension = world.getDimension(dimId);
    } catch (e) {
      continue;
    }
    let list;
    try {
      list = dimension.getEntities({ type: RF_TYPE });
    } catch (e) {
      continue;
    }
    for (const entity of list) {
      try {
        if (entity.isValid) sortRecordFurnace(entity);
      } catch (e) {}
    }
  }
}, SORT_INTERVAL_TICKS);

world.afterEvents.entityRemove.subscribe(({ removedEntityId }) => {
  lastSent.delete(removedEntityId);
});
