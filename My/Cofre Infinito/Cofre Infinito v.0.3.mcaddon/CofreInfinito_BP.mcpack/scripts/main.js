// storage + hidden lore token), exactly like a vanilla shulker box.
// ---------------------------------------------------------------------------
import {
  world as icWorld,
  system as icSystem,
  ItemStack as IcItemStack,
  EquipmentSlot as IcEquipmentSlot,
  GameMode as IcGameMode,
  StructureSaveMode as IcStructureSaveMode
} from "@minecraft/server";

var IC_BLOCK = "infinitychest:infinity_chest";
var IC_BLOCK_TYPES = [
  IC_BLOCK,
  "infinitychest:infinity_chest_rojo",
  "infinitychest:infinity_chest_negro",
  "infinitychest:infinity_chest_verde",
  "infinitychest:infinity_chest_morado",
  "infinitychest:infinity_chest_blanco",
  "infinitychest:infinity_chest_amarillo",
  "infinitychest:infinity_chest_naranja",
  "infinitychest:infinity_chest_arcoiris",
];
function icIsChestType(typeId) {
  return IC_BLOCK_TYPES.includes(typeId);
}
var IC_ENTITY = "infinitychest:infinity_chest_entity";
var IC_TAG = "infinitychest:infinity_chest_holder";
var IC_NAME = "Cofre Infinito";
var IC_STRUCT_PREFIX = "infinitychest:ichest_";
var IC_STRUCT_COUNTER = "infinitychest:ichest_structure_counter";
var IC_TOKEN_PREFIX = "\u00a7a\u00a7c\u00a7d";
var IC_TOKEN_RESET = "\u00a7r";
var IC_LOC_TAG_PREFIX = "infinitychest_at_";
var IC_STORE_TAG_PREFIX = "infinitychest_store_";
var IC_MAX_LORE = 5;
var IC_VIEW_COLS = 15;
var IC_VIEW_ROWS = 15;
var IC_VIEW_SIZE = IC_VIEW_COLS * IC_VIEW_ROWS;
var IC_LABEL_BASE = 228;
var IC_LABEL_COLS = 15;
var IC_LABEL_ROWS = IC_VIEW_ROWS;
var IC_FILLER = "infinitychest:ui_filler";

// Remove the invisible UI marker immediately if a JSON-UI button ejects it.
// The pager still detects the emptied control slot and changes page as before.
try {
  icWorld.afterEvents.entitySpawn.subscribe((event) => {
    const spawned = event && event.entity;
    if (!spawned || spawned.typeId !== "minecraft:item") return;
    try {
      const itemComponent = spawned.getComponent("minecraft:item");
      const stack = itemComponent && itemComponent.itemStack;
      if (stack && stack.typeId === IC_FILLER) spawned.remove();
    } catch (_) {}
  });
} catch (err) {
  console.warn(`[infinitychest] UI marker cleanup listener unavailable: ${err}`);
}

var IC_MAX_COUNT = 2147483647;
var IC_COUNTS_PROP = "infinitychest:counts";
var IC_DIMS = ["overworld", "nether", "the_end"];

var icPendingPlacement = /* @__PURE__ */ new Map();
var icSuppressedRemoval = /* @__PURE__ */ new Set();

function icGetContainer(entity) {
  try {
    const inv = entity.getComponent("minecraft:inventory") || entity.getComponent("inventory");
    if (inv && inv.container) return inv.container;
  } catch (_) {
  }
  return null;
}

function icBlockLoc(loc) {
  return { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
}

function icCenter(loc) {
  return { x: Math.floor(loc.x) + 0.5, y: Math.floor(loc.y) + 0.25, z: Math.floor(loc.z) + 0.5 };
}

function icSameBlock(a, b) {
  return !!a && !!b && Math.floor(a.x) === Math.floor(b.x) && Math.floor(a.y) === Math.floor(b.y) && Math.floor(a.z) === Math.floor(b.z);
}

function icLocTag(loc) {
  const l = icBlockLoc(loc);
  return `${IC_LOC_TAG_PREFIX}${l.x}_${l.y}_${l.z}`;
}

function icParseLocTag(tag) {
  if (typeof tag !== "string" || !tag.startsWith(IC_LOC_TAG_PREFIX)) return void 0;
  const parts = tag.slice(IC_LOC_TAG_PREFIX.length).split("_").map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) return void 0;
  return { x: parts[0], y: parts[1], z: parts[2] };
}

function icHolderLoc(entity) {
  try {
    for (const tag of entity.getTags()) {
      const parsed = icParseLocTag(tag);
      if (parsed) return parsed;
    }
  } catch (_) {
  }
  try {
    const bl = entity.getDynamicProperty("blockLoc");
    if (bl) return icBlockLoc(bl);
  } catch (_) {
  }
  return void 0;
}

function icMarkHolder(entity, loc) {
  const l = icBlockLoc(loc);
  try {
    for (const tag of entity.getTags()) {
      if (tag.startsWith(IC_LOC_TAG_PREFIX) || tag.startsWith(IC_STORE_TAG_PREFIX)) entity.removeTag(tag);
    }
  } catch (_) {
  }
  try {
    entity.addTag(IC_TAG);
    entity.addTag(icLocTag(l));
    entity.nameTag = IC_NAME;
    entity.setDynamicProperty("blockLoc", l);
    entity.setDynamicProperty("dimId", entity.dimension.id);
  } catch (_) {
  }
}

function icMoveTo(entity, loc, force) {
  try {
    const target = icCenter(loc);
    const cur = entity.location;
    if (Math.abs(cur.x - target.x) < 0.4 && Math.abs(cur.y - target.y) < 0.4 && Math.abs(cur.z - target.z) < 0.4) return;
    if (!force) {
      // Teleporting the holder while a player has its container open makes the
      // client drop everything back into the player's inventory. Only nudge it
      // back into place when nobody is close enough to be using it.
      let nearby = [];
      try {
        nearby = entity.dimension.getPlayers({ location: entity.location, maxDistance: 10 });
      } catch (_) {
        nearby = [];
      }
      if (nearby.length) return;
    }
    entity.teleport(target);
  } catch (_) {
  }
}

function icFindHolder(dim, loc) {
  const l = icBlockLoc(loc);
  try {
    const tagged = dim.getEntities({ type: IC_ENTITY, tags: [icLocTag(l)] })[0];
    if (tagged) return tagged;
  } catch (_) {
  }
  try {
    for (const e of dim.getEntities({ tags: [IC_TAG] })) {
      if (icSameBlock(icHolderLoc(e), l)) return e;
    }
  } catch (_) {
  }
  return null;
}

// --- inventory helpers -----------------------------------------------------

function icSnapshot(entity) {
  const out = [];
  const c = icGetContainer(entity);
  if (!c) return out;
  const limit = Math.min(c.size, IC_VIEW_SIZE);
  for (let i = 0; i < limit; i++) {
    let item;
    try {
      item = c.getItem(i);
    } catch (_) {
      item = void 0;
    }
    out[i] = item ? item.clone ? item.clone() : item : void 0;
  }
  return out;
}

function icHasItems(items) {
  return items.some(Boolean);
}

function icDropItems(dim, items, loc) {
  for (const item of items) {
    if (!item) continue;
    try {
      dim.spawnItem(item, loc);
    } catch (_) {
    }
  }
}

function icRestoreInventory(entity, items) {
  const c = icGetContainer(entity);
  if (!c) {
    icDropItems(entity.dimension, items, entity.location);
    return;
  }
  for (let i = 0; i < c.size; i++) {
    try {
      c.setItem(i, i < items.length ? items[i] : void 0);
    } catch (_) {
    }
  }
}

// --- hidden lore token -----------------------------------------------------

function icStructureKey(index) {
  return `${IC_STRUCT_PREFIX}${Math.max(0, Math.floor(Number(index) || 0))}`;
}

function icIndexFromKey(key) {
  if (typeof key !== "string" || !key.startsWith(IC_STRUCT_PREFIX)) return void 0;
  const raw = key.slice(IC_STRUCT_PREFIX.length);
  return /^\d+$/.test(raw) ? Number(raw) : void 0;
}

function icTokenFromKey(key) {
  const index = icIndexFromKey(key);
  if (index === void 0) return void 0;
  const digits = String(index);
  return `${IC_TOKEN_PREFIX}${[...digits].map((d) => `\u00a7${d}`).join("")}${IC_TOKEN_RESET}`;
}

function icKeyFromToken(token) {
  if (typeof token !== "string") return void 0;
  const start = token.lastIndexOf(IC_TOKEN_PREFIX);
  if (start < 0) return void 0;
  const from = start + IC_TOKEN_PREFIX.length;
  const resetAt = token.indexOf(IC_TOKEN_RESET, from);
  const encoded = token.slice(from, resetAt >= 0 ? resetAt : token.length);
  const digits = [];
  for (let i = 0; i < encoded.length; i += 2) {
    if (encoded[i] !== "\u00a7") return void 0;
    const d = encoded[i + 1];
    if (!/^\d$/.test(d)) return void 0;
    digits.push(d);
  }
  return digits.length ? icStructureKey(Number(digits.join(""))) : void 0;
}

function icRawText(message) {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map(icRawText).join("");
  let text = typeof message.text === "string" ? message.text : "";
  if (Array.isArray(message.rawtext)) text += message.rawtext.map(icRawText).join("");
  return text;
}

