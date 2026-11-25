// PORTED FROM v16.2 -> v27. FIX: "@minecraft/server" >= 2.0.0 has REMOVED runCommandAsync()
// entirely (only the synchronous runCommand() remains) - all runCommandAsync() were switched to runCommand() the same way
// as fixed in armorEffects.js/teleporting.js. The remaining logic is kept 100% the same as v16.2
// (including the area-mining part for infinity_hammer/infinity_destroyer and super plow for
// infinity_hoe, but those parts were dropped when v27 rewrote this file in a minimal direction).
import * as MC from "@minecraft/server";
import { addToMatterCluster, hasSpaceForItem } from "../mechanics/matterCluster.js";


const mediumSize = 5;

// FIX (on request): the world breaker must still "return items" to the player when clearing
// a whole chunk, it cannot make everything vanish as before. The key point to NOT
// lag again: the lag cost previously came from calling runCommand() (setblock) FOR
// EACH BLOCK - a heavy operation because it goes through the entire native/networking
// layer. Whereas reading block.typeId via getBlock() is a pure read, MUCH
// CHEAPER. So: scan block by block within 1 layer (JS for loop, only getBlock(),
// NO runCommand inside the loop) to accumulate into the matter cluster, then
// clear THAT WHOLE LAYER with ONLY 1 "/fill" command (instead of thousands of setblocks).
// This way full drops are still kept like the old "hammer", yet it is as fast as the
// previous "no drop" version, since the number of runCommand calls is unchanged (still 1 command/layer).
//
// EXTRA LAG FIX (on request, same technique as the Black Hole addon fad_black_hole -
// see crater.js/craterPass): the old version used MC.system.run() to recurse itself over each
// 16-block-thick LAYER (16x16x16 = 4096 getBlock() + 1 fill command) EVERY TICK - this
// FIXED schedule does not know whether the server is idle or busy, so a tall chunk (e.g. -64
// to 319 = 384 blocks = 24 layers) could still cause noticeable stutter every time it was hit
// while the server was busy (many entities/redstone...). Now switched to system.runJob()
// with a generator, the unit of work per yield shrinks to 1 ROW (16 blocks
// along Z, same x/y) instead of a whole 16x16x16 layer - runJob will AUTOMATICALLY spread
// more/fewer yields into 1 tick depending on the actual remaining load in that tick
// (exactly the same mechanism as craterPass in Black Hole), no more rigid schedule as before.
// goDown = true : clear FROM the block being hit (yMax) STRAIGHT DOWN to yMin (bedrock).
// goDown = false: clear FROM the block being hit (yMin) STRAIGHT UP to yMax (world ceiling).
// Always starts from the player's side and moves away, never clearing backwards from the far end toward the player.
function* clearChunkColumnJob(dimension, player, noGM1, chunkOriginX, chunkOriginZ, yMin, yMax, goDown) {
  const yStart = goDown ? yMax : yMin;
  const yStep = goDown ? -1 : 1;
  const yCount = yMax - yMin + 1;
  for (let i = 0; i < yCount; i++) {
    const y = yStart + i * yStep;
    for (let x = chunkOriginX; x <= chunkOriginX + 15; x++) {
      if (noGM1) {
        for (let z = chunkOriginZ; z <= chunkOriginZ + 15; z++) {
          let targetBlock;
          try {
            targetBlock = dimension.getBlock({ x, y, z });
          } catch (e) {
            continue; // chunk not loaded -> skip this cell, do not crash the whole job
          }
          if (!targetBlock || targetBlock.typeId === "minecraft:air") continue;
          const fortune = fortuneOres[targetBlock.typeId];
          const otherDrops = hammerBreacking[targetBlock.typeId];
          if (!hasSpaceForItem(player, fortune ? fortuCalc(fortune.quantity) : 1)) continue;
          if (fortune) addToMatterCluster(player, fortune.drop, fortuCalc(fortune.quantity));
          else if (otherDrops) { if (Math.random() < otherDrops.chance) addToMatterCluster(player, otherDrops.drop, 1); }
          else addToMatterCluster(player, targetBlock.typeId, 1);
        }
      }

      // Clears exactly 1 ROW (16 blocks along Z) with 1 small fill command - much cheaper
      // than filling a whole 16x16x16 layer, and yields the tick RIGHT after each row instead of after
      // the whole layer.
      try {
        dimension.runCommand(
          `fill ${x} ${y} ${chunkOriginZ} ${x} ${y} ${chunkOriginZ + 15} air replace`
        );
      } catch (e) {
        // chunk not loaded or other error -> skip this row, do not crash the job
      }

      yield; // <-- yield RIGHT after each row - Bedrock adapts to the load itself,
             // just like craterPass in Black Hole.
    }
  }
}

