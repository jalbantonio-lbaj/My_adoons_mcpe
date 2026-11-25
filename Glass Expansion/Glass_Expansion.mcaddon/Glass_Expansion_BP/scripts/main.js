import { world, system, ItemStack, EquipmentSlot } from "@minecraft/server";

const DIRS = {
  north: { x: 0, y: 0, z: -1 },
  south: { x: 0, y: 0, z: 1 },
  east: { x: 1, y: 0, z: 0 },
  west: { x: -1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  down: { x: 0, y: -1, z: 0 },
};
const LEFT = { north: "west", west: "south", south: "east", east: "north" };
const OPP = { north: "south", south: "north", east: "west", west: "east" };
const CARD = "minecraft:cardinal_direction";

function safe(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

const GLASS_TOOLS = new Set(["vge:glass_sword", "vge:glass_pickaxe", "vge:glass_axe", "vge:glass_shovel", "vge:glass_hoe", "vge:white_stained_glass_sword", "vge:white_stained_glass_pickaxe", "vge:white_stained_glass_axe", "vge:white_stained_glass_shovel", "vge:white_stained_glass_hoe", "vge:orange_stained_glass_sword", "vge:orange_stained_glass_pickaxe", "vge:orange_stained_glass_axe", "vge:orange_stained_glass_shovel", "vge:orange_stained_glass_hoe", "vge:magenta_stained_glass_sword", "vge:magenta_stained_glass_pickaxe", "vge:magenta_stained_glass_axe", "vge:magenta_stained_glass_shovel", "vge:magenta_stained_glass_hoe", "vge:light_blue_stained_glass_sword", "vge:light_blue_stained_glass_pickaxe", "vge:light_blue_stained_glass_axe", "vge:light_blue_stained_glass_shovel", "vge:light_blue_stained_glass_hoe", "vge:yellow_stained_glass_sword", "vge:yellow_stained_glass_pickaxe", "vge:yellow_stained_glass_axe", "vge:yellow_stained_glass_shovel", "vge:yellow_stained_glass_hoe", "vge:lime_stained_glass_sword", "vge:lime_stained_glass_pickaxe", "vge:lime_stained_glass_axe", "vge:lime_stained_glass_shovel", "vge:lime_stained_glass_hoe", "vge:pink_stained_glass_sword", "vge:pink_stained_glass_pickaxe", "vge:pink_stained_glass_axe", "vge:pink_stained_glass_shovel", "vge:pink_stained_glass_hoe", "vge:gray_stained_glass_sword", "vge:gray_stained_glass_pickaxe", "vge:gray_stained_glass_axe", "vge:gray_stained_glass_shovel", "vge:gray_stained_glass_hoe", "vge:light_gray_stained_glass_sword", "vge:light_gray_stained_glass_pickaxe", "vge:light_gray_stained_glass_axe", "vge:light_gray_stained_glass_shovel", "vge:light_gray_stained_glass_hoe", "vge:cyan_stained_glass_sword", "vge:cyan_stained_glass_pickaxe", "vge:cyan_stained_glass_axe", "vge:cyan_stained_glass_shovel", "vge:cyan_stained_glass_hoe", "vge:purple_stained_glass_sword", "vge:purple_stained_glass_pickaxe", "vge:purple_stained_glass_axe", "vge:purple_stained_glass_shovel", "vge:purple_stained_glass_hoe", "vge:blue_stained_glass_sword", "vge:blue_stained_glass_pickaxe", "vge:blue_stained_glass_axe", "vge:blue_stained_glass_shovel", "vge:blue_stained_glass_hoe", "vge:brown_stained_glass_sword", "vge:brown_stained_glass_pickaxe", "vge:brown_stained_glass_axe", "vge:brown_stained_glass_shovel", "vge:brown_stained_glass_hoe", "vge:green_stained_glass_sword", "vge:green_stained_glass_pickaxe", "vge:green_stained_glass_axe", "vge:green_stained_glass_shovel", "vge:green_stained_glass_hoe", "vge:red_stained_glass_sword", "vge:red_stained_glass_pickaxe", "vge:red_stained_glass_axe", "vge:red_stained_glass_shovel", "vge:red_stained_glass_hoe", "vge:black_stained_glass_sword", "vge:black_stained_glass_pickaxe", "vge:black_stained_glass_axe", "vge:black_stained_glass_shovel", "vge:black_stained_glass_hoe", "vge:tinted_glass_sword", "vge:tinted_glass_pickaxe", "vge:tinted_glass_axe", "vge:tinted_glass_shovel", "vge:tinted_glass_hoe"]);
const BOAT_LABELS = {"vge:glass_boat": "Glass Boat", "vge:glass_chest_boat": "Glass Boat with Chest", "vge:glass_boat_with_glass_chest": "Glass Boat with Glass Chest", "vge:white_stained_glass_boat": "White Stained Glass Boat", "vge:white_stained_glass_chest_boat": "White Stained Glass Boat with Chest", "vge:white_stained_glass_boat_with_glass_chest": "White Stained Glass Boat with White Stained Glass Chest", "vge:orange_stained_glass_boat": "Orange Stained Glass Boat", "vge:orange_stained_glass_chest_boat": "Orange Stained Glass Boat with Chest", "vge:orange_stained_glass_boat_with_glass_chest": "Orange Stained Glass Boat with Orange Stained Glass Chest", "vge:magenta_stained_glass_boat": "Magenta Stained Glass Boat", "vge:magenta_stained_glass_chest_boat": "Magenta Stained Glass Boat with Chest", "vge:magenta_stained_glass_boat_with_glass_chest": "Magenta Stained Glass Boat with Magenta Stained Glass Chest", "vge:light_blue_stained_glass_boat": "Light Blue Stained Glass Boat", "vge:light_blue_stained_glass_chest_boat": "Light Blue Stained Glass Boat with Chest", "vge:light_blue_stained_glass_boat_with_glass_chest": "Light Blue Stained Glass Boat with Light Blue Stained Glass Chest", "vge:yellow_stained_glass_boat": "Yellow Stained Glass Boat", "vge:yellow_stained_glass_chest_boat": "Yellow Stained Glass Boat with Chest", "vge:yellow_stained_glass_boat_with_glass_chest": "Yellow Stained Glass Boat with Yellow Stained Glass Chest", "vge:lime_stained_glass_boat": "Lime Stained Glass Boat", "vge:lime_stained_glass_chest_boat": "Lime Stained Glass Boat with Chest", "vge:lime_stained_glass_boat_with_glass_chest": "Lime Stained Glass Boat with Lime Stained Glass Chest", "vge:pink_stained_glass_boat": "Pink Stained Glass Boat", "vge:pink_stained_glass_chest_boat": "Pink Stained Glass Boat with Chest", "vge:pink_stained_glass_boat_with_glass_chest": "Pink Stained Glass Boat with Pink Stained Glass Chest", "vge:gray_stained_glass_boat": "Gray Stained Glass Boat", "vge:gray_stained_glass_chest_boat": "Gray Stained Glass Boat with Chest", "vge:gray_stained_glass_boat_with_glass_chest": "Gray Stained Glass Boat with Gray Stained Glass Chest", "vge:light_gray_stained_glass_boat": "Light Gray Stained Glass Boat", "vge:light_gray_stained_glass_chest_boat": "Light Gray Stained Glass Boat with Chest", "vge:light_gray_stained_glass_boat_with_glass_chest": "Light Gray Stained Glass Boat with Light Gray Stained Glass Chest", "vge:cyan_stained_glass_boat": "Cyan Stained Glass Boat", "vge:cyan_stained_glass_chest_boat": "Cyan Stained Glass Boat with Chest", "vge:cyan_stained_glass_boat_with_glass_chest": "Cyan Stained Glass Boat with Cyan Stained Glass Chest", "vge:purple_stained_glass_boat": "Purple Stained Glass Boat", "vge:purple_stained_glass_chest_boat": "Purple Stained Glass Boat with Chest", "vge:purple_stained_glass_boat_with_glass_chest": "Purple Stained Glass Boat with Purple Stained Glass Chest", "vge:blue_stained_glass_boat": "Blue Stained Glass Boat", "vge:blue_stained_glass_chest_boat": "Blue Stained Glass Boat with Chest", "vge:blue_stained_glass_boat_with_glass_chest": "Blue Stained Glass Boat with Blue Stained Glass Chest", "vge:brown_stained_glass_boat": "Brown Stained Glass Boat", "vge:brown_stained_glass_chest_boat": "Brown Stained Glass Boat with Chest", "vge:brown_stained_glass_boat_with_glass_chest": "Brown Stained Glass Boat with Brown Stained Glass Chest", "vge:green_stained_glass_boat": "Green Stained Glass Boat", "vge:green_stained_glass_chest_boat": "Green Stained Glass Boat with Chest", "vge:green_stained_glass_boat_with_glass_chest": "Green Stained Glass Boat with Green Stained Glass Chest", "vge:red_stained_glass_boat": "Red Stained Glass Boat", "vge:red_stained_glass_chest_boat": "Red Stained Glass Boat with Chest", "vge:red_stained_glass_boat_with_glass_chest": "Red Stained Glass Boat with Red Stained Glass Chest", "vge:black_stained_glass_boat": "Black Stained Glass Boat", "vge:black_stained_glass_chest_boat": "Black Stained Glass Boat with Chest", "vge:black_stained_glass_boat_with_glass_chest": "Black Stained Glass Boat with Black Stained Glass Chest", "vge:tinted_glass_boat": "Tinted Glass Boat", "vge:tinted_glass_chest_boat": "Tinted Glass Boat with Chest", "vge:tinted_glass_boat_with_glass_chest": "Tinted Glass Boat with Tinted Glass Chest"};

function hasSilkTouch(player) {
  const item = safe(() => player.getComponent("minecraft:equippable").getEquipment(EquipmentSlot.Mainhand));
  if (!item) return false;
  return safe(() => item.getComponent("minecraft:enchantable").hasEnchantment("silk_touch")) === true;
}

function isCreative(player) {
  return safe(() => String(player.getGameMode()).toLowerCase() === "creative") === true;
}

function partsOf(block) {
  const parts = safe(() => block.getParts());
  return parts && parts.length ? parts : [block];
}

function setOpen(block, open) {
  for (const part of partsOf(block)) {
    safe(() => part.setPermutation(part.permutation.withState("vge:open", open)));
  }
  safe(() => block.dimension.playSound(open ? "vge.glass_door.open" : "vge.glass_door.close", block.center(), { pitch: 0.95 + Math.random() * 0.1, volume: 1 }));
}

function redstoneToggle({ block, powerLevel, previousPowerLevel }) {
  const on = powerLevel > 0;
  if (on === previousPowerLevel > 0) return;
  if (block.permutation.getState("vge:open") === on) return;
  setOpen(block, on);
}

function consumeHeld(player, typeId) {
  if (isCreative(player)) return;
  const slot = safe(() => player.getComponent("minecraft:equippable").getEquipmentSlot(EquipmentSlot.Mainhand));
  const item = slot && safe(() => slot.getItem());
  if (!item || item.typeId !== typeId) return;
  if (item.amount > 1) {
    item.amount -= 1;
    slot.setItem(item);
  } else {
    slot.setItem(undefined);
  }
}

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent("vge:door", {
    beforeOnPlayerPlace(e) {
      const perm = e.permutationToPlace;
      const dir = perm.getState(CARD);
      const side = LEFT[dir];
      if (!side) return;
      const nb = safe(() => e.block.offset(DIRS[side]));
      if (!nb || nb.typeId !== perm.type.id) return;
      const np = nb.permutation;
      if (np.getState(CARD) === dir && np.getState("vge:hinge_right") === false) {
        e.permutationToPlace = perm.withState("vge:hinge_right", true);
      }
    },
    onPlayerInteract({ block }) {
      setOpen(block, !block.permutation.getState("vge:open"));
    },
    onRedstoneUpdate: redstoneToggle,
  });

  blockComponentRegistry.registerCustomComponent("vge:chest", {
    onPlace({ block }) {
      system.run(() => setupChest(block));
    },
  });

  blockComponentRegistry.registerCustomComponent("vge:toggle", {
    onPlayerInteract({ block }) {
      setOpen(block, !block.permutation.getState("vge:open"));
    },
    onRedstoneUpdate: redstoneToggle,
  });

  blockComponentRegistry.registerCustomComponent("vge:gate", {
    onPlayerInteract({ block, player }) {
      const perm = block.permutation;
      const open = perm.getState("vge:open");
      if (!open && player) {
        const dir = perm.getState(CARD);
        const v = DIRS[dir];
        const c = block.center();
        const rel = (player.location.x - c.x) * v.x + (player.location.z - c.z) * v.z;
        if (rel > 0) safe(() => block.setPermutation(perm.withState(CARD, OPP[dir])));
      }
      setOpen(block, !open);
    },
    onRedstoneUpdate: redstoneToggle,
  });

  blockComponentRegistry.registerCustomComponent("vge:button", {
    onPlayerInteract({ block, dimension }) {
      if (block.permutation.getState("vge:pressed")) return;
      const id = block.typeId;
      safe(() => block.setPermutation(block.permutation.withState("vge:pressed", true)));
      safe(() => dimension.playSound("random.click", block.center(), { pitch: 0.6, volume: 0.6 }));
      const loc = block.location;
      system.runTimeout(() => {
        const b = safe(() => dimension.getBlock(loc));
        if (!b || b.typeId !== id || !b.permutation.getState("vge:pressed")) return;
        safe(() => b.setPermutation(b.permutation.withState("vge:pressed", false)));
        safe(() => dimension.playSound("random.click", b.center(), { pitch: 0.5, volume: 0.6 }));
      }, 30);
    },
  });

  blockComponentRegistry.registerCustomComponent("vge:plate", {
    onTick({ block, dimension }) {
      const loc = block.location;
      const ents = safe(() => dimension.getEntities({
        location: { x: loc.x, y: loc.y - 0.05, z: loc.z },
        volume: { x: 1, y: 0.6, z: 1 },
      })) || [];
      const pressed = ents.some((en) => {
        const l = safe(() => en.location);
        if (!l) return false;
        const fx = l.x - loc.x;
        const fz = l.z - loc.z;
        const fy = l.y - loc.y;
        return fx >= 0.0625 && fx <= 0.9375 && fz >= 0.0625 && fz <= 0.9375 && fy >= -0.05 && fy <= 0.3;
      });
      if (block.permutation.getState("vge:pressed") === pressed) return;
      safe(() => block.setPermutation(block.permutation.withState("vge:pressed", pressed)));
      safe(() => dimension.playSound("random.click", block.center(), { pitch: pressed ? 0.6 : 0.5, volume: 0.5 }));
    },
  });

  blockComponentRegistry.registerCustomComponent("vge:slab", {
    onPlayerBreak({ block, brokenBlockPermutation, player, dimension }) {
      if (!brokenBlockPermutation.getState("vge:double")) return;
      if (!player || isCreative(player) || !hasSilkTouch(player)) return;
      safe(() => dimension.spawnItem(new ItemStack(brokenBlockPermutation.type.id, 1), block.center()));
    },
  });
});