function icLastLoreLine(item) {
  try {
    const raw = item && item.getRawLore ? item.getRawLore() : [];
    if (raw && raw.length) return icRawText(raw[raw.length - 1]);
  } catch (_) {
  }
  try {
    const lore = item && item.getLore ? item.getLore() : [];
    if (lore && lore.length) return lore[lore.length - 1];
  } catch (_) {
  }
  return void 0;
}

function icKeyFromItem(item) {
  return icKeyFromToken(icLastLoreLine(item));
}

function icItemDisplay(item) {
  try {
    if (item.nameTag) return { name: item.nameTag, custom: true };
  } catch (_) {
  }
  try {
    const key = item.localizationKey ?? (item.type && item.type.localizationKey);
    if (key) return { name: key, custom: false };
  } catch (_) {
  }
  return { name: item.typeId, custom: false };
}

function icPreviewLore(list) {
  const byKey = /* @__PURE__ */ new Map();
  for (const source of list || []) {
    const item = source && source.item ? source.item : source;
    if (!item) continue;
    const display = icItemDisplay(item);
    const key = `${item.typeId}|${display.custom ? display.name : ""}`;
    const amount = Math.max(1, Number(source && source.total != null ? source.total : item.amount) || 1);
    const existing = byKey.get(key);
    if (existing) {
      existing.amount = Math.min(IC_MAX_COUNT, existing.amount + amount);
      continue;
    }
    byKey.set(key, { name: display.name, custom: display.custom, amount });
  }
  const entries = [...byKey.values()];
  const lore = entries.slice(0, IC_MAX_LORE).map((entry) => entry.custom ? { rawtext: [{ text: `\u00a77\u00a7o${entry.name}\u00a7r\u00a77` }, { text: ` x${entry.amount}` }] } : { rawtext: [{ text: "\u00a7r\u00a77" }, { translate: entry.name }, { text: ` x${entry.amount}` }] });
  const remaining = entries.length - IC_MAX_LORE;
  if (remaining > 0) lore.push({ text: `\u00a7r\u00a77and ${remaining} more...` });
  return lore.length ? lore : void 0;
}

function icAppendToken(lore, structureKey) {
  const token = icTokenFromKey(structureKey);
  if (!token) return lore && lore.length ? lore : void 0;
  const lines = lore && lore.length ? lore : [];
  const last = lines[lines.length - 1];
  const hidden = { text: token };
  if (!last) return [hidden];
  if (Array.isArray(last.rawtext)) {
    last.rawtext.push(hidden);
    return lines;
  }
  lines[lines.length - 1] = { rawtext: [last, hidden] };
  return lines;
}

function icCreateItem(structureKey, entries, blockType) {
  try {
    const item = new IcItemStack(icIsChestType(blockType) ? blockType : IC_BLOCK, 1);
    if (structureKey) item.setLore(icAppendToken(icPreviewLore(entries), structureKey));
    return item;
  } catch (_) {
    return void 0;
  }
}

// --- structure storage -----------------------------------------------------

function icNextStructureKey() {
  let index = 0;
  try {
    index = Math.max(0, Math.floor(Number(icWorld.getDynamicProperty(IC_STRUCT_COUNTER)) || 0));
  } catch (_) {
  }
  for (let attempt = 0; attempt < 10000; attempt++) {
    const key = icStructureKey(index);
    let exists = false;
    try {
      exists = Boolean(icWorld.structureManager.get(key));
    } catch (_) {
    }
    if (!exists) {
      try {
        icWorld.setDynamicProperty(IC_STRUCT_COUNTER, index + 1);
      } catch (_) {
      }
      return key;
    }
    index++;
  }
  const fallback = Date.now();
  try {
    icWorld.setDynamicProperty(IC_STRUCT_COUNTER, fallback + 1);
  } catch (_) {
  }
  return icStructureKey(fallback);
}

function icDeleteStructure(key) {
  if (!key) return;
  try {
    icWorld.structureManager.delete(key);
  } catch (_) {
  }
}

function icStorageLoc(dim, loc) {
  let minY = -64;
  try {
    if (dim.heightRange && Number.isFinite(dim.heightRange.min)) minY = dim.heightRange.min;
  } catch (_) {
  }
  // Keep page parking in the same general chunk column, but include the
  // chest's Y coordinate in the parking address.  The old address used only
  // X/Z, so vertically stacked chests shared every hidden page position.
  // Encode the dimension's vertical range into a small 3-D parking cube:
  // sixteen Y layers and a 16x16 horizontal grid give ample room while
  // keeping the storage entities close enough to remain loaded with the
  // chest's chunk.
  const x = Math.floor(loc.x);
  const y = Math.floor(loc.y);
  const z = Math.floor(loc.z);
  const yOffset = Math.max(0, y - minY);
  const layer = yOffset % 16;
  const column = Math.floor(yOffset / 16);
  return {
    x: x + (column % 16),
    y: minY + layer,
    z: z + Math.floor(column / 16)
  };
}

function icSaveHolderAsStructure(entity, loc) {
  const key = icNextStructureKey();
  const storage = icStorageLoc(entity.dimension, loc);
  try {
    for (const tag of entity.getTags()) {
      if (tag.startsWith(IC_LOC_TAG_PREFIX)) entity.removeTag(tag);
    }
    entity.addTag(`${IC_STORE_TAG_PREFIX}${key.replace(/[^A-Za-z0-9_]/g, "_")}`);
    entity.nameTag = IC_NAME;
    entity.teleport(icCenter(storage));
    icWorld.structureManager.createFromWorld(key, entity.dimension, storage, storage, {
      includeBlocks: false,
      includeEntities: true,
      saveMode: IcStructureSaveMode.World
    });
    return key;
  } catch (_) {
    icDeleteStructure(key);
    return void 0;
  }
}

function icPlaceHolderStructure(dim, loc, structureKey) {
  const before = /* @__PURE__ */ new Set();
  const center = icCenter(loc);
  try {
    for (const e of dim.getEntities({ type: IC_ENTITY, location: center, maxDistance: 2 })) before.add(e.id);
  } catch (_) {
  }
  try {
    icWorld.structureManager.place(structureKey, dim, icBlockLoc(loc), {
      includeBlocks: false,
      includeEntities: true
    });
  } catch (_) {
    return void 0;
  }
  let placed;
  try {
    placed = dim.getEntities({ type: IC_ENTITY, location: center, maxDistance: 2 }).find((e) => !before.has(e.id));
  } catch (_) {
  }
  if (!placed) return void 0;
  icMarkHolder(placed, loc);
  icMoveTo(placed, loc, true);
  icDeleteStructure(structureKey);
  return placed;
}

// --- nested chest rejection (shulkers cannot hold shulkers) ----------------

function icIsChestItem(item) {
  return !!item && icIsChestType(item.typeId);
}

function icRejectNested(entity, players) {
  const c = icGetContainer(entity);
  if (!c) return;
  let nearby = players;
  if (!nearby || !nearby.length) {
    try {
      nearby = entity.dimension.getPlayers({ location: entity.location, maxDistance: 8 });
    } catch (_) {
      nearby = [];
    }
  }
  for (let i = 0; i < Math.min(c.size, IC_VIEW_SIZE); i++) {
    let item;
    try {
      item = c.getItem(i);
    } catch (_) {
      continue;
    }
    if (!icIsChestItem(item)) continue;
    try {
      c.setItem(i, void 0);
    } catch (_) {
      continue;
    }
    let returned = false;
    for (const player of nearby) {
      try {
        const pc = player.getComponent("minecraft:inventory") && player.getComponent("minecraft:inventory").container;
        if (pc && !pc.addItem(item)) {
          returned = true;
          break;
        }
      } catch (_) {
      }
    }
    if (!returned) {
      try {
        entity.dimension.spawnItem(item, entity.location);
      } catch (_) {
      }
    }
  }
}

// --- place / break ---------------------------------------------------------

function icSpawnHolder(dim, loc) {
  const e = dim.spawnEntity(IC_ENTITY, icCenter(loc));
  icMarkHolder(e, loc);
  return e;
}

function icRemoveHolder(entity) {
  try {
    icSuppressedRemoval.add(entity.id);
    entity.remove();
  } catch (_) {
  }
  icSystem.run(() => {
    try {
      icSuppressedRemoval.delete(entity.id);
    } catch (_) {
    }
  });
}

function icPlacementKey(dim, loc) {
  const l = icBlockLoc(loc);
  return `${dim.id}:${l.x}:${l.y}:${l.z}`;
}

function icRememberPlacement(block, dim, player) {
  let item;
  try {
    const eq = player && player.getComponent("minecraft:equippable");
    item = eq && eq.getEquipment(IcEquipmentSlot.Mainhand);
  } catch (_) {
  }
  const structureKey = icKeyFromItem(item);
  if (!structureKey) return;
  const key = icPlacementKey(dim, block.location);
  icPendingPlacement.set(key, structureKey);
  icSystem.runTimeout(() => icPendingPlacement.delete(key), 20);
}

function icTakePlacement(dim, loc) {
  const key = icPlacementKey(dim, loc);
  const structureKey = icPendingPlacement.get(key);
  if (structureKey) icPendingPlacement.delete(key);
  return structureKey;
}