function fortuCalc(quantity) {
  return Math.floor((Math.random() * (quantity - 3) + 5) * (Math.random() * 4)) + 1;
}

const hammerBreacking = {
  "minecraft:stone": { "drop": "minecraft:cobblestone", "chance": 1.0 },
  "minecraft:deepslate": { "drop": "minecraft:cobbled_deepslate", "chance": 1.0 },
  "minecraft:grass_block": { "drop": "minecraft:dirt", "chance": 1.0 },
  "minecraft:grass_path": { "drop": "minecraft:dirt", "chance": 1.0 },
  "minecraft:mycelium": { "drop": "minecraft:dirt", "chance": 1.0 },
  "minecraft:seagrass": { "drop": "minecraft:air", "chance": 0 },
  "minecraft:snow_layer": { "drop": "minecraft:snowball", "chance": 1.0 },
  "minecraft:chorus_plant": { "drop": "minecraft:chorus_fruit", "chance": 1.0 },
  "minecraft:campfire": { "drop": "minecraft:charcoal", "chance": 1.0 },
  "minecraft:soul_campfire": { "drop": "minecraft:charcoal", "chance": 1.0 },
  "minecraft:tall_grass": { "drop": "minecraft:wheat_seeds", "chance": 0.125 },
  "minecraft:short_grass": { "drop": "minecraft:wheat_seeds", "chance": 0.125 },
  "minecraft:fern": { "drop": "minecraft:wheat_seeds", "chance": 0.125 },
  "minecraft:podzol": { "drop": "minecraft:dirt", "chance": 1.0 },
  "minecraft:vine": { "drop": "minecraft:air", "chance": 0 },
  "minecraft:melon": { "drop": "minecraft:melon_slice", "chance": 1.0 },
  "minecraft:sweet_berry_bush": { "drop": "minecraft:sweet_berries", "chance": 1.0 },
  "minecraft:lit_furnace": { "drop": "minecraft:furnace", "chance": 1.0 },
  "minecraft:lit_smoker": { "drop": "minecraft:smoker", "chance": 1.0 },
  "minecraft:lit_blast_furnace": { "drop": "minecraft:blast_furnace", "chance": 1.0 },
  "minecraft:web": { "drop": "minecraft:string", "chance": 1.0 },
  "minecraft:warped_nylium": { "drop": "minecraft:netherrack", "chance": 1.0 },
  "minecraft:crimson_nylium": { "drop": "minecraft:netherrack", "chance": 1.0 }
};

const containers = [
  "minecraft:chest",
  "minecraft:trapped_chest",
  "minecraft:barrel",
  "minecraft:frame",
  "minecraft:glow_frame",
  "minecraft:shulker_box",
  "minecraft:white_shulker_box",
  "minecraft:orange_shulker_box",
  "minecraft:magenta_shulker_box",
  "minecraft:light_blue_shulker_box",
  "minecraft:yellow_shulker_box",
  "minecraft:lime_shulker_box",
  "minecraft:pink_shulker_box",
  "minecraft:gray_shulker_box",
  "minecraft:light_gray_shulker_box",
  "minecraft:cyan_shulker_box",
  "minecraft:purple_shulker_box",
  "minecraft:blue_shulker_box",
  "minecraft:brown_shulker_box",
  "minecraft:green_shulker_box",
  "minecraft:red_shulker_box",
  "minecraft:black_shulker_box"
];

