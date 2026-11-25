import { world, system, ItemStack, EquipmentSlot, MolangVariableMap, BlockVolume, BlockPermutation, EntityDamageCause } from "@minecraft/server";
import { useRod } from "./infinityFishing.js";

/**
 * ===== INFINITY UTILITY TOOLS =====
 *  - avaritia:infinity_totem            moved to infinityTotemEternal.js
 *  - avaritia:infinity_fishing_rod      cast (visible line), wait for a bite, reel-in challenge -> jackpot (2 stacks of fish + treasure + premium loot) + XP. See infinityFishing.js.
 *  - avaritia:infinity_shears           shears sheep / mooshrooms; leaves, webs, vines... drop themselves.
 *  - avaritia:infinity_bucket           sneak+use cycles Water -> Lava -> Suck. Never runs out.
 *  - avaritia:infinity_flint_and_steel  sneak+use cycles 8 fire colours + rainbow; places eternal fire (no spread, punch to remove).
 *                                       Each colour adds an effect to what stands in it (see FIRE_EFFECTS); use on a mob to ignite it.
 *                                       Burning is continuous: every 0.5s the target loses 2.5% of its health, under 1 hp = instant kill; after 3 minutes health -> 0 then remove; it SPREADS: a burning entity ignites any living entity that comes within SPREAD_RADIUS.
 */

const ID = {
  totem: "avaritia:infinity_totem",
  rod: "avaritia:infinity_fishing_rod",
  shears: "avaritia:infinity_shears",
  bucket: "avaritia:infinity_bucket",
  flint: "avaritia:infinity_flint_and_steel",
};

const lastUse = new Map(); // key -> tick
function debounce(player, key, ticks) {
  const k = player.id + key;
  const now = system.currentTick;
  if (now - (lastUse.get(k) ?? -9999) < ticks) return false;
  lastUse.set(k, now);
  return true;
}
world.afterEvents.playerLeave.subscribe((e) => {
  for (const k of [...lastUse.keys()]) if (k.startsWith(e.playerId)) lastUse.delete(k);
});

function msg(player, text) {
  try { player.onScreenDisplay.setActionBar(text); } catch (e) {}
}
function mainhand(player) {
  return player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand);
}
function raycast(player, dist, liquids) {
  try {
    return player.getBlockFromViewDirection({ maxDistance: dist, includeLiquidBlocks: liquids });
  } catch (e) { return undefined; }
}
const FACE_OFFSET = {
  Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0],
};
function neighbor(block, face) {
  const o = FACE_OFFSET[face] ?? [0, 1, 0];
  return block.dimension.getBlock({ x: block.x + o[0], y: block.y + o[1], z: block.z + o[2] });
}
function center(b) { return { x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 }; }

// (The Totem of Eternal Rebirth now lives in infinityTotemEternal.js)

// ===================== FISHING ROD =====================
// Cast / line / bite / reel-in: infinityFishing.js. Works on water AND lava. Every catch = 2 full stacks of fish + treasure + premium loot.
function isFishable(b) {
  if (!b) return false;
  const id = b.typeId;
  return id === "minecraft:water" || id === "minecraft:flowing_water" ||
         id === "minecraft:lava" || id === "minecraft:flowing_lava";
}
function isLavaBlock(b) {
  return b.typeId === "minecraft:lava" || b.typeId === "minecraft:flowing_lava";
}

const FISH = ["minecraft:cod", "minecraft:salmon", "minecraft:tropical_fish", "minecraft:pufferfish"];

// [id, minAmount, maxAmount, weight]
const GOOD_LOOT = [
  ["minecraft:enchanted_golden_apple", 1, 3, 6],
  ["minecraft:golden_apple", 8, 16, 10],
  ["minecraft:diamond", 16, 32, 12],
  ["minecraft:emerald", 16, 32, 10],
  ["minecraft:netherite_ingot", 2, 5, 6],
  ["minecraft:netherite_scrap", 4, 8, 6],
  ["minecraft:totem_of_undying", 1, 2, 6],
  ["minecraft:nautilus_shell", 1, 3, 8],
  ["minecraft:heart_of_the_sea", 1, 1, 4],
  ["minecraft:nether_star", 1, 1, 3],
  ["minecraft:elytra", 1, 1, 2],
  ["minecraft:trident", 1, 1, 4],
  ["minecraft:name_tag", 2, 4, 8],
  ["minecraft:saddle", 1, 1, 6],
  ["minecraft:experience_bottle", 16, 48, 10],
  ["minecraft:ender_pearl", 8, 16, 8],
  ["minecraft:blaze_rod", 8, 16, 6],
  ["minecraft:gold_block", 4, 8, 6],
  ["minecraft:diamond_block", 2, 4, 5],
  ["minecraft:netherite_block", 1, 1, 1],
  ["avaritia:neutronium_ingot", 1, 3, 3],
  ["avaritia:crystal_matrix", 1, 1, 2],
  ["avaritia:infinity_nugget", 1, 2, 1],
];
const GOOD_TOTAL = GOOD_LOOT.reduce((a, e) => a + e[3], 0);
function rollGood() {
  let r = Math.random() * GOOD_TOTAL;
  for (const e of GOOD_LOOT) { r -= e[3]; if (r <= 0) return e; }
  return GOOD_LOOT[0];
}
function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function giveItem(player, id, amount) {
  try {
    const max = new ItemStack(id, 1).maxAmount;
    let left = amount;
    const inv = player.getComponent("minecraft:inventory")?.container;
    while (left > 0) {
      const n = Math.min(left, max);
      left -= n;
      const stack = new ItemStack(id, n);
      const over = inv ? inv.addItem(stack) : stack;
      if (over) player.dimension.spawnItem(over, player.location);
    }
    return true;
  } catch (e) { return false; }
}

