import { world, system, ItemStack, BlockPermutation } from "@minecraft/server";

/**
 * ===== RECORD FURNACE =====
 * On request: smelts any music disc into 1
 * avaritia:record_fragment. REQUIRES avaritia:starfuel as fuel
 * (no other vanilla fuel is accepted). Each Record Fragment costs
 * EXACTLY 1 Star Fuel and 1 real hour (3600s = 72000 ticks) of continuous smelting.
 *
 * Same invisible container-entity style as the Neutronium Compressor
 * (compressorUI.js) - the avaritia:record_furnace_container entity has 3 slots:
 *   slot 0 = music disc input
 *   slot 1 = Star Fuel
 *   slot 2 = Record Fragment output
 * Opens the UI AUTOMATICALLY when the block is used (the engine automatically opens the container of the
 * is_chested entity, exactly like the Compressor/Collector/Dire Altar mechanism).
 *
 * Smelting progress is saved via a dynamic property on the container entity itself
 * (survives reload/leaving the world). If the disc or Star Fuel is missing at
 * any time, progress is PAUSED (accumulated progress is not lost,
 * it just does not continue until the ingredients are back).
 */
const CONTAINER_TYPE = "avaritia:record_furnace_container";
const BLOCK_TYPE = "avaritia:record_furnace";
const UI_NAME_TAG = "record_furnace_ui";
const SEARCH_RADIUS = 0.75;
const SELF_HEAL_INTERVAL_TICKS = 20;
const INVISIBILITY_DURATION_TICKS = 1000000;

const DISC_SLOT = 0;
const FUEL_SLOT = 1;
const OUTPUT_SLOT = 2;

// --- Hidden slots used to drive the UI (not shown to the player) ---
// The UI (chest_screen.json, panel rf_panel) reads these 2 hidden slots via the binding
// #item_durability_total_amount:
//   slot 3 = item "avaritia:rf_progress_NN" (NN = 01..20, each step 5% progress) -> filled-in arrow
//   slot 4 = item "avaritia:rf_burning" while actually smelting -> lit flame
const PROGRESS_SLOT = 3;
const BURN_SLOT = 4;
const PROGRESS_STEPS = 20;
const PROGRESS_ITEM_PREFIX = "avaritia:rf_progress_";
const BURN_ITEM_ID = "avaritia:rf_burning";

function progressItemId(step) {
  return PROGRESS_ITEM_PREFIX + String(step).padStart(2, "0");
}

export function isIndicatorItem(item) {
  return !!item && (item.typeId === BURN_ITEM_ID || item.typeId.startsWith(PROGRESS_ITEM_PREFIX));
}

const FUEL_ID = "avaritia:starfuel";
const RESULT_ID = "avaritia:record_fragment";
const COOK_TICKS = 72000; // 1 real hour = 3600s * 20 tick/s

// List of vanilla music disc ids (in addition, isMusicDisc() below also accepts
// discs with "music_disc" in the id or with the tag minecraft:music_disc).
const MUSIC_DISCS = new Set([
  "minecraft:music_disc_13",
  "minecraft:music_disc_cat",
  "minecraft:music_disc_blocks",
  "minecraft:music_disc_chirp",
  "minecraft:music_disc_far",
  "minecraft:music_disc_mall",
  "minecraft:music_disc_mellohi",
  "minecraft:music_disc_stal",
  "minecraft:music_disc_strad",
  "minecraft:music_disc_ward",
  "minecraft:music_disc_11",
  "minecraft:music_disc_wait",
  "minecraft:music_disc_pigstep",
  "minecraft:music_disc_otherside",
  "minecraft:music_disc_5",
  "minecraft:music_disc_relic",
  "minecraft:music_disc_precipice",
  "minecraft:music_disc_creator",
  "minecraft:music_disc_creator_music_box",
  "minecraft:music_disc_tears",
  "minecraft:music_disc_lava_chicken",
  "minecraft:music_disc_bounce"
]);

/**
 * Music disc detection: is in the list above, OR typeId contains "music_disc"
 * (discs from other addons / new vanilla discs in the future), OR has the tag
 * "minecraft:music_disc".
 */
