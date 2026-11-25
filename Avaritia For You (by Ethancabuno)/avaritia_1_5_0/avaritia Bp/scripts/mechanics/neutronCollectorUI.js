import { world, system, ItemStack } from "@minecraft/server";

/**
 * ===== REAL UI FOR THE NEUTRON COLLECTOR (like the original Java version) =====
 * This file is INDEPENDENT of the old neutronCollector.js (the old file is not modified). The original Java
 * version of Avaritia: the Neutron Collector has only ONE RESULT SLOT, and about every
 * 7111 ticks it generates 1 Pile of Neutrons into that slot. This Bedrock version recreates
 * exactly that 1 slot with 1 invisible container entity (inventory_size = 1) -
 * the player uses it to open it and sees Pile of Neutrons gradually accumulate, taking them
 * out by hand like a chest, no form/slider needed anymore.
 *
 * SIMPLIFIED compared to the old form version: each machine works INDEPENDENTLY (adjacent Neutron
 * Collectors are no longer merged into a shared network storage, like Java).
 */
const CONTAINER_TYPE = "avaritia:neutron_collector_container";
const BLOCK_TYPE = "avaritia:neutron_collector";
const UI_NAME_TAG = "nc_ui";
const SEARCH_RADIUS = 0.75;
const SELF_HEAL_INTERVAL_TICKS = 20;
const INVISIBILITY_DURATION_TICKS = 1000000;
const TICKS_PER_NEUTRON = 6000;
const MAX_STACK = 64;

function containerSpawnLocation(block) {
  return { x: block.location.x + 0.5, y: block.location.y, z: block.location.z + 0.5 };
}

