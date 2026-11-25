import { world, system } from "@minecraft/server";

const ALTAR_TYPE = "avaritia:altar";
const DIRE_TABLE_ID = "avaritia:dire_crafting_table";
const UI_NAME_TAG = "ec_9x9_ui";
const SEARCH_RADIUS = 0.75;
// Interval (ticks) between self-checks/respawns of an altar lost via on_tick -
// it does not need to run every tick because searching for nearby entities has a cost, once per second
// (20 ticks) is fast enough that players barely notice the delay.
const SELF_HEAL_INTERVAL_TICKS = 20;
// Duration (ticks) applied for the invisibility effect. Set very large (~ many days) so
// it is nearly permanent - the altar NEVER loses invisibility on its own during a
// normal play session.
const INVISIBILITY_DURATION_TICKS = 1000000;
// Only re-apply the effect when it has completely run out (duration = 0 / no longer present
// on the entity) - NOT early. Previously the code called addEffect() again every
// time the self-heal ran (every 20 ticks) even though the effect still had a very long time left - the constant
// repeated addEffect made the Bedrock engine reset rendering for 1 frame
// each time, causing a "show then vanish" (flicker) even though logically the
// effect never expired. Now it only re-applies exactly when the effect hits 0 ticks,
// so the effect no longer "blinks".
const INVISIBILITY_REFILL_THRESHOLD_TICKS = 0;

/** Spawn position at the CENTER of the dire_crafting_table block (as requested). */
function altarSpawnLocation(block) {
  return {
    x: block.location.x + 0.5,
    y: block.location.y,
    z: block.location.z + 0.5
  };
}

function findAltarNear(dimension, location) {
  // Pick the NEAREST entity within a small radius (< 1 block) so 2 adjacent blocks
  // do not "steal" each other's entity - each block only takes the entity right at its center.
  const list = dimension.getEntities({ type: ALTAR_TYPE, location, maxDistance: SEARCH_RADIUS });
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

/** Completely hides the altar's model + shadow with the invisibility effect (NOT
 *  editing the model/geometry) - only the collision area remains (collision_box, now exactly
 *  the 1x1 block size) to catch interaction, with no small cube
 *  or shadow floating above the table anymore. showParticles:false so there is no trail of
 *  sparkle particles when the effect is applied/refreshed.
 */
function applyInvisibility(altar) {
  try {
    // Only re-apply the effect if it is missing, or the remaining time is about to run out -
    // avoids redundant addEffect() calls (the cause of the flicker, see the explanation
    // at INVISIBILITY_REFILL_THRESHOLD_TICKS).
    const current = altar.getEffect("invisibility");
    if (current && current.duration > INVISIBILITY_REFILL_THRESHOLD_TICKS) return;

    altar.addEffect("invisibility", INVISIBILITY_DURATION_TICKS, {
      amplifier: 0,
      showParticles: false
    });
  } catch (e) {
    // safety: ignore if the altar was just removed while applying the effect
  }
}

/** Spawns a new altar around the block (if none exists yet), ensures it is invisible
 *  (see applyInvisibility - now only re-applies when about to expire, no longer
 *  redundantly every time) and ensures the nameTag "ec_9x9_ui" is attached right from
 *  creation (so chest_screen.json always receives the correct 9x9 UI title without having to
 *  wait until the use click to attach it). Returns the altar (new or existing).
 */
function ensureAltar(block) {
  const dimension = block.dimension;
  const spawnLoc = altarSpawnLocation(block);

  const existing = findAltarNear(dimension, spawnLoc);
  if (existing) {
    try { existing.teleport(spawnLoc); } catch (e) {}
    applyInvisibility(existing);
    if (existing.nameTag !== UI_NAME_TAG) existing.nameTag = UI_NAME_TAG;
    return existing;
  }

  const altar = dimension.spawnEntity(ALTAR_TYPE, spawnLoc);
  applyInvisibility(altar);
  setNameTagLater(altar);
  return altar;
}

/** Placing a dire table -> spawns the altar IMMEDIATELY, no need to use it first anymore.
 *  Uses world.afterEvents.playerPlaceBlock (a global API, equally stable as
 *  playerInteractWithBlock below - does NOT use a custom block component/onPlace
 *  to avoid depending on format_version, the source of many hard-to-diagnose bugs before).
 */
world.afterEvents.playerPlaceBlock.subscribe((event) => {
  const { block, player } = event;
  if (!block || block.typeId !== DIRE_TABLE_ID) return;

  system.run(() => {
    ensureAltar(block);
  });
});

/** When the player uses the dire table: ensure the altar exists (the UI nameTag was already
 *  attached when the altar was created in ensureAltar, no need to attach/flash it again
 *  here). This is still a safety net for when the altar is lost (/kill,
 *  entity not yet spawned because the table was placed via command/dispenser...) - the self-heal via
 *  on_tick below (registerDireCraftingTableSelfHeal) already covers most of
 *  these cases before the player can use it, so normally the altar is already
 *  ready and there is no need to click twice.
 */
world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { block, player } = event;
  if (!block || block.typeId !== DIRE_TABLE_ID) return;

  system.run(() => {
    ensureAltar(block);
  });
});

/** Self-checks & respawns the altar for 1 dire_crafting_table block - called periodically
 *  from the custom component "avaritia:on_tick" (registered in blockEvents.js) so the altar
 *  always exists BEFORE the player can use it, instead of relying only on the
 *  place/use events (which can be missed if the table was placed by dispenser/
 *  command, or the altar was lost to /kill, world bugs...). This was the main cause
 *  of the old bug "the block covering the entity cannot be used" (had to click twice).
 */
export function selfHealDireCraftingTable(block) {
  if (system.currentTick % SELF_HEAL_INTERVAL_TICKS !== 0) return;
  try {
    ensureAltar(block);
  } catch (e) {
    // safety: skip if the block/dimension is temporarily invalid
  }
}

/** When the dire table is broken: clean up the linked altar (if any) so no entity
 *  lingers permanently in the world. Ingredients/results still in the grid are
 *  dropped on the ground before removing the entity, to avoid unfair item loss.
 */
world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { block, brokenBlockPermutation, dimension } = event;
  if (!brokenBlockPermutation || brokenBlockPermutation.type.id !== DIRE_TABLE_ID) return;

  const loc = altarSpawnLocation(block);
  const altar = findAltarNear(dimension, loc);
  if (!altar) return;

  try {
    const inv = altar.getComponent("minecraft:inventory");
    if (inv && inv.container) {
      for (let i = 0; i < inv.container.size; i++) {
        const item = inv.container.getItem(i);
        if (item) dimension.spawnItem(item, altar.location);
      }
    }
  } catch (e) {
    // safety: skip if the inventory cannot be read, still continue removing the entity
  }

  altar.remove();
});