const blockDrops = {
  "minecraft:bedrock": { "block": "bedrock" },
  "minecraft:structure_block": { "block": "structure_block" },
  "minecraft:barrier": { "block": "barrier" },
  "minecraft:command_block": { "block": "command_block" },
  "minecraft:chain_command_block": { "block": "chain_command_block" },
  "minecraft:repeating_command_block": { "block": "repeating_command_block" },
  "minecraft:end_portal": { "block": "end_portal" },
  "minecraft:end_portal_frame": { "block": "end_portal_frame" },
  "minecraft:end_gateway": { "block": "end_gateway" }
};

const fortuneOres = {
  "minecraft:deepslate_coal_ore": { "drop": "minecraft:coal", "quantity": 1, "xp_reward": 2 },
  "minecraft:deepslate_diamond_ore": { "drop": "minecraft:diamond", "quantity": 1, "xp_reward": 7 },
  "minecraft:deepslate_emerald_ore": { "drop": "minecraft:emerald", "quantity": 1, "xp_reward": 7 },
  "minecraft:deepslate_gold_ore": { "drop": "minecraft:gold_ingot", "quantity": 1, "xp_reward": 2 },
  "minecraft:deepslate_iron_ore": { "drop": "minecraft:iron_ingot", "quantity": 1, "xp_reward": 2 },
  "minecraft:deepslate_copper_ore": { "drop": "minecraft:copper_ingot", "quantity": 2, "xp_reward": 2 },
  "minecraft:deepslate_lapis_ore": { "drop": "minecraft:lapis_lazuli", "quantity": 4, "xp_reward": 6 },
  "minecraft:deepslate_redstone_ore": { "drop": "minecraft:redstone", "quantity": 4, "xp_reward": 4 },
  "minecraft:coal_ore": { "drop": "minecraft:coal", "quantity": 1, "xp_reward": 2 },
  "minecraft:diamond_ore": { "drop": "minecraft:diamond", "quantity": 1, "xp_reward": 7 },
  "minecraft:emerald_ore": { "drop": "minecraft:emerald", "quantity": 1, "xp_reward": 7 },
  "minecraft:gold_ore": { "drop": "minecraft:gold_ingot", "quantity": 1, "xp_reward": 2 },
  "minecraft:iron_ore": { "drop": "minecraft:iron_ingot", "quantity": 1, "xp_reward": 2 },
  "minecraft:copper_ore": { "drop": "minecraft:copper_ingot", "quantity": 2, "xp_reward": 2 },
  "minecraft:lapis_ore": { "drop": "minecraft:lapis_lazuli", "quantity": 4, "xp_reward": 6 },
  "minecraft:redstone_ore": { "drop": "minecraft:redstone", "quantity": 4, "xp_reward": 4 },
  "minecraft:lit_deepslate_redstone_ore": { "drop": "minecraft:redstone", "quantity": 4, "xp_reward": 4 },
  "minecraft:lit_redstone_ore": { "drop": "minecraft:redstone", "quantity": 4, "xp_reward": 4 },
  "minecraft:nether_gold_ore": { "drop": "minecraft:gold_nugget", "quantity": 4, "xp_reward": 0 },
  "minecraft:quartz_ore": { "drop": "minecraft:quartz", "quantity": 4, "xp_reward": 8 },
  "minecraft:amethyst_cluster": { "drop": "minecraft:amethyst_shard", "quantity": 4, "xp_reward": 0 },
  "minecraft:ancient_debris": { "drop": "minecraft:netherite_scrap", "quantity": 4, "xp_reward": 0 },

  "213:titanium_ore": { "drop": "213:titanium_nugget", "quantity": 1, "xp_reward": 2 },
  "213:uranium_ore": { "drop": "213:uranium_nugget", "quantity": 1, "xp_reward": 2 },
  "213:deepslate_titanium_ore": { "drop": "213:titanium_nugget", "quantity": 1, "xp_reward": 2 },
  "213:deepslate_uranium_ore": { "drop": "213:uranium_nugget", "quantity": 1, "xp_reward": 2 },
  "spec:spectrite_ore": { "drop": "spec:spectrite_gem", "quantity": 1, "xp_reward": 9 },
  "spec:deepslate_spectrite_ore": { "drop": "spec:spectrite_gem", "quantity": 1, "xp_reward": 9 },
  "spec:nether_spectrite_ore": { "drop": "spec:spectrite_gem", "quantity": 1, "xp_reward": 9 },
  "spec:end_spectrite_ore": { "drop": "spec:spectrite_gem", "quantity": 1, "xp_reward": 9 }
};

