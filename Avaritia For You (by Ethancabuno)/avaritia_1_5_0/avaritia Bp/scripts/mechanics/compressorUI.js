import { world, system, ItemStack } from "@minecraft/server";

/**
 * ===== REAL UI FOR THE NEUTRONIUM COMPRESSOR (like the original Java version) =====
 * This file is INDEPENDENT of the old compressor.js (the old file is not modified). In the original Java version:
 * the Neutronium Compressor has only ONE INPUT INGREDIENT SLOT, you put blocks in
 * and the machine runs by itself, with a text line showing "how much more is needed" (most
 * recipes need 12,000-15,000 blocks). This Bedrock version recreates exactly that:
 * the invisible container entity has 2 slots - slot 0 = input ingredient, slot 1 = result -
 * and the actionbar shows progress when used, replacing the old ActionFormData/
 * ModalFormData.
 *
 * UPDATE (on request): Experience Singularity can now be FED through the real ingredient
 * slot, using the game's XP bottle with XP lore (XP Vial - see xpVial.js). The vial
 * does not represent "1 block = 1 unit" like the other 15 Singularities, but carries
 * a number of XP written directly in its own lore (the player first loads XP
 * into the vial through the use screen in xpVial.js). The machine reads that exact number from
 * the vial (not always +1 like a regular block) and accumulates until it reaches 100000, then
 * releases avaritia:experience_singularity - EXACTLY the same logic as the other 15 kinds, only differing in
 * reading "consume" from the lore instead of from item.amount. The 2 files remain separate, with no
 * cross import - the lore read/write functions here are copied exactly from xpVial.js.
 */
const CONTAINER_TYPE = "avaritia:compressor_container";
const BLOCK_TYPE = "avaritia:neutronium_compressor";
const UI_NAME_TAG = "comp_ui";
const SEARCH_RADIUS = 0.75;
const SELF_HEAL_INTERVAL_TICKS = 20;
const PROCESS_INTERVAL_TICKS = 10;
const INVISIBILITY_DURATION_TICKS = 1000000;
const INPUT_SLOT = 0;
const OUTPUT_SLOT = 1;

// Same material -> Singularity mapping table as the old compressor.js (copied separately here
// to keep the 2 files independent, no cross import, avoiding errors if one file has a problem).
const singularities = {
  "minecraft:coal_block": { id: "avaritia:coal_singularity", max_value: 10000 },
  "minecraft:diamond_block": { id: "avaritia:diamond_singularity", max_value: 10000 },
  "minecraft:emerald_block": { id: "avaritia:emerald_singularity", max_value: 10000 },
  "minecraft:quartz_block": { id: "avaritia:quartz_singularity", max_value: 10000 },
  "minecraft:lapis_block": { id: "avaritia:lapis_singularity", max_value: 10000 },
  "minecraft:slime": { id: "avaritia:slime_singularity", max_value: 10000 },
  "minecraft:honey_block": { id: "avaritia:honey_singularity", max_value: 10000 },
  "minecraft:redstone_block": { id: "avaritia:redstone_singularity", max_value: 10000 },
  "minecraft:gold_block": { id: "avaritia:gold_singularity", max_value: 10000 },
  "minecraft:iron_block": { id: "avaritia:iron_singularity", max_value: 10000 },
  "minecraft:netherite_block": { id: "avaritia:netherite_singularity", max_value: 10000 },
  "minecraft:obsidian": { id: "avaritia:obsidian_singularity", max_value: 10000 },
  "minecraft:soul_sand": { id: "avaritia:soul_sand_singularity", max_value: 10000 },
  "minecraft:copper_block": { id: "avaritia:copper_singularity", max_value: 10000 },
  "minecraft:amethyst_block": { id: "avaritia:amethyst_singularity", max_value: 10000 },
  "minecraft:netherrack": { id: "avaritia:netherrack_singularity", max_value: 10000 },
  "minecraft:glowstone": { id: "avaritia:glowstone_singularity", max_value: 10000 },
  "minecraft:prismarine": { id: "avaritia:prismarine_singularity", max_value: 10000 },
  "minecraft:end_stone": { id: "avaritia:end_stone_singularity", max_value: 10000 },
  "minecraft:magma": { id: "avaritia:magma_singularity", max_value: 10000 },
  "minecraft:bone_block": { id: "avaritia:bone_singularity", max_value: 10000 },
  "minecraft:packed_ice": { id: "avaritia:ice_singularity", max_value: 10000 }
};

