import { world, system, Player, ItemStack, EquipmentSlot } from "@minecraft/server";

// ===== Seal Orb =====
// avaritia:seal_orb      (empty)  - right-click a creature to seal it.
// avaritia:seal_orb_full (filled) - use it (right-click in air / on block) to release the creature at your feet.
//
// Sealing = the creature is teleported over and over to a far-away cell (same dimension),
// inside a ticking area that is kept loaded, so the chunk stays active and the mob does not despawn.

const EMPTY_ID = "avaritia:seal_orb";
const FULL_ID = "avaritia:seal_orb_full";
const REG_KEY = "avaritia:seal_registry";
const TAG = "avaritia_sealed";
const PROP_ID = "avaritia:seal_id";
const PROP_NAME = "avaritia:seal_name"; // original nameTag, saved on the entity
const PROP_NAMED = "avaritia:seal_named"; // true if we set the nameTag ourselves

// ----- Settings -----
const DIMS = ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"];
const SEAL_X = 7000000; // far away but < 2^23, so float positions stay precise
const SEAL_Z = 7000000;
const AREA_SIZE = 64; // ticking area = 64x64 blocks (4x4 chunks)
const SLOT_SPACING = 2; // blocks between sealed creatures (avoids pushing each other)
const SLOTS_PER_ROW = AREA_SIZE / SLOT_SPACING - 1; // 31 -> 961 slots per dimension
const SEAL_Y = { "minecraft:overworld": 200, "minecraft:nether": 80, "minecraft:the_end": 80 };
const TP_INTERVAL = 5; // ticks between teleports
const EFFECT_REFRESH = 1200; // ticks between re-applying effects
const AREA_LOAD_TIMEOUT = 600; // ticks to wait for the ticking area to load
const BLOCKED_PREFIXES = ["avaritia:"]; // never seal addon machine/container entities
const BLOCKED_TYPES = new Set(["minecraft:player", "minecraft:ender_dragon"]);
const SOUND_SEAL = "mob.endermen.portal";
const SOUND_RELEASE = "random.orb";

// ----- Registry (persisted in world dynamic property) -----
// { [entityId]: { d: dimIndex, s: slot, t: typeId } }
let registry = null;
function reg() {
  if (registry) return registry;
  try {
    const raw = world.getDynamicProperty(REG_KEY);
    registry = typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    registry = {};
  }
  return registry;
}
function saveReg() {
  try {
    world.setDynamicProperty(REG_KEY, JSON.stringify(reg()));
  } catch (e) {
    console.warn("[SealOrb] save failed: " + e);
  }
}

function dimIndex(dimId) {
  return DIMS.indexOf(dimId);
}
function getDim(i) {
  return world.getDimension(DIMS[i]);
}
function slotPos(dimI, slot) {
  const col = slot % SLOTS_PER_ROW;
  const row = Math.floor(slot / SLOTS_PER_ROW);
  return {
    x: SEAL_X + SLOT_SPACING * (col + 1) + 0.5,
    y: SEAL_Y[DIMS[dimI]],
    z: SEAL_Z + SLOT_SPACING * (row + 1) + 0.5,
  };
}
function allocSlot(dimI) {
  const used = new Set();
  for (const r of Object.values(reg())) if (r.d === dimI) used.add(r.s);
  const max = SLOTS_PER_ROW * SLOTS_PER_ROW;
  for (let s = 0; s < max; s++) if (!used.has(s)) return s;
  return -1;
}

// ----- Ticking area (1 per dimension, shared by all seals) -----
const areaPromises = new Map();
function areaId(dimId) {
  return "avaritia_seal_" + dimId.replace("minecraft:", "");
}
function ensureArea(dimId) {
  if (!areaPromises.has(dimId)) {
    const p = createArea(dimId).catch((e) => {
      areaPromises.delete(dimId);
      throw e;
    });
    areaPromises.set(dimId, p);
  }
  return areaPromises.get(dimId);
}
async function createArea(dimId) {
  const dim = world.getDimension(dimId);
  const id = areaId(dimId);
  const y = SEAL_Y[dimId];
  const from = { x: SEAL_X, y, z: SEAL_Z };
  const to = { x: SEAL_X + AREA_SIZE - 1, y, z: SEAL_Z + AREA_SIZE - 1 };

  let tm;
  try {
    tm = world.tickingAreaManager;
  } catch {
    tm = undefined;
  }

  let exists = false;
  if (tm) {
    try {
      exists = !!tm.getTickingArea(id);
    } catch {
      exists = false;
    }
  }
  if (!exists) {
    let made = false;
    if (tm) {
      try {
        const p = tm.createTickingArea(id, { dimension: dim, from, to });
        if (p && typeof p.then === "function") await p;
        made = true;
      } catch {
        made = false;
      }
    }
    if (!made) {
      // Fallback: command (preload = true). Throws if there is no room left.
      dim.runCommand(`tickingarea add ${from.x} ${from.y} ${from.z} ${to.x} ${to.y} ${to.z} ${id} true`);
    }
  }

  // wait until loaded
  for (let waited = 0; waited < AREA_LOAD_TIMEOUT; waited += 4) {
    let ok = false;
    try {
      const ta = tm ? tm.getTickingArea(id) : undefined;
      if (ta && ta.isFullyLoaded !== undefined) ok = ta.isFullyLoaded;
      else ok = !!dim.getBlock({ x: SEAL_X + 2, y, z: SEAL_Z + 2 });
    } catch {
      ok = false;
    }
    if (ok) return true;
    await system.waitTicks(4);
  }
  throw new Error("ticking area load timeout");
}