const shovelBlocks = [
  "minecraft:black_concrete_powder",
  "minecraft:blue_concrete_powder",
  "minecraft:brown_concrete_powder",
  "minecraft:clay",
  "minecraft:coarse_dirt",
  "minecraft:cyan_concrete_powder",
  "minecraft:dirt",
  "minecraft:dirt_with_roots",
  "minecraft:farmland",
  "minecraft:grass_block",
  "minecraft:grass_path",
  "minecraft:gravel",
  "minecraft:gray_concrete_powder",
  "minecraft:green_concrete_powder",
  "minecraft:light_blue_concrete_powder",
  "minecraft:light_gray_concrete_powder",
  "minecraft:lime_concrete_powder",
  "minecraft:magenta_concrete_powder",
  "minecraft:mud",
  "minecraft:muddy_mangrove_roots",
  "minecraft:mycelium",
  "minecraft:orange_concrete_powder",
  "minecraft:pink_concrete_powder",
  "minecraft:podzol",
  "minecraft:purple_concrete_powder",
  "minecraft:red_concrete_powder",
  "minecraft:red_sand",
  "minecraft:sand",
  "minecraft:snow",
  "minecraft:snow_layer",
  "minecraft:soul_sand",
  "minecraft:soul_soil",
  "minecraft:white_concrete_powder",
  "minecraft:yellow_concrete_powder"
];

const destroyedStones = [
  "minecraft:stone",
  "minecraft:andesite",
  "minecraft:diorite",
  "minecraft:granite",
  "minecraft:deepslate",
  "minecraft:tuff",
  "minecraft:netherrack"
];

const plowingBlocks = [
  "minecraft:dirt",
  "minecraft:grass_block",
  "minecraft:grass_path",
  "minecraft:mycelium",
  "minecraft:podzol"
];

// FIX: plants/flowers/saplings usually sit ON TOP of dirt/grass_block. The "setblock" command
// used to till soil ONLY replaces the block below, it does NOT touch the block above
// it at all - unlike when a player tills a cell by hand with a hoe (vanilla automatically breaks the plant on
// top too). So cells tilled by script (around the center cell) kept
// the grass/flowers standing on them, leaving the player unable to plant anything on the new farmland.
// Fix: before tilling a cell, check the block directly above and break it if it is in the
// plant list below.
const plowClearAbove = [
  "minecraft:short_grass",
  "minecraft:tall_grass",
  "minecraft:tallgrass",
  "minecraft:fern",
  "minecraft:large_fern",
  "minecraft:double_plant",
  "minecraft:dead_bush",
  "minecraft:sunflower",
  "minecraft:lilac",
  "minecraft:rose_bush",
  "minecraft:peony",
  "minecraft:dandelion",
  "minecraft:poppy",
  "minecraft:allium",
  "minecraft:azure_bluet",
  "minecraft:blue_orchid",
  "minecraft:cornflower",
  "minecraft:lily_of_the_valley",
  "minecraft:oxeye_daisy",
  "minecraft:orange_tulip",
  "minecraft:pink_tulip",
  "minecraft:red_tulip",
  "minecraft:white_tulip",
  "minecraft:wither_rose",
  "minecraft:torchflower",
  "minecraft:red_flower",
  "minecraft:yellow_flower",
  "minecraft:sapling",
  "minecraft:brown_mushroom",
  "minecraft:red_mushroom",
  "minecraft:sweet_berry_bush",
  "minecraft:vine",
  "minecraft:seagrass"
];

// FIX v3: on request - when the hoe breaks plants/flowers above, the dropped items must be COLLECTED
// DIRECTLY into the player's matter cluster (like the hammer mechanism using
// addToMatterCluster above), not scattered on the ground like the previous setblock..destroy.
// - For blocks already in "hammerBreacking" (tall_grass/short_grass/fern...)
//   reuse exactly that drop logic/rates (e.g. wheat_seeds 12.5%) to stay IN SYNC with the hammer.
// - The remaining kinds (flowers, mushrooms, saplings...) have item ids equal to
//   their block ids in Bedrock, so calling addToMatterCluster with that same typeId is enough.
function collectFloraAbove(player, typeId) {
  if (!hasSpaceForItem(player, 1)) return; // if there is no room, skip it, do not block planting
  const known = hammerBreacking[typeId];
  if (known) {
    if (known.chance > 0 && Math.random() < known.chance && known.drop !== "minecraft:air") {
      addToMatterCluster(player, known.drop, 1);
    }
    return;
  }
  addToMatterCluster(player, typeId, 1);
}