// ===== XP Vial (minecraft:experience_bottle with XP lore) - lore read/write exactly like xpVial.js =====
const XP_VIAL_ID = "minecraft:experience_bottle";
const XP_SINGULARITY_ID = "avaritia:experience_singularity";
const XP_SINGULARITY_TARGET = 100000; // = XP_VIAL_CAP in xpVial.js
const XP_VIAL_LORE_PREFIX = "§r§7XP: ";
const XP_VIAL_ID_PREFIX = "§r§8ID: ";

function getVialXp(item) {
  if (!item || item.typeId !== XP_VIAL_ID) return 0;
  const lore = item.getLore();
  const line = lore.find((l) => l.startsWith(XP_VIAL_LORE_PREFIX));
  if (!line) return 0;
  const n = parseInt(line.replace(XP_VIAL_LORE_PREFIX, "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function setVialXp(item, amount) {
  if (amount > 0) {
    const idLine = item.getLore().find((l) => l.startsWith(XP_VIAL_ID_PREFIX));
    item.setLore(idLine ? [`${XP_VIAL_LORE_PREFIX}${amount}/${XP_SINGULARITY_TARGET}`, idLine] : [`${XP_VIAL_LORE_PREFIX}${amount}/${XP_SINGULARITY_TARGET}`]);
    item.nameTag = `§bXP Vial §r§a(${amount}/${XP_SINGULARITY_TARGET} XP)`;
  } else {
    item.setLore([]);
    item.nameTag = undefined;
  }
}

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

function ensureCompressorContainer(block) {
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

function getProgress(entity) {
  const raw = entity.getDynamicProperty("avaritia:compProgress");
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function setProgress(entity, data) {
  entity.setDynamicProperty("avaritia:compProgress", JSON.stringify(data));
}

/** Collects ingredients from the ONLY slot (slot 0) into progress, releases the Singularity into the result slot (slot 1) when enough. */
function processCompressor(entity) {
  const inv = entity.getComponent("minecraft:inventory")?.container;
  if (!inv) return;
  const progress = getProgress(entity);

  const item = inv.getItem(INPUT_SLOT);
  if (item) {
    if (item.typeId === XP_VIAL_ID && getVialXp(item) > 0) {
      // The vial carries its OWN XP number (written in the lore) - not always +1
      // like a regular block, so it is handled separately from the `singularities` table.
      const vialXp = getVialXp(item);
      if (vialXp > 0) {
        const current = progress[XP_SINGULARITY_ID] || 0;
        const room = XP_SINGULARITY_TARGET - current;
        if (room > 0) {
          const consume = Math.min(vialXp, room);
          if (consume > 0) {
            progress[XP_SINGULARITY_ID] = current + consume;
            const leftover = vialXp - consume;
            if (leftover > 0) {
              // The vial only gets emptier, it does not disappear - like a block whose quantity is reduced.
              setVialXp(item, leftover);
              inv.setItem(INPUT_SLOT, item);
            } else {
              inv.setItem(INPUT_SLOT, undefined);
            }
          }
        }
      }
    } else {
      const mapping = singularities[item.typeId];
      if (mapping) {
        const current = progress[mapping.id] || 0;
        const room = mapping.max_value - current;
        if (room > 0) {
          const consume = Math.min(item.amount, room);
          if (consume > 0) {
            progress[mapping.id] = current + consume;
            if (consume >= item.amount) inv.setItem(INPUT_SLOT, undefined);
            else { item.amount -= consume; inv.setItem(INPUT_SLOT, item); }
          }
        }
      }
    }
  }

  // Releases the result for the first type that has reached the threshold and whose result slot can still accept it.
  for (const materialId in singularities) {
    const mapping = singularities[materialId];
    const current = progress[mapping.id] || 0;
    if (current < mapping.max_value) continue;

    const outputItem = inv.getItem(OUTPUT_SLOT);
    if (!outputItem) {
      inv.setItem(OUTPUT_SLOT, new ItemStack(mapping.id, 1));
      progress[mapping.id] = current - mapping.max_value;
    } else if (outputItem.typeId === mapping.id && outputItem.amount < 64) {
      outputItem.amount += 1;
      inv.setItem(OUTPUT_SLOT, outputItem);
      progress[mapping.id] = current - mapping.max_value;
    }
    // if the result slot holds a DIFFERENT Singularity, leave the progress as is and wait for the slot to free up.
  }

  // Experience Singularity - same result-release mechanism as above, but the progress source
  // comes from the XP Vial instead of the `singularities` table.
  {
    const current = progress[XP_SINGULARITY_ID] || 0;
    if (current >= XP_SINGULARITY_TARGET) {
      const outputItem = inv.getItem(OUTPUT_SLOT);
      if (!outputItem) {
        inv.setItem(OUTPUT_SLOT, new ItemStack(XP_SINGULARITY_ID, 1));
        progress[XP_SINGULARITY_ID] = current - XP_SINGULARITY_TARGET;
      } else if (outputItem.typeId === XP_SINGULARITY_ID && outputItem.amount < 64) {
        outputItem.amount += 1;
        inv.setItem(OUTPUT_SLOT, outputItem);
        progress[XP_SINGULARITY_ID] = current - XP_SINGULARITY_TARGET;
      }
    }
  }

  setProgress(entity, progress);
}

/** Returns a progress text line like "X more <material> needed" for the actionbar, like the Java version. */
function getProgressText(entity) {
  const inv = entity.getComponent("minecraft:inventory")?.container;
  if (!inv) return "";
  const item = inv.getItem(INPUT_SLOT);
  if (!item) return "§7Put ingredients in the input slot";

  if (item.typeId === XP_VIAL_ID && getVialXp(item) > 0) {
    const progress = getProgress(entity);
    const current = progress[XP_SINGULARITY_ID] || 0;
    const remaining = Math.max(0, XP_SINGULARITY_TARGET - current);
    return `§e${current}/${XP_SINGULARITY_TARGET} XP §7(§f${remaining}§7 more needed)`;
  }

  const mapping = singularities[item.typeId];
  if (!mapping) return "§cInvalid material";
  const progress = getProgress(entity);
  const current = progress[mapping.id] || 0;
  const remaining = Math.max(0, mapping.max_value - current);
  return `§e${current}/${mapping.max_value} §7(§f${remaining}§7 more needed)`;
}

/** Called every tick from blockEvents.js for the avaritia:neutronium_compressor block. */
export function tickCompressor(block, steps = 1) {
  if (!block) return;
  if (system.currentTick % SELF_HEAL_INTERVAL_TICKS === 0) {
    try { ensureCompressorContainer(block); } catch (e) {}
  }
  if (system.currentTick % PROCESS_INTERVAL_TICKS !== 0) return;
  try {
    const container = ensureCompressorContainer(block);
    for (let i = 0; i < steps; i++) processCompressor(container); // steps > 1 inside a speed zone
  } catch (e) {}
}

world.afterEvents.playerPlaceBlock.subscribe((event) => {
  const { block } = event;
  if (!block || block.typeId !== BLOCK_TYPE) return;
  try { ensureCompressorContainer(block); } catch (e) { system.run(() => ensureCompressorContainer(block)); }
});

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, player } = event;
  if (!block || block.typeId !== BLOCK_TYPE) return;
  system.run(() => {
    const container = ensureCompressorContainer(block);
    try { player.onScreenDisplay.setActionBar(getProgressText(container)); } catch (e) {}
  });
});

world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { block, brokenBlockPermutation, dimension } = event;
  if (!brokenBlockPermutation || brokenBlockPermutation.type.id !== BLOCK_TYPE) return;

  const loc = containerSpawnLocation(block);
  const container = findContainerNear(dimension, loc);
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

export { ensureCompressorContainer };