function isSlabId(id) {
  return id.startsWith("vge:") && id.endsWith("glass_slab");
}

function isGlassThing(id) {
  if (id === "minecraft:tinted_glass") return false;
  if (id.startsWith("vge:")) return true;
  return id.startsWith("minecraft:") && id.includes("glass");
}

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation, itemStackBeforeBreak }) => {
  if (isCreative(player)) return;
  const id = brokenBlockPermutation.type.id;
  const tinted = id.startsWith("vge:tinted_glass_");
  const tool = !!itemStackBeforeBreak && GLASS_TOOLS.has(itemStackBeforeBreak.typeId);
  if (CHESTS[id]) return;
  if (!tinted && !tool) return;
  if (!isGlassThing(id)) return;
  const silk = !!itemStackBeforeBreak && safe(() => itemStackBeforeBreak.getComponent("minecraft:enchantable").hasEnchantment("silk_touch")) === true;
  if (silk) return;
  let stack = safe(() => brokenBlockPermutation.getItemStack(1));
  if (!stack) stack = safe(() => new ItemStack(id, 1));
  if (!stack) return;
  if (isSlabId(id) && brokenBlockPermutation.getState("vge:double")) stack.amount = 2;
  safe(() => block.dimension.spawnItem(stack, block.center()));
});