// Rewards for a successful catch (the cast / line / bite / reel-in mechanics live in infinityFishing.js)
function giveJackpot(player, loc, lava) {
  system.runTimeout(() => {
    try {
      if (!player.isValid) return;
      // 1) Two guaranteed full stacks of fish (128 total)
      const f1 = FISH[Math.floor(Math.random() * FISH.length)];
      let f2 = FISH[Math.floor(Math.random() * FISH.length)];
      if (f2 === f1) f2 = FISH[(FISH.indexOf(f1) + 1) % FISH.length];
      giveItem(player, f1, 64);
      giveItem(player, f2, 64);
      // 2) Vanilla treasure x3
      for (let i = 0; i < 3; i++) {
        try { player.runCommand('loot give @s loot "gameplay/fishing/treasure"'); } catch (e) {}
      }
      // 3) Premium loot x3 (never empty)
      for (let i = 0; i < 3; i++) {
        const [id, mn, mx] = rollGood();
        giveItem(player, id, rint(mn, mx));
      }
      player.addExperience(rint(100000, 10000000));
      player.playSound("random.levelup");
      msg(player, "§6Jackpot! §f2 stacks of fish + treasure");
    } catch (e) {}
  }, 10);
}

// ===================== BUCKET =====================
// Modes: 0 Water, 1 Lava, 2 Suck, 3 Pick block (works on blocks of ANY addon), 4 Place the saved block once,
// 5 Spread the saved block like a tsunami. The spreading is a script flood-fill (startSpread) with a per-tick budget, no entities.
const BUCKET_MODES = ["§bWater", "§6Lava", "§7Suck (infinite)", "§dPick block", "§aPlace saved block (1)", "§cSpread saved block (tsunami)", "§4Erase tsunami (everything -> air)", "§5Erase same block (-> air)"];
const SAVED_KEY = "avaritia:saved_block";
const SPREADER_ID = "avaritia:spreader";
function getMode(player) {
  const v = player.getDynamicProperty("avaritia:bucket_mode");
  return typeof v === "number" && v >= 0 && v < BUCKET_MODES.length ? v : 0;
}
const SUCK_RADIUS = 8; // the liquid inside a (2*R+1)^3 box around the clicked block is removed with ONE fill call
function suck(player, startBlock) {
  const waterFam = startBlock.typeId.includes("water");
  const types = waterFam ? ["minecraft:water", "minecraft:flowing_water"] : ["minecraft:lava", "minecraft:flowing_lava"];
  const dim = startBlock.dimension;
  const R = SUCK_RADIUS;
  try {
    const from = { x: startBlock.x - R, y: startBlock.y - R, z: startBlock.z - R };
    const to = { x: startBlock.x + R, y: startBlock.y + R, z: startBlock.z + R };
    try {
      from.y = Math.max(from.y, dim.heightRange.min);
      to.y = Math.min(to.y, dim.heightRange.max - 1);
    } catch (e) {}
    dim.fillBlocks(new BlockVolume(from, to), "minecraft:air", { blockFilter: { includeTypes: types } });
    player.playSound(waterFam ? "bucket.fill_water" : "bucket.fill_lava");
    msg(player, waterFam ? "§7Sucked up the water nearby" : "§7Sucked up the lava nearby");
  } catch (e) {
    msg(player, "§cCannot suck here (area not loaded)");
  }
}
// ---- pick / place / spread the saved block
const LIQUID_IDS = new Set(["minecraft:water", "minecraft:flowing_water", "minecraft:lava", "minecraft:flowing_lava"]);
function getSaved(item) {
  try {
    const v = item?.getDynamicProperty(SAVED_KEY);
    if (typeof v === "string") return JSON.parse(v);
  } catch (e) {}
  return undefined;
}
// ---- tsunami spread: pure SCRIPT flood-fill, NO entities (the old avaritia:spreader entities caused the lag).
// One job per player, a queue of block positions, a fixed number of blocks placed per tick.
const SPREAD_PER_TICK = 1200;    // blocks placed per tick  (higher = faster but laggier)
const SPREAD_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]; // sideways + DOWN, never up
const spreadJobs = new Map();    // playerId -> job
function cancelSpread(playerId) {
  const j = spreadJobs.get(playerId);
  if (!j) return;
  try { system.clearRun(j.run); } catch (e) {}
  spreadJobs.delete(playerId);
}
function startSpread(player, target, perm) {
  cancelSpread(player.id);
  const dim = target.dimension;
  let minY = -64, maxY = 319;
  try { minY = dim.heightRange.min; maxY = dim.heightRange.max - 1; } catch (e) {}
  const job = {
    dim, perm, minY, maxY, run: 0,
    ox: target.x, oy: target.y, oz: target.z,
    qx: [target.x], qy: [target.y], qz: [target.z], head: 0, total: 1,
  };
  job.run = system.runInterval(() => {
    let placed = 0, pops = 0;
    while (job.head < job.qx.length && placed < SPREAD_PER_TICK && pops < SPREAD_PER_TICK * 2) {
      const i = job.head++;
      pops++;
      const x = job.qx[i], y = job.qy[i], z = job.qz[i];
      for (const d of SPREAD_DIRS) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        if (ny > job.oy || ny < job.minY) continue; // may go down, never above the start Y
        let b;
        try { b = job.dim.getBlock({ x: nx, y: ny, z: nz }); } catch (e) { continue; }
        if (!b || !b.isAir) continue; // unloaded chunk or not air: the wave stops here
        try { b.setPermutation(job.perm); } catch (e) { continue; }
        job.qx.push(nx); job.qy.push(ny); job.qz.push(nz);
        placed++; job.total++;
      }
    }
    // free memory of the already-processed part of the queue
    if (job.head > 20000) {
      job.qx = job.qx.slice(job.head); job.qy = job.qy.slice(job.head); job.qz = job.qz.slice(job.head);
      job.head = 0;
    }
    if (job.head >= job.qx.length) { // nothing left to fill
      cancelSpread(player.id);
      try { msg(player, "§aSpread finished: §f" + job.total + " §7blocks"); } catch (e) {}
    }
  }, 1);
  spreadJobs.set(player.id, job);
}
function stopSpreaders() {
  for (const k of [...spreadJobs.keys()]) cancelSpread(k);
  // also removes leftover spreader entities from older versions of the addon
  for (const d of ["overworld", "nether", "the_end"]) {
    try { world.getDimension(d).runCommand("kill @e[type=" + SPREADER_ID + "]"); } catch (e) {}
  }
}
world.afterEvents.playerLeave.subscribe((e) => cancelSpread(e.playerId));
function pickBlock(player) {
  const res = raycast(player, 12, true);
  const b = res?.block;
  if (!b || b.isAir) { msg(player, "§cLook at a block to pick it"); return; }
  const item = mainhand(player);
  if (!item) return;
  let id = b.typeId;
  let states = {};
  try { states = b.permutation.getAllStates(); } catch (e) {}
  if (LIQUID_IDS.has(id)) { // always save liquids as full source blocks
    id = id.includes("lava") ? "minecraft:lava" : "minecraft:water";
    states = { liquid_depth: 0 };
  }
  try {
    item.setDynamicProperty(SAVED_KEY, JSON.stringify({ id, states }));
    try { item.setLore(["§7Saved block: §f" + id]); } catch (e) {}
    player.getComponent("minecraft:equippable").setEquipment(EquipmentSlot.Mainhand, item);
    player.playSound("random.orb");
    msg(player, "§dSaved block: §f" + id);
  } catch (e) { msg(player, "§cCould not save this block"); }
}
function placeSaved(player, spread) {
  const saved = getSaved(mainhand(player));
  if (!saved) { msg(player, "§cNo block saved: use 'Pick block' on a block first"); return; }
  const res = raycast(player, 8, true);
  if (!res?.block) return;
  let target = res.block;
  if (!(target.isLiquid || target.isAir)) target = neighbor(target, res.face);
  if (!target || !(target.isAir || target.isLiquid)) return;
  let perm;
  try { perm = BlockPermutation.resolve(saved.id, saved.states ?? {}); }
  catch (e) { try { perm = BlockPermutation.resolve(saved.id); } catch (e2) { msg(player, "§cBlock not found: " + saved.id); return; } }
  try {
    target.setPermutation(perm);
    if (spread) {
      startSpread(player, target, perm);
      msg(player, "§cSpreading §f" + saved.id + " §7- Sneak+Use stops it");
    }
    player.playSound("random.pop");
  } catch (e) { msg(player, "§cCannot place here"); }
}