function findContainerNear(dimension, location) {
  // Pick the NEAREST entity within a small radius (< 1 block) so 2 adjacent blocks
  // do not "steal" each other's entity - each block only takes the entity right at its center.
  const list = dimension.getEntities({ type: CONTAINER_TYPE, location, maxDistance: SEARCH_RADIUS });
  let best;
  let bestD = Infinity;
  for (const e of list) {
    const dx = e.location.x - location.x;
    const dy = e.location.y - location.y;
    const dz = e.location.z - location.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// Attach the nameTag a few ticks LATE after the entity spawns: so the invisibility effect (already applied
// at spawn + via the entity JSON) reaches the client first, with no 1-frame name flash.
const NAME_TAG_DELAY_TICKS = 5;
function setNameTagLater(entity) {
  system.runTimeout(() => {
    try { if (entity.nameTag !== UI_NAME_TAG) entity.nameTag = UI_NAME_TAG; } catch (e) {}
  }, NAME_TAG_DELAY_TICKS);
}

function applyInvisibility(entity) {
  try {
    const current = entity.getEffect("invisibility");
    if (current && current.duration > 0) return;
    entity.addEffect("invisibility", INVISIBILITY_DURATION_TICKS, { amplifier: 0, showParticles: false });
  } catch (e) {}
}

function ensureCollectorContainer(block) {
  const dimension = block.dimension;
  const spawnLoc = containerSpawnLocation(block);
  const existing = findContainerNear(dimension, spawnLoc);
  if (existing) {
    try { existing.teleport(spawnLoc); } catch (e) {}
    applyInvisibility(existing);
    if (existing.nameTag !== UI_NAME_TAG) existing.nameTag = UI_NAME_TAG;
    return existing;
  }
  const entity = dimension.spawnEntity(CONTAINER_TYPE, spawnLoc);
  applyInvisibility(entity);
  // Name the entity the instant it spawns (right after invisibility is applied) so the machine already opens with
  // its custom UI even if the player uses it within the first ticks; the delayed call below is only a safety net.
  try { entity.nameTag = UI_NAME_TAG; } catch (e) {}
  setNameTagLater(entity);
  return entity;
}

/** Adds Pile of Neutrons into the entity's ONLY slot (slot 0), stopping if the slot is full at 64. */
function depositNeutrons(containerEntity, amount) {
  const inv = containerEntity.getComponent("minecraft:inventory")?.container;
  if (!inv) return amount;
  const item = inv.getItem(0);
  if (item && item.typeId === "avaritia:pile_of_neutrons" && item.amount < MAX_STACK) {
    const add = Math.min(MAX_STACK - item.amount, amount);
    item.amount += add;
    inv.setItem(0, item);
    return amount - add;
  } else if (!item) {
    const add = Math.min(MAX_STACK, amount);
    inv.setItem(0, new ItemStack("avaritia:pile_of_neutrons", add));
    return amount - add;
  }
  return amount; // slot full or holding a different item -> cannot add more for now (like a full chest)
}

/** Called every tick from blockEvents.js for the avaritia:neutron_collector block. */
export function tickCollector(block, steps = 1) {
  if (!block) return;
  if (system.currentTick % SELF_HEAL_INTERVAL_TICKS === 0) {
    try { ensureCollectorContainer(block); } catch (e) {}
  }

  // Counts the accumulated neutron ticks with its own dynamic property on the WORLD, keyed by block coordinates
  // (completely independent of the old neutronCollector.js to avoid touching its data).
  const key = `avaritia:nc2_${block.location.x}_${block.location.y}_${block.location.z}`;
  // steps > 1 when the collector sits inside a speed zone (see admin/timeZones.js)
  let timer = (world.getDynamicProperty(key) ?? 0) + steps;
  if (timer >= TICKS_PER_NEUTRON) {
    const gained = Math.floor(timer / TICKS_PER_NEUTRON);
    timer = timer % TICKS_PER_NEUTRON;
    try {
      const container = ensureCollectorContainer(block);
      depositNeutrons(container, gained);
    } catch (e) {}
  }
  world.setDynamicProperty(key, timer);
}

/** Placing a new block -> creates the item shelf immediately. */
world.afterEvents.playerPlaceBlock.subscribe((event) => {
  const { block } = event;
  if (!block || block.typeId !== BLOCK_TYPE) return;
  try { ensureCollectorContainer(block); } catch (e) { system.run(() => ensureCollectorContainer(block)); }
});

/** Using the block -> ensures the item shelf exists before the engine automatically opens the entity's UI,
 *  and also shows an actionbar with how long until the next Pile of Neutrons (like the
 *  status line in the original Java GUI). */
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, player } = event;
  if (!block || block.typeId !== BLOCK_TYPE) return;
  const key = `avaritia:nc2_${block.location.x}_${block.location.y}_${block.location.z}`;
  const timer = world.getDynamicProperty(key) ?? 0;
  const secondsLeft = Math.max(0, Math.floor((TICKS_PER_NEUTRON - timer) / 20));
  system.run(() => {
    ensureCollectorContainer(block);
    try { player.onScreenDisplay.setActionBar(`§eNext Neutron in: §f${secondsLeft}s`); } catch (e) {}
  });
});

/** Breaking the block -> drops everything left in the shelf + cleans up the entity + deletes the tick-counting dynamic property. */
world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { block, brokenBlockPermutation, dimension } = event;
  if (!brokenBlockPermutation || brokenBlockPermutation.type.id !== BLOCK_TYPE) return;

  const loc = containerSpawnLocation(block);
  const container = findContainerNear(dimension, loc);
  const key = `avaritia:nc2_${block.location.x}_${block.location.y}_${block.location.z}`;
  world.setDynamicProperty(key, undefined);
  if (!container) return;

  try {
    const inv = container.getComponent("minecraft:inventory");
    if (inv && inv.container) {
      for (let i = 0; i < inv.container.size; i++) {
        const item = inv.container.getItem(i);
        if (item) dimension.spawnItem(item, container.location);
      }
    }
  } catch (e) {}

  container.remove();
});

export { ensureCollectorContainer };