// FIX: merge the single-cell tilling logic into 1 shared function - used for both the center cell (already
// tilled by vanilla, only missing moisture) and the surrounding cells tilled by the script, so
// there is no code duplication and BOTH cases get moisture=7 + clearing the plant
// above identically.
function plowTile(dimension, player, x, y, z) {
  const above = dimension.getBlock({ x, y: y + 1, z });
  if (above && plowClearAbove.includes(above.typeId)) {
    // FIX v3: use "air" instead of "air destroy" - because the item was already collected manually through
    // collectFloraAbove/matter cluster, using "destroy" would make vanilla SPAWN AN EXTRA
    // item on the ground -> duplicating items.
    collectFloraAbove(player, above.typeId);
    player.runCommand(`setblock ${x} ${y + 1} ${z} air`);
  }
  player.runCommand(`setblock ${x} ${y} ${z} farmland ["moisturized_amount"=7]`);
  player.runCommand(`playsound step.gravel @a ${x} ${y} ${z}`);
}

MC.world.afterEvents.entityHitBlock.subscribe((eventData) => {
  const hitBlock = eventData.hitBlock;
  const player = eventData.damagingEntity;
  const overworld = player.dimension.id == "minecraft:overworld";
  const nether = player.dimension.id == "minecraft:nether";
  const equipment = player.getComponent("equippable");
  if (!equipment) return;
  const item = equipment.getEquipment("Mainhand");
  if (!item || !hitBlock) return;

  if (!item.typeId.includes("avaritia:infinity")) return;
  const noGM1 = player.getGameMode() != "creative";
  const blockFace = player.getBlockFromViewDirection()?.face;

  const getDirection = {
    yStart: blockFace == 'Down' ? 0 : blockFace == 'Up' ? -(mediumSize * 2) : -1,
    yEnd: blockFace == 'Down' ? mediumSize * 2 : blockFace == 'Up' ? 0 : (mediumSize * 2) - 1,

    zStart: blockFace == 'North' ? 0 : blockFace == 'South' ? -(mediumSize * 2) : -mediumSize,
    zEnd: blockFace == 'North' ? mediumSize * 2 : blockFace == 'South' ? 0 : mediumSize,

    xStart: blockFace == 'West' ? 0 : blockFace == 'East' ? -(mediumSize * 2) : -mediumSize,
    xEnd: blockFace == 'West' ? mediumSize * 2 : blockFace == 'East' ? 0 : mediumSize
  };

  const { xStart, xEnd, yStart, yEnd, zStart, zEnd } = getDirection;
  const layer = {
    yDown: overworld ? -64 : 0,
    yUp: overworld ? 320 : nether ? 128 : 256
  };

  if (item.typeId.endsWith("pickaxe") && !hitBlock.typeId.includes("neutron_collector")) {
    const blockType = blockDrops[hitBlock.typeId];
    if (blockType) player.runCommand(`loot spawn ${hitBlock.location.x} ${hitBlock.location.y} ${hitBlock.location.z} loot "drops/${blockType.block}"`);
    if (!fortuneOres[hitBlock.typeId] || !containers[hitBlock.typeId]) player.runCommand(`setblock ${hitBlock.location.x} ${hitBlock.location.y} ${hitBlock.location.z} air destroy`);
  }
  
  if (item.typeId.endsWith("hammer")) {
    const chunkOriginX = Math.floor(hitBlock.location.x / 16) * 16;
    const chunkOriginZ = Math.floor(hitBlock.location.z / 16) * 16;
    const worldYMin = overworld ? -64 : 0;
    const worldYMax = overworld ? 319 : nether ? 127 : 255;
    // FIX (on request): previously every hit cleared the WHOLE COLUMN from bottom to
    // top, regardless of the digging direction - very annoying because digging down also removed everything
    // above the head. Now uses "blockFace" (the block face being looked at/hit,
    // already computed above) to determine the digging direction, like the intent of the old
    // getDirection/mediumSize:
    // - blockFace 'Up'   => standing ABOVE looking DOWN at the top face of the block
    //   (digging down) => only clears from the hit point DOWN to the world bottom.
    // - blockFace 'Down' => standing BELOW looking UP at the bottom face of the block
    //   (digging up) => only clears from the hit point UP to the build limit.
    // - Side faces (North/South/East/West, digging horizontally) => default to clearing DOWNWARD
    //   from the hit point (tunnel/quarry style going down), same as the "down" direction
    //   above. If another direction is needed for horizontal digging, adjust here.
    // Dig direction: block face 'Up' (standing above looking down) => down; face 'Down' (standing
    // below looking up) => up; side face (horizontal digging) => follow the player's look direction
    // (looking up = up, otherwise = down).
    let diggingUp;
    if (blockFace == 'Up') diggingUp = false;
    else if (blockFace == 'Down') diggingUp = true;
    else diggingUp = (player.getViewDirection()?.y ?? 0) > 0;
    const yMin = diggingUp ? hitBlock.location.y : worldYMin;
    const yMax = diggingUp ? worldYMax : hitBlock.location.y;
    player.runCommand(`playsound dig.stone @a ${hitBlock.location.x} ${hitBlock.location.y} ${hitBlock.location.z}`);
    player.runCommand(`playsound land.stone @a ${hitBlock.location.x} ${hitBlock.location.y} ${hitBlock.location.z}`);
    // runJob (not recursive system.run) - so Bedrock spreads the work according to the
    // actual load, exactly like crater.js in Black Hole runs craterPass().
    MC.system.runJob(clearChunkColumnJob(hitBlock.dimension, player, noGM1, chunkOriginX, chunkOriginZ, yMin, yMax, !diggingUp));
  };
  if (item.typeId.endsWith("destroyer")) {
    player.runCommand(`playsound step.gravel @a ${hitBlock.location.x} ${hitBlock.location.y} ${hitBlock.location.z}`);
    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        for (let z = zStart; z <= zEnd; z++) {
          const offsetX = hitBlock.location.x + x;
          const offsetY = hitBlock.location.y + y;
          const offsetZ = hitBlock.location.z + z;
          if (layer.yDown > offsetY) continue;
          if (layer.yUp < offsetY) continue;
          const targetBlock = hitBlock.dimension.getBlock({ x: offsetX, y: offsetY, z: offsetZ });
          if (!targetBlock) continue;
          // FIX lag: the destroyer now ONLY clears the dirt layer (shovelBlocks) - does NOT touch
          // destroyedStones (stone/andesite/deepslate...) anymore, reducing the number of
          // setblocks per hit to cut lag, like the Java version which only processes the dirt layer.
          const grassId = shovelBlocks.includes(targetBlock.typeId);
          if (!grassId) continue;
          if (!hasSpaceForItem(player, 1)) return player.sendMessage("§cNot enough inventory space");
          if (noGM1) addToMatterCluster(player, targetBlock.typeId, 1);
          MC.system.run(() => player.runCommand(`setblock ${offsetX} ${offsetY} ${offsetZ} air`));
        }
      }
    }
  }
});