// ---- ERASE modes (6 / 7): flood-fill that turns blocks into AIR.
//  6 = "Erase tsunami": the wave eats EVERYTHING connected (any block, liquids too), sideways + down, never above the start Y.
//  7 = "Erase same block": spreads only through blocks of the SAME type as the clicked block (all 6 directions).
// No radius / block cap: like the tsunami spread, it only stops when nothing is left to erase, at an unloaded chunk, or by Sneak+Use (mode change).
const ERASE_PER_TICK = 1500;       // blocks erased per tick
const ERASE_DIRS_ALL = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];
const ERASE_DIRS_SAME = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0], [0, 1, 0]];
const ERASE_KEEP = new Set(["minecraft:bedrock", "minecraft:air"]);
function sameFamily(a, b) {
  if (a === b) return true;
  const w = (t) => t === "minecraft:water" || t === "minecraft:flowing_water";
  const l = (t) => t === "minecraft:lava" || t === "minecraft:flowing_lava";
  return (w(a) && w(b)) || (l(a) && l(b));
}
function startErase(player, start, sameOnly) {
  cancelSpread(player.id);
  const dim = start.dimension;
  const startType = start.typeId;
  if (ERASE_KEEP.has(startType)) { msg(player, "§cCannot erase this block"); return; }
  let minY = -64, maxY = 319;
  try { minY = dim.heightRange.min; maxY = dim.heightRange.max - 1; } catch (e) {}
  const dirs = sameOnly ? ERASE_DIRS_SAME : ERASE_DIRS_ALL;
  const job = {
    run: 0, total: 0,
    qx: [start.x], qy: [start.y], qz: [start.z], head: 0,
  };
  try { start.setType("minecraft:air"); job.total = 1; } catch (e) { msg(player, "§cCannot erase here"); return; }
  const oy = start.y;
  job.run = system.runInterval(() => {
    let done = 0, pops = 0;
    while (job.head < job.qx.length && done < ERASE_PER_TICK && pops < ERASE_PER_TICK * 2) {
      const i = job.head++;
      pops++;
      const x = job.qx[i], y = job.qy[i], z = job.qz[i];
      for (const d of dirs) {
        const nx = x + d[0], ny = y + d[1], nz = z + d[2];
        if (ny < minY || ny > maxY) continue;
        if (!sameOnly && ny > oy) continue; // tsunami: never above the start Y
        let b;
        try { b = dim.getBlock({ x: nx, y: ny, z: nz }); } catch (e) { continue; }
        if (!b) continue; // unloaded chunk: the wave stops here
        const t = b.typeId;
        if (ERASE_KEEP.has(t)) continue;
        if (sameOnly && !sameFamily(t, startType)) continue;
        try { b.setType("minecraft:air"); } catch (e) { continue; }
        job.qx.push(nx); job.qy.push(ny); job.qz.push(nz);
        done++; job.total++;
      }
    }
    if (job.head > 20000) {
      job.qx = job.qx.slice(job.head); job.qy = job.qy.slice(job.head); job.qz = job.qz.slice(job.head);
      job.head = 0;
    }
    if (job.head >= job.qx.length) {
      cancelSpread(player.id);
      try { msg(player, "§aErase finished: §f" + job.total + " §7blocks"); } catch (e) {}
    }
  }, 1);
  spreadJobs.set(player.id, job);
  player.playSound("random.explode");
  msg(player, (sameOnly ? "§5Erasing §f" + startType : "§4Erasing everything") + " §7- Sneak+Use stops it");
}
function eraseUse(player, sameOnly) {
  const res = raycast(player, 12, true);
  const b = res?.block;
  if (!b || b.isAir) { msg(player, "§cLook at a block to erase it"); return; }
  startErase(player, b, sameOnly);
}