function icHandlePlace(block, dim) {
  const loc = block.location;
  const structureKey = icTakePlacement(dim, loc);
  const existing = icFindHolder(dim, loc);
  if (structureKey) {
    if (existing) icRemoveHolder(existing);
    if (icPlaceHolderStructure(dim, loc, structureKey)) return;
  }
  if (existing) {
    icMarkHolder(existing, loc);
    icMoveTo(existing, loc, true);
    return;
  }
  icSpawnHolder(dim, loc);
}

function icRemoveVanillaDrop(dim, loc) {
  try {
    const drop = dim.getEntities({ type: "item", location: loc, maxDistance: 3 }).find((e) => {
      const comp = e.getComponent("minecraft:item");
      const stack = comp && comp.itemStack;
      return stack && icIsChestType(stack.typeId) && !icKeyFromItem(stack);
    });
    if (drop) drop.remove();
  } catch (_) {
  }
}

function icIsCreative(player) {
  try {
    return player && player.getGameMode && player.getGameMode() === IcGameMode.Creative;
  } catch (_) {
    return false;
  }
}

function icHandleBreak(dim, loc, options) {
  const opts = options || {};
  const holder = icFindHolder(dim, loc);
  if (holder && opts.player) icRejectNested(holder, [opts.player]);
  if (holder) icClearLabels(holder);
  const entries = holder ? icVirtualEntries(holder) : [];
  const items = holder ? icSnapshot(holder) : [];
  const hasItems = icHasItems(items) || entries.length > 0;
  const dropLocation = icCenter(loc);
  const shouldDrop = opts.dropItem !== false && (!icIsCreative(opts.player) || hasItems);
  const structureKey = shouldDrop && hasItems && holder ? icSaveHolderAsStructure(holder, loc) : void 0;
  if (holder) icRemoveHolder(holder);
  if (!shouldDrop) {
    if (hasItems) icDropItems(dim, icExpandStacks(entries), dropLocation);
    return;
  }
  const item = icCreateItem(structureKey, entries);
  if (!item) {
    icDeleteStructure(structureKey);
    icDropItems(dim, icExpandStacks(entries), dropLocation);
    return;
  }
  icSystem.run(() => {
    icRemoveVanillaDrop(dim, dropLocation);
    if (!structureKey && hasItems) icDropItems(dim, icExpandStacks(entries), dropLocation);
    try {
      dim.spawnItem(item, dropLocation);
    } catch (_) {
    }
  });
}

icSystem.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent("infinitychest:infinity_chest_logic", {
    beforeOnPlayerPlace(event) {
      try {
        icRememberPlacement(event.block, event.dimension || event.block.dimension, event.player);
      } catch (_) {
      }
    },
    onPlace({ block, dimension }) {
      try {
        icHandlePlace(block, dimension || block.dimension);
      } catch (err) {
        console.warn(`[infinitychest] infinity chest place failed: ${err}`);
      }
    },
    onPlayerBreak({ block, dimension, player }) {
      try {
        icHandleBreak(dimension || block.dimension, block.location, { dropItem: true, player, blockType: block.typeId });
      } catch (err) {
        console.warn(`[infinitychest] infinity chest break failed: ${err}`);
      }
    }
  });
});

// Keep nested infinity chests out of the chest itself, like shulker boxes.
try {
  icWorld.afterEvents.entityContainerOpened?.subscribe((event) => {
    const entity = event && event.entity;
    if (!entity || entity.typeId !== IC_ENTITY) return;
    icSystem.run(() => icRejectNested(entity));
  });
} catch (_) {
}

try {
  icWorld.afterEvents.entityContainerClosed?.subscribe((event) => {
    const entity = event && event.entity;
    if (!entity || entity.typeId !== IC_ENTITY) return;
    icSystem.run(() => icRejectNested(entity));
  });
} catch (_) {
}

// Safety net: if the block vanished (explosion, /setblock, ...), drop the chest
// as an item that still holds its contents instead of scattering the inventory.
icSystem.runInterval(() => {
  for (const dimId of IC_DIMS) {
    let dim;
    try {
      dim = icWorld.getDimension(dimId);
    } catch (_) {
      continue;
    }
    let holders = [];
    try {
      holders = dim.getEntities({ type: IC_ENTITY });
    } catch (_) {
      continue;
    }
    for (const holder of holders) {
      let loc;
      try {
        loc = icHolderLoc(holder);
      } catch (_) {
        continue;
      }
      if (!loc) continue;
      let block;
      try {
        block = dim.getBlock(loc);
      } catch (_) {
        continue;
      }
      if (!block) continue;
      if (icIsChestType(block.typeId)) {
        icMoveTo(holder, loc);
        continue;
      }
      try {
        icHandleBreak(dim, loc, { dropItem: true });
      } catch (_) {
      }
    }
  }
}, 40);

// ---------------------------------------------------------------------------
// Infinity Chest - stack cap bypass
//
// Every view slot keeps a real ItemStack capped at its vanilla stack size, while
// the true amount (up to 2,147,483,647) lives in a per-slot virtual count. The
// count is drawn over the grid as a green UI label fed by hidden lore-carrying
// slots (IC_LABEL_BASE..), the same trick the digital storage addon uses.
// ---------------------------------------------------------------------------

var icOpenHolders = /* @__PURE__ */ new Set();
var icViewSnapshots = /* @__PURE__ */ new Map();
var icLabelCache = /* @__PURE__ */ new Map();

function icIsPlainItem(item) {
  if (!item) return false;
  if (item.typeId === IC_FILLER) return false;
  try {
    if ((item.maxAmount || 1) <= 1) return false;
  } catch (_) {
    return false;
  }
  try {
    if (item.nameTag) return false;
  } catch (_) {
  }
  try {
    const lore = item.getLore ? item.getLore() : [];
    if (lore && lore.some((line) => !icIsCountLore(line))) return false;
  } catch (_) {
  }
  try {
    const ench = item.getComponent("minecraft:enchantable");
    if (ench && ench.getEnchantments && ench.getEnchantments().length) return false;
  } catch (_) {
  }
  try {
    const dur = item.getComponent("minecraft:durability");
    if (dur && dur.damage > 0) return false;
  } catch (_) {
  }
  try {
    if (item.getDynamicPropertyIds && item.getDynamicPropertyIds().length) return false;
  } catch (_) {
  }
  return true;
}

function icFormatCount(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n < 1e3) return String(n);
  const units = ["K", "M", "B", "T", "Qa", "Qi"];
  let out = n;
  let unit = "";
  for (const u of units) {
    if (out < 1e3) break;
    out /= 1e3;
    unit = u;
  }
  if (out >= 1e3) {
    const exp = Math.floor(Math.log10(n));
    return `${(n / Math.pow(10, exp)).toFixed(1)}e${exp}`;
  }
  const text = out >= 100 ? out.toFixed(0) : out >= 10 ? out.toFixed(1) : out.toFixed(2);
  return `${text.replace(/\.0+$/, "").replace(/(\.\d)0$/, "$1")}${unit}`;
}

var IC_LORE_MARK = "\u00a7r\u00a77Count: ";

function icIsCountLore(line) {
  return typeof line === "string" && line.indexOf("Count: ") >= 0 && line.indexOf("\u00a77") >= 0;
}