const CHEST_BOATS = { families: ["vge_chest_boat"] };
const BOAT_CHEST = "vge:boat_chest";
const DIMS = ["overworld", "nether", "the_end"];
const boatHits = new Map();
const openCount = new Map();
const orphanAge = new Map();

function linked(entity, key) {
  const id = safe(() => entity.getDynamicProperty(key));
  if (typeof id !== "string") return undefined;
  const e = safe(() => world.getEntity(id));
  return e && e.isValid ? e : undefined;
}

function chestOf(boat) {
  return linked(boat, "vge:chest");
}

function boatOf(chest) {
  return linked(chest, "vge:boat");
}

function chestSpot(boat) {
  const l = boat.location;
  const yaw = (safe(() => boat.getRotation().y) ?? 0) * Math.PI / 180;
  return { x: l.x + Math.sin(yaw) * 0.44, y: l.y + 0.35, z: l.z - Math.cos(yaw) * 0.44 };
}

function link(boat, chest) {
  safe(() => boat.setDynamicProperty("vge:chest", chest.id));
  safe(() => chest.setDynamicProperty("vge:boat", boat.id));
  const name = BOAT_LABELS[boat.typeId] ?? "Glass Boat with Chest";
  if (safe(() => chest.nameTag) !== name) safe(() => { chest.nameTag = name; });
}

