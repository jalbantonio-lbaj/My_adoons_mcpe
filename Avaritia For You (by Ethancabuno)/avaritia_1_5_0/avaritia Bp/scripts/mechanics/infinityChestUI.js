import { world, system } from "@minecraft/server";

/**
 * ===== INFINITY CHEST =====
 * Block "avaritia:infinity_chest" + 1 invisible container entity (1054 slots = 31 columns x 34 rows).
 * Same mechanism as the Neutron Collector / Compressor: the entity is "is_chested", so the engine opens its
 * container UI when the player uses the block. The entity's nameTag "ic_ui" makes
 * ui/chest_screen.json pick the custom panel (scroll bar + search box, see ui/infinity_chest.json).
 */
const CONTAINER_TYPE = "avaritia:infinity_chest_container";
const BLOCK_TYPE = "avaritia:infinity_chest";
const UI_NAME_TAG = "ic_ui";
const SEARCH_RADIUS = 0.75;
const INVISIBILITY_DURATION_TICKS = 1000000;
const NAME_TAG_DELAY_TICKS = 5;

function containerSpawnLocation(block) {
  return { x: block.location.x + 0.5, y: block.location.y, z: block.location.z + 0.5 };
}

function findContainerNear(dimension, location) {
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

export function ensureInfinityChestContainer(block) {
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

/** Called every 20 ticks from blockEvents.js: self-heal the entity if it ever goes missing. */
export function tickInfinityChest(block) {
  if (!block) return;
  try { ensureInfinityChestContainer(block); } catch (e) {}
  try { if (getAnim(block) > 0) track(block, false); } catch (e) {}
}

world.afterEvents.playerPlaceBlock.subscribe((event) => {
  const { block } = event;
  if (!block || block.typeId !== BLOCK_TYPE) return;
  try { ensureInfinityChestContainer(block); } catch (e) { system.run(() => { try { ensureInfinityChestContainer(block); } catch (e2) {} }); }
});

/* ---- Lid animation (multi-frame, like the Chests Template add-on) ----
 * Block state "avaritia:anim": 0 = closed, 1-4 = lid moving, 5 = fully open (see blocks/infinity_chest.json).
 * The container entity detects (entity_sensor + has_container_open) when a player has a container open nearby and
 * adds/removes the tag "ic_open"; the script steps the animation toward open/closed according to that tag,
 * so the lid closes exactly when the player closes the chest UI. */
const ANIM_STATE = "avaritia:anim";
const ANIM_MAX = 5;
const OPEN_TAG = "ic_open";
const GRACE_TICKS = 20;      // time the entity sensor needs to notice the UI opening
const ANIM_INTERVAL = 2;     // ticks per animation frame
const PLAYER_RANGE = 8;      // no player this close -> force close
const tracked = new Map();   // "dim|x|y|z" -> { dimId, x, y, z, grace }

function chestKey(block) { return block.dimension.id + "|" + block.x + "|" + block.y + "|" + block.z; }

function playChestSound(block, id) {
  try { block.dimension.playSound(id, { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 }); } catch (e) {}
}

function getAnim(block) {
  try { return block.permutation.getState(ANIM_STATE) ?? 0; } catch (e) { return 0; }
}

function setAnim(block, value) {
  try {
    let perm = block.permutation.withState(ANIM_STATE, value);
    try { perm = perm.withState("avaritia:open", value > 0); } catch (e) {}
    block.setPermutation(perm);
    return true;
  } catch (e) { return false; }
}

function track(block, withGrace) {
  const key = chestKey(block);
  const entry = tracked.get(key) ?? { dimId: block.dimension.id, x: block.x, y: block.y, z: block.z, grace: 0 };
  if (withGrace) entry.grace = system.currentTick + GRACE_TICKS;
  tracked.set(key, entry);
}

function wantsOpen(block, entry) {
  if (system.currentTick < entry.grace) return true;
  const container = findContainerNear(block.dimension, containerSpawnLocation(block));
  if (!container || !container.hasTag(OPEN_TAG)) return false;
  // Safety net: the sensor only works while a player is near; if nobody is around, close.
  const near = block.dimension.getPlayers({ location: container.location, maxDistance: PLAYER_RANGE });
  return near.length > 0;
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
  const { block } = event;
  if (!block || block.typeId !== BLOCK_TYPE) return;
  system.run(() => {
    try { ensureInfinityChestContainer(block); } catch (e) {}
    try { track(block, true); } catch (e) {}
  });
});

// The invisible container entity can be hit before the block (see machineHitbox.js), so also start the animation
// when a player interacts with the entity itself.
world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
  const { target } = event;
  if (!target || target.typeId !== CONTAINER_TYPE) return;
  system.run(() => {
    try {
      const block = target.dimension.getBlock({ x: Math.floor(target.location.x), y: Math.floor(target.location.y + 0.01), z: Math.floor(target.location.z) });
      if (block && block.typeId === BLOCK_TYPE) track(block, true);
    } catch (e) {}
  });
});

system.runInterval(() => {
  if (tracked.size === 0) return;
  for (const [key, c] of tracked) {
    try {
      const block = world.getDimension(c.dimId).getBlock({ x: c.x, y: c.y, z: c.z });
      if (!block || block.typeId !== BLOCK_TYPE) { tracked.delete(key); continue; }
      const anim = getAnim(block);
      const open = wantsOpen(block, c);
      if (open && anim < ANIM_MAX) {
        if (anim === 0) playChestSound(block, "random.chestopen");
        setAnim(block, anim + 1);
      } else if (!open && anim > 0) {
        setAnim(block, anim - 1);
        if (anim - 1 === 0) { playChestSound(block, "random.chestclosed"); tracked.delete(key); }
      } else if (!open && anim === 0) {
        tracked.delete(key);
      }
    } catch (e) { tracked.delete(key); }
  }
}, ANIM_INTERVAL);

/** Breaking the block -> spill everything inside + remove the entity. */
world.afterEvents.playerBreakBlock.subscribe((event) => {
  const { block, brokenBlockPermutation, dimension } = event;
  if (!brokenBlockPermutation || brokenBlockPermutation.type.id !== BLOCK_TYPE) return;
  const container = findContainerNear(dimension, containerSpawnLocation(block));
  if (!container) return;
  try {
    const inv = container.getComponent("minecraft:inventory")?.container;
    if (inv) {
      for (let i = 0; i < inv.size; i++) {
        const item = inv.getItem(i);
        if (item) dimension.spawnItem(item, container.location);
      }
    }
  } catch (e) {}
  try { container.remove(); } catch (e) {}
});