function placeLiquid(player, mode) {
  const res = raycast(player, 8, true);
  if (!res?.block) return;
  let target = res.block;
  if (!(target.isLiquid || target.isAir)) target = neighbor(target, res.face);
  if (!target || !(target.isAir || target.isLiquid)) return;
  const dim = target.dimension;
  if (mode === 0 && dim.id === "minecraft:nether") {
    try { dim.spawnParticle("minecraft:large_explosion", center(target)); } catch (e) {}
    player.playSound("random.fizz");
    return;
  }
  try {
    target.setType(mode === 0 ? "minecraft:water" : "minecraft:lava");
    player.playSound(mode === 0 ? "bucket.empty_water" : "bucket.empty_lava");
  } catch (e) {}
}

// ===================== ITEM USE =====================
world.afterEvents.itemUse.subscribe((ev) => {
  const player = ev.source;
  const item = ev.itemStack;
  if (!player || !item) return;
  const id = item.typeId;

  if (id === ID.rod || id === "avaritia:infinity_fishing_rod_cast") {
    useRod(player, giveJackpot);
    return;
  }

  if (id === ID.bucket) {
    if (!debounce(player, "bucket", 6)) return;
    if (player.isSneaking) {
      const m = (getMode(player) + 1) % BUCKET_MODES.length;
      player.setDynamicProperty("avaritia:bucket_mode", m);
      stopSpreaders(); // changing mode stops every running spread
      msg(player, "Bucket of the Void: " + BUCKET_MODES[m]);
      player.playSound("random.click");
      return;
    }
    const mode = getMode(player);
    if (mode === 2) {
      const res = raycast(player, 12, true);
      if (res?.block?.isLiquid) suck(player, res.block);
      else msg(player, "§cLook at a liquid to suck it up");
    } else if (mode === 3) {
      pickBlock(player);
    } else if (mode === 4 || mode === 5) {
      placeSaved(player, mode === 5);
    } else if (mode === 6 || mode === 7) {
      eraseUse(player, mode === 7);
    } else {
      placeLiquid(player, mode);
    }
    return;
  }

  if (id === ID.flint) {
    // Used in the air / on non-targetable space: raycast from the view for a long reach.
    const res = raycast(player, 14, false);
    if (res?.block) useFlint(player, res.block, res.face);
    return;
  }
});

// ===================== ETERNAL FLINT & STEEL =====================
// Sneak + use = change mode. Use = place an eternal fire (never goes out, never spreads,
// only removed by punching it). Modes: 8 single colours + a 7-colour rainbow fire.
const FIRE_MODES = [
  { id: "red", name: "§cRed Fire" },
  { id: "orange", name: "§6Orange Fire" },
  { id: "yellow", name: "§eYellow Fire" },
  { id: "green", name: "§aGreen Fire" },
  { id: "light_blue", name: "§bLight Blue Fire" },
  { id: "blue", name: "§9Blue Fire" },
  { id: "purple", name: "§5Purple Fire" },
  { id: "pink", name: "§dPink Fire" },
  { id: "rainbow", name: "§cR§6a§ei§an§bb§9o§5w §fFire" },
];
const FIRE_PREFIX = "avaritia:eternal_fire_";
function isEternalFire(b) { return !!b && typeof b.typeId === "string" && b.typeId.startsWith(FIRE_PREFIX); }
function flintMode(player) {
  const v = player.getDynamicProperty("avaritia:flint_mode");
  return typeof v === "number" && v >= 0 && v < FIRE_MODES.length ? v : 0;
}
const FIRE_REPLACEABLE = new Set([
  "minecraft:short_grass", "minecraft:tallgrass", "minecraft:fern", "minecraft:deadbush", "minecraft:vine",
  "minecraft:snow_layer", "minecraft:glow_lichen", "minecraft:hanging_roots", "minecraft:sculk_vein",
  "minecraft:seagrass", "minecraft:double_plant",
]);
function canHoldFire(b) {
  return !!b && (b.isAir || FIRE_REPLACEABLE.has(b.typeId) || isEternalFire(b));
}
function useFlint(player, block, face) {
  if (!player || !block) return;
  if (!debounce(player, "flint", 3)) return;

  // Sneak = cycle fire mode
  if (player.isSneaking) {
    const m = (flintMode(player) + 1) % FIRE_MODES.length;
    player.setDynamicProperty("avaritia:flint_mode", m);
    msg(player, "Flint & Steel: " + FIRE_MODES[m].name);
    player.playSound("random.click");
    return;
  }

  const dim = block.dimension;
  const t = block.typeId;
  try {
    // Special ignitions keep working
    if (t === "minecraft:tnt") {
      block.setType("minecraft:air");
      dim.spawnEntity("minecraft:tnt", center(block));
      player.playSound("fire.ignite");
      return;
    }
    if (t.endsWith("campfire")) {
      block.setPermutation(block.permutation.withState("extinguished", false));
      player.playSound("fire.ignite");
      return;
    }
    if (t.includes("candle")) {
      block.setPermutation(block.permutation.withState("lit", true));
      player.playSound("fire.ignite");
      return;
    }
    const mode = FIRE_MODES[flintMode(player)];
    const fireId = FIRE_PREFIX + mode.id;
    // Clicking an existing eternal fire recolours it; otherwise place on the clicked face
    let target = isEternalFire(block) ? block : neighbor(block, face);
    if (!canHoldFire(target)) {
      // Fallback: try the clicked block itself if it can hold fire (grass, snow ...)
      if (canHoldFire(block)) target = block; else return;
    }
    if (target.typeId === fireId) return;
    target.setType(fireId);
    player.playSound("fire.ignite");
    msg(player, mode.name);
  } catch (e) {}
}