function ensureChest(boat) {
  if (!boat || !boat.isValid || chestOf(boat)) return;
  const dim = boat.dimension;
  const near = safe(() => dim.getEntities({ type: BOAT_CHEST, location: boat.location, maxDistance: 4 })) || [];
  const mine = near.find((c) => safe(() => c.getDynamicProperty("vge:boat")) === boat.id);
  if (mine) return link(boat, mine);
  const chest = safe(() => dim.spawnEntity(BOAT_CHEST, chestSpot(boat)));
  if (chest) link(boat, chest);
}

function dropContainer(entity, dim, loc) {
  const inv = safe(() => entity.getComponent("minecraft:inventory").container);
  if (!inv) return;
  for (let i = 0; i < inv.size; i++) {
    const st = safe(() => inv.getItem(i));
    if (st) safe(() => dim.spawnItem(st, loc));
  }
  safe(() => inv.clearAll());
}

function setLid(boat, open) {
  if (!boat || !boat.isValid) return;
  if (safe(() => boat.getProperty("vge:chest_open")) === open) return;
  safe(() => boat.setProperty("vge:chest_open", open));
  safe(() => boat.dimension.playSound(open ? "random.chestopen" : "random.chestclosed", boat.location, { volume: 0.6 }));
}

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (BOAT_LABELS[entity.typeId] && !entity.typeId.endsWith("glass_boat")) system.run(() => ensureChest(entity));
});

world.beforeEvents.entityHurt.subscribe((e) => {
  const id = e.hurtEntity.typeId;
  if (BOAT_LABELS[id] || id === BOAT_CHEST) e.cancel = true;
});

world.afterEvents.entityContainerOpened.subscribe(({ entity }) => {
  if (!entity || entity.typeId !== BOAT_CHEST) return;
  openCount.set(entity.id, (openCount.get(entity.id) ?? 0) + 1);
  setLid(boatOf(entity), true);
});

world.afterEvents.entityContainerClosed.subscribe(({ entity }) => {
  if (!entity || entity.typeId !== BOAT_CHEST) return;
  const n = Math.max(0, (openCount.get(entity.id) ?? 1) - 1);
  if (n) openCount.set(entity.id, n);
  else {
    openCount.delete(entity.id);
    setLid(boatOf(entity), false);
  }
});

system.runInterval(() => {
  for (const dimId of DIMS) {
    const dim = safe(() => world.getDimension(dimId));
    if (!dim) continue;
    for (const boat of safe(() => dim.getEntities(CHEST_BOATS)) || []) {
      const chest = chestOf(boat);
      if (!chest) continue;
      const want = chestSpot(boat);
      const at = safe(() => chest.location);
      if (at && Math.abs(at.x - want.x) < 0.01 && Math.abs(at.y - want.y) < 0.01 && Math.abs(at.z - want.z) < 0.01) continue;
      safe(() => chest.teleport(want, { dimension: dim }));
    }
  }
}, 1);

system.runInterval(() => {
  const tick = system.currentTick;
  for (const [id, h] of boatHits) if (tick - h.tick >= 60) boatHits.delete(id);
  for (const dimId of DIMS) {
    const dim = safe(() => world.getDimension(dimId));
    if (!dim) continue;
    for (const boat of safe(() => dim.getEntities(CHEST_BOATS)) || []) ensureChest(boat);
    for (const chest of safe(() => dim.getEntities({ type: BOAT_CHEST })) || []) {
      const boat = boatOf(chest);
      if (boat) {
        link(boat, chest);
        orphanAge.delete(chest.id);
        continue;
      }
      const age = (orphanAge.get(chest.id) ?? 0) + 1;
      orphanAge.set(chest.id, age);
      if (age < 3) continue;
      orphanAge.delete(chest.id);
      dropContainer(chest, dim, chest.location);
      safe(() => chest.remove());
    }
  }
}, 40);

function breakBoat(boat, player) {
  const dim = boat.dimension;
  const loc = { ...boat.location };
  const creative = isCreative(player);
  const now = system.currentTick;
  const prev = boatHits.get(boat.id);
  const hits = prev && now - prev.tick < 60 ? prev.hits + 1 : 1;
  boatHits.set(boat.id, { hits, tick: now });
  if (!creative && hits < 3) {
    safe(() => dim.playSound("hit.wood", loc, { pitch: 1.3 }));
    return;
  }
  boatHits.delete(boat.id);
  const chest = chestOf(boat);
  if (chest) {
    if (!creative) dropContainer(chest, dim, loc);
    openCount.delete(chest.id);
    safe(() => chest.remove());
  }
  if (!creative) safe(() => dim.spawnItem(new ItemStack(boat.typeId, 1), loc));
  safe(() => boat.getComponent("minecraft:rideable").ejectRiders());
  safe(() => dim.playSound("random.glass", loc));
  safe(() => boat.remove());
}

world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (!hitEntity || !damagingEntity || damagingEntity.typeId !== "minecraft:player") return;
  if (BOAT_LABELS[hitEntity.typeId]) breakBoat(hitEntity, damagingEntity);
  else if (hitEntity.typeId === BOAT_CHEST) {
    const boat = boatOf(hitEntity);
    if (boat) breakBoat(boat, damagingEntity);
  }
});

function singleSlab(block, id) {
  return block && block.typeId === id && block.permutation.getState("vge:double") === false;
}