function isMusicDisc(item) {
  if (!item) return false;
  if (MUSIC_DISCS.has(item.typeId)) return true;
  if (item.typeId.includes("music_disc")) return true;
  try {
    if (item.hasTag("minecraft:music_disc")) return true;
  } catch (e) {}
  return false;
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

export function ensureRecordFurnaceContainer(block) {
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
  const raw = entity.getDynamicProperty("avaritia:recordFurnaceProgress");
  const n = typeof raw === "number" ? raw : parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function setProgress(entity, ticks) {
  entity.setDynamicProperty("avaritia:recordFurnaceProgress", Math.max(0, Math.floor(ticks)));
}

/**
 * Syncs the 2 hidden slots (slot 3/4) for the UI: progress arrow + flame.
 * Only calls setItem when the value changes so no redundant change is made every tick.
 * If the player accidentally shift-clicks an item into a hidden slot, return it outside (no item loss).
 */
function syncIndicators(entity, inv, progress, burning) {
  if (inv.size <= BURN_SLOT) return; // old container does not have the hidden slots yet -> skip, do not break smelting

  const wantStep = progress > 0 ? Math.min(PROGRESS_STEPS, Math.ceil((progress / COOK_TICKS) * PROGRESS_STEPS)) : 0;
  const wantProgressId = wantStep > 0 ? progressItemId(wantStep) : undefined;
  const wantBurnId = burning ? BURN_ITEM_ID : undefined;

  const wants = [
    [PROGRESS_SLOT, wantProgressId],
    [BURN_SLOT, wantBurnId]
  ];

  for (const [slot, wantId] of wants) {
    const cur = inv.getItem(slot);
    if (cur && !isIndicatorItem(cur)) {
      try { entity.dimension.spawnItem(cur, entity.location); } catch (e) {}
      inv.setItem(slot, undefined);
    }
    const now = inv.getItem(slot);
    if ((now ? now.typeId : undefined) === wantId) continue;
    inv.setItem(slot, wantId ? new ItemStack(wantId, 1) : undefined);
  }
}

/** Handles 1 tick for the furnace: accumulates progress if there is a disc + Star Fuel, outputs the result when 72000 ticks are reached. */
function processRecordFurnace(entity, steps = 1) {
  const inv = entity.getComponent("minecraft:inventory")?.container;
  if (!inv) return;

  const discItem = inv.getItem(DISC_SLOT);
  const fuelItem = inv.getItem(FUEL_SLOT);
  const outputItem = inv.getItem(OUTPUT_SLOT);

  const hasDisc = isMusicDisc(discItem);
  const hasFuel = !!fuelItem && fuelItem.typeId === FUEL_ID && fuelItem.amount >= 1;
  const outputHasRoom = !outputItem || (outputItem.typeId === RESULT_ID && outputItem.amount < 64);

  // Missing ingredients or the output slot is full -> pause, do NOT lose accumulated progress.
  const canCook = hasDisc && hasFuel && outputHasRoom;

  if (canCook) {
    const progress = getProgress(entity) + steps; // steps > 1 inside a speed zone

    if (progress < COOK_TICKS) {
      setProgress(entity, progress);
    } else {
      // After 1 hour of smelting -> consume 1 disc, consume 1 Star Fuel, output 1 Record Fragment.
      if (discItem.amount > 1) {
        const remain = discItem.clone();
        remain.amount -= 1;
        inv.setItem(DISC_SLOT, remain);
      } else {
        inv.setItem(DISC_SLOT, undefined);
      }

      if (fuelItem.amount > 1) {
        const remain = fuelItem.clone();
        remain.amount -= 1;
        inv.setItem(FUEL_SLOT, remain);
      } else {
        inv.setItem(FUEL_SLOT, undefined);
      }

      if (!outputItem) {
        inv.setItem(OUTPUT_SLOT, new ItemStack(RESULT_ID, 1));
      } else {
        const newOut = outputItem.clone();
        newOut.amount += 1;
        inv.setItem(OUTPUT_SLOT, newOut);
      }

      setProgress(entity, 0);
    }
  }

  // Update the UI (% arrow + flame). An error here must not break smelting.
  try { syncIndicators(entity, inv, getProgress(entity), canCook); } catch (e) {}
  return canCook;
}

// ===== LIGHT WHILE SMELTING (LIGHT BLOCK) =====
// While smelting -> scatter light blocks (level 15) onto EMPTY cells (air) in a grid
// spaced LIGHT_SPACING blocks apart, within LIGHT_RADIUS blocks around the furnace
// (only in loaded chunks). When smelting finishes / stops / the furnace is broken -> remove all placed
// light blocks (only if that cell is still a light block). The list of positions is saved in
// a world dynamic property so no light block is left behind when leaving/re-entering the world.
const LIGHT_RADIUS = 100;
const LIGHT_SPACING = 9; // light level 15 spreads ~14 cells -> a spacing of 9 covers fully with no gaps
const LIGHT_STATE = "avaritia:lit";
const LIGHT_BLOCK_ID = "minecraft:light_block_15";
const PLACE_CHECKS_PER_TICK = 150;
const REMOVE_PER_TICK = 300;
const RESCAN_INTERVAL_TICKS = 200; // rescan to fill in newly loaded chunks
const REMOVE_RETRY_TICKS = 100;    // retry cells in unloaded chunks
const SAVE_INTERVAL_TICKS = 40;
const PROP_INDEX = "rfl_idx";
const PART_SIZE = 28000;

// Offset cells (dx,dy,dz) of the grid within a sphere of radius LIGHT_RADIUS.
const LIGHT_OFFSETS = (() => {
  const out = [];
  const n = Math.floor(LIGHT_RADIUS / LIGHT_SPACING);
  for (let ix = -n; ix <= n; ix++)
    for (let iz = -n; iz <= n; iz++)
      for (let iy = -n; iy <= n; iy++) {
        const dx = ix * LIGHT_SPACING, dy = iy * LIGHT_SPACING, dz = iz * LIGHT_SPACING;
        if (dx * dx + dy * dy + dz * dz > LIGHT_RADIUS * LIGHT_RADIUS) continue;
        if (dx === 0 && dy === 0 && dz === 0) continue;
        out.push([dx, dy, dz]);
      }
  return out;
})();

const furnaceLights = new Map(); // furnaceKey -> state
let nextLightId = 1;

function furnaceKey(dimension, x, y, z) {
  return dimension.id + "|" + x + "|" + y + "|" + z;
}

function getOrCreateLightState(block) {
  const key = furnaceKey(block.dimension, block.x, block.y, block.z);
  let st = furnaceLights.get(key);
  if (!st) {
    st = {
      id: nextLightId++, dimId: block.dimension.id, dimension: block.dimension,
      x: block.x, y: block.y, z: block.z,
      active: false, lastCookTick: 0,
      placed: new Set(), cursor: 0, nextScanTick: 0, nextRemoveTick: 0,
      dirty: true
    };
    furnaceLights.set(key, st);
  }
  return st;
}

function markFurnaceCooking(block) {
  const st = getOrCreateLightState(block);
  st.active = true;
  st.lastCookTick = system.currentTick;
}

function markFurnaceStopped(dimension, x, y, z) {
  const st = furnaceLights.get(furnaceKey(dimension, x, y, z));
  if (!st) return;
  st.active = false;
}

function placeLightAt(dimension, x, y, z) {
  const b = dimension.getBlock({ x, y, z });
  if (!b) return null; // chunk not loaded
  if (!b.isAir) return false;
  try {
    b.setType(LIGHT_BLOCK_ID);
  } catch (e) {
    try {
      b.setPermutation(BlockPermutation.resolve("minecraft:light_block", { block_light_level: 15 }));
    } catch (e2) { return false; }
  }
  return true;
}

function removeLightAt(dimension, x, y, z) {
  const b = dimension.getBlock({ x, y, z });
  if (!b) return null; // chunk not loaded -> retry later
  if (b.typeId.startsWith("minecraft:light_block")) {
    try { b.setType("minecraft:air"); } catch (e) {}
  }
  return true;
}

function processLightState(st, now) {
  // active is only turned off when the furnace REALLY stops smelting / is broken (see markFurnaceStopped) - NOT automatically
  // when the chunk unloads / the player goes far away.

  if (st.active) {
    if (now < st.nextScanTick && st.cursor === 0) return;
    let checks = 0;
    while (checks < PLACE_CHECKS_PER_TICK && st.cursor < LIGHT_OFFSETS.length) {
      const [dx, dy, dz] = LIGHT_OFFSETS[st.cursor++];
      const key = dx + "," + dy + "," + dz;
      if (st.placed.has(key)) continue;
      checks++;
      try {
        const r = placeLightAt(st.dimension, st.x + dx, st.y + dy, st.z + dz);
        if (r === true) { st.placed.add(key); st.dirty = true; }
      } catch (e) {}
    }
    if (st.cursor >= LIGHT_OFFSETS.length) {
      st.cursor = 0;
      st.nextScanTick = now + RESCAN_INTERVAL_TICKS;
    }
    return;
  }

  // Not smelting -> remove light blocks.
  st.cursor = 0;
  if (st.placed.size === 0) return;
  if (now < st.nextRemoveTick) return;
  let removed = 0;
  let blockedByUnloaded = false;
  for (const key of st.placed) {
    if (removed >= REMOVE_PER_TICK) break;
    const [dx, dy, dz] = key.split(",").map(Number);
    try {
      const r = removeLightAt(st.dimension, st.x + dx, st.y + dy, st.z + dz);
      if (r === null) { blockedByUnloaded = true; continue; }
    } catch (e) { blockedByUnloaded = true; continue; }
    st.placed.delete(key);
    st.dirty = true;
    removed++;
  }
  if (removed === 0 && blockedByUnloaded) st.nextRemoveTick = now + REMOVE_RETRY_TICKS;
}

// ----- Save / restore the light block list (world dynamic property) -----
function saveLightStates() {
  const index = [];
  for (const [key, st] of furnaceLights) {
    if (!st.active && st.placed.size === 0) {
      // All done -> clear the saved data and remove it from the map.
      for (let i = 0; i < 64; i++) {
        const pk = "rfl_" + st.id + "_" + i;
        if (world.getDynamicProperty(pk) === undefined) break;
        world.setDynamicProperty(pk, undefined);
      }
      furnaceLights.delete(key);
      continue;
    }
    index.push({ id: st.id, d: st.dimId, x: st.x, y: st.y, z: st.z, a: st.active ? 1 : 0 });
    if (!st.dirty) continue;
    const joined = Array.from(st.placed).join(";");
    let i = 0;
    for (; i * PART_SIZE < joined.length; i++) {
      world.setDynamicProperty("rfl_" + st.id + "_" + i, joined.slice(i * PART_SIZE, (i + 1) * PART_SIZE));
    }
    for (let j = i; j < 64; j++) {
      const pk = "rfl_" + st.id + "_" + j;
      if (world.getDynamicProperty(pk) === undefined) break;
      world.setDynamicProperty(pk, undefined);
    }
    st.dirty = false;
  }
  world.setDynamicProperty(PROP_INDEX, JSON.stringify(index));
}

function loadLightStates() {
  try {
    const raw = world.getDynamicProperty(PROP_INDEX);
    if (typeof raw !== "string") return;
    for (const e of JSON.parse(raw)) {
      const dimension = world.getDimension(e.d);
      let joined = "";
      for (let i = 0; i < 64; i++) {
        const part = world.getDynamicProperty("rfl_" + e.id + "_" + i);
        if (typeof part !== "string") break;
        joined += part;
      }
      const st = {
        id: e.id, dimId: e.d, dimension, x: e.x, y: e.y, z: e.z,
        active: !!e.a, lastCookTick: 0,
        placed: new Set(joined ? joined.split(";") : []),
        cursor: 0, nextScanTick: 0, nextRemoveTick: 0, dirty: false
      };
      furnaceLights.set(furnaceKey(dimension, e.x, e.y, e.z), st);
      if (e.id >= nextLightId) nextLightId = e.id + 1;
    }
  } catch (e) {}
}

system.run(loadLightStates);

system.runInterval(() => {
  const now = system.currentTick;
  for (const st of furnaceLights.values()) {
    // The furnace block is gone (explosion, command...) while the chunk is loaded -> turn the light off.
    // Chunk NOT loaded (player far away) -> getBlock returns undefined -> keep as is, do not turn off.
    if (st.active) {
      try {
        const b = st.dimension.getBlock({ x: st.x, y: st.y, z: st.z });
        if (b && b.typeId !== BLOCK_TYPE) markFurnaceStopped(st.dimension, st.x, st.y, st.z);
      } catch (e) {}
    }
    try { processLightState(st, now); } catch (e) {}
  }
}, 1);

system.runInterval(() => {
  try { saveLightStates(); } catch (e) {}
}, SAVE_INTERVAL_TICKS);

function setLit(block, lit) {
  try {
    const perm = block.permutation;
    if (perm.getState(LIGHT_STATE) === lit) return;
    block.setPermutation(perm.withState(LIGHT_STATE, lit));
  } catch (e) {}
}

function formatTime(remainingTicks) {
  const totalSeconds = Math.ceil(remainingTicks / 20);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

function getProgressText(entity) {
  const inv = entity.getComponent("minecraft:inventory")?.container;
  if (!inv) return "";
  const discItem = inv.getItem(DISC_SLOT);
  const fuelItem = inv.getItem(FUEL_SLOT);

  if (!isMusicDisc(discItem)) return "§7Put any music disc in the first slot";
  if (!fuelItem || fuelItem.typeId !== FUEL_ID) return "§7Star Fuel is needed in the 2nd slot to smelt";

  const progress = getProgress(entity);
  const remaining = Math.max(0, COOK_TICKS - progress);
  const pct = Math.floor((progress / COOK_TICKS) * 100);
  return `§eSmelting: ${pct}% §7(§f${formatTime(remaining)}§7 left)`;
}

/** Called every tick from blockEvents.js for the avaritia:record_furnace block. */
export function tickRecordFurnace(block, steps = 1) {
  if (!block) return;
  if (system.currentTick % SELF_HEAL_INTERVAL_TICKS === 0) {
    try { ensureRecordFurnaceContainer(block); } catch (e) {}
  }
  try {
    const container = ensureRecordFurnaceContainer(block);
    const cooking = processRecordFurnace(container, steps);
    // Smelting -> lit. Stopped smelting (done / missing ingredients / output full) -> light off.
    if (cooking) markFurnaceCooking(block);
    else markFurnaceStopped(block.dimension, block.x, block.y, block.z);
    if (system.currentTick % SELF_HEAL_INTERVAL_TICKS === 0) setLit(block, !!cooking);
  } catch (e) {}
}

world.afterEvents.playerPlaceBlock.subscribe((event) => {
  const { block } = event;
  if (!block || block.typeId !== BLOCK_TYPE) return;
  try { ensureRecordFurnaceContainer(block); } catch (e) { system.run(() => ensureRecordFurnaceContainer(block)); }
});

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, player } = event;
  if (!block || block.typeId !== BLOCK_TYPE) return;
  system.run(() => {
    const container = ensureRecordFurnaceContainer(block);
    try { player.onScreenDisplay.setActionBar(getProgressText(container)); } catch (e) {}
  });
});

world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { block, brokenBlockPermutation, dimension } = event;
  if (!brokenBlockPermutation || brokenBlockPermutation.type.id !== BLOCK_TYPE) return;

  markFurnaceStopped(dimension, block.x, block.y, block.z); // furnace broken -> light off
  const loc = containerSpawnLocation(block);
  const container = findContainerNear(dimension, loc);
  if (!container) return;

  try {
    const inv = container.getComponent("minecraft:inventory");
    if (inv && inv.container) {
      for (let i = 0; i < inv.container.size; i++) {
        const item = inv.container.getItem(i);
        if (item && !isIndicatorItem(item)) dimension.spawnItem(item, container.location);
      }
    }
  } catch (e) {}

  container.remove();
});