MC.world.beforeEvents.playerBreakBlock.subscribe((eventData) => {
  const block = eventData.block;
  const player = eventData.player;
  const equipment = player.getComponent("equippable");
  if (!equipment) return;
  const item = equipment.getEquipment("Mainhand");
  if (!item || !block) return;

  if (player.getGameMode() == "creative") return;
  if (item.typeId == "avaritia:infinity_hammer") return eventData.cancel = true;
  if (item.typeId == "avaritia:infinity_destroyer") return eventData.cancel = true;

  if (item.typeId == "avaritia:infinity_pickaxe") {
    const fortune = fortuneOres[block.typeId];
    if (fortune) {
      MC.system.run(() => {
        block.dimension.spawnItem(new MC.ItemStack(fortune.drop, fortuCalc(fortune.quantity)), block.location);
        // @minecraft/server 2.11: ONE orb worth xp_reward*2 XP (was 2 commands per XP point).
        if (fortune.xp_reward > 0) {
          try {
            block.dimension.spawnXp(
              { x: block.location.x + 0.5, y: block.location.y + 0.5, z: block.location.z + 0.5 },
              Math.min(12000, Math.max(1, Math.floor(fortune.xp_reward * 2)))
            );
          } catch (e) { /* chunk unloaded: skip the XP */ }
        }
      });
      eventData.cancel = true;
      player.runCommand(`setblock ${block.location.x} ${block.location.y} ${block.location.z} air`);
      player.runCommand(`playsound dig.stone @a ${block.location.x} ${block.location.y} ${block.location.z}`);
      player.runCommand(`playsound land.stone @a ${block.location.x} ${block.location.y} ${block.location.z}`);
    }
  }
});