world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
  if (!e.isFirstEvent) return;
  if (!e.itemStack || !isSlabId(e.itemStack.typeId)) return;
  const id = e.itemStack.typeId;
  const face = String(e.blockFace).toLowerCase();
  const block = e.block;
  let target;
  if (singleSlab(block, id)) {
    const half = block.permutation.getState("minecraft:vertical_half");
    if ((half === "bottom" && face === "up") || (half === "top" && face === "down")) target = block;
  }
  if (!target && DIRS[face]) {
    const next = safe(() => block.offset(DIRS[face]));
    if (singleSlab(next, id)) target = next;
  }
  if (!target) return;
  e.cancel = true;
  const player = e.player;
  system.run(() => {
    if (!singleSlab(target, id)) return;
    safe(() => target.setPermutation(target.permutation.withState("vge:double", true)));
    safe(() => target.dimension.playSound("dig.stone", target.center(), { pitch: 0.9 }));
    consumeHeld(player, id);
  });
});

const GEAR = new Set(["vge:glass_sword", "vge:glass_pickaxe", "vge:glass_axe", "vge:glass_shovel", "vge:glass_hoe", "vge:white_stained_glass_sword", "vge:white_stained_glass_pickaxe", "vge:white_stained_glass_axe", "vge:white_stained_glass_shovel", "vge:white_stained_glass_hoe", "vge:orange_stained_glass_sword", "vge:orange_stained_glass_pickaxe", "vge:orange_stained_glass_axe", "vge:orange_stained_glass_shovel", "vge:orange_stained_glass_hoe", "vge:magenta_stained_glass_sword", "vge:magenta_stained_glass_pickaxe", "vge:magenta_stained_glass_axe", "vge:magenta_stained_glass_shovel", "vge:magenta_stained_glass_hoe", "vge:light_blue_stained_glass_sword", "vge:light_blue_stained_glass_pickaxe", "vge:light_blue_stained_glass_axe", "vge:light_blue_stained_glass_shovel", "vge:light_blue_stained_glass_hoe", "vge:yellow_stained_glass_sword", "vge:yellow_stained_glass_pickaxe", "vge:yellow_stained_glass_axe", "vge:yellow_stained_glass_shovel", "vge:yellow_stained_glass_hoe", "vge:lime_stained_glass_sword", "vge:lime_stained_glass_pickaxe", "vge:lime_stained_glass_axe", "vge:lime_stained_glass_shovel", "vge:lime_stained_glass_hoe", "vge:pink_stained_glass_sword", "vge:pink_stained_glass_pickaxe", "vge:pink_stained_glass_axe", "vge:pink_stained_glass_shovel", "vge:pink_stained_glass_hoe", "vge:gray_stained_glass_sword", "vge:gray_stained_glass_pickaxe", "vge:gray_stained_glass_axe", "vge:gray_stained_glass_shovel", "vge:gray_stained_glass_hoe", "vge:light_gray_stained_glass_sword", "vge:light_gray_stained_glass_pickaxe", "vge:light_gray_stained_glass_axe", "vge:light_gray_stained_glass_shovel", "vge:light_gray_stained_glass_hoe", "vge:cyan_stained_glass_sword", "vge:cyan_stained_glass_pickaxe", "vge:cyan_stained_glass_axe", "vge:cyan_stained_glass_shovel", "vge:cyan_stained_glass_hoe", "vge:purple_stained_glass_sword", "vge:purple_stained_glass_pickaxe", "vge:purple_stained_glass_axe", "vge:purple_stained_glass_shovel", "vge:purple_stained_glass_hoe", "vge:blue_stained_glass_sword", "vge:blue_stained_glass_pickaxe", "vge:blue_stained_glass_axe", "vge:blue_stained_glass_shovel", "vge:blue_stained_glass_hoe", "vge:brown_stained_glass_sword", "vge:brown_stained_glass_pickaxe", "vge:brown_stained_glass_axe", "vge:brown_stained_glass_shovel", "vge:brown_stained_glass_hoe", "vge:green_stained_glass_sword", "vge:green_stained_glass_pickaxe", "vge:green_stained_glass_axe", "vge:green_stained_glass_shovel", "vge:green_stained_glass_hoe", "vge:red_stained_glass_sword", "vge:red_stained_glass_pickaxe", "vge:red_stained_glass_axe", "vge:red_stained_glass_shovel", "vge:red_stained_glass_hoe", "vge:black_stained_glass_sword", "vge:black_stained_glass_pickaxe", "vge:black_stained_glass_axe", "vge:black_stained_glass_shovel", "vge:black_stained_glass_hoe", "vge:tinted_glass_sword", "vge:tinted_glass_pickaxe", "vge:tinted_glass_axe", "vge:tinted_glass_shovel", "vge:tinted_glass_hoe", "vge:glass_helmet", "vge:glass_chestplate", "vge:glass_leggings", "vge:glass_boots", "vge:glass_shield", "vge:white_stained_glass_helmet", "vge:white_stained_glass_chestplate", "vge:white_stained_glass_leggings", "vge:white_stained_glass_boots", "vge:white_stained_glass_shield", "vge:orange_stained_glass_helmet", "vge:orange_stained_glass_chestplate", "vge:orange_stained_glass_leggings", "vge:orange_stained_glass_boots", "vge:orange_stained_glass_shield", "vge:magenta_stained_glass_helmet", "vge:magenta_stained_glass_chestplate", "vge:magenta_stained_glass_leggings", "vge:magenta_stained_glass_boots", "vge:magenta_stained_glass_shield", "vge:light_blue_stained_glass_helmet", "vge:light_blue_stained_glass_chestplate", "vge:light_blue_stained_glass_leggings", "vge:light_blue_stained_glass_boots", "vge:light_blue_stained_glass_shield", "vge:yellow_stained_glass_helmet", "vge:yellow_stained_glass_chestplate", "vge:yellow_stained_glass_leggings", "vge:yellow_stained_glass_boots", "vge:yellow_stained_glass_shield", "vge:lime_stained_glass_helmet", "vge:lime_stained_glass_chestplate", "vge:lime_stained_glass_leggings", "vge:lime_stained_glass_boots", "vge:lime_stained_glass_shield", "vge:pink_stained_glass_helmet", "vge:pink_stained_glass_chestplate", "vge:pink_stained_glass_leggings", "vge:pink_stained_glass_boots", "vge:pink_stained_glass_shield", "vge:gray_stained_glass_helmet", "vge:gray_stained_glass_chestplate", "vge:gray_stained_glass_leggings", "vge:gray_stained_glass_boots", "vge:gray_stained_glass_shield", "vge:light_gray_stained_glass_helmet", "vge:light_gray_stained_glass_chestplate", "vge:light_gray_stained_glass_leggings", "vge:light_gray_stained_glass_boots", "vge:light_gray_stained_glass_shield", "vge:cyan_stained_glass_helmet", "vge:cyan_stained_glass_chestplate", "vge:cyan_stained_glass_leggings", "vge:cyan_stained_glass_boots", "vge:cyan_stained_glass_shield", "vge:purple_stained_glass_helmet", "vge:purple_stained_glass_chestplate", "vge:purple_stained_glass_leggings", "vge:purple_stained_glass_boots", "vge:purple_stained_glass_shield", "vge:blue_stained_glass_helmet", "vge:blue_stained_glass_chestplate", "vge:blue_stained_glass_leggings", "vge:blue_stained_glass_boots", "vge:blue_stained_glass_shield", "vge:brown_stained_glass_helmet", "vge:brown_stained_glass_chestplate", "vge:brown_stained_glass_leggings", "vge:brown_stained_glass_boots", "vge:brown_stained_glass_shield", "vge:green_stained_glass_helmet", "vge:green_stained_glass_chestplate", "vge:green_stained_glass_leggings", "vge:green_stained_glass_boots", "vge:green_stained_glass_shield", "vge:red_stained_glass_helmet", "vge:red_stained_glass_chestplate", "vge:red_stained_glass_leggings", "vge:red_stained_glass_boots", "vge:red_stained_glass_shield", "vge:black_stained_glass_helmet", "vge:black_stained_glass_chestplate", "vge:black_stained_glass_leggings", "vge:black_stained_glass_boots", "vge:black_stained_glass_shield", "vge:tinted_glass_helmet", "vge:tinted_glass_chestplate", "vge:tinted_glass_leggings", "vge:tinted_glass_boots", "vge:tinted_glass_shield"]);
const SHIELDS = new Set(["vge:glass_shield", "vge:white_stained_glass_shield", "vge:orange_stained_glass_shield", "vge:magenta_stained_glass_shield", "vge:light_blue_stained_glass_shield", "vge:yellow_stained_glass_shield", "vge:lime_stained_glass_shield", "vge:pink_stained_glass_shield", "vge:gray_stained_glass_shield", "vge:light_gray_stained_glass_shield", "vge:cyan_stained_glass_shield", "vge:purple_stained_glass_shield", "vge:blue_stained_glass_shield", "vge:brown_stained_glass_shield", "vge:green_stained_glass_shield", "vge:red_stained_glass_shield", "vge:black_stained_glass_shield", "vge:tinted_glass_shield"]);
const CHESTS = {"vge:glass_chest": [0, "Glass Chest"], "vge:white_stained_glass_chest": [1, "White Stained Glass Chest"], "vge:orange_stained_glass_chest": [2, "Orange Stained Glass Chest"], "vge:magenta_stained_glass_chest": [3, "Magenta Stained Glass Chest"], "vge:light_blue_stained_glass_chest": [4, "Light Blue Stained Glass Chest"], "vge:yellow_stained_glass_chest": [5, "Yellow Stained Glass Chest"], "vge:lime_stained_glass_chest": [6, "Lime Stained Glass Chest"], "vge:pink_stained_glass_chest": [7, "Pink Stained Glass Chest"], "vge:gray_stained_glass_chest": [8, "Gray Stained Glass Chest"], "vge:light_gray_stained_glass_chest": [9, "Light Gray Stained Glass Chest"], "vge:cyan_stained_glass_chest": [10, "Cyan Stained Glass Chest"], "vge:purple_stained_glass_chest": [11, "Purple Stained Glass Chest"], "vge:blue_stained_glass_chest": [12, "Blue Stained Glass Chest"], "vge:brown_stained_glass_chest": [13, "Brown Stained Glass Chest"], "vge:green_stained_glass_chest": [14, "Green Stained Glass Chest"], "vge:red_stained_glass_chest": [15, "Red Stained Glass Chest"], "vge:black_stained_glass_chest": [16, "Black Stained Glass Chest"], "vge:tinted_glass_chest": [17, "Tinted Glass Chest"]};
const CHEST_ENT = "vge:glass_chest";
const FACE_YAW = { south: 0, west: 90, north: 180, east: -90 };
function shatter(player) {
  const dim = player.dimension;
  const loc = player.location;
  safe(() => dim.playSound("random.glass", loc, { volume: 0.9, pitch: 1.1 }));
}