// Primary trigger: using the item on a block (itemUse does NOT reliably fire in that case)
world.afterEvents.playerInteractWithBlock.subscribe((ev) => {
  try {
    if (!ev.isFirstEvent) return;
    if (ev.itemStack?.typeId !== ID.flint) return;
    useFlint(ev.player, ev.block, ev.blockFace);
  } catch (e) {}
});

// ---- Per-colour fire effects --------------------------------------------------------------
// burn = seconds of burning, fx = [effectId, amplifier].
// Edit this table to retune a colour. Burning entities always show the animated rainbow flame
// (fire_0/fire_1 overridden in the resource pack).
const FIRE_EFFECTS = {
  red:        { burn: 8, fx: ["weakness", 0] },
  orange:     { burn: 5, fx: ["slowness", 0] },
  yellow:     { burn: 5, fx: ["mining_fatigue", 0] },
  green:      { burn: 5, fx: ["poison", 0] },
  light_blue: { burn: 2, fx: ["slowness", 2] },   // frost fire
  blue:       { burn: 5, fx: ["wither", 0] },     // soul fire
  purple:     { burn: 5, fx: ["nausea", 0] },
  pink:       { burn: 5, fx: ["hunger", 0] },
};
const RAINBOW_POOL = Object.keys(FIRE_EFFECTS);
const EFFECT_TICKS = 80;