// ----- Helpers -----
function say(player, text) {
  try {
    player.onScreenDisplay.setActionBar(text);
  } catch {
    try {
      player.sendMessage(text);
    } catch {
      // ignore
    }
  }
}
function shortType(typeId) {
  return typeId.replace("minecraft:", "");
}
function mainhandItem(player) {
  try {
    return player.getComponent("minecraft:equippable").getEquipment(EquipmentSlot.Mainhand);
  } catch {
    return undefined;
  }
}
function setMainhand(player, item) {
  player.getComponent("minecraft:equippable").setEquipment(EquipmentSlot.Mainhand, item);
}
function applyEffects(e) {
  try {
    e.addEffect("slowness", 20000000, { amplifier: 10, showParticles: false });
    e.addEffect("resistance", 20000000, { amplifier: 4, showParticles: false });
    e.addEffect("fire_resistance", 20000000, { amplifier: 0, showParticles: false });
  } catch {
    // ignore
  }
}
function clearEffects(e) {
  for (const fx of ["slowness", "resistance", "fire_resistance"]) {
    try {
      e.removeEffect(fx);
    } catch {
      // ignore
    }
  }
}
function canSeal(target) {
  if (!target || !target.isValid) return false;
  if (target instanceof Player) return false;
  if (BLOCKED_TYPES.has(target.typeId)) return false;
  if (BLOCKED_PREFIXES.some((p) => target.typeId.startsWith(p))) return false;
  if (target.hasTag(TAG)) return false;
  return !!target.getComponent("minecraft:health"); // living mobs only
}

// ----- Seal -----
const busy = new Set();
const lastSealTick = new Map(); // playerId -> tick (prevents releasing in the same tick as sealing)

async function trySeal(player, target) {
  if (!canSeal(target)) {
    say(player, "§cThis creature cannot be sealed!");
    return;
  }
  if (busy.has(target.id)) return;
  busy.add(target.id);
  try {
    const dimId = target.dimension.id;
    const dimI = dimIndex(dimId);
    if (dimI < 0) {
      say(player, "§cThis dimension is not supported!");
      return;
    }
    say(player, "§5Sealing...");
    await ensureArea(dimId);

    // re-validate after await
    if (!player.isValid || !canSeal(target)) return;
    const held = mainhandItem(player);
    if (!held || held.typeId !== EMPTY_ID) return;

    const slot = allocSlot(dimI);
    if (slot < 0) {
      say(player, "§cNo free seal slots left in this dimension!");
      return;
    }
    const pos = slotPos(dimI, slot);
    const typeId = target.typeId;
    const id = target.id;

    // remember + mark entity
    try {
      target.setDynamicProperty(PROP_NAME, target.nameTag ?? "");
      if (!target.nameTag) {
        // a named mob never despawns in Bedrock -> extra insurance on top of the ticking area
        target.nameTag = "§8[Sealed]";
        target.setDynamicProperty(PROP_NAMED, true);
      }
    } catch {
      // ignore
    }
    target.addTag(TAG);
    applyEffects(target);
    target.teleport(pos, { dimension: getDim(dimI) });
    try {
      target.clearVelocity();
    } catch {
      // ignore
    }

    reg()[id] = { d: dimI, s: slot, t: typeId };
    saveReg();

    // empty orb -> full orb
    const full = new ItemStack(FULL_ID, 1);
    full.setDynamicProperty(PROP_ID, id);
    full.setLore(["§7Creature: §f" + shortType(typeId), "§8Use to release"]);
    setMainhand(player, full);
    lastSealTick.set(player.id, system.currentTick);

    player.playSound(SOUND_SEAL, { location: player.location });
    say(player, `§dSealed §f${shortType(typeId)}§d!`);
  } catch (e) {
    console.warn("[SealOrb] seal failed: " + e);
    say(player, "§cSealing failed (could not create the ticking area?)");
  } finally {
    busy.delete(target.id);
  }
}