const GEAR_SLOTS = [EquipmentSlot.Mainhand, EquipmentSlot.Offhand, EquipmentSlot.Head, EquipmentSlot.Chest, EquipmentSlot.Legs, EquipmentSlot.Feet];
const lastGear = new Map();

system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const eq = safe(() => p.getComponent("minecraft:equippable"));
    if (!eq) continue;
    const sel = p.selectedSlotIndex;
    const prev = lastGear.get(p.id) ?? {};
    const now = {};
    for (const s of GEAR_SLOTS) {
      const it = safe(() => eq.getEquipment(s));
      if (it && GEAR.has(it.typeId)) {
        const d = safe(() => it.getComponent("minecraft:durability"));
        now[s] = { id: it.typeId, left: d ? d.maxDurability - d.damage : 999, max: d ? d.maxDurability : 1, sel };
      }
      const was = prev[s];
      if (was && !it && (s !== EquipmentSlot.Mainhand || was.sel === sel) && was.left <= Math.max(2, Math.ceil(was.max * 0.04))) shatter(p);
    }
    lastGear.set(p.id, now);
  }
}, 2);

world.afterEvents.playerLeave.subscribe(({ playerId }) => lastGear.delete(playerId));

function heldShield(p) {
  const eq = safe(() => p.getComponent("minecraft:equippable"));
  if (!eq) return undefined;
  const off = safe(() => eq.getEquipment(EquipmentSlot.Offhand));
  if (off && SHIELDS.has(off.typeId)) return EquipmentSlot.Offhand;
  const main = safe(() => eq.getEquipment(EquipmentSlot.Mainhand));
  if (main && SHIELDS.has(main.typeId)) return EquipmentSlot.Mainhand;
  return undefined;
}