function fireColour(b) {
  return b && typeof b.typeId === "string" && b.typeId.startsWith(FIRE_PREFIX) ? b.typeId.slice(FIRE_PREFIX.length) : undefined;
}
// ---- Coloured flames on burning entities ----------------------------------------------------
// The vanilla burning overlay cannot be recoloured per entity, so while an entity burns because of an
// eternal fire we draw coloured flame particles (avaritia:burn_flame) over it.
const FLAME_RGB = {
  red: [1, 0.15, 0.1], orange: [1, 0.5, 0.05], yellow: [1, 0.9, 0.1], green: [0.2, 1, 0.2],
  light_blue: [0.4, 0.9, 1], blue: [0.2, 0.3, 1], purple: [0.6, 0.2, 1], pink: [1, 0.4, 0.8],
};
function hueRgb(h) { // h in 0..1 -> [r,g,b]
  const k = (n) => (n + h * 6) % 6;
  const f = (n) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  return [f(5), f(3), f(1)];
}
// Once something catches fire from an eternal fire it burns FOREVER (water does not help) until it dies.
// State lives in an entity tag ("avaritia_burn:<colour>") so it survives reloads / leaving the chunk.
const BURN_TAG = "avaritia_burn:";
const burning = new Map(); // entityId -> { colour, lastIgnite, lastFx }
function burnColourOf(entity) {
  for (const t of entity.getTags()) if (t.startsWith(BURN_TAG)) return t.slice(BURN_TAG.length);
  return undefined;
}
function stopBurn(entity) {
  burning.delete(entity.id);
  try { entity.setDynamicProperty(BURN_SINCE, undefined); } catch (err) {}
  try { for (const t of entity.getTags()) if (t.startsWith(BURN_TAG)) entity.removeTag(t); } catch (err) {}
}
function startBurn(entity, colour) {
  const old = burnColourOf(entity);
  if (old !== colour) {
    if (old) entity.removeTag(BURN_TAG + old);
    entity.addTag(BURN_TAG + colour);
  }
  try { if (typeof entity.getDynamicProperty(BURN_SINCE) !== "number") entity.setDynamicProperty(BURN_SINCE, Date.now()); } catch (err) {}
  const st = burning.get(entity.id);
  burning.set(entity.id, { ...(st ?? {}), colour, lastIgnite: st?.lastIgnite ?? -9999, lastFx: st?.lastFx ?? -9999 });
}
// Mobs that are naturally immune to fire never take the curse damage.
const FIRE_PROOF = new Set([
  "minecraft:blaze", "minecraft:magma_cube", "minecraft:ghast", "minecraft:strider", "minecraft:wither_skeleton",
  "minecraft:zombified_piglin", "minecraft:wither", "minecraft:ender_dragon",
]);
const BURN_PERCENT = 0.025;     // every damage tick the target loses this fraction of its health ("keep dividing")...
const BURN_DAMAGE_EVERY = 10;   // ...every 0.5s, with no gaps = continuous burn. Scales with any max health.
const BURN_KILL_BELOW = 1;      // as soon as health would drop below this (1 hp) the target is killed outright
const BURN_LIMIT_MS = 3 * 60 * 1000; // burned 3 minutes and still alive (took no damage) -> health = 0, then remove
const BURN_SINCE = "avaritia:burn_since";
const FLAME_MAX_PER_TICK = 30; // particle cap per burning entity per 2 ticks (keeps giant mobs from lagging)
// ---- Fire spread: a burning entity ignites any living, not-yet-burning entity that gets this close ----
const SPREAD_RADIUS = 2.0;    // blocks
const SPREAD_EVERY = 10;      // ticks between spread checks per burning entity
function canCatchFire(e) {
  if (!e?.isValid) return false;
  if (e.typeId === "minecraft:item" || e.typeId === "minecraft:xp_orb") return false;
  if (FIRE_PROOF.has(e.typeId) || e.hasTag("fire_immunity")) return false;
  try { if (!e.getComponent("minecraft:health")) return false; } catch (err) { return false; }
  return true;
}
function spreadFrom(src, st, now) {
  if (now - (st.lastSpread ?? -9999) < SPREAD_EVERY) return;
  st.lastSpread = now;
  const near = src.dimension.getEntities({ location: src.location, maxDistance: SPREAD_RADIUS });
  for (const o of near) {
    if (o.id === src.id || burning.has(o.id) || !canCatchFire(o)) continue;
    if (burnColourOf(o)) continue;
    // the new victim burns with the same colour (rainbow stays rainbow)
    let c = st.colour;
    if (!FIRE_EFFECTS[c] && c !== "rainbow") c = "orange";
    startBurn(o, c);
    const nst = burning.get(o.id);
    if (nst) { nst.lastSpread = now; igniteNow(o, nst, now); }
    try { o.dimension.playSound("fire.ignite", o.location); } catch (err) {}
  }
}
// No vanilla fire any more (it was put out by water/rain/leaving the block and flickered). The flame is the
// particle drawn in the loop below and the damage is dealt by hand every BURN_DAMAGE_EVERY ticks until it dies.
// Each burn tick the target keeps (1 - BURN_PERCENT) of its health; once that falls below BURN_KILL_BELOW it dies at once.
function burnHealth(entity) {
  try {
    if (entity.typeId === "minecraft:player") {
      const gm = String(entity.getGameMode?.() ?? "").toLowerCase();
      if (gm === "creative" || gm === "spectator") return;
    }
    const h = entity.getComponent("minecraft:health");
    if (!h) return;
    const before = h.currentValue;
    const next = before * (1 - BURN_PERCENT);
    if (next < BURN_KILL_BELOW) { entity.kill(); return; }
    // A real (tiny) fire hit first so the target flashes red, plays its hurt sound and shows the damage animation;
    // setCurrentValue alone changes health silently. The exact percentage is then written over the result.
    try { entity.applyDamage(0.1, { cause: EntityDamageCause.fireTick }); } catch (err) {}
    if (!entity.isValid) return;
    const h2 = entity.getComponent("minecraft:health") ?? h;
    h2.setCurrentValue(Math.min(before, next));
  } catch (err) {}
}
// Burning for 3 minutes without dying (fire-proof / immune / regenerating): health -> 0, and if it is somehow still
// there on the next check it is removed from the world (players cannot be removed, they are killed instead).
function enforceBurnLimit(e, st) {
  let since;
  try { since = e.getDynamicProperty(BURN_SINCE); } catch (err) {}
  if (typeof since !== "number") { try { e.setDynamicProperty(BURN_SINCE, Date.now()); } catch (err) {} return; }
  if (Date.now() - since < BURN_LIMIT_MS) return;
  if (st.zeroed) {
    try { e.remove(); } catch (err) { try { e.kill(); } catch (err2) {} }
    return;
  }
  st.zeroed = true;
  try { e.getComponent("minecraft:health")?.setCurrentValue(0); } catch (err) {}
  try { if (e.isValid) e.kill(); } catch (err) {}
}
function igniteNow(entity, st, now) {
  if (FIRE_PROOF.has(entity.typeId)) return;
  if (now - st.lastIgnite >= BURN_DAMAGE_EVERY) {
    st.lastIgnite = now;
    burnHealth(entity);
  }
  if (now - st.lastFx >= 40) {
    st.lastFx = now;
    let c = st.colour;
    if (c === "rainbow") c = RAINBOW_POOL[Math.floor(Math.random() * RAINBOW_POOL.length)];
    const def = FIRE_EFFECTS[c];
    if (def) entity.addEffect(def.fx[0], EFFECT_TICKS, { amplifier: def.fx[1], showParticles: true });
  }
}
// ---- Hitbox size of an entity (used to scale the flames) ------------------------------------
// 1) the engine's own bounding box when the Script API offers it (getAABB), 2) a table of vanilla hitboxes,
// 3) an estimate from the head height. Result is multiplied by the entity's scale / baby state and cached.
const HITBOX_TABLE = { // [width, height]
  "minecraft:player": [0.6, 1.8], "minecraft:zombie": [0.6, 1.95], "minecraft:husk": [0.6, 1.95], "minecraft:drowned": [0.6, 1.95],
  "minecraft:zombie_villager": [0.6, 1.95], "minecraft:skeleton": [0.6, 1.99], "minecraft:stray": [0.6, 1.99], "minecraft:bogged": [0.6, 1.99],
  "minecraft:wither_skeleton": [0.7, 2.4], "minecraft:creeper": [0.6, 1.7], "minecraft:spider": [1.4, 0.9], "minecraft:cave_spider": [0.7, 0.5],
  "minecraft:enderman": [0.6, 2.9], "minecraft:ender_dragon": [16, 8], "minecraft:wither": [0.9, 3.5], "minecraft:warden": [0.9, 2.9],
  "minecraft:iron_golem": [1.4, 2.7], "minecraft:snow_golem": [0.4, 1.9], "minecraft:ravager": [1.95, 2.2], "minecraft:giant": [3.6, 12],
  "minecraft:ghast": [4, 4], "minecraft:blaze": [0.6, 1.8], "minecraft:breeze": [0.6, 1.77], "minecraft:witch": [0.6, 1.95],
  "minecraft:villager": [0.6, 1.95], "minecraft:villager_v2": [0.6, 1.95], "minecraft:wandering_trader": [0.6, 1.95],
  "minecraft:pillager": [0.6, 1.95], "minecraft:vindicator": [0.6, 1.95], "minecraft:evoker": [0.6, 1.95], "minecraft:vex": [0.4, 0.8],
  "minecraft:piglin": [0.6, 1.95], "minecraft:piglin_brute": [0.6, 1.95], "minecraft:zombie_pigman": [0.6, 1.95], "minecraft:zombified_piglin": [0.6, 1.95],
  "minecraft:hoglin": [1.4, 1.4], "minecraft:zoglin": [1.4, 1.4], "minecraft:strider": [0.9, 1.7], "minecraft:elder_guardian": [1.9, 1.9],
  "minecraft:guardian": [0.85, 0.85], "minecraft:phantom": [0.9, 0.5], "minecraft:shulker": [1, 1], "minecraft:silverfish": [0.4, 0.3],
  "minecraft:endermite": [0.4, 0.3], "minecraft:cow": [0.9, 1.4], "minecraft:mooshroom": [0.9, 1.4], "minecraft:pig": [0.9, 0.9],
  "minecraft:sheep": [0.9, 1.3], "minecraft:chicken": [0.4, 0.7], "minecraft:horse": [1.4, 1.6], "minecraft:donkey": [1.4, 1.6],
  "minecraft:mule": [1.4, 1.6], "minecraft:skeleton_horse": [1.4, 1.6], "minecraft:zombie_horse": [1.4, 1.6], "minecraft:llama": [0.9, 1.87],
  "minecraft:camel": [1.7, 2.375], "minecraft:sniffer": [1.9, 1.75], "minecraft:wolf": [0.6, 0.85], "minecraft:cat": [0.6, 0.7],
  "minecraft:ocelot": [0.6, 0.7], "minecraft:fox": [0.6, 0.7], "minecraft:rabbit": [0.4, 0.5], "minecraft:bee": [0.7, 0.6],
  "minecraft:bat": [0.5, 0.9], "minecraft:polar_bear": [1.4, 1.4], "minecraft:panda": [1.3, 1.25], "minecraft:turtle": [1.2, 0.4],
  "minecraft:dolphin": [0.9, 0.6], "minecraft:squid": [0.8, 0.8], "minecraft:glow_squid": [0.8, 0.8], "minecraft:goat": [0.9, 1.3],
  "minecraft:frog": [0.5, 0.5], "minecraft:axolotl": [0.75, 0.42], "minecraft:parrot": [0.5, 0.9], "minecraft:armadillo": [0.7, 0.65],
};
const hitboxCache = new Map(); // key -> { w, h }
function entityHitbox(e) {
  let scale = 1;
  try { const sc = e.getComponent("minecraft:scale"); if (sc && typeof sc.value === "number" && sc.value > 0) scale = sc.value; } catch (err) {}
  let baby = false;
  try { baby = !!e.getComponent("minecraft:is_baby"); } catch (err) {}
  // 1) real bounding box from the engine (feature-detected: ignored if the API does not have it or returns nonsense)
  try {
    if (typeof e.getAABB === "function") {
      const bb = e.getAABB();
      const ex = bb?.extent;
      if (ex && Number.isFinite(ex.x) && Number.isFinite(ex.y) && Number.isFinite(ex.z) && ex.y > 0) {
        return { w: Math.max(0.2, 2 * Math.max(ex.x, ex.z)), h: Math.max(0.2, 2 * ex.y) };
      }
    }
  } catch (err) {}
  const key = e.typeId + "|" + scale + "|" + baby;
  const hit = hitboxCache.get(key);
  if (hit) return hit;
  let w, h;
  const t = HITBOX_TABLE[e.typeId];
  if (t) { w = t[0]; h = t[1]; }
  else { // unknown / modded mob: estimate from the head position
    let top = 1.8;
    try { top = Math.max(0.4, e.getHeadLocation().y - e.location.y + 0.25); } catch (err) {}
    h = top; w = Math.max(0.5, Math.min(top * 0.6, top));
  }
  w *= scale; h *= scale;
  if (baby && !t) { /* estimate already reflects the smaller head height */ }
  else if (baby) { w *= 0.5; h *= 0.5; }
  const res = { w: Math.max(0.2, w), h: Math.max(0.2, h) };
  if (hitboxCache.size > 400) hitboxCache.clear();
  hitboxCache.set(key, res);
  return res;
}