// ----- Release -----
function tryRelease(player, item) {
  const id = item.getDynamicProperty(PROP_ID);
  const rec = typeof id === "string" ? reg()[id] : undefined;
  const entity = typeof id === "string" ? world.getEntity(id) : undefined;

  if (entity && entity.isValid) {
    clearEffects(entity);
    try {
      entity.removeTag(TAG);
    } catch {
      // ignore
    }
    try {
      const orig = entity.getDynamicProperty(PROP_NAME);
      entity.nameTag = typeof orig === "string" ? orig : "";
      entity.setDynamicProperty(PROP_NAME, undefined);
      entity.setDynamicProperty(PROP_NAMED, undefined);
    } catch {
      // ignore
    }
    const dir = player.getViewDirection();
    const hl = Math.hypot(dir.x, dir.z) || 1;
    const loc = player.location;
    try {
      entity.teleport(
        { x: loc.x + (dir.x / hl) * 2, y: loc.y + 0.2, z: loc.z + (dir.z / hl) * 2 },
        { dimension: player.dimension }
      );
      entity.clearVelocity();
    } catch (e) {
      say(player, "§cCould not release it, try again!");
      console.warn("[SealOrb] release failed: " + e);
      return;
    }
    delete reg()[id];
    saveReg();
    setMainhand(player, new ItemStack(EMPTY_ID, 1));
    player.playSound(SOUND_RELEASE, { location: player.location });
    say(player, "§aCreature released!");
    return;
  }

  // entity not found
  if (player.isSneaking) {
    // sneak + use = discard the seal (creature is gone / unreachable)
    if (typeof id === "string") {
      delete reg()[id];
      saveReg();
    }
    setMainhand(player, new ItemStack(EMPTY_ID, 1));
    say(player, "§eSeal cancelled (creature not found).");
    return;
  }
  say(player, rec ? "§eThe creature has not finished loading, try again in a moment. (Sneak + use to cancel the seal)" : "§eCreature not found. (Sneak + use to cancel the seal)");
}

// ----- Events -----
// Right-click a creature with the empty orb -> seal (cancel its own interaction: trade UI, mount, ...)
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target, itemStack } = ev;
  if (!itemStack) return;
  if (itemStack.typeId === EMPTY_ID) {
    ev.cancel = true;
    system.run(() => {
      if (player.isValid && target.isValid) trySeal(player, target);
    });
  } else if (itemStack.typeId === FULL_ID) {
    ev.cancel = true; // do not trigger the mob's interaction with the full orb
  }
});

// Use the full orb -> release
world.afterEvents.itemUse.subscribe((ev) => {
  const { source: player, itemStack } = ev;
  if (!(player instanceof Player) || !itemStack || itemStack.typeId !== FULL_ID) return;
  if (lastSealTick.get(player.id) === system.currentTick) return;
  tryRelease(player, itemStack);
});

// Sealed creature died anyway -> free its slot
world.afterEvents.entityDie.subscribe((ev) => {
  const id = ev.deadEntity.id;
  if (reg()[id]) {
    delete reg()[id];
    saveReg();
  }
});

// ----- Main loop: keep teleporting sealed creatures to their cell -----
system.runInterval(() => {
  const r = reg();
  const t = system.currentTick;
  const refresh = t % EFFECT_REFRESH < TP_INTERVAL;
  for (const [id, rec] of Object.entries(r)) {
    const e = world.getEntity(id);
    if (!e || !e.isValid) continue; // not loaded right now (ticking area keeps it loaded normally)
    try {
      e.teleport(slotPos(rec.d, rec.s), { dimension: getDim(rec.d) });
      e.clearVelocity();
      if (refresh) applyEffects(e);
    } catch {
      // chunk not loaded yet: try again next interval
    }
  }
}, TP_INTERVAL);

// After world load: make sure the ticking areas for dimensions that already hold seals exist.
system.run(() => {
  const dims = new Set(Object.values(reg()).map((r) => DIMS[r.d]));
  for (const d of dims) ensureArea(d).catch((e) => console.warn("[SealOrb] area: " + e));
});