function icFormatFullCount(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Remove the count lore we injected so stored/dropped copies stay vanilla.
function icStripCountLore(item) {
  if (!item) return item;
  try {
    const lore = item.getLore ? item.getLore() : [];
    if (lore && lore.some(icIsCountLore)) {
      item.setLore(lore.filter((line) => !icIsCountLore(line)));
    }
  } catch (_) {
  }
  return item;
}

function icApplyCountLore(item, total) {
  try {
    const lore = (item.getLore ? item.getLore() : []).filter((line) => !icIsCountLore(line));
    if (total > 1) lore.push(`${IC_LORE_MARK}${icFormatFullCount(total)}`);
    item.setLore(lore);
  } catch (_) {
  }
  return item;
}

function icReadCounts(entity) {
  try {
    const raw = entity.getDynamicProperty(IC_COUNTS_PROP);
    if (typeof raw === "string" && raw.length) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (_) {
  }
  return {};
}

function icWriteCounts(entity, counts) {
  try {
    const keys = Object.keys(counts);
    entity.setDynamicProperty(IC_COUNTS_PROP, keys.length ? JSON.stringify(counts) : void 0);
  } catch (_) {
  }
}

function icClearLabels(entity) {
  const c = icGetContainer(entity);
  if (!c) return;
  for (let i = 0; i < IC_LABEL_COLS; i++) {
    const slot = IC_LABEL_BASE + i;
    if (slot >= c.size) break;
    try {
      c.setItem(slot, void 0);
    } catch (_) {
    }
  }
  icLabelCache.delete(entity.id);
}

function icWriteLabels(entity, columns) {
  const c = icGetContainer(entity);
  if (!c) return;
  const signature = columns.map((col) => col.join("\u0001")).join("\u0002");
  let intact = true;
  try {
    const probe = c.getItem(IC_LABEL_BASE);
    intact = !!probe && probe.typeId === IC_FILLER;
  } catch (_) {
    intact = false;
  }
  if (intact && icLabelCache.get(entity.id) === signature) return;
  icLabelCache.set(entity.id, signature);
  for (let i = 0; i < IC_LABEL_COLS; i++) {
    const slot = IC_LABEL_BASE + i;
    if (slot >= c.size) break;
    try {
      const label = new IcItemStack(IC_FILLER, 1);
      const colLines = columns[i] || [];
      // One multiline name avoids the extra name-to-lore tooltip gap.
      label.nameTag = colLines.join("\n") || " ";
      label.setLore([]);
      c.setItem(slot, label);
    } catch (_) {
    }
  }
}

// Aggregated view of everything the chest holds, virtual counts included.
function icVirtualEntries(entity) {
  const c = icGetContainer(entity);
  const out = [];
  if (!c) return out;
  const counts = icReadCounts(entity);
  for (let i = 0; i < Math.min(c.size, IC_VIEW_SIZE); i++) {
    let item;
    try {
      item = c.getItem(i);
    } catch (_) {
      continue;
    }
    if (!item || item.typeId === IC_FILLER) continue;
    const stored = Math.max(0, Math.floor(Number(counts[i]) || 0));
    const total = Math.max(item.amount, stored);
    out.push({ item: icStripCountLore(item.clone ? item.clone() : item), total });
  }
  return out;
}

function icExpandStacks(entries) {
  const out = [];
  for (const entry of entries || []) {
    if (!entry || !entry.item) continue;
    const max = Math.max(1, entry.item.maxAmount || 64);
    let left = Math.max(1, Math.floor(Number(entry.total) || entry.item.amount));
    let guard = 0;
    while (left > 0 && guard++ < 4096) {
      const stack = entry.item.clone();
      stack.amount = Math.min(max, left);
      out.push(stack);
      left -= stack.amount;
    }
  }
  return out;
}

var IC_FIRST_SLOT = 1;

function icNearestPlayer(entity) {
  let best;
  let bestDist = Infinity;
  try {
    for (const player of entity.dimension.getPlayers({ location: entity.location, maxDistance: 12 })) {
      const l = player.location;
      const e = entity.location;
      const d = (l.x - e.x) ** 2 + (l.y - e.y) ** 2 + (l.z - e.z) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = player;
      }
    }
  } catch (_) {
  }
  return best;
}

// Hand a stack to the closest player; returns how much could not be delivered.
function icGiveToPlayer(entity, stack) {
  const player = icNearestPlayer(entity);
  if (!player) return stack.amount;
  // Strip the count lore from the display item the player just grabbed so the
  // top-up merges into it and they end with one clean vanilla stack.
  try {
    icCleanPlayerItems(player);
  } catch (_) {
  }
  try {
    const pc = player.getComponent("minecraft:inventory")?.container;
    if (!pc) return stack.amount;
    const left = pc.addItem(stack);
    return left ? left.amount : 0;
  } catch (_) {
    return stack.amount;
  }
}

function icSlotUpToDate(existing, item, total) {
  if (!existing || existing.typeId !== item.typeId || existing.amount !== 1) return false;
  let lore = [];
  try {
    lore = existing.getLore ? existing.getLore() : [];
  } catch (_) {
    return false;
  }
  const counts = (lore || []).filter(icIsCountLore);
  if (total > 1) return counts.length === 1 && counts[0] === `${IC_LORE_MARK}${icFormatFullCount(total)}`;
  return counts.length === 0;
}

// Diff the container against the last rendered snapshot, fold duplicate stacks
// of the same item into one slot, sort by amount and re-render slots + labels.
function icSyncChest(entity) {
  const c = icGetContainer(entity);
  if (!c) return;
  const viewSize = Math.min(c.size, IC_VIEW_SIZE);
  const counts = icReadCounts(entity);
  const prevSnapshot = icViewSnapshots.get(entity.id);
  const current = [];
  for (let i = 0; i < viewSize; i++) {
    let item;
    try {
      item = c.getItem(i);
    } catch (_) {
      item = void 0;
    }
    current[i] = item && item.typeId !== IC_FILLER ? item : void 0;
  }

  const leftovers = [];
  const totals = [];
  for (let i = 0; i < viewSize; i++) {
    const item = current[i];
    const stored = Math.max(0, Math.floor(Number(counts[i]) || 0));
    const prev = prevSnapshot ? prevSnapshot[i] : void 0;
    if (!prev || !prevSnapshot) {
      totals[i] = item ? Math.max(item.amount, stored) : 0;
      continue;
    }
    let reserve = Math.max(0, stored - prev.amount);
    if (!reserve) {
      totals[i] = item ? item.amount : 0;
      continue;
    }
    if (item && icIsPlainItem(item) && item.typeId === prev.typeId) {
      // Player took from or added to the visible part of this stack.
      totals[i] = Math.min(IC_MAX_COUNT, reserve + item.amount);
      continue;
    }
    const template = prev.item;
    if (!item && template) {
      // The single display item was picked up: top the player up so they end
      // with a full vanilla stack instead of one item.
      const max = Math.max(1, template.maxAmount || 64);
      const give = Math.min(max - 1, reserve);
      if (give > 0) {
        try {
          const stack = template.clone();
          stack.amount = give;
          const undelivered = icGiveToPlayer(entity, stack);
          reserve -= give - undelivered;
        } catch (_) {
        }
      }
      if (reserve > 0) {
        try {
          const keep = template.clone();
          keep.amount = 1;
          current[i] = keep;
        } catch (_) {
        }
        totals[i] = reserve;
      } else {
        current[i] = void 0;
        totals[i] = 0;
      }
      continue;
    }
    // The visible stack was swapped for something else: the hidden reserve has
    // to be re-homed instead of vanishing.
    if (template) {
      try {
        const carry = template.clone();
        carry.amount = 1;
        leftovers.push({ item: carry, total: reserve });
      } catch (_) {
      }
    }
    totals[i] = item ? item.amount : 0;
  }

  // Fold every plain stack of the same type into one entry.
  const buckets = /* @__PURE__ */ new Map();
  const entries = [];
  const addToBucket = (item, amount) => {
    const key = item.typeId;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    const max = Math.max(1, item.maxAmount || 64);
    let left = amount;
    for (const entry of list) {
      if (entry.total >= IC_MAX_COUNT) continue;
      const room = IC_MAX_COUNT - entry.total;
      const put = Math.min(room, left);
      entry.total += put;
      left -= put;
      if (left <= 0) return true;
    }
    if (left <= 0) return true;
    const entry = { item: icStripCountLore(item.clone()), total: Math.min(IC_MAX_COUNT, left), max, slot: -1 };
    entry.item.amount = 1;
    list.push(entry);
    entries.push(entry);
    return true;
  };

  const fixed = [];
  const insertion = [];
  for (let i = 0; i < viewSize; i++) {
    const item = current[i];
    if (!item) continue;
    if (!icIsPlainItem(item)) {
      if (i === 0) insertion.push({ item: item.clone ? item.clone() : item, total: Math.max(1, totals[i] || item.amount) });
      else fixed.push(i);
      continue;
    }
    addToBucket(item, Math.max(1, totals[i] || item.amount));
  }
  for (const left of leftovers) addToBucket(left.item, left.total);
  for (const item of insertion) addToBucket(item.item, item.total);

  // Biggest stacks first.
  entries.sort((a, b) => b.total - a.total || (a.item.typeId < b.item.typeId ? -1 : a.item.typeId > b.item.typeId ? 1 : 0));

  // Slot 0 stays free as the insertion slot and is only used when the rest of
  // the grid is full.
  const used = new Set(fixed);
  const freeSlots = [];
  for (let i = IC_FIRST_SLOT; i < viewSize; i++) if (!used.has(i)) freeSlots.push(i);
  let cursor = 0;
  for (const entry of entries) entry.slot = cursor < freeSlots.length ? freeSlots[cursor++] : -1;

  const newCounts = {};
  const snapshot = [];
  const columns = [];
  for (let col = 0; col < IC_LABEL_COLS; col++) columns[col] = new Array(IC_LABEL_ROWS).fill(" ");

  const overflow = [];
  for (const entry of entries) {
    if (entry.slot < 0) {
      overflow.push({ item: entry.item, total: entry.total });
      continue;
    }
    // Always show a single item so the vanilla stack counter never appears;
    // the real amount lives in the virtual count + item lore.
    let existing;
    try {
      existing = c.getItem(entry.slot);
    } catch (_) {
      existing = void 0;
    }
    if (existing && existing.typeId === IC_FILLER) existing = void 0;
    if (!icSlotUpToDate(existing, entry.item, entry.total)) {
      const stack = entry.item.clone();
      stack.amount = 1;
      icApplyCountLore(stack, entry.total);
      try {
        c.setItem(entry.slot, stack);
      } catch (_) {
        continue;
      }
    }
    snapshot[entry.slot] = { typeId: entry.item.typeId, amount: 1, item: entry.item };
    if (entry.total > 1) {
      newCounts[entry.slot] = entry.total;
      const col = entry.slot % IC_VIEW_COLS;
      const row = Math.floor(entry.slot / IC_VIEW_COLS);
      if (columns[col] && row < IC_LABEL_ROWS) columns[col][row] = `\u00a7r${icFormatCount(entry.total)}`;
    }
  }
  for (const slot of fixed) {
    const item = current[slot];
    if (!item) continue;
    snapshot[slot] = { typeId: item.typeId, amount: item.amount, item: icStripCountLore(item.clone ? item.clone() : item) };
  }
  for (let i = 0; i < viewSize; i++) {
    if (snapshot[i]) continue;
    if (current[i]) {
      try {
        c.setItem(i, void 0);
      } catch (_) {
      }
    }
    snapshot[i] = void 0;
  }

  icViewSnapshots.set(entity.id, snapshot);
  icWriteCounts(entity, newCounts);
  icWriteLabels(entity, columns);

  // A paged infinity chest can move the surplus into its next page.  Keep the
  // old drop behavior as a fallback for worlds where the page manager is not
  // installed.
  if (overflow.length) {
    if (typeof icHandlePagedOverflow === "function") {
      icHandlePagedOverflow(entity, overflow);
    } else {
      try {
        icDropItems(entity.dimension, icExpandStacks(overflow), entity.location);
      } catch (_) {
      }
    }
  }
}

// Items pulled out of the chest carry our count lore; scrub it so they stack
// normally again in the player's inventory.
function icCleanPlayerItems(player) {
  let c;
  try {
    c = player.getComponent("minecraft:inventory")?.container;
  } catch (_) {
    return;
  }
  if (!c) return;
  for (let i = 0; i < c.size; i++) {
    let item;
    try {
      item = c.getItem(i);
    } catch (_) {
      continue;
    }
    if (!item) continue;
    let lore = [];
    try {
      lore = item.getLore ? item.getLore() : [];
    } catch (_) {
      continue;
    }
    if (!lore || !lore.some(icIsCountLore)) continue;
    try {
      item.setLore(lore.filter((line) => !icIsCountLore(line)));
      c.setItem(i, item);
    } catch (_) {
    }
  }
}

function icCleanAllPlayers() {
  let players = [];
  try {
    players = icWorld.getAllPlayers();
  } catch (_) {
    return;
  }
  for (const player of players) {
    try {
      icCleanPlayerItems(player);
    } catch (_) {
    }
  }
}

function icSafeSync(entity) {
  try {
    if (entity && entity.isValid !== false) icSyncChest(entity);
  } catch (err) {
    console.warn(`[infinitychest] infinity chest sync failed: ${err}`);
  }
}

try {
  icWorld.afterEvents.entityContainerOpened?.subscribe((event) => {
    const entity = event && event.entity;
    if (!entity || entity.typeId !== IC_ENTITY) return;
    icOpenHolders.add(entity.id);
    icSystem.run(() => icSafeSync(entity));
  });
} catch (_) {
}

try {
  icWorld.afterEvents.entityContainerClosed?.subscribe((event) => {
    const entity = event && event.entity;
    if (!entity || entity.typeId !== IC_ENTITY) return;
    icOpenHolders.delete(entity.id);
    icSystem.run(() => {
      icSafeSync(entity);
      icCleanAllPlayers();
    });
  });
} catch (_) {
}

// Fast loop while somebody is browsing, slow sweep for hoppers and unloading.
icSystem.runInterval(() => {
  if (!icOpenHolders.size) return;
  for (const dimId of IC_DIMS) {
    let dim;
    try {
      dim = icWorld.getDimension(dimId);
    } catch (_) {
      continue;
    }
    let holders = [];
    try {
      holders = dim.getEntities({ type: IC_ENTITY });
    } catch (_) {
      continue;
    }
    for (const holder of holders) {
      if (!icOpenHolders.has(holder.id)) continue;
      icSafeSync(holder);
    }
  }
}, 5);

icSystem.runInterval(() => {
  for (const dimId of IC_DIMS) {
    let dim;
    try {
      dim = icWorld.getDimension(dimId);
    } catch (_) {
      continue;
    }
    let holders = [];
    try {
      holders = dim.getEntities({ type: IC_ENTITY });
    } catch (_) {
      continue;
    }
    for (const holder of holders) {
      if (icOpenHolders.has(holder.id)) continue;
      icSafeSync(holder);
    }
  }
  if (!icOpenHolders.size) icCleanAllPlayers();
}, 40);

// ---------------------------------------------------------------------------
// Infinity Chest pages
//
// The Bedrock container exposed to JSON UI is limited to 255 slots.  Slot 0
// is an always-empty insertion buffer, slots 1..224 are the visible page,
// 225..227 are UI controls, and 228..242 are count-label columns. Additional
// pages are stored as structure-backed
// copies of the chest entity at the world's storage Y level.  Structures keep
// the complete entity inventory, including item components and custom data,
// rather than reducing items to type/count pairs.
// ---------------------------------------------------------------------------
var IC_PAGE_PROP = "infinitychest:page";
var IC_PAGE_COUNT_PROP = "infinitychest:page_count";
var IC_ARCHIVE_PROP = "infinitychest:archive";
var IC_PAGE_PREVIOUS_SLOT = 225;
var IC_PAGE_LABEL_SLOT = 226;
var IC_PAGE_NEXT_SLOT = 227;
// Keep the page number separate from the search action.  Slot 243 is outside
// the 15 count-label slots (228..242), so the page number can remain a plain
// display label instead of also being a clickable control.
var IC_PAGE_SEARCH_SLOT = 243;
var IC_PAGE_CAPACITY = IC_VIEW_SIZE - 1;
var IC_PAGE_STRUCT_SUFFIX = "_p";
var icPagedOverflow = /* @__PURE__ */ new Map();
var icPagedSignatures = /* @__PURE__ */ new Map();
var icPagedControlsReady = /* @__PURE__ */ new Set();
var icPagedSyncing = /* @__PURE__ */ new Set();
var icPagedSearches = /* @__PURE__ */ new Map();
var icPagedSearchForms = /* @__PURE__ */ new Set();
var icLegacySyncChest = icSyncChest;
var IC_PAGE_TAG = "infinitychest_page";
var IC_PAGE_OWNER_PREFIX = "infinitychest_pageof_";
var IC_PAGE_INDEX_PROP = "infinitychest:page_index";
var icPageBreaking = /* @__PURE__ */ new Set();

function icPageInteger(value, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function icPageCount(entity) {
  let count = 1;
  try {
    count = Math.max(1, icPageInteger(entity.getDynamicProperty(IC_PAGE_COUNT_PROP), 1));
  } catch (_) {
  }
  return count;
}

function icPageNumber(entity) {
  try {
    return Math.min(icPageCount(entity) - 1, icPageInteger(entity.getDynamicProperty(IC_PAGE_PROP), 0));
  } catch (_) {
    return 0;
  }
}

function icPageArchive(entity) {
  try {
    const value = entity.getDynamicProperty(IC_ARCHIVE_PROP);
    return typeof value === "string" && value.length ? value : void 0;
  } catch (_) {
    return void 0;
  }
}

function icPageKey(archive, page) {
  if (!archive) return void 0;
  return page <= 0 ? archive : `${archive}${IC_PAGE_STRUCT_SUFFIX}${page}`;
}

function icPageStructureExists(key) {
  if (!key) return false;
  try {
    return Boolean(icWorld.structureManager.get(key));
  } catch (_) {
    return false;
  }
}

function icPageControlItem(name) {
  try {
    const item = new IcItemStack(IC_FILLER, 1);
    item.nameTag = name;
    return item;
  } catch (_) {
    return void 0;
  }
}

function icPageRenderControls(entity, page) {
  const c = icGetContainer(entity);
  if (!c) return;
  const previous = icPageControlItem("\u00a7f<");
  const next = icPageControlItem("\u00a7f>");
  const search = icPageControlItem("\u00a7fSearch");
  try {
    c.setItem(IC_PAGE_PREVIOUS_SLOT, previous);
    c.setItem(IC_PAGE_LABEL_SLOT, void 0);
    c.setItem(IC_PAGE_NEXT_SLOT, next);
    c.setItem(IC_PAGE_SEARCH_SLOT, search);
  } catch (_) {
  }
  icPagedControlsReady.add(entity.id);
}

function icPageControlType(entity, slot) {
  try {
    return entity.getComponent("minecraft:inventory")?.container?.getItem(slot)?.typeId;
  } catch (_) {
    return void 0;
  }
}

function icPageSignature(entity) {
  const c = icGetContainer(entity);
  if (!c) return "";
  const parts = [];
  for (let i = 0; i < IC_VIEW_SIZE; i++) {
    let item;
    try {
      item = c.getItem(i);
    } catch (_) {
      item = void 0;
    }
    if (!item) {
      parts.push("");
      continue;
    }
    let lore = "";
    try {
      lore = (item.getLore ? item.getLore() : []).join("\u0001");
    } catch (_) {
    }
    parts.push(`${item.typeId}:${item.amount}:${lore}`);
  }
  let counts = "";
  try {
    counts = String(entity.getDynamicProperty(IC_COUNTS_PROP) || "");
  } catch (_) {
  }
  return `${icPageNumber(entity)}|${counts}|${parts.join("\u0002")}`;
}

function icPageCombineEntries(entries) {
  const buckets = /* @__PURE__ */ new Map();
  const out = [];
  const add = (source) => {
    if (!source || !source.item) return;
    const item = source.item.clone ? source.item.clone() : source.item;
    const total = Math.min(IC_MAX_COUNT, Math.max(1, Math.floor(Number(source.total) || item.amount || 1)));
    if (!icIsPlainItem(item)) {
      out.push({ item: icStripCountLore(item), total });
      return;
    }
    const key = item.typeId;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    let left = total;
    for (const existing of bucket) {
      const room = IC_MAX_COUNT - existing.total;
      if (room <= 0) continue;
      const put = Math.min(room, left);
      existing.total += put;
      left -= put;
      if (left <= 0) return;
    }
    if (left > 0) {
      item.amount = 1;
      const entry = { item: icStripCountLore(item), total: left };
      bucket.push(entry);
      out.push(entry);
    }
  };
  for (const entry of entries || []) add(entry);
  out.sort((a, b) => b.total - a.total || (a.item.typeId < b.item.typeId ? -1 : a.item.typeId > b.item.typeId ? 1 : 0));
  return out;
}


// --- page entities -----------------------------------------------------------
//
// Every page that is not currently displayed lives in a hidden, persistent
// holder entity parked at the bottom of the world directly below the chest
// (same chunk column, so it is loaded whenever the chest is).  Each page entity
// carries the owner tag of its chest and its page index.  Reading a page is a
// plain inventory read, so nothing can vanish between page flips.
function icPageAnchor(entity) {
  return icHolderLoc(entity) || icBlockLoc(entity.location);
}

function icPageOwnerTag(anchor) {
  const l = icBlockLoc(anchor);
  return `${IC_PAGE_OWNER_PREFIX}${l.x}_${l.y}_${l.z}`;
}

function icPageIsPageEntity(entity) {
  try {
    return !!entity && entity.hasTag(IC_PAGE_TAG);
  } catch (_) {
    return false;
  }
}

function icPageSpot(dim, anchor, page) {
  const base = icStorageLoc(dim, anchor);
  return { x: base.x, y: base.y + Math.max(0, page), z: base.z };
}

function icPageIndexOf(entity) {
  try {
    return icPageInteger(entity.getDynamicProperty(IC_PAGE_INDEX_PROP), -1);
  } catch (_) {
    return -1;
  }
}

function icPageEntities(entity, anchorOverride) {
  const out = [];
  let dim;
  try {
    dim = entity.dimension;
  } catch (_) {
    return out;
  }
  const anchor = anchorOverride || icPageAnchor(entity);
  let found = [];
  try {
    found = dim.getEntities({ type: IC_ENTITY, tags: [IC_PAGE_TAG, icPageOwnerTag(anchor)] });
  } catch (_) {
    found = [];
  }
  for (const e of found) {
    if (!e || !e.isValid || e.id === entity.id) continue;
    out.push({ entity: e, page: icPageIndexOf(e) });
  }
  out.sort((a, b) => a.page - b.page);
  return out;
}

function icPageMarkPageEntity(e, anchor, page) {
  try {
    for (const tag of e.getTags()) {
      if (tag === IC_TAG || tag.startsWith(IC_LOC_TAG_PREFIX) || tag.startsWith(IC_STORE_TAG_PREFIX) || tag.startsWith(IC_PAGE_OWNER_PREFIX)) e.removeTag(tag);
    }
  } catch (_) {
  }
  try {
    e.addTag(IC_PAGE_TAG);
    e.addTag(icPageOwnerTag(anchor));
    e.nameTag = IC_NAME;
    e.setDynamicProperty(IC_PAGE_INDEX_PROP, page);
    e.setDynamicProperty("blockLoc", void 0);
    e.setDynamicProperty("dimId", void 0);
  } catch (_) {
  }
}

function icPageSpawnPageEntity(dim, anchor, page) {
  const e = dim.spawnEntity(IC_ENTITY, icCenter(icPageSpot(dim, anchor, page)));
  icPageMarkPageEntity(e, anchor, page);
  return e;
}

function icPageReadArchive(entity, page) {
  for (const p of icPageEntities(entity)) {
    if (p.page === page) return icVirtualEntries(p.entity);
  }
  return [];
}

function icPageCollectAll(entity, extra) {
  const entries = [...icVirtualEntries(entity)];
  for (const p of icPageEntities(entity)) entries.push(...icVirtualEntries(p.entity));
  for (const entry of extra || []) entries.push(entry);
  return entries;
}


function icPageWriteEntity(entity, entries, page) {
  const c = icGetContainer(entity);
  if (!c) return;
  const counts = {};
  const columns = [];
  const snapshot = [];
  for (let col = 0; col < IC_LABEL_COLS; col++) columns[col] = new Array(IC_LABEL_ROWS).fill(" ");
  for (let i = 0; i < c.size; i++) {
    try {
      c.setItem(i, void 0);
    } catch (_) {
    }
  }
  const visible = (entries || []).slice(0, IC_PAGE_CAPACITY);
  visible.forEach((entry, entryIndex) => {
    if (!entry || !entry.item) return;
    const slot = entryIndex + 1;
    const item = entry.item.clone ? entry.item.clone() : entry.item;
    const total = Math.max(1, Math.floor(Number(entry.total) || item.amount || 1));
    if (icIsPlainItem(item)) {
      item.amount = 1;
      icApplyCountLore(item, total);
      counts[slot] = total;
      const col = slot % IC_VIEW_COLS;
      const row = Math.floor(slot / IC_VIEW_COLS);
      if (columns[col] && row < IC_LABEL_ROWS) columns[col][row] = `\u00a7r${icFormatCount(total)}`;
    } else {
      icStripCountLore(item);
    }
    try {
      c.setItem(slot, item);
    } catch (_) {
    }
  });
  for (let i = 0; i < IC_VIEW_SIZE; i++) {
    let item;
    try {
      item = c.getItem(i);
    } catch (_) {
      item = void 0;
    }
    snapshot[i] = item && item.typeId !== IC_FILLER ? {
      typeId: item.typeId,
      amount: item.amount,
      item: icStripCountLore(item.clone ? item.clone() : item)
    } : void 0;
  }
  icWriteCounts(entity, counts);
  icWriteLabels(entity, columns);
  icPageRenderControls(entity, page);
  if (entity.id) icViewSnapshots.set(entity.id, snapshot);
}

// Lay `pages` out: page `shown` into the chest holder itself, every other page
// into a page entity (reused when one with that index already exists).
function icPageLayout(entity, pages, shown, anchor) {
  const dim = entity.dimension;
  const existing = icPageEntities(entity, anchor);
  const byPage = /* @__PURE__ */ new Map();
  const spare = [];
  for (const p of existing) {
    if (p.page >= 0 && p.page < pages.length && p.page !== shown && !byPage.has(p.page)) byPage.set(p.page, p.entity);
    else spare.push(p.entity);
  }
  const used = [];
  for (let page = 0; page < pages.length; page++) {
    if (page === shown) continue;
    let target = byPage.get(page);
    if (!target) {
      target = spare.pop();
      if (target) icPageMarkPageEntity(target, anchor, page);
    }
    if (!target) target = icPageSpawnPageEntity(dim, anchor, page);
    try {
      target.setDynamicProperty(IC_PAGE_COUNT_PROP, pages.length);
      target.setDynamicProperty(IC_PAGE_PROP, page);
    } catch (_) {
    }
    icPageWriteEntity(target, pages[page] || [], page);
    used.push(target);
  }
  for (const leftover of spare) icRemoveHolder(leftover);
  return used;
}

function icPageNormalize(entity, targetPage, extra, replaceAll) {
  if (!entity || !entity.isValid) return;
  const anchor = icPageAnchor(entity);
  const all = replaceAll ? icPageCombineEntries(replaceAll) : icPageCombineEntries(icPageCollectAll(entity, extra));
  const requested = Math.max(0, Math.floor(Number(targetPage) || 0));
  const naturalCount = Math.max(1, Math.ceil(all.length / IC_PAGE_CAPACITY));
  const pageCount = Math.max(naturalCount, requested + 1);
  const pages = [];
  for (let page = 0; page < pageCount; page++) {
    pages[page] = all.slice(page * IC_PAGE_CAPACITY, (page + 1) * IC_PAGE_CAPACITY);
  }
  try {
    entity.setDynamicProperty(IC_PAGE_PROP, requested);
    entity.setDynamicProperty(IC_PAGE_COUNT_PROP, pageCount);
    entity.setDynamicProperty(IC_ARCHIVE_PROP, void 0);
    icPageWriteEntity(entity, pages[requested] || [], requested);
    icPageLayout(entity, pages, requested, anchor);
    icPagedSignatures.set(entity.id, icPageSignature(entity));
  } catch (err) {
    console.warn(`[infinitychest] infinity chest page save failed: ${err}`);
  }
}

function icHandlePagedOverflow(entity, overflow) {
  if (!entity || !overflow || !overflow.length) return;
  const current = icPagedOverflow.get(entity.id) || [];
  current.push(...overflow);
  icPagedOverflow.set(entity.id, current);
}

function icPageButtonTarget(entity, clickedSlot) {
  const current = icPageNumber(entity);
  const count = icPageCount(entity);
  if (clickedSlot === IC_PAGE_PREVIOUS_SLOT) return Math.max(0, current - 1);
  if (clickedSlot !== IC_PAGE_NEXT_SLOT) return current;
  if (current < count - 1) return current + 1;
  return icVirtualEntries(entity).length >= IC_PAGE_CAPACITY ? current + 1 : current;
}

function icPageSearchEntries(entity, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const extra = icPagedOverflow.get(entity.id) || [];
  const all = icPageCombineEntries(icPageCollectAll(entity, extra));
  return all.filter((entry) => {
    if (!entry || !entry.item) return false;
    let name = "";
    try { name = entry.item.nameTag || ""; } catch (_) {}
    return `${entry.item.typeId || ""} ${name}`.toLowerCase().includes(q);
  });
}

function icPageRenderSearch(entity, query) {
  const entries = icPageSearchEntries(entity, query);
  icPagedSearches.set(entity.id, {
    query: String(query || "").trim(),
    returnPage: icPageNumber(entity),
    entries
  });
  icPagedOverflow.delete(entity.id);
  icPageWriteEntity(entity, entries, -1);
  icPagedSignatures.delete(entity.id);
}

function icPageExitSearch(entity) {
  const state = icPagedSearches.get(entity.id);
  if (!state) return false;
  icPagedSearches.delete(entity.id);
  icPageNormalize(entity, state.returnPage, []);
  return true;
}

function icPageOpenSearch(entity) {
  const player = icNearestPlayer(entity);
  if (!player || icPagedSearchForms.has(player.id)) return;
  icPagedSearchForms.add(player.id);
  const form = new UI3.ModalFormData()
    .title("\u00a7lInfinity Chest Search")
    .textField("Item name or ID", "diamond, minecraft:diamond, ...", { defaultValue: "" });
  form.show(player).then((response) => {
    icPagedSearchForms.delete(player.id);
    if (!response || response.canceled) return;
    const query = String((response.formValues || [])[0] || "").trim();
    if (!query) return;
    if (!entity || !entity.isValid) return;
    icPageRenderSearch(entity, query);
  }).catch(() => {
    icPagedSearchForms.delete(player.id);
  });
}

function icSyncChestPaged(entity) {
  if (!entity || !entity.isValid || icPagedSyncing.has(entity.id)) return;
  if (icPageIsPageEntity(entity) || icPageBreaking.has(entity.id)) return;
  const c = icGetContainer(entity);
  if (!c) return;
  icPagedSyncing.add(entity.id);
  try {
    const ready = icPagedControlsReady.has(entity.id);
    let clicked;
    let searchClicked = false;
    if (ready) {
      if (icPageControlType(entity, IC_PAGE_PREVIOUS_SLOT) !== IC_FILLER) clicked = IC_PAGE_PREVIOUS_SLOT;
      else if (icPageControlType(entity, IC_PAGE_SEARCH_SLOT) !== IC_FILLER) searchClicked = true;
      else if (icPageControlType(entity, IC_PAGE_NEXT_SLOT) !== IC_FILLER) clicked = IC_PAGE_NEXT_SLOT;
    }

    const search = icPagedSearches.get(entity.id);
    if (search) {
      if (clicked !== void 0 || searchClicked) {
        icPageExitSearch(entity);
      } else {
        const before = icPageSignature(entity);
        const known = icPagedSignatures.get(entity.id);
        if (known !== before) {
          icPageWriteEntity(entity, search.entries, -1);
          icPagedSignatures.set(entity.id, icPageSignature(entity));
        }
      }
      return;
    }

    // IMPORTANT: Do not rewrite the inventory every few ticks while the player
    // is looking at it.  That was the source of the visible item blinking.
    const before = icPageSignature(entity);

    if (!ready) {
      icLegacySyncChest(entity);
      icPageRenderControls(entity, icPageNumber(entity));
      icPagedSignatures.set(entity.id, icPageSignature(entity));
      return;
    }

    if (clicked !== void 0) {
      icPageNormalize(entity, icPageButtonTarget(entity, clicked), []);
      return;
    }

    if (searchClicked) {
      icPageRenderControls(entity, icPageNumber(entity));
      icPageOpenSearch(entity);
      return;
    }

    // If nothing changed since the last stable render, leave the native
    // container completely untouched. This prevents client-side flickering.
    if (icPagedSignatures.get(entity.id) === before) return;

    icLegacySyncChest(entity);
    const extra = icPagedOverflow.get(entity.id) || [];
    icPagedOverflow.delete(entity.id);
    const after = icPageSignature(entity);
    if (extra.length || icPagedSignatures.get(entity.id) !== after) {
      icPageNormalize(entity, icPageNumber(entity), extra);
    } else {
      icPagedSignatures.set(entity.id, after);
    }
  } catch (err) {
    console.warn(`[infinitychest] infinity chest paged sync failed: ${err}`);
  } finally {
    icPagedSyncing.delete(entity.id);
  }
}

// --- break / place with multi-page structures ------------------------------
//
// When the chest is broken every page becomes its own structure
// (<archive>, <archive>_p1, <archive>_p2, ...).  Structures are captured one
// tick after the entities were written, one entity per capture region, and
// re-placed one tick apart on placement so the freshly placed entity can be
// found and tagged.
function icPageFindNewEntity(dim, center, before, expectedStoreKey) {
  const expectedStoreTag = expectedStoreKey ? `${IC_STORE_TAG_PREFIX}${String(expectedStoreKey).replace(/[^A-Za-z0-9_]/g, "_")}` : void 0;
  try {
    const candidates = dim.getEntities({ type: IC_ENTITY, location: center, maxDistance: 2 }).filter((e) => !before.has(e.id));
    // Structure placement preserves the store tag. Prefer that exact entity;
    // otherwise reject page entities from another chest before falling back to
    // the remaining newly created entity.
    if (expectedStoreTag) {
      const tagged = candidates.find((e) => {
        try { return e.hasTag(expectedStoreTag); } catch (_) { return false; }
      });
      if (tagged) return tagged;
    }
    const unclaimed = candidates.find((e) => !icPageIsPageEntity(e));
    return unclaimed || candidates[0];
  } catch (_) {
    return void 0;
  }
}

function icPageSnapshotIds(dim, center) {
  const before = /* @__PURE__ */ new Set();
  try {
    for (const e of dim.getEntities({ type: IC_ENTITY, location: center, maxDistance: 2 })) before.add(e.id);
  } catch (_) {
  }
  return before;
}

function icPageCaptureEntity(entity, key, spot) {
  if (!entity || !key) return false;
  try {
    for (const tag of entity.getTags()) {
      if (tag.startsWith(IC_LOC_TAG_PREFIX) || tag.startsWith(IC_PAGE_OWNER_PREFIX) || tag === IC_PAGE_TAG || tag === IC_TAG) entity.removeTag(tag);
    }
    entity.addTag(`${IC_STORE_TAG_PREFIX}${key.replace(/[^A-Za-z0-9_]/g, "_")}`);
    entity.nameTag = IC_NAME;
    entity.setDynamicProperty("blockLoc", void 0);
    entity.setDynamicProperty(IC_PAGE_INDEX_PROP, void 0);
    entity.teleport(icCenter(spot));
    icWorld.structureManager.createFromWorld(key, entity.dimension, spot, spot, {
      includeBlocks: false,
      includeEntities: true,
      saveMode: IcStructureSaveMode.World
    });
    return true;
  } catch (_) {
    icDeleteStructure(key);
    return false;
  }
}

function icPageRestoreArchivedPages(holder, archive, anchor, onDone) {
  let done = false;
  const complete = () => {
    if (done) return;
    done = true;
    if (onDone) onDone();
  };
  let dim;
  try {
    dim = holder.dimension;
  } catch (_) {
    complete();
    return;
  }
  const keys = [];
  for (let page = 1; page < 4096; page++) {
    const key = icPageKey(archive, page);
    if (!icPageStructureExists(key)) break;
    keys.push({ key, page });
  }
  if (!keys.length) {
    complete();
    return;
  }
  const restoreNext = (index) => {
    if (index >= keys.length) {
      icSystem.run(() => {
        try {
          if (holder.isValid) {
            icPagedSignatures.delete(holder.id);
            icPageNormalize(holder, 0, []);
          }
        } finally {
          complete();
        }
      });
      return;
    }
    const { key, page } = keys[index];
    const spot = icPageSpot(dim, anchor, page);
    const center = icCenter(spot);
    const before = icPageSnapshotIds(dim, center);
    const find = () => icFindByStoreTag(dim, center, key) || icPageFindNewEntity(dim, center, before, key);
    const adopt = (placed) => {
      icPageMarkPageEntity(placed, anchor, page);
      icDeleteStructure(key);
    };
    let attempt = 0;
    const tryPlace = () => {
      attempt++;
      let ok = true;
      try {
        icWorld.structureManager.place(key, dim, spot, { includeBlocks: false, includeEntities: true });
      } catch (err) {
        ok = false;
      }
      const got = ok ? find() : void 0;
      if (got) {
        adopt(got);
        restoreNext(index + 1);
        return;
      }
      icPollFor(find, 40, (late) => {
        if (late) {
          adopt(late);
          restoreNext(index + 1);
        } else if (attempt < 3) {
          tryPlace();
        } else {
          // The page structure is deliberately kept so the data is not destroyed.
          console.warn(`[infinitychest] infinity chest page ${page + 1} could not be restored`);
          restoreNext(index + 1);
        }
      });
    };
    tryPlace();
  };
  restoreNext(0);
}

var icPlacingNow = /* @__PURE__ */ new Set();
var icRestoreWaiters = /* @__PURE__ */ new Map();
var icBreakQueued = /* @__PURE__ */ new Set();

// A chest counts as "restoring" from the moment its item is placed until every page entity is back.
// Breaking or re-placing it during that window used to orphan the saved pages (data loss), so those
// actions wait here and run once the restore has fully finished.
function icAfterRestore(pk, fn) {
  let list = icRestoreWaiters.get(pk);
  if (!list) {
    list = [];
    icRestoreWaiters.set(pk, list);
  }
  list.push(fn);
}

function icRestoreDone(pk) {
  icPlacingNow.delete(pk);
  const list = icRestoreWaiters.get(pk);
  icRestoreWaiters.delete(pk);
  if (!list) return;
  for (const fn of list) {
    icSystem.run(() => {
      try {
        fn();
      } catch (err) {
        console.warn(`[infinitychest] infinity chest deferred action failed: ${err}`);
      }
    });
  }
}

// Polls every tick until fn() returns something truthy (or maxTicks pass), then calls cb(result|undefined).
function icPollFor(fn, maxTicks, cb) {
  let waited = 0;
  const h = icSystem.runInterval(() => {
    let r;
    try { r = fn(); } catch (_) {}
    if (r || ++waited >= maxTicks) {
      icSystem.clearRun(h);
      cb(r);
    }
  }, 1);
}

function icStoreTagOf(key) {
  return `${IC_STORE_TAG_PREFIX}${String(key).replace(/[^A-Za-z0-9_]/g, "_")}`;
}

// The restored chest entity carries a unique store tag from when it was saved, so look for exactly that
// (no before/after diff, no tight radius that a rounding or offset quirk could miss).
function icFindByStoreTag(dim, center, key) {
  try {
    const tag = icStoreTagOf(key);
    const list = dim.getEntities({ type: IC_ENTITY, tags: [tag], location: center, maxDistance: 6 });
    return list[0];
  } catch (_) {
    return void 0;
  }
}

function icHandlePlacePaged(block, dim) {
  const loc = block.location;
  const structureKey = icTakePlacement(dim, loc);
  const pk = icPlacementKey(dim, loc);
  if (icPlacingNow.has(pk)) {
    // A restore is still running at this spot. A duplicate event is ignored; a different chest item
    // placed here waits its turn (its data key is kept) instead of being dropped.
    if (structureKey) {
      icAfterRestore(pk, () => {
        icPendingPlacement.set(pk, structureKey);
        let b;
        try { b = dim.getBlock(icBlockLoc(loc)); } catch (_) {}
        if (b && icIsChestType(b.typeId)) icHandlePlacePaged(b, dim);
      });
    }
    return;
  }
  const existing = icFindHolder(dim, loc);
  if (!structureKey) {
    if (existing) {
      icMarkHolder(existing, loc);
      icMoveTo(existing, loc, true);
      return;
    }
    const spawned = icSpawnHolder(dim, loc);
    icPageWriteEntity(spawned, [], 0);
    return;
  }
  if (existing) icRemoveHolder(existing);
  const center = icCenter(loc);
  const before = icPageSnapshotIds(dim, center);

  const find = () => icFindByStoreTag(dim, center, structureKey) || icPageFindNewEntity(dim, center, before, structureKey);

  const emptyFallback = () => {
    const spawned = icSpawnHolder(dim, loc);
    icPageWriteEntity(spawned, [], 0);
  };
  const finish = (placed) => {
    icMarkHolder(placed, loc);
    icMoveTo(placed, loc, true);
    icDeleteStructure(structureKey);
    try {
      placed.setDynamicProperty(IC_PAGE_PROP, 0);
      placed.setDynamicProperty(IC_PAGE_COUNT_PROP, 1);
      placed.setDynamicProperty(IC_ARCHIVE_PROP, void 0);
    } catch (_) {
    }
    icPageWriteEntity(placed, icVirtualEntries(placed), 0);
    icPagedControlsReady.delete(placed.id);
    icPageRestoreArchivedPages(placed, structureKey, loc, () => icRestoreDone(pk));
  };

  icPlacingNow.add(pk);
  let attempt = 0;
  const tryPlace = () => {
    attempt++;
    let ok = true;
    try {
      icWorld.structureManager.place(structureKey, dim, icBlockLoc(loc), { includeBlocks: false, includeEntities: true });
    } catch (err) {
      ok = false;
      console.warn(`[infinitychest] infinity chest place attempt ${attempt} threw: ${err}`);
    }
    const got = ok ? find() : void 0;
    if (got) {
      finish(got);
      return;
    }
    // Entities can show up a few ticks after place(): wait ~2s, then try placing again (max 3 tries).
    icPollFor(find, 40, (late) => {
      if (late) {
        finish(late);
        return;
      }
      if (attempt < 3) tryPlace();
      else {
        icRestoreDone(pk);
        emptyFallback();
        console.warn(`[infinitychest] infinity chest ${structureKey} could not be restored in place`);
      }
    });
  };
  tryPlace();
}

function icHandleBreakPaged(dim, loc, options) {
  const opts = options || {};
  const blockType = icIsChestType(opts.blockType) ? opts.blockType : IC_BLOCK;
  const pk = icPlacementKey(dim, loc);
  if (icPlacingNow.has(pk)) {
    // Pages are still being restored: breaking now would archive an incomplete chest and orphan the rest.
    if (!icBreakQueued.has(pk)) {
      icBreakQueued.add(pk);
      icSystem.run(() => icRemoveVanillaDrop(dim, icCenter(loc)));
      icAfterRestore(pk, () => {
        icBreakQueued.delete(pk);
        const o = Object.assign({}, opts);
        try {
          if (o.player && !o.player.isValid) delete o.player;
        } catch (_) {
          delete o.player;
        }
        icHandleBreakPaged(dim, loc, o);
      });
    }
    return;
  }
  const holder = icFindHolder(dim, loc);
  if (holder && icPageBreaking.has(holder.id)) return;
  if (holder && opts.player) icRejectNested(holder, [opts.player]);
  if (holder) {
    try {
      icLegacySyncChest(holder);
    } catch (_) {
    }
  }
  const extra = holder ? icPagedOverflow.get(holder.id) || [] : [];
  if (holder) icPagedOverflow.delete(holder.id);
  const pageEntities = holder ? icPageEntities(holder, loc) : [];
  const entries = holder ? icPageCombineEntries(icPageCollectAll(holder, extra)) : [];
  const hasItems = entries.length > 0;
  const shouldDrop = opts.dropItem !== false && (!icIsCreative(opts.player) || hasItems);
  const dropLocation = icCenter(loc);
  const removeAll = () => {
    for (const p of pageEntities) icRemoveHolder(p.entity);
    if (holder) icRemoveHolder(holder);
  };
  if (!shouldDrop) {
    removeAll();
    if (hasItems) icDropItems(dim, icExpandStacks(entries), dropLocation);
    return;
  }
  if (!hasItems || !holder) {
    removeAll();
    const empty = icCreateItem(void 0, [], blockType);
    if (!empty) return;
    icSystem.run(() => {
      icRemoveVanillaDrop(dim, dropLocation);
      try {
        dim.spawnItem(empty, dropLocation);
      } catch (_) {
      }
    });
    return;
  }
  // Lay every page out on real entities and archive them immediately.  The
  // old implementation left real inventory-bearing entities in the world for
  // one tick before capture; an unload or disconnect in that window could
  // lose the contents.
  const pageCount = Math.max(1, Math.ceil(entries.length / IC_PAGE_CAPACITY));
  const pages = [];
  for (let page = 0; page < pageCount; page++) pages[page] = entries.slice(page * IC_PAGE_CAPACITY, (page + 1) * IC_PAGE_CAPACITY);
  icPageBreaking.add(holder.id);
  try {
    for (const tag of holder.getTags()) {
      if (tag.startsWith(IC_LOC_TAG_PREFIX)) holder.removeTag(tag);
    }
    holder.setDynamicProperty("blockLoc", void 0);
    holder.setDynamicProperty(IC_PAGE_PROP, 0);
    holder.setDynamicProperty(IC_PAGE_COUNT_PROP, pageCount);
    holder.setDynamicProperty(IC_ARCHIVE_PROP, void 0);
  } catch (_) {
  }
  let used = [];
  try {
    icPageWriteEntity(holder, pages[0], 0);
    used = icPageLayout(holder, pages, 0, loc);
  } catch (err) {
    console.warn(`[infinitychest] infinity chest break layout failed: ${err}`);
  }
  const archive = icNextStructureKey();
  const captureAll = () => {
    const saved = [];
    let ok = icPageCaptureEntity(holder, archive, icStorageLoc(dim, loc));
    if (ok) saved.push(archive);
    const byPage = /* @__PURE__ */ new Map();
    for (const e of used) byPage.set(icPageIndexOf(e), e);
    for (let page = 1; ok && page < pageCount; page++) {
      const e = byPage.get(page);
      const key = icPageKey(archive, page);
      ok = !!e && e.isValid && icPageCaptureEntity(e, key, icPageSpot(dim, loc, page));
      if (ok) saved.push(key);
    }
    return { ok, saved };
  };
  const finishCapture = (result) => {
    const { ok, saved } = result;
    icPageBreaking.delete(holder.id);
    for (const e of used) icRemoveHolder(e);
    icRemoveHolder(holder);
    const item = ok ? icCreateItem(archive, entries, blockType) : void 0;
    if (!ok || !item) {
      for (const key of saved) icDeleteStructure(key);
      console.warn("[infinitychest] infinity chest archive failed, dropping contents");
      icDropItems(dim, icExpandStacks(entries), dropLocation);
      return;
    }
    icRemoveVanillaDrop(dim, dropLocation);
    try {
      dim.spawnItem(item, dropLocation);
    } catch (_) {
    }
  };
  let captureResult = captureAll();
  if (!captureResult.ok) {
    // Structure calls are synchronous on current Script API versions, but
    // retain one retry for worlds that delay entity updates during a break.
    icSystem.run(() => {
      captureResult = captureAll();
      finishCapture(captureResult);
    });
    return;
  }
  finishCapture(captureResult);
}

// Replace the single-page callbacks with the page-aware versions.  The
// listeners above resolve these function bindings when they fire.
icSyncChest = icSyncChestPaged;
icHandlePlace = icHandlePlacePaged;
icHandleBreak = icHandleBreakPaged;