function wearShield(p, slot, amount) {
  safe(() => p.dimension.playSound("item.shield.block", p.location));
  if (amount < 3 || isCreative(p)) return;
  const eq = safe(() => p.getComponent("minecraft:equippable"));
  const item = eq && safe(() => eq.getEquipment(slot));
  if (!item || !SHIELDS.has(item.typeId)) return;
  const d = safe(() => item.getComponent("minecraft:durability"));
  if (!d) return;
  const next = d.damage + 1 + Math.floor(amount);
  if (next >= d.maxDurability) {
    safe(() => eq.setEquipment(slot, undefined));
    safe(() => p.dimension.playSound("random.break", p.location));
    shatter(p);
    return;
  }
  d.damage = next;
  safe(() => eq.setEquipment(slot, item));
}

world.beforeEvents.entityHurt.subscribe((e) => {
  const p = e.hurtEntity;
  if (!p || p.typeId !== "minecraft:player" || !p.isSneaking) return;
  const slot = heldShield(p);
  if (!slot) return;
  const src = e.damageSource;
  const att = src.damagingProjectile ?? src.damagingEntity;
  const al = att && safe(() => att.location);
  const v = safe(() => p.getViewDirection());
  if (!al || !v) return;
  const dx = al.x - p.location.x;
  const dz = al.z - p.location.z;
  if (v.x * dx + v.z * dz <= 0) return;
  e.cancel = true;
  const amount = e.damage;
  system.run(() => wearShield(p, slot, amount));
});

const CHEST_LIFT = 0.625;
const RIGHT_OF = { north: "east", east: "south", south: "west", west: "north" };
const chestViewers = new Map();

function chestSpotOf(block) {
  const c = block.bottomCenter();
  return { x: c.x, y: c.y + CHEST_LIFT, z: c.z };
}

function chestEntityAt(block) {
  const list = safe(() => block.dimension.getEntities({ type: CHEST_ENT, location: block.center(), maxDistance: 0.75 })) || [];
  return list[0];
}

function chestBlockOf(ent) {
  const l = safe(() => ent.isValid && ent.location);
  if (!l) return undefined;
  return safe(() => ent.dimension.getBlock({ x: Math.floor(l.x), y: Math.floor(l.y + 0.01), z: Math.floor(l.z) }));
}

function invOf(ent) {
  return safe(() => ent.getComponent("minecraft:inventory").container);
}

function snapshot(ent) {
  const inv = invOf(ent);
  const out = [];
  if (!inv) return out;
  for (let i = 0; i < inv.size; i++) out.push(safe(() => inv.getItem(i)));
  return out;
}

function fill(ent, items) {
  const inv = invOf(ent);
  if (!inv) return items;
  const extra = [];
  for (let i = 0; i < items.length; i++) {
    if (!items[i]) continue;
    if (i < inv.size) safe(() => inv.setItem(i, items[i]));
    else extra.push(items[i]);
  }
  return extra;
}

function clearInv(ent) {
  const inv = invOf(ent);
  if (inv) safe(() => inv.clearAll());
}

function spill(dim, loc, items) {
  for (const it of items) if (it) safe(() => dim.spawnItem(it, loc));
}

function partnerOf(ent) {
  return linked(ent, "vge:partner");
}

function setBlockHalf(ent, half) {
  const b = chestBlockOf(ent);
  if (b && CHESTS[b.typeId]) safe(() => b.setPermutation(b.permutation.withState("vge:half", half)));
}

function setupChest(block) {
  const info = CHESTS[block.typeId];
  if (!info) return;
  let ent = chestEntityAt(block);
  if (!ent) ent = safe(() => block.dimension.spawnEntity(CHEST_ENT, chestSpotOf(block)));
  if (!ent) return;
  const dir = block.permutation.getState(CARD);
  const face = OPP[dir] ?? "south";
  safe(() => ent.teleport(chestSpotOf(block), { rotation: { x: 0, y: FACE_YAW[face] } }));
  safe(() => ent.setProperty("vge:color", info[0]));
  if (safe(() => ent.nameTag)) safe(() => { ent.nameTag = ""; });
  if (partnerOf(ent)) return;
  for (const side of [RIGHT_OF[dir], LEFT[dir]]) {
    const nb = safe(() => block.offset(DIRS[side]));
    if (!nb || nb.typeId !== block.typeId || nb.permutation.getState(CARD) !== dir) continue;
    const other = chestEntityAt(nb);
    if (!other || partnerOf(other) || safe(() => other.getProperty("vge:half")) !== 0) continue;
    pairChests(ent, other, side === RIGHT_OF[dir]);
    return;
  }
}