// FIX v2: "afterEvents.itemUseOn" also does not exist - both beforeEvents.itemUseOn AND
// afterEvents.itemUseOn were COMPLETELY REMOVED from the stable @minecraft/server since
// version 2.0.0 (see the official changelog: "Removed property itemUseOn" on both
// WorldBeforeEvents and WorldAfterEvents). This pack's manifest requires 2.6.0, so
// "MC.world.afterEvents.itemUseOn" returns undefined -> ".subscribe" crashes as soon as the
// file is imported, bringing down the whole script pack. The official replacement event, STABLE in the
// current API, is "afterEvents.playerInteractWithBlock", which has the full "block"/"player"/
// "itemStack" needed for the wide-area tilling logic below.
MC.world.afterEvents.playerInteractWithBlock.subscribe((eventData) => {
  const block = eventData.block;
  const player = eventData.player;
  const item = eventData.itemStack;

  if (!item || !block) return;

  // FIX: items with the tag "minecraft:is_hoe" make vanilla AUTOMATICALLY till the dirt/grass under
  // the pointer into farmland RIGHT during interaction handling - before this afterEvent
  // can run. So the "block.typeId" read here is already "minecraft:farmland"
  // and NO LONGER dirt/grass_block, so the old condition "plowingBlocks.includes
  // (block.typeId)" always failed and the whole wide-area tilling loop never ran
  // (this is why the hoe could not use its skill while other tools could
  // because hammer/destroyer/pickaxe use entityHitBlock/playerBreakBlock - events that
  // are not modified by vanilla before the script reads typeId).
  // Fix: use the very sign "vanilla just tilled" (block became farmland) as
  // the trigger condition, instead of checking the before-tilling state which no longer exists.
  if (item.typeId == "avaritia:infinity_hoe" && block.typeId == "minecraft:farmland") {
    const isSneak = player.isSneaking ? 7 : 2;

    // FIX: the center cell (the block the player clicked) was already tilled by vanilla into
    // DRY farmland (moisturized_amount = 0) before this event ran - and since it
    // is now "farmland" it is NO LONGER in plowingBlocks, so the loop below
    // skips it automatically. That is why 1 center cell was dry while the surrounding ones
    // were wet. Fix: proactively call plowTile for the center cell first, independent
    // of the loop - this function also conveniently clears plants/flowers standing
    // on the center cell if any.
    MC.system.run(() => plowTile(block.dimension, player, block.location.x, block.location.y, block.location.z));

    for (let x = -isSneak; x <= isSneak; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -isSneak; z <= isSneak; z++) {
          if (x == 0 && y == 0 && z == 0) continue; // already handled separately above
          const offsetX = block.location.x + x;
          const offsetY = block.location.y + y;
          const offsetZ = block.location.z + z;
          const targetBlock = block.dimension.getBlock({ x: offsetX, y: offsetY, z: offsetZ });

          // FIX: add a null-check for targetBlock (like the pattern in hammer/destroyer
          // above) - getBlock() can return undefined at the edge of unloaded chunks,
          // previously the missing check would crash and cut off the whole loop.
          if (targetBlock && plowingBlocks.includes(targetBlock.typeId)) {
            MC.system.run(() => plowTile(block.dimension, player, offsetX, offsetY, offsetZ));
          }
        }
      }
    }
  }
});