import * as MC from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { playGachaAnimation, STYLE_NAMES, FRAME_NAMES } from "./gachaAnim.js";

/**
 * ===== GACHA MACHINE (resource-devouring gacha) =====
 * Block avaritia:gacha_machine: HOLD a resource in hand then use the block.
 * The machine DEVOURS any resource (except tools/armor/enchanted gear...).
 * Each item has a "value" (VALUES). Each pull needs total value = PULL_VALUE
 * -> the rarer the item, the fewer are needed AND the higher the QUALITY,
 * i.e. the better the drop rates for Rare/Epic/Legendary/Unreal (see RATES).
 * Rarity: Common -> Rare -> Epic -> Legendary (singularity) -> UNREAL (infinity).
 *   Quality: Junk -> Basic -> Good -> Great -> Elite -> Cosmic
 * Quality is computed from the BASE item (block = same grade as ingot/shard, see GRADE_BASE)
 * -> compressing resources into blocks does NOT raise the grade.
 * PITY: grows with quality (PITY_GAIN) - devouring junk cannot "farm pity".
 *   - Unreal: soft pity from threshold 400, guaranteed at 500
 *   - Legendary: guaranteed 1 Legendary (or better) when the counter reaches 350
 *   - Epic: guaranteed 1 Epic (or better) when the counter reaches 100
 * Pity data is stored as a dynamic property on the player.
 * Edit values / rates / rewards in the CONFIG section below.
 * (Open the menu from anywhere: /scriptevent avaritia:gacha)
 */

// ===================== CONFIG =====================
const MACHINE_BLOCK = "avaritia:gacha_machine";

// Each pull needs this total value. x10 = 10 times the price (no discount).
const PULL_VALUE = 160;
const TEN_PULL_MULT = 10;
const DEFAULT_VALUE = 0.5; // item not in the table -> treated as junk

// Value of 1 item (points). You can add more freely.
const VALUES = {
  // --- Vanilla resources ---
  "minecraft:coal": 3, "minecraft:charcoal": 2, "minecraft:coal_block": 27,
  "minecraft:raw_copper": 2, "minecraft:copper_ingot": 3, "minecraft:copper_block": 27,
  "minecraft:raw_iron": 6, "minecraft:iron_ingot": 8, "minecraft:iron_nugget": 1, "minecraft:iron_block": 72,
  "minecraft:raw_gold": 15, "minecraft:gold_ingot": 20, "minecraft:gold_nugget": 2, "minecraft:gold_block": 180,
  "minecraft:redstone": 3, "minecraft:redstone_block": 27,
  "minecraft:lapis_lazuli": 3, "minecraft:lapis_block": 27,
  "minecraft:quartz": 4, "minecraft:quartz_block": 16,
  "minecraft:amethyst_shard": 4, "minecraft:amethyst_block": 16,
  "minecraft:glowstone_dust": 3, "minecraft:blaze_rod": 6, "minecraft:slime_ball": 3,
  "minecraft:ender_pearl": 10, "minecraft:ender_eye": 15, "minecraft:obsidian": 3, "minecraft:crying_obsidian": 6,
  "minecraft:diamond": 50, "minecraft:diamond_block": 450,
  "minecraft:emerald": 60, "minecraft:emerald_block": 540,
  "minecraft:echo_shard": 30, "minecraft:shulker_shell": 40, "minecraft:heart_of_the_sea": 1000,
  "minecraft:ancient_debris": 120, "minecraft:netherite_scrap": 100,
  "minecraft:netherite_ingot": 400, "minecraft:netherite_block": 3600,
  "minecraft:nether_star": 1200,
  "minecraft:dragon_egg": 5000, "minecraft:sculk_catalyst": 1200,
  // --- Avaritia ---
  "avaritia:pile_of_neutrons": 5, "avaritia:neutronium_nugget": 12,
  "avaritia:neutronium_ingot": 108, "avaritia:neutronium_block_item": 972,
  "avaritia:diamond_lattice": 450, "avaritia:starfuel": 150, "avaritia:record_fragment": 30,
  "avaritia:neutronium_star": 300, "avaritia:neutronium_gear": 300,
  "avaritia:crystal_matrix": 400, "avaritia:crystal_matrix_block": 3600,
  "avaritia:endest_pearl": 200,
  "avaritia:infinity_nugget": 600, "avaritia:infinity_ingot": 5400, "avaritia:infinity_catalyst": 3000,
  "avaritia:infinity_block": 48600,
};

// Quality by the value of 1 item: [minimum value, name]. Ascending.
const GRADES = [
  { min: 0, name: "Junk", color: "§8" },
  { min: 2, name: "Basic", color: "§7" },
  { min: 10, name: "Good", color: "§a" },
  { min: 40, name: "Great", color: "§b" },
  { min: 150, name: "Elite", color: "§d" },
  { min: 1000, name: "Cosmic", color: "§6" },
];

// Quality is computed from the value of the BASE item: block/blocks take the grade of the matching ingot/shard
// -> compressing into blocks does not raise the grade (it only changes how the price is paid).
const GRADE_BASE = {
  "minecraft:coal_block": "minecraft:coal",
  "minecraft:copper_block": "minecraft:copper_ingot",
  "minecraft:iron_block": "minecraft:iron_ingot",
  "minecraft:gold_block": "minecraft:gold_ingot",
  "minecraft:redstone_block": "minecraft:redstone",
  "minecraft:lapis_block": "minecraft:lapis_lazuli",
  "minecraft:quartz_block": "minecraft:quartz",
  "minecraft:amethyst_block": "minecraft:amethyst_shard",
  "minecraft:diamond_block": "minecraft:diamond",
  "minecraft:emerald_block": "minecraft:emerald",
  "minecraft:netherite_block": "minecraft:netherite_ingot",
  "avaritia:neutronium_block_item": "avaritia:neutronium_ingot",
  "avaritia:crystal_matrix_block": "avaritia:crystal_matrix",
  "avaritia:infinity_block": "avaritia:infinity_ingot",
};

// Rates by quality: [Common, Rare, Epic, Legendary, Unreal] (total = 1)
const RATES = [
  [0.93, 0.06, 0.008, 0.0019, 0.0001],
  [0.83985, 0.145, 0.01, 0.005, 0.00015],
  [0.7108, 0.22, 0.05, 0.019, 0.0002],
  [0.6425, 0.25, 0.07, 0.037, 0.0005],
  [0.509, 0.33, 0.1, 0.06, 0.001],
  [0.298, 0.42, 0.2, 0.08, 0.002],
];
// Pity points added per pull according to quality
const PITY_GAIN = [0, 0.25, 0.5, 1, 1.25, 1.5];

const UNREAL_SOFT_PITY = 400;
const UNREAL_HARD_PITY = 500;
const UNREAL_SOFT_STEP = 0.01; // +1% per point after soft pity
const LEGENDARY_PITY = 350;
const EPIC_PITY = 100;

// Not devoured: tools, armor, weapons... (unless listed in VALUES)
const PROTECTED_RE = /(sword|axe|pickaxe|shovel|hoe|helmet|chestplate|leggings|boots|bow|mace|trident|crossbow|elytra|shield|shulker_box|totem|bundle|spear|fishing_rod|shears|flint_and_steel|brush)/;

// Each entry: [id, min amount, max amount, weight]
const POOLS = {
  common: [
    ["avaritia:pile_of_neutrons", 2, 4, 20],
    ["avaritia:neutronium_nugget", 3, 6, 20],
    ["avaritia:diamond_lattice", 1, 2, 15],
    ["avaritia:starfuel", 1, 2, 15],
    ["avaritia:cosmic_meatballs", 1, 3, 15],
    ["avaritia:record_fragment", 1, 1, 10],
  ],
  rare: [
    ["avaritia:neutronium_ingot", 1, 2, 18],
    ["avaritia:crystal_matrix", 1, 2, 18],
    ["avaritia:neutronium_gear", 1, 1, 10],
    ["avaritia:neutronium_star", 1, 1, 10],
    ["avaritia:endest_pearl", 1, 2, 8],
    ["avaritia:ultimate_stew", 1, 1, 8],
  ],
  epic: [
    ["avaritia:crystal_matrix_block", 1, 1, 14],
    ["avaritia:neutronium_block_item", 1, 1, 10],
    ["avaritia:infinity_nugget", 3, 6, 16],
    ["avaritia:infinity_catalyst", 1, 1, 10],
    ["avaritia:skullfire_sword", 1, 1, 10],
  ],
  // Legendary = singularity (cheap items -> high weight, premium items -> low weight)
  legendary: [
    ["avaritia:coal_singularity", 1, 1, 6],
    ["avaritia:iron_singularity", 1, 1, 6],
    ["avaritia:copper_singularity", 1, 1, 6],
    ["avaritia:lapis_singularity", 1, 1, 6],
    ["avaritia:redstone_singularity", 1, 1, 6],
    ["avaritia:quartz_singularity", 1, 1, 6],
    ["avaritia:slime_singularity", 1, 1, 6],
    ["avaritia:soul_sand_singularity", 1, 1, 6],
    ["avaritia:honey_singularity", 1, 1, 6],
    ["avaritia:amethyst_singularity", 1, 1, 6],
    ["avaritia:netherrack_singularity", 1, 1, 6],
    ["avaritia:glowstone_singularity", 1, 1, 6],
    ["avaritia:prismarine_singularity", 1, 1, 6],
    ["avaritia:end_stone_singularity", 1, 1, 6],
    ["avaritia:magma_singularity", 1, 1, 6],
    ["avaritia:bone_singularity", 1, 1, 6],
    ["avaritia:ice_singularity", 1, 1, 6],
    ["avaritia:obsidian_singularity", 1, 1, 6],
    ["avaritia:gold_singularity", 1, 1, 6],
    ["avaritia:diamond_singularity", 1, 1, 4],
    ["avaritia:emerald_singularity", 1, 1, 4],
    ["avaritia:netherite_singularity", 1, 1, 4],
    ["avaritia:experience_singularity", 1, 1, 12], // 2x compared to the regular singularities (weight 6)
    ["avaritia:ultimate_singularity", 1, 1, 1],
  ],
  // Unreal = Infinity items (highest tier)
  unreal: [
    ["avaritia:infinity_ingot", 1, 1, 35],
    ["avaritia:infinity_catalyst", 2, 3, 15],
    ["avaritia:infinity_block", 1, 1, 5],
    ["avaritia:infinity_helmet", 1, 1, 4],
    ["avaritia:infinity_chestplate", 1, 1, 4],
    ["avaritia:infinity_leggings", 1, 1, 4],
    ["avaritia:infinity_boots", 1, 1, 4],
    ["avaritia:infinity_sword", 1, 1, 4],
    ["avaritia:infinity_pickaxe", 1, 1, 4],
    ["avaritia:infinity_axe", 1, 1, 4],
    ["avaritia:infinity_shovel", 1, 1, 4],
    ["avaritia:infinity_hoe", 1, 1, 4],
    ["infinity_bow:bow", 1, 1, 4],
    ["avaritia:infinity_mace", 1, 1, 4],
    // --- gear / utilities that were missing from the gacha ---
    ["avaritia:infinity_trident", 1, 1, 4],
    ["avaritia:infinity_crossbow", 1, 1, 4],
    ["avaritia:infinity_spear", 1, 1, 4],
    ["avaritia:infinity_scythe", 1, 1, 4],
    ["avaritia:infinity_shield", 1, 1, 4],
    ["avaritia:infinity_hammer", 1, 1, 4],
    ["avaritia:infinity_destroyer", 1, 1, 4],
    ["avaritia:infinity_fishing_rod", 1, 1, 4],
    ["avaritia:infinity_shears", 1, 1, 4],
    ["avaritia:infinity_bucket", 1, 1, 4],
    ["avaritia:infinity_flint_and_steel", 1, 1, 4],
    ["avaritia:infinity_totem", 1, 1, 3],
    ["avaritia:infinity_totem_berserker", 1, 1, 2],
    ["avaritia:infinity_totem_clairvoyance", 1, 1, 2],
    ["avaritia:infinity_totem_ender", 1, 1, 2],
    ["avaritia:infinity_totem_fortune", 1, 1, 2],
    ["avaritia:infinity_totem_frost", 1, 1, 2],
    ["avaritia:infinity_totem_gale", 1, 1, 2],
    ["avaritia:infinity_totem_inferno", 1, 1, 2],
    ["avaritia:infinity_totem_mercy", 1, 1, 2],
    ["avaritia:infinity_totem_shadow", 1, 1, 2],
    ["avaritia:infinity_totem_tide", 1, 1, 2],
    ["avaritia:infinity_totem_vitality", 1, 1, 2],
    ["avaritia:infinity_totem_void", 1, 1, 2],
  ],
};

const TIER_INFO = {
  common: { label: "Common", color: "§7", stars: "★★★" },
  rare: { label: "Rare", color: "§b", stars: "★★★★" },
  epic: { label: "Epic", color: "§d", stars: "★★★★★" },
  legendary: { label: "LEGENDARY", color: "§6", stars: "★★★★★★" },
  unreal: { label: "UNREAL", color: "§c", stars: "★★★★★★★" },
};
// ==================================================

const PROP_PITY_UNREAL = "avaritia:gacha_pity_unreal";
const PROP_PITY_EPIC = "avaritia:gacha_pity_epic";
const PROP_PITY_LEGENDARY = "avaritia:gacha_pity_legendary";
const PROP_TOTAL = "avaritia:gacha_total_pulls";
const PROP_ANIM = "avaritia:gacha_anim_style"; // 0 = Off, 1..6 = animation style (default 1)
const PROP_FRAME = "avaritia:gacha_frame_style"; // 0 = default, 1..5 = reel frame skin
const REEL_STYLE = 3; // STYLE_NAMES index of "Reel" (0 Off, 1 Drop, 2 Wheel, 3 Reel...) - only this mode has a frame


// ---------- Utilities ----------
function getState(player) {
  return {
    pityUnreal: Number(player.getDynamicProperty(PROP_PITY_UNREAL) ?? 0),
    pityEpic: Number(player.getDynamicProperty(PROP_PITY_EPIC) ?? 0),
    pityLegendary: Number(player.getDynamicProperty(PROP_PITY_LEGENDARY) ?? 0),
    total: Number(player.getDynamicProperty(PROP_TOTAL) ?? 0),
  };
}

function saveState(player, st) {
  player.setDynamicProperty(PROP_PITY_UNREAL, st.pityUnreal);
  player.setDynamicProperty(PROP_PITY_EPIC, st.pityEpic);
  player.setDynamicProperty(PROP_PITY_LEGENDARY, st.pityLegendary);
  player.setDynamicProperty(PROP_TOTAL, st.total);
}

function itemNameKey(id) {
  return id.split(":")[1] + ".name";
}

function countItem(player, typeId) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return 0;
  let n = 0;
  for (let i = 0; i < container.size; i++) {
    const it = container.getItem(i);
    if (it && it.typeId === typeId) n += it.amount;
  }
  return n;
}

function removeItem(player, typeId, amount) {
  const container = player.getComponent("inventory")?.container;
  if (!container) return false;
  if (countItem(player, typeId) < amount) return false;
  let left = amount;
  for (let i = 0; i < container.size && left > 0; i++) {
    const it = container.getItem(i);
    if (!it || it.typeId !== typeId) continue;
    if (it.amount <= left) {
      left -= it.amount;
      container.setItem(i, undefined);
    } else {
      it.amount -= left;
      left = 0;
      container.setItem(i, it);
    }
  }
  return true;
}

function giveItem(player, typeId, amount) {
  const container = player.getComponent("inventory")?.container;
  let remaining = amount;
  while (remaining > 0) {
    let stack;
    try {
      stack = new MC.ItemStack(typeId, 1);
    } catch (e) {
      return; // id does not exist -> skip, avoid crashing the script
    }
    const n = Math.min(remaining, stack.maxAmount);
    stack.amount = n;
    remaining -= n;
    let leftover = stack;
    if (container) leftover = container.addItem(stack);
    if (leftover) player.dimension.spawnItem(leftover, player.location);
  }
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickWeighted(pool) {
  let total = 0;
  for (const e of pool) total += e[3];
  let r = Math.random() * total;
  for (const e of pool) {
    r -= e[3];
    if (r < 0) return e;
  }
  return pool[pool.length - 1];
}

function gradeOf(unit) {
  let g = 0;
  for (let i = 0; i < GRADES.length; i++) if (unit >= GRADES[i].min) g = i;
  return g;
}

// ---------- Price guessing for unknown items (not in VALUES) ----------
// Base price guessed from the name (UNKNOWN_*), then multiplied by a self-learned "ease of obtaining" factor:
//  - Each devour records the amount put into the machine (world-wide).
//  - Items put in MORE than the average of unknown items -> easy to obtain -> price gradually drops.
//  - Items rarely put in (or never) -> hard to obtain -> price gradually rises.
// The factor runs smoothly (no cutoff threshold): factor = ((U + PRIOR) / (AVG + PRIOR)) ^ -0.5,
// clamped within [FACTOR_MIN, FACTOR_MAX]. At the very start AVG is small so factor ~ 1 (nothing learned yet).
// Data decays over time (every DECAY_STEP_MS = 5 minutes it drops by 20%, fully erased after FADE_MS = 1 hour) so prices follow the market.
// The price has no cap; only the item's GRADE (quality) is capped at Good (UNKNOWN_GRADE_CAP_VALUE).
const UNKNOWN_STRONG_RE = /(netherite|diamond|emerald|star|essence|crystal|gem|relic|rune|heart|core)/;
const UNKNOWN_WEAK_RE = /(ingot|nugget|shard|dust|(^|_)ore($|_)|raw_|scrap|fragment|coin|token)/;
const UNKNOWN_STRONG_VALUE = 12; // Good
const UNKNOWN_WEAK_VALUE = 4; // Basic
const UNKNOWN_MIN_VALUE = 0.1; // lowest price
// The price has NO upper cap (heading to infinity). The item's grade (quality) is still capped at Good
// so you cannot "inflate" the price high and then devour 1 item to get Cosmic.
const UNKNOWN_GRADE_CAP_VALUE = 39;
const PRIOR_UNITS = 40; // larger -> slower to "learn"
const FACTOR_MIN = 0.05;
const FACTOR_MAX = Infinity;
const DECAY_STEP_MS = 5 * 60 * 1000; // every 5 minutes (real time)
const DECAY_KEEP = 0.8; // every 5 minutes only 80% remains (drops 20%) -> the price recovers gradually, no jumps
const FADE_MS = 60 * 60 * 1000; // after 1 hour with no devouring -> that item's data is erased completely
const MAX_TRACKED = 300;
// --- BEAT-BASED PRICE INCREASE MECHANISM (independent of the decay/recovery mechanism above) ---
// Every beat (RISE_STEP_MS) in which the item is NOT devoured, the price gets multiplied by one more increasing factor:
//   beat 1: x1.2, beat 2: x1.3, beat 3: x1.4, ... (beat i: x(1.1 + 0.1*i)), cumulative, no cap.
// Devouring an item does NOT reset it to 0: the accumulated beat count drops GRADUALLY (RISE_DROP_BEATS_PER_PULL beats per pull),
// while the old decay/recovery mechanism still runs; once an item goes a full beat without being devoured the price rises again.
const RISE_STEP_MS = 5 * 60 * 1000;
const RISE_BASE = 1.1;
const RISE_INC = 0.1;
const RISE_DROP_BEATS_PER_PULL = 1;
const RISE_MAX_BEATS = 50000; // only to bound the calculation loop
const PROP_EPOCH = "avaritia:gacha_epoch";
let epochCache = null;
const PROP_MARKET = "avaritia:gacha_market";
let marketCache = null;

function loadMarket() {
  if (marketCache) return marketCache;
  try {
    const raw = MC.world.getDynamicProperty(PROP_MARKET);
    marketCache = typeof raw === "string" ? JSON.parse(raw) : {};
  } catch (e) {
    marketCache = {};
  }
  return marketCache;
}

function saveMarket() {
  try {
    MC.world.setDynamicProperty(PROP_MARKET, JSON.stringify(marketCache ?? {}));
  } catch (e) {
    // ignore
  }
}

// Each entry: [amount devoured, last update time]
function decayed(e, now) {
  const age = Math.max(0, now - e[1]);
  if (age >= FADE_MS) return 0;
  return e[0] * Math.pow(DECAY_KEEP, age / DECAY_STEP_MS);
}

function noteUnknown(id, units, pulls) {
  const m = loadMarket();
  const now = Date.now();
  // accumulated beats at the moment of devouring (computed before editing the entry)
  const beatsNow = riseBeats(id, now);
  if (!m[id]) {
    const keys = Object.keys(m);
    if (keys.length >= MAX_TRACKED) {
      let low = keys[0];
      let lowV = decayed(m[low], now);
      for (const k of keys) {
        const v = decayed(m[k], now);
        if (v < lowV) { low = k; lowV = v; }
      }
      delete m[low];
    }
    m[id] = [0, now, 0];
  }
  // reduce the beat count gradually (not to 0), time mark = time of the last devour -> once it goes 1 beat without devouring it rises again
  const beats = Math.max(0, beatsNow - RISE_DROP_BEATS_PER_PULL * (pulls ?? 1));
  m[id] = [Math.round((decayed(m[id], now) + units) * 10) / 10, now, beats];
  saveMarket();
}

function marketMean(now) {
  const m = loadMarket();
  const keys = Object.keys(m);
  if (keys.length === 0) return 0;
  let t = 0;
  for (const k of keys) t += decayed(m[k], now);
  return t / keys.length;
}

function rarityFactor(id) {
  const now = Date.now();
  const e = loadMarket()[id];
  const u = e ? decayed(e, now) : 0;
  const f = Math.pow((u + PRIOR_UNITS) / (marketMean(now) + PRIOR_UNITS), -0.5);
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, f));
}

function baseGuess(id) {
  const name = id.split(":")[1] ?? id;
  if (UNKNOWN_STRONG_RE.test(name)) return UNKNOWN_STRONG_VALUE;
  if (UNKNOWN_WEAK_RE.test(name)) return UNKNOWN_WEAK_VALUE;
  return DEFAULT_VALUE;
}

function getEpoch() {
  if (epochCache !== null) return epochCache;
  try {
    const raw = MC.world.getDynamicProperty(PROP_EPOCH);
    if (typeof raw === "number") epochCache = raw;
    else {
      epochCache = Date.now();
      MC.world.setDynamicProperty(PROP_EPOCH, epochCache);
    }
  } catch (e) {
    epochCache = Date.now();
  }
  return epochCache;
}

// The item's current accumulated beats: B saved at the last devour + the number of whole beats elapsed since then.
// Item never devoured: counted from when the machine started running.
function riseBeats(id, now) {
  const e = loadMarket()[id];
  if (!e) return Math.max(0, Math.floor((now - getEpoch()) / RISE_STEP_MS));
  const stored = Number(e[2] ?? 0);
  return Math.max(0, stored + Math.floor(Math.max(0, now - e[1]) / RISE_STEP_MS));
}

// ln of the price-increase factor after B beats = sum of ln(1.1 + 0.1*i), i = 1..B (computed in log form to avoid overflow)
function riseLog(beats) {
  const n = Math.min(Math.floor(beats), RISE_MAX_BEATS);
  let sum = 0;
  for (let i = 1; i <= n; i++) sum += Math.log(RISE_BASE + RISE_INC * i);
  return sum;
}

function riseFactor(id) {
  return Math.exp(Math.min(riseLog(riseBeats(id, Date.now())), 700));
}

function guessValue(id) {
  const logP =
    Math.log(baseGuess(id)) + Math.log(rarityFactor(id)) + riseLog(riseBeats(id, Date.now()));
  return Math.max(UNKNOWN_MIN_VALUE, Math.exp(Math.min(logP, 700)));
}

// Read the item currently held in hand -> "grade" information
function getOffer(player) {
  const eq = player.getComponent("equippable");
  const item = eq?.getEquipment("Mainhand");
  if (!item) return null;
  const id = item.typeId;
  const known = VALUES[id] !== undefined;
  if (!known) {
    if (PROTECTED_RE.test(id)) return null;
    try {
      if (item.getComponent("minecraft:durability")) return null;
      const ench = item.getComponent("minecraft:enchantable");
      if (ench && ench.getEnchantments().length > 0) return null;
    } catch (e) {
      // ignore
    }
    if (item.nameTag) return null;
  }
  const unit = known ? VALUES[id] : guessValue(id);
  const baseId = GRADE_BASE[id];
  const gradeUnit = baseId && VALUES[baseId] !== undefined ? VALUES[baseId] : unit;
  const grade = gradeOf(known ? gradeUnit : Math.min(gradeUnit, UNKNOWN_GRADE_CAP_VALUE));
  const cost1 = Math.max(1, Math.ceil(PULL_VALUE / unit));
  return {
    id,
    name: displayName(id),
    unit,
    estimated: !known,
    grade,
    cost1,
    cost10: cost1 * TEN_PULL_MULT,
    have: countItem(player, id),
  };
}

function unrealChance(grade, pityUnreal) {
  const p = Math.floor(pityUnreal);
  if (p >= UNREAL_HARD_PITY) return 1;
  let c = RATES[grade][4];
  if (p >= UNREAL_SOFT_PITY) c += (p - UNREAL_SOFT_PITY + 1) * UNREAL_SOFT_STEP;
  return Math.min(c, 1);
}

// ---------- Single pull ----------
function rollOne(st, grade) {
  const rates = RATES[grade];
  st.total++;
  st.pityUnreal += PITY_GAIN[grade];
  st.pityEpic += PITY_GAIN[grade];
  st.pityLegendary += PITY_GAIN[grade];
  const unC = unrealChance(grade, st.pityUnreal);
  const r = Math.random();
  let tier;
  if (r < unC) tier = "unreal";
  else if (Math.floor(st.pityLegendary) >= LEGENDARY_PITY || r < unC + rates[3]) tier = "legendary";
  else if (Math.floor(st.pityEpic) >= EPIC_PITY || r < unC + rates[3] + rates[2]) tier = "epic";
  else if (r < unC + rates[3] + rates[2] + rates[1]) tier = "rare";
  else tier = "common";

  if (tier === "unreal") {
    st.pityUnreal = 0;
    st.pityLegendary = 0;
    st.pityEpic = 0;
  } else if (tier === "legendary") {
    st.pityLegendary = 0;
    st.pityEpic = 0;
  } else if (tier === "epic") {
    st.pityEpic = 0;
  }
  const entry = pickWeighted(POOLS[tier]);
  return { tier, id: entry[0], amount: randInt(entry[1], entry[2]) };
}

// ---------- UI ----------
// This form is replaced by a dedicated UI in RP/ui/server_form.json (recognized
// via UI_TITLE). Always sends EXACTLY 4 buttons in a fixed order so the UI can map indexes:
//   0 = Pull x1, 1 = Pull x10, 2 = Rates / Back, 3 = Close
const UI_TITLE = "avaritia:gacha_ui";

const NAME_OVERRIDES = {
  "avaritia:infinity_sword": "Sword of the Cosmos",
  "avaritia:infinity_axe": "Nature's Ruins",
  "avaritia:infinity_pickaxe": "World Breaker",
  "avaritia:infinity_shovel": "Planet Eater",
  "avaritia:infinity_hoe": "Hoe of the Green Earth",
  "infinity_bow:bow": "Longbow of the Heavens",
  "avaritia:infinity_chestplate": "Infinity Breastplate",
  "avaritia:infinity_leggings": "Infinity Pants",
  "avaritia:neutronium_block_item": "Block of Neutronium",
  "avaritia:crystal_matrix_block": "Block of Crystal Matrix",
  "avaritia:infinity_block": "Block of Infinity",
  "minecraft:lapis_lazuli": "Lapis Lazuli",
};

function displayName(id) {
  if (NAME_OVERRIDES[id]) return NAME_OVERRIDES[id];
  return id
    .split(":")[1]
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const fmt = (n) => {
  if (!Number.isFinite(n)) return "inf";
  if (n >= 1e6) return n.toExponential(2);
  if (n < 1) return n.toFixed(2);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};
const pct = (v) => {
  const x = v * 100;
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
};

function pityLines(st) {
  return (
    `§cUnreal pity: §f${Math.floor(st.pityUnreal)}§7/${UNREAL_HARD_PITY}\n` +
    `§6Legendary pity: §f${Math.floor(st.pityLegendary)}§7/${LEGENDARY_PITY}\n` +
    `§dEpic pity: §f${Math.floor(st.pityEpic)}§7/${EPIC_PITY}`
  );
}

function menuBody(player, notice) {
  const st = getState(player);
  const o = getOffer(player);
  let top;
  if (!o) {
    top =
      `§cHold a resource in your hand\n` +
      `§7The machine swallows any resource.\n` +
      `§7(tools, armor & enchanted items are refused)\n`;
  } else {
    const g = GRADES[o.grade];
    top =
      `§eOffering: §f${o.name} §7(value ${fmt(o.unit)}${o.estimated ? " est." : ""})\n` +
      `§7Quality: ${g.color}${g.name}\n` +
      `§7x1: §f${o.cost1} §7| x10: §f${o.cost10} §7| Have: §f${o.have}\n` +
      `§8(1 pull = ${PULL_VALUE} value = ${o.cost1} x ${o.name})\n`;
  }
  return (
    (notice ? notice + "\n" : "") + top + "\n" + pityLines(st) + `\n§7Total pulls: §f${st.total}`
  );
}

// --- Column alignment by font pixel width (Bedrock has no monospace font) ---
// Character width (including 1px spacing): default 5+1; narrow characters are listed separately.
const NARROW_W = {
  " ": 4, "i": 2, "l": 3, "t": 4, "f": 5, "k": 5, "I": 4, ".": 2, ":": 2, ",": 2,
  "!": 2, "'": 2, "|": 2, "(": 4, ")": 4, "[": 4, "]": 4, "*": 4, "<": 5, ">": 5,
};
function pxWidth(str) {
  let w = 0;
  for (const ch of str.replace(/§./g, "")) w += NARROW_W[ch] ?? 6;
  return w;
}
// Add spaces (4px) until the line is about `target` px long.
function padToPx(line, target) {
  const n = Math.max(1, Math.round((target - pxWidth(line)) / 4));
  return line + " ".repeat(n);
}

// Rates table: each COLUMN is a separate label in RP/ui/server_form.json (needs to be
// right-aligned per column), the column contents are sent via the text of the auxiliary buttons (index 4..9).
// The body only contains the title + blank lines reserving space for the table + the footnote below.
const RATE_TABLE_LINES = 7; // 1 header line + 6 quality lines
const pct2 = (v) => String(parseFloat((v * 100).toFixed(3)));

function ratesColumns() {
  const heads = ["Common", "Rare", "Epic", "Legendary", "Unreal"];
  const colors = ["§7", "§b", "§d", "§6", "§c"];
  const cols = [];
  // column 0: grade labels
  cols.push("\n" + "§r \n" + GRADES.map((g) => `${g.color}${g.name}:`).join("\n"));
  for (let c = 0; c < 5; c++) {
    cols.push(
      "\n" + `${colors[c]}${heads[c]}\n` +
      GRADES.map((_, i) => `${colors[c]}${pct2(RATES[i][c])}`).join("\n")
    );
  }
  return cols;
}

function ratesBody() {
  return (
    `§8Chance per quality (%)` + "\n".repeat(RATE_TABLE_LINES + 2) +
    `§7Each pull = §f${PULL_VALUE} value §7(item count = ${PULL_VALUE} / item value).\n` +
    `§7Pity: §dEpic ${EPIC_PITY} §7| §6Legendary ${LEGENDARY_PITY} §7| §cUnreal ${UNREAL_HARD_PITY}`
  );
}

function resultBody(player, results, spent) {
  const st = getState(player);
  const best = results[0].tier;
  const head =
    best === "unreal"
      ? "§c§l★★ UNREAL! ★★§r"
      : best === "legendary"
        ? "§6§l★ LEGENDARY! ★§r"
        : best === "epic"
        ? "§d§lEpic pull!§r"
        : "§aPull result§r";
  const lines = results.map((r) => {
    const info = TIER_INFO[r.tier];
    return `${info.color}${info.stars} §f${displayName(r.id)} x${r.amount}`;
  });
  return (
    `${head} §8(-${spent})\n` + lines.join("\n") +
    `\n§8Pity §c${Math.floor(st.pityUnreal)}§8/${UNREAL_HARD_PITY} §6${Math.floor(st.pityLegendary)}§8/${LEGENDARY_PITY} §d${Math.floor(st.pityEpic)}§8/${EPIC_PITY}`
  );
}

async function showScreen(player, view) {
  let body;
  if (view.mode === "rates") body = ratesBody();
  else if (view.mode === "result") body = resultBody(player, view.results, view.spent);
  else body = menuBody(player, view.notice);
  const form = new ActionFormData()
    .title(UI_TITLE)
    .body(body)
    .button("Pull x1")
    .button("Pull x10")
    .button(view.mode === "rates" ? "Back" : "Rates")
    .button("Close");
  // Auxiliary buttons (only to carry column data for the labels in the UI) - not clickable
  if (view.mode === "rates") for (const col of ratesColumns()) form.button(col);
  else {
    // index 4..9 left empty (for the Rates columns), index 10 = animation style selection button
    for (let i = 4; i < 10; i++) form.button("");
    const st = getAnimStyle(player);
    form.button(`Anim: ${STYLE_NAMES[st]}${st === 6 ? " (x10)" : ""}`);
    // index 11 = frame selection button, ONLY added in Reel mode; other animations have no frame
    // so no button is added -> the UI (collection_index 11) hides itself.
    if (st === REEL_STYLE) form.button(`Frame: ${FRAME_NAMES[getFrameStyle(player)]}`);
  }
  const res = await showForm(player, form);
  if (res.canceled) return;
  if (res.selection === 10 && view.mode !== "rates") {
    setAnimStyle(player, (getAnimStyle(player) + 1) % STYLE_NAMES.length);
    player.playSound("random.click", { volume: 0.6 });
    return showScreen(player, view);
  }
  if (res.selection === 11 && view.mode !== "rates" && getAnimStyle(player) === REEL_STYLE) {
    setFrameStyle(player, (getFrameStyle(player) + 1) % FRAME_NAMES.length);
    player.playSound("random.click", { volume: 0.6 });
    return showScreen(player, view);
  }
  switch (res.selection) {
    case 0: return doPull(player, 1);
    case 1: return doPull(player, 10);
    case 2: return view.mode === "rates" ? openGachaMenu(player) : showScreen(player, { mode: "rates" });
    default: return;
  }
}

function getAnimStyle(player) {
  const v = Number(player.getDynamicProperty(PROP_ANIM) ?? 1);
  return Number.isInteger(v) && v >= 0 && v < STYLE_NAMES.length ? v : 1;
}
function setAnimStyle(player, v) {
  player.setDynamicProperty(PROP_ANIM, v);
}
function getFrameStyle(player) {
  const v = Number(player.getDynamicProperty(PROP_FRAME) ?? 0);
  return Number.isInteger(v) && v >= 0 && v < FRAME_NAMES.length ? v : 0;
}
function setFrameStyle(player, v) {
  player.setDynamicProperty(PROP_FRAME, v);
}

// Random decoy item of a tier (the slot reel scrolls past them before landing on the real one)
function decoyId(tierKey) {
  return pickWeighted(POOLS[tierKey])[0];
}

async function showForm(player, form) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === "UserBusy") {
      await new Promise((r) => MC.system.runTimeout(r, 10));
      continue;
    }
    return res;
  }
  return { canceled: true };
}

export async function openGachaMenu(player, notice) {
  return showScreen(player, { mode: "menu", notice });
}

async function doPull(player, count) {
  const o = getOffer(player);
  if (!o) {
    player.playSound("note.bass");
    return openGachaMenu(player, "§cHold a valid resource in your hand!");
  }
  const cost = count === 10 ? o.cost10 : o.cost1;
  if (o.have < cost) {
    player.playSound("note.bass");
    return openGachaMenu(player, `§cNot enough ${o.name}! Need ${cost}.`);
  }
  if (!removeItem(player, o.id, cost)) {
    return openGachaMenu(player, "§cPayment failed.");
  }
  if (o.estimated) noteUnknown(o.id, cost, count);

  const st = getState(player);
  const results = [];
  for (let i = 0; i < count; i++) results.push(rollOne(st, o.grade));
  saveState(player, st);

  // Merge rewards of the same kind to allocate compactly
  const merged = new Map();
  for (const r of results) merged.set(r.id, (merged.get(r.id) ?? 0) + r.amount);
  for (const [id, amt] of merged) giveItem(player, id, amt);

  // Sort: rarest first
  const order = { unreal: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
  results.sort((a, b) => order[a.tier] - order[b.tier]);

  // Animation (if enabled). The reward was already granted above, the animation is only a visual effect.
  const style = getAnimStyle(player);
  if (style > 0) {
    const top = results[0];
    const info = TIER_INFO[top.tier];
    const caption =
      `${info.color}${displayName(top.id)} §fx${top.amount}\n${info.color}${info.label}` +
      (count > 1 ? ` §8(+${count - 1} more)` : "");
    try {
      await playGachaAnimation(player, { style, frame: style === REEL_STYLE ? getFrameStyle(player) : 0, results, count, caption, decoy: decoyId, showForm });
    } catch (e) {
      // an animation error must not block the result screen
    }
  }
  announce(player, results);
  return showScreen(player, { mode: "result", results, spent: `${cost} ${o.name}` });
}

// ---------- Hieu ung / thong bao ----------
function announce(player, results) {
  let best = "common";
  const order = { common: 0, rare: 1, epic: 2, legendary: 3, unreal: 4 };
  for (const r of results) if (order[r.tier] > order[best]) best = r.tier;
  try {
    const loc = { x: player.location.x, y: player.location.y + 1, z: player.location.z };
    if (best === "unreal") {
      player.playSound("random.totem");
      player.dimension.spawnParticle("minecraft:totem_particle", loc);
      player.onScreenDisplay.setTitle("§c§l★ UNREAL ★", {
        fadeInDuration: 5,
        stayDuration: 60,
        fadeOutDuration: 15,
      });
      const top = results.find((r) => r.tier === "unreal");
      MC.world.sendMessage({
        rawtext: [
          { text: `§c[Gacha] §e${player.name} §7pulled §c` },
          { translate: itemNameKey(top.id) },
          { text: "§7!" },
        ],
      });
    } else if (best === "legendary") {
      player.playSound("random.totem");
      player.dimension.spawnParticle("minecraft:totem_particle", loc);
      player.onScreenDisplay.setTitle("§6§l★ LEGENDARY ★", {
        fadeInDuration: 5,
        stayDuration: 50,
        fadeOutDuration: 15,
      });
    } else if (best === "epic") {
      player.playSound("random.levelup");
      player.dimension.spawnParticle("minecraft:totem_particle", loc);
    } else if (best === "rare") {
      player.playSound("random.levelup", { volume: 0.6, pitch: 1.2 });
    } else {
      player.playSound("random.orb");
    }
  } catch (e) {
    // an effect error must not ruin the pull
  }
}

// ---------- Registration ----------
MC.system.beforeEvents.startup.subscribe((ev) => {
  ev.blockComponentRegistry.registerCustomComponent("avaritia:gacha_interact", {
    onPlayerInteract(event) {
      const { block, player } = event;
      if (!block || !player || block.typeId !== MACHINE_BLOCK) return;
      openGachaMenu(player);
    },
  });
});

MC.system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== "avaritia:gacha") return;
  const player = ev.sourceEntity;
  if (player && player.typeId === "minecraft:player") openGachaMenu(player);
});

// /scriptevent avaritia:gacha_log  -> view the unknown items that were devoured + current price
// /scriptevent avaritia:gacha_log_reset -> clear the price learning data
MC.system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== "avaritia:gacha_log" && ev.id !== "avaritia:gacha_log_reset") return;
  const target = ev.sourceEntity?.typeId === "minecraft:player" ? ev.sourceEntity : null;
  const say = (m) => (target ? target.sendMessage(m) : MC.world.sendMessage(m));
  if (ev.id === "avaritia:gacha_log_reset") {
    marketCache = {};
    saveMarket();
    say("§e[Gacha] Price learning data cleared.");
    return;
  }
  const now = Date.now();
  const rows = Object.entries(loadMarket())
    .map(([id, e]) => [id, decayed(e, now)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  if (rows.length === 0) return say("§e[Gacha] No unknown items have been devoured yet.");
  say("§e[Gacha] Unknown items (id | devoured | current price | rarity factor | beat-rise factor):");
  for (const [id, u] of rows) {
    say(`§7${id} §f| ${fmt(u)} | ${fmt(guessValue(id))} | x${rarityFactor(id).toFixed(2)} | x${fmt(riseFactor(id))}`);
  }
});