system.runInterval(() => {
  const now = system.currentTick;
  for (const [id, st] of [...burning]) {
    let e;
    try { e = world.getEntity(id); } catch (err) { e = undefined; }
    if (!e?.isValid) { burning.delete(id); continue; } // unloaded or dead; the tag re-registers it when it is loaded again
    if (e.hasTag("fire_immunity")) { stopBurn(e); continue; }
    try {
      igniteNow(e, st, now);
      spreadFrom(e, st, now);
      enforceBurnLimit(e, st);
      if (!e.isValid) { burning.delete(id); continue; }
      const loc = e.location;
      // flames follow the mob's hitbox: spread over its width x height, bigger flames + more of them for big mobs
      const hb = entityHitbox(e);
      const area = hb.w * hb.h;
      const sizeK = Math.max(0.5, Math.min(8, Math.sqrt(area) / 1.04)); // 1.0 = player-sized (0.6 x 1.8)
      const count = Math.max(2, Math.min(FLAME_MAX_PER_TICK, Math.round(1.5 + area * 1.4)));
      const rgb = st.colour === "rainbow" ? hueRgb((now * 0.02) % 1) : (FLAME_RGB[st.colour] ?? [1, 1, 1]);
      for (let i = 0; i < count; i++) {
        const map = new MolangVariableMap();
        map.setFloat("variable.cr", rgb[0]); map.setFloat("variable.cg", rgb[1]); map.setFloat("variable.cb", rgb[2]);
        map.setFloat("variable.s", (0.5 + Math.random() * 0.3) * sizeK);
        e.dimension.spawnParticle("avaritia:burn_flame", {
          x: loc.x + (Math.random() - 0.5) * hb.w * 0.9,
          y: loc.y + Math.random() * hb.h,
          z: loc.z + (Math.random() - 0.5) * hb.w * 0.9,
        }, map);
      }
    } catch (err) {}
  }
}, 2);
// Death ends the curse (players too: tags would otherwise survive a respawn)
world.afterEvents.entityDie.subscribe((ev) => { try { stopBurn(ev.deadEntity); } catch (err) {} });
world.afterEvents.playerSpawn.subscribe((ev) => { try { if (!ev.initialSpawn) stopBurn(ev.player); } catch (err) {} });

function applyFire(entity, colour) {
  if (!FIRE_EFFECTS[colour] && colour !== "rainbow") colour = "orange";
  startBurn(entity, colour);
  // first hit applies immediately; the loop above keeps it going forever
  const st = burning.get(entity.id);
  igniteNow(entity, st, system.currentTick);
}

// Eternal fire burns whatever stands in it (but never spreads and never burns out)
system.runInterval(() => {
  try {
    for (const player of world.getAllPlayers()) {
      const seen = new Set();
      const list = [player, ...player.dimension.getEntities({ location: player.location, maxDistance: 24 })];
      for (const e of list) {
        if (!e?.isValid || seen.has(e.id)) continue;
        seen.add(e.id);
        if (e.typeId === "minecraft:item" || e.typeId === "minecraft:xp_orb") continue;
        if (e.hasTag("fire_immunity")) continue;
        const loc = e.location;
        const b = e.dimension.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
        const b2 = e.dimension.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y + 1), z: Math.floor(loc.z) });
        const colour = fireColour(b) ?? fireColour(b2);
        if (colour) { try { applyFire(e, colour); } catch (err) {} }
        else if (!burning.has(e.id)) { const tagged = burnColourOf(e); if (tagged) startBurn(e, tagged); }
      }
    }
  } catch (err) {}
}, 10);

// ===================== ENTITY INTERACTION =====================
const WOOL = ["white","orange","magenta","light_blue","yellow","lime","pink","gray","light_gray","cyan","purple","blue","brown","green","red","black"];

world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
  const player = ev.player;
  const target = ev.target;
  const item = ev.itemStack ?? mainhand(player);
  if (!item || !target) return;

  if (item.typeId === ID.shears) {
    if (!debounce(player, "shear", 6)) return;
    try {
      if (target.typeId === "minecraft:sheep") {
        if (target.getComponent("minecraft:is_baby") || target.getComponent("minecraft:is_sheared")) return;
        const col = target.getComponent("minecraft:color")?.value ?? 0;
        target.triggerEvent("minecraft:on_sheared");
        const n = 1 + Math.floor(Math.random() * 3) + 2;
        target.dimension.spawnItem(new ItemStack(`minecraft:${WOOL[col] ?? "white"}_wool`, n), target.location);
        player.playSound("mob.sheep.shear");
      } else if (target.typeId === "minecraft:mooshroom") {
        if (target.getComponent("minecraft:is_baby")) return;
        const loc = target.location, dim = target.dimension;
        target.remove();
        dim.spawnEntity("minecraft:cow", loc);
        dim.spawnItem(new ItemStack("minecraft:red_mushroom", 5), loc);
        player.playSound("mob.sheep.shear");
      }
    } catch (e) {}
    return;
  }

  if (item.typeId === ID.flint) {
    if (player.isSneaking) return; // sneak = change mode only
    if (!debounce(player, "flintEntity", 6)) return;
    try {
      if (target.typeId === "minecraft:creeper") target.triggerEvent("minecraft:start_exploding_forced");
      // Ignite the entity directly with the selected fire colour's effect
      if (target.typeId !== "minecraft:item" && !target.hasTag("fire_immunity")) {
        applyFire(target, FIRE_MODES[flintMode(player)].id);
      }
      player.playSound("fire.ignite");
    } catch (e) {}
  }
});

// Shears: leaves / webs / vines etc. also drop themselves (like silk-touch shears)
const SHEAR_BLOCKS = new Set(["minecraft:web","minecraft:vine","minecraft:glow_lichen","minecraft:hanging_roots","minecraft:sculk_vein","minecraft:tallgrass","minecraft:deadbush"]);
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  try {
    const held = ev.itemStackAfterBreak ?? mainhand(ev.player);
    if (held?.typeId !== ID.shears) return;
    const perm = ev.brokenBlockPermutation;
    const bid = perm.type.id;
    if (!(bid.includes("leaves") || bid.includes("wool") || SHEAR_BLOCKS.has(bid))) return;
    const stack = perm.getItemStack(1);
    if (stack) ev.block.dimension.spawnItem(stack, center(ev.block));
  } catch (e) {}
});
