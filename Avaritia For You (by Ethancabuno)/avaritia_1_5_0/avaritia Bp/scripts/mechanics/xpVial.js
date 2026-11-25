import * as MC from "@minecraft/server";
import * as MCUI from "@minecraft/server-ui";

/**
 * ===== XP VIAL - USES THE GAME'S (vanilla) GLASS BOTTLE & XP BOTTLE =====
 * No separate item anymore: EMPTY vial = minecraft:glass_bottle, vial WITH XP =
 * minecraft:experience_bottle mang lore "XP: N/100000".
 *
 * DOES NOT AFFECT THE ORIGINAL MECHANICS:
 *  - Glass bottle: only opens the menu when CROUCHING (sneak) + use, AND not looking
 *    at water / a cauldron / a beehive / a bee nest / dragon's breath
 *    (area_effect_cloud). The script uses afterEvents so it does NOT cancel any
 *    game action -> scooping water, taking honey, taking dragon's breath all still work as before.
 *  - A regular XP bottle (without the addon's XP lore) is still THROWN normally. Only XP bottles
 *    loaded by the addon (with lore) are blocked from throwing and open the menu.
 *
 * Empty bottle: crouch + use -> asks whether to put XP in -> enter a number -> deducts the player's
 * XP, 1 glass bottle turns into 1 XP bottle carrying the loaded XP.
 * Bottle already holding XP:
 *   - CROUCH (sneak) + use -> opens the number entry directly to ADD MORE XP (accumulates,
 *     max 100000 per vial). This is the only way to add more.
 *   - STAND + use -> the game THROWS the vial (projectile avaritia:xp_vial_projectile).
 *     The vial shatters on hitting a block / mob = "smash to get the XP back": reads the XP stored in the vial
 *     and releases ALL of it (unlike a regular bottle that gives only 3-11 XP). A thrown vial is lost.
 *
 * Each XP vial has its own lore ID line so they do NOT stack with each other (each vial keeps its
 * own XP). The Neutronium Compressor reads the XP number in the lore (compressorUI.js).
 */

const GLASS_BOTTLE_ID = "minecraft:glass_bottle";
const XP_BOTTLE_ID = "minecraft:experience_bottle";
export const XP_VIAL_CAP = 100000; // matches XP_SINGULARITY_TARGET in compressorUI.js (Experience Singularity)
const LORE_PREFIX = "§r§7XP: ";
const ID_PREFIX = "§r§8ID: ";

const REQUIRE_SNEAK = true; // false = using an empty bottle opens the menu (easy to conflict with the original mechanics)
const USE_COOLDOWN_TICKS = 10;

// ===== Original XP formula to compute the player's TOTAL XP points =====
function totalXpForLevel(level) {
  if (level <= 16) return level * level + 6 * level;
  if (level <= 31) return Math.floor(2.5 * level * level - 40.5 * level + 360);
  return Math.floor(4.5 * level * level - 162.5 * level + 2220);
}

function getPlayerTotalXp(player) {
  return totalXpForLevel(player.level) + Math.floor(player.xpEarnedAtCurrentLevel || 0);
}

// ===== Read/write the XP number in the item's OWN lore =====
export function getVialXp(item) {
  if (!item || item.typeId !== XP_BOTTLE_ID) return 0;
  const line = item.getLore().find((l) => l.startsWith(LORE_PREFIX));
  if (!line) return 0;
  const n = parseInt(line.replace(LORE_PREFIX, "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function getVialUid(item) {
  const line = item.getLore().find((l) => l.startsWith(ID_PREFIX));
  return line ? line.replace(ID_PREFIX, "").trim() : "";
}

function newUid() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1679616).toString(36)}`;
}

export function setVialXp(item, amount) {
  if (amount > 0) {
    const uid = getVialUid(item) || newUid();
    item.setLore([`${LORE_PREFIX}${amount}/${XP_VIAL_CAP}`, `${ID_PREFIX}${uid}`]);
    item.nameTag = `§bXP Vial §r§a(${amount}/${XP_VIAL_CAP} XP)`;
  } else {
    item.setLore([]);
    item.nameTag = undefined;
  }
}

function makeXpBottle(amount) {
  const bottle = new MC.ItemStack(XP_BOTTLE_ID, 1);
  setVialXp(bottle, amount);
  return bottle;
}

// ===== Give the item to the player: into the inventory, dropped at their feet if full =====
function giveOrDrop(player, item) {
  const container = player.getComponent("inventory")?.container;
  const leftover = container ? container.addItem(item) : item;
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}

// Takes exactly 1 vial from the held slot; returns false if the slot was changed while the form was open.
function takeOneFromSlot(container, slot, predicate) {
  const cur = container.getItem(slot);
  if (!cur || !predicate(cur)) return false;
  if (cur.amount > 1) {
    cur.amount -= 1;
    container.setItem(slot, cur);
  } else {
    container.setItem(slot, undefined);
  }
  return true;
}

// ===== Is the player aiming at something the glass bottle has an original mechanic for? =====
function isTargetingVanillaBottleSource(player) {
  try {
    const hit = player.getBlockFromViewDirection({
      maxDistance: 6,
      includeLiquidBlocks: true,
      includePassableBlocks: false,
    });
    const id = hit?.block?.typeId ?? "";
    if (id.includes("water") || id.includes("cauldron") || id.includes("bee_nest") || id.includes("beehive")) {
      return true;
    }
  } catch (e) {}
  try {
    // Dragon's breath lives inside an area_effect_cloud
    const clouds = player.dimension.getEntities({
      type: "minecraft:area_effect_cloud",
      location: player.location,
      maxDistance: 8,
    });
    if (clouds.length > 0) return true;
  } catch (e) {}
  return false;
}

const openForms = new Set();
const lastUse = new Map();

// A form that opens right after another one closed gets returned as canceled + UserBusy
// (the old form had not finished closing) -> previously the XP entry form "vanished" after pressing OK.
// This function retries every 5 ticks until it shows.
function showFormRetry(form, player, tries = 40) {
  return form.show(player).then((res) => {
    const busy = res.canceled && (res.cancelationReason === MCUI.FormCancelationReason?.UserBusy || res.cancelationReason === "UserBusy");
    if (busy && tries > 0) {
      return new Promise((resolve) => {
        MC.system.runTimeout(() => resolve(showFormRetry(form, player, tries - 1)), 5);
      });
    }
    return res;
  });
}

function throttled(player) {
  const now = MC.system.currentTick;
  const last = lastUse.get(player.id) ?? -1000;
  if (now - last < USE_COOLDOWN_TICKS) return true;
  lastUse.set(player.id, now);
  return false;
}

// ===== EMPTY GLASS BOTTLE (afterEvents: does not cancel the original mechanics) =====
MC.world.afterEvents.itemUse.subscribe((data) => {
  const player = data.source;
  if (!player || player.typeId !== "minecraft:player") return;
  const item = data.itemStack;
  if (!item) return;

  if (item.typeId !== GLASS_BOTTLE_ID) return;
  if (REQUIRE_SNEAK && !player.isSneaking) return;
  if (isTargetingVanillaBottleSource(player)) return;
  if (openForms.has(player.id) || throttled(player)) return;

  const slot = player.selectedSlotIndex;
  openForms.add(player.id);
  const confirm = new MCUI.MessageFormData();
  confirm.title("§lXP Vial");
  confirm.body("§fDo you want to put your XP into the vial?");
  confirm.button1("§aYes");
  confirm.button2("§cNo");
  showFormRetry(confirm, player).then((response) => {
    if (response.canceled || response.selection !== 0) { openForms.delete(player.id); return; }
    // Opening the next form in the very tick the "Yes/No" form closed is prone to residual
    // click-through (the finger/mouse that just pressed "Yes" lands on the new form) -> the XP entry form
    // is treated as if the player closed it themselves (canceled, NOT UserBusy) so showFormRetry
    // cannot retry. Wait 1 extra tick before the first show() to avoid this.
    MC.system.runTimeout(() => askDepositAmount(player, slot, 0, "empty"), 1);
  }).catch(() => openForms.delete(player.id));
});

// ===== LOADED XP VIAL (beforeEvents: always blocks the game's default THROW) =====
// Regular XP bottle (no lore) -> return early, throw as normal.
MC.world.beforeEvents.itemUse.subscribe((data) => {
  const player = data.source;
  if (!player || player.typeId !== "minecraft:player") return;
  const item = data.itemStack;
  if (!item || item.typeId !== XP_BOTTLE_ID) return;
  if (getVialXp(item) <= 0) return;

  data.cancel = true;
  const sneaking = player.isSneaking;
  MC.system.run(() => {
    if (openForms.has(player.id) || throttled(player)) return;
    const slot = player.selectedSlotIndex;
    const container = player.getComponent("inventory")?.container;
    const cur = container?.getItem(slot);
    const stored = cur ? getVialXp(cur) : 0;
    if (!cur || stored <= 0) return;

    if (sneaking) {
      // CROUCHING: add more XP straight into the vial
      if (stored >= XP_VIAL_CAP) {
        player.sendMessage(`§eThe vial is full (${XP_VIAL_CAP}/${XP_VIAL_CAP} XP). Stand and use to throw the vial and release all the XP.`);
        return;
      }
      openForms.add(player.id);
      askDepositAmount(player, slot, stored, getVialUid(cur));
    } else {
      // STANDING: throw the vial, XP bursts out on impact
      throwFilledVial(player, container, slot, cur, stored);
    }
  });
});

// ===== THROWING THE VIAL: custom projectile, XP bursts out on impact =====
const PROJECTILE_ID = "avaritia:xp_vial_projectile";
const THROW_POWER = 1.1;
const ORBS_PER_TICK = 10; // spread out gradually over ticks so there is no stutter
const ORBS_TARGET = 100;  // a big vial bursts into about this many orbs (each worth total/100 XP)
const inFlight = new Map(); // projectile.id -> { xp, ownerId }

function throwFilledVial(player, container, slot, item, stored) {
  const creative = String(player.getGameMode?.() ?? "").toLowerCase() === "creative";
  const dir = player.getViewDirection();
  const head = player.getHeadLocation();
  const spawnLoc = { x: head.x + dir.x * 0.5, y: head.y + dir.y * 0.5, z: head.z + dir.z * 0.5 };

  let proj;
  try {
    proj = player.dimension.spawnEntity(PROJECTILE_ID, spawnLoc);
  } catch (e) {
    player.sendMessage("§cCannot throw the vial right now.");
    return;
  }
  proj.applyImpulse({ x: dir.x * THROW_POWER, y: dir.y * THROW_POWER, z: dir.z * THROW_POWER });
  const comp = proj.getComponent("minecraft:projectile");
  if (comp) comp.owner = player;
  inFlight.set(proj.id, { xp: stored, ownerId: player.id });

  player.playSound("random.bow", { pitch: 1.2 });

  // The vial is thrown away (creative keeps it unchanged, like vanilla)
  if (!creative) {
    if (item.amount > 1) { item.amount -= 1; container.setItem(slot, item); }
    else container.setItem(slot, undefined);
  }
}

function findPlayerById(id) {
  return MC.world.getAllPlayers().find((p) => p.id === id);
}

function burstXp(dimension, location, xp, ownerId) {
  // Releases ALL the XP in the vial as experience orbs, whoever picks them up gets them like regular
  // XP - NOT split, NOT added straight to the thrower.
  // @minecraft/server 2.11: Dimension.spawnXp(location, amount) makes ONE orb worth `amount` XP
  // (1..12000), so a full vial is ~100 orbs instead of up to 100000 one-XP entities.
  let remaining = xp;
  const perOrb = Math.max(1, Math.min(12000, Math.ceil(xp / ORBS_TARGET)));
  const handle = MC.system.runInterval(() => {
    try {
      for (let i = 0; i < ORBS_PER_TICK && remaining > 0; i++) {
        const amount = Math.min(perOrb, remaining);
        // spawnXp returns nothing (no impulse possible), so scatter the orbs a little instead
        dimension.spawnXp({
          x: location.x + (Math.random() - 0.5) * 0.8,
          y: location.y + 0.3 + Math.random() * 0.4,
          z: location.z + (Math.random() - 0.5) * 0.8,
        }, amount);
        remaining -= amount;
      }
    } catch (e) {
      // Orbs cannot be spawned (e.g. chunk not loaded): return the remaining XP to the thrower so it is not lost
      const owner = findPlayerById(ownerId);
      if (owner && remaining > 0) owner.addExperience(remaining);
      remaining = 0;
    }
    if (remaining <= 0) MC.system.clearRun(handle);
  }, 1);
}

function onVialHit(event, location, dimension) {
  let id;
  try { id = event.projectile.id; } catch (e) { return; }
  const info = inFlight.get(id);
  if (!info) return;
  inFlight.delete(id);
  if (!location || !dimension) return;
  burstXp(dimension, location, info.xp, info.ownerId);
  try { dimension.playSound?.("random.glass", location); } catch (e) {}
}

MC.world.afterEvents.projectileHitBlock.subscribe((event) => {
  onVialHit(event, event.location, event.dimension);
});

MC.world.afterEvents.projectileHitEntity.subscribe((event) => {
  const hit = event.getEntityHit()?.entity;
  let target;
  try { target = hit && hit.isValid ? hit : undefined; } catch { target = undefined; }
  onVialHit(event, target ? target.location : event.location, target ? target.dimension : event.dimension);
});

// mode: "empty" (holding glass_bottle) or the uid of the XP vial being added to
function askDepositAmount(player, slot, storedXp, mode) {
  const remainingRoom = XP_VIAL_CAP - storedXp;
  const playerXp = getPlayerTotalXp(player);

  const modal = new MCUI.ModalFormData();
  modal.title("§lLoad XP into the vial");
  modal.textField(
    `§fYou currently have §a${playerXp}§f XP.\n§fThe vial can still take up to §a${remainingRoom}§f XP.\n§fEnter the amount of XP to put in:`,
    "vd: 1000",
    { defaultValue: "" }
  );
  showFormRetry(modal, player).then((response) => {
    openForms.delete(player.id);
    if (response.canceled) return;
    const amount = parseInt(response.formValues[0], 10);
    const fail = (msg) => { player.sendMessage(msg); player.playSound("note.bass"); };

    if (!Number.isFinite(amount) || amount <= 0) return fail("§cInvalid XP amount.");
    if (amount > remainingRoom) return fail(`§cThe vial only has room for up to ${remainingRoom} XP.`);
    if (amount > getPlayerTotalXp(player)) return fail(`§cYou do not have enough XP (you have ${getPlayerTotalXp(player)}).`);

    const container = player.getComponent("inventory")?.container;
    if (!container) return;
    const cur = container.getItem(slot);

    if (mode === "empty") {
      // Glass bottle -> XP vial
      if (!cur || cur.typeId !== GLASS_BOTTLE_ID) return fail("§cYou changed the item you were holding.");
      player.addExperience(-amount);
      takeOneFromSlot(container, slot, (i) => i.typeId === GLASS_BOTTLE_ID);
      giveOrDrop(player, makeXpBottle(amount));
      player.sendMessage(`§aLoaded ${amount} XP into the vial (${amount}/${XP_VIAL_CAP}).`);
      player.playSound(amount >= XP_VIAL_CAP ? "random.levelup" : "random.orb");
      return;
    }

    // Add more to an existing XP vial
    if (!cur || getVialXp(cur) !== storedXp || getVialUid(cur) !== mode) return fail("§cYou changed the item you were holding.");
    player.addExperience(-amount);
    const newTotal = storedXp + amount;
    setVialXp(cur, newTotal);
    container.setItem(slot, cur);
    player.sendMessage(`§aLoaded ${amount} XP into the vial (${newTotal}/${XP_VIAL_CAP}).`);
    player.playSound(newTotal >= XP_VIAL_CAP ? "random.levelup" : "random.orb");
  }).catch(() => openForms.delete(player.id));
}