function pairChests(a, b, aLeft) {
  const left = aLeft ? a : b;
  const right = aLeft ? b : a;
  const li = snapshot(left).slice(0, 27);
  const ri = snapshot(right).slice(0, 27);
  clearInv(left);
  clearInv(right);
  safe(() => left.setDynamicProperty("vge:partner", right.id));
  safe(() => right.setDynamicProperty("vge:partner", left.id));
  for (const [e, h] of [[left, 1], [right, 2]]) {
    safe(() => e.triggerEvent("vge:to_double"));
    safe(() => e.setProperty("vge:half", h));
    setBlockHalf(e, h);
  }
  const all = li.concat(new Array(27 - li.length).fill(undefined), ri);
  system.runTimeout(() => {
    for (const e of [left, right]) if (e.isValid) fill(e, all);
  }, 2);
}

function unpair(ent, keepHalf) {
  const items = snapshot(ent);
  const kept = keepHalf === 1 ? items.slice(0, 27) : items.slice(27, 54);
  clearInv(ent);
  safe(() => ent.setDynamicProperty("vge:partner", undefined));
  safe(() => ent.triggerEvent("vge:to_single"));
  safe(() => ent.setProperty("vge:half", 0));
  setBlockHalf(ent, 0);
  system.runTimeout(() => {
    if (!ent.isValid) return;
    const extra = fill(ent, kept);
    spill(ent.dimension, ent.location, extra);
  }, 2);
}

function removeChestEntity(ent, dim, loc) {
  const half = safe(() => ent.getProperty("vge:half")) ?? 0;
  const partner = partnerOf(ent);
  const items = snapshot(ent);
  if (partner && half) {
    spill(dim, loc, half === 1 ? items.slice(0, 27) : items.slice(27, 54));
    unpair(partner, half === 1 ? 2 : 1);
  } else {
    spill(dim, loc, items);
  }
  clearInv(ent);
  chestViewers.delete(ent.id);
  const timer = lidTimers.get(ent.id);
  if (timer !== undefined) {
    system.clearRun(timer);
    lidTimers.delete(ent.id);
  }
  safe(() => ent.remove());
}

world.afterEvents.playerBreakBlock.subscribe(({ player, block, brokenBlockPermutation, itemStackBeforeBreak }) => {
  const id = brokenBlockPermutation.type.id;
  if (!CHESTS[id]) return;
  const ent = chestEntityAt(block);
  if (ent) removeChestEntity(ent, block.dimension, block.center());
  const silk = !!itemStackBeforeBreak && safe(() => itemStackBeforeBreak.getComponent("minecraft:enchantable").hasEnchantment("silk_touch")) === true;
  if (!isCreative(player) && !silk) safe(() => block.dimension.spawnItem(new ItemStack(id, 1), block.center()));
});

world.beforeEvents.entityHurt.subscribe((e) => {
  if (e.hurtEntity && e.hurtEntity.typeId === CHEST_ENT) e.cancel = true;
});

const lidTimers = new Map();

function lidStep(ent, open) {
  const b = chestBlockOf(ent);
  if (!b || !CHESTS[b.typeId]) return;
  const key = ent.id;
  const prev = lidTimers.get(key);
  if (prev !== undefined) {
    system.clearRun(prev);
    lidTimers.delete(key);
  }
  const target = open ? 3 : 0;
  const h = system.runInterval(() => {
    const blk = chestBlockOf(ent);
    if (!blk || !CHESTS[blk.typeId]) {
      system.clearRun(h);
      lidTimers.delete(key);
      return;
    }
    const cur = blk.permutation.getState("vge:lid") ?? 0;
    if (cur === target) {
      system.clearRun(h);
      lidTimers.delete(key);
      return;
    }
    safe(() => blk.setPermutation(blk.permutation.withState("vge:lid", cur + (open ? 1 : -1))));
  }, 1);
  lidTimers.set(key, h);
}

function setLidPair(ent, open) {
  for (const e of [ent, partnerOf(ent)]) {
    if (!e) continue;
    safe(() => e.setProperty("vge:open", open));
    lidStep(e, open);
  }
}

world.afterEvents.entityContainerOpened.subscribe(({ entity }) => {
  if (!entity || entity.typeId !== CHEST_ENT) return;
  const n = (chestViewers.get(entity.id) ?? 0) + 1;
  chestViewers.set(entity.id, n);
  if (n === 1) {
    setLidPair(entity, true);
    safe(() => entity.dimension.playSound("random.chestopen", entity.location, { pitch: 1.2, volume: 0.6 }));
  }
});

world.afterEvents.entityContainerClosed.subscribe(({ entity }) => {
  if (!entity || entity.typeId !== CHEST_ENT) return;
  const partner = partnerOf(entity);
  if (partner) {
    const items = snapshot(entity);
    clearInv(partner);
    fill(partner, items);
  }
  const n = Math.max(0, (chestViewers.get(entity.id) ?? 1) - 1);
  if (n) {
    chestViewers.set(entity.id, n);
    return;
  }
  chestViewers.delete(entity.id);
  if (partner && chestViewers.get(partner.id)) return;
  setLidPair(entity, false);
  safe(() => entity.dimension.playSound("random.chestclosed", entity.location, { pitch: 1.2, volume: 0.6 }));
});

system.runInterval(() => {
  for (const dimId of DIMS) {
    const dim = safe(() => world.getDimension(dimId));
    if (!dim) continue;
    for (const ent of safe(() => dim.getEntities({ type: CHEST_ENT })) || []) {
      const block = chestBlockOf(ent);
      if (!block) continue;
      if (CHESTS[block.typeId]) {
        if (safe(() => ent.nameTag)) safe(() => { ent.nameTag = ""; });
        const want = chestSpotOf(block);
        if (Math.abs(ent.location.y - want.y) > 0.05) safe(() => ent.teleport(want));
        const half = safe(() => ent.getProperty("vge:half")) ?? 0;
        if (half && !partnerOf(ent)) unpair(ent, half);
        continue;
      }
      removeChestEntity(ent, dim, ent.location);
    }
  }
}, 40);
