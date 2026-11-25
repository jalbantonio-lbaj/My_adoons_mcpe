import { world, system, ItemStack, EquipmentSlot, EnchantmentTypes, GameMode } from '@minecraft/server'
import { UNDESTRUCTABLE_BLOCKS } from './constants';

function countClusterTotal(contentsMap) {
    let total = 0;
    for (const count of Object.values(contentsMap)) { total += count; }
    return total;
}

function spawnDistributedClusters(dimension, location, inventoryCluster, isCreative) {
    if (isCreative) return;
    const capacity = 4096;
    const itemEntries = Object.entries(inventoryCluster);
    
    let currentTotal = 0;
    let currentClusterMap = {};

    for (const [blockId, totalAmount] of itemEntries) {
        let remaining = totalAmount;

        while (remaining > 0) {
            let spaceLeft = capacity - currentTotal;
            let countToMove = Math.min(spaceLeft, remaining);

            currentClusterMap[blockId] = (currentClusterMap[blockId] || 0) + countToMove;
            currentTotal += countToMove;
            remaining -= countToMove;

            if (currentTotal === capacity) {
                const clusterDataString = JSON.stringify(currentClusterMap);
                const criticalCluster = new ItemStack("avaritia:critical_matter_cluster", 1);
                criticalCluster.nameTag = `§4Critical Matter Cluster§r\n4096/4096 items\n\n§7Use to deconstruct.§r`; 
                criticalCluster.setDynamicProperty("cluster_contents", clusterDataString);
                dimension.spawnItem(criticalCluster, { x: location.x, y: location.y + 0.5, z: location.z });

                currentTotal = 0;
                currentClusterMap = {};
            }
        }
    }

    if (currentTotal > 0) {
        const clusterDataString = JSON.stringify(currentClusterMap);
        const clusterItem = new ItemStack("avaritia:matter_cluster", 1);
        clusterItem.nameTag = `§4Matter Cluster§r\n${currentTotal}/4096 items\n\n§7Use to deconstruct.§r`;
        clusterItem.setDynamicProperty("cluster_contents", clusterDataString);
        dimension.spawnItem(clusterItem, { x: location.x, y: location.y + 0.5, z: location.z });
    }
}


system.runInterval(() => {
    const players = world.getAllPlayers();
    const capacity = 4096;

    for (const player of players) {
        const inventoryComp = player.getComponent("minecraft:inventory");
        if (!inventoryComp || !inventoryComp.container) continue;

        const container = inventoryComp.container;
        const containerSize = container.size;
        let clusterSlots = [];

        for (let i = 0; i < containerSize; i++) {
            const item = container.getItem(i);
            if (!item) continue;

            const isNormal = item.typeId === "avaritia:matter_cluster";
            const isCritical = item.typeId === "avaritia:critical_matter_cluster";

            if (isNormal || isCritical) {
                const rawData = item.getDynamicProperty("cluster_contents");
                let data = rawData ? JSON.parse(rawData) : {};
                let totalItems = countClusterTotal(data);

                if (totalItems > 0 && totalItems < capacity) {
                    clusterSlots.push({ slot: i, item: item, data: data, total: totalItems });
                }
            }
        }

        if (clusterSlots.length < 2) continue;
        let inventoryChanged = false;

        for (let i = 1; i < clusterSlots.length; i++) {
            let recipient = clusterSlots[0];
            let donor = clusterSlots[i];

            if (recipient.total >= capacity || donor.total <= 0) continue;
            const donorEntries = Object.entries(donor.data);

            for (const [blockId, wrapcount] of donorEntries) {
                if (recipient.total >= capacity || donor.total <= 0) break;
                let countToMove = Math.min(capacity - recipient.total, wrapcount);

                recipient.data[blockId] = (recipient.data[blockId] || 0) + countToMove;
                recipient.total += countToMove;
                donor.total -= countToMove;

                if (wrapcount - countToMove > 0) {
                    donor.data[blockId] = wrapcount - countToMove;
                } else {
                    delete donor.data[blockId];
                }
                inventoryChanged = true;
            }

            if (donor.total <= 0) {
                container.setItem(donor.slot, undefined);
            } else {
                const updatedDonorStr = JSON.stringify(donor.data);
                donor.item.setDynamicProperty("cluster_contents", updatedDonorStr);
                donor.item.nameTag = `§4Matter Cluster§r\n${donor.total}/4096 items\n\n§7Use to deconstruct.§r`;
                container.setItem(donor.slot, donor.item);
            }
        }

        if (inventoryChanged) {
            let recipient = clusterSlots[0];
            const updatedRecipStr = JSON.stringify(recipient.data);

            if (recipient.total >= capacity) {
                const finalCritical = new ItemStack("avaritia:critical_matter_cluster", 1);
                finalCritical.nameTag = `§4Critical Matter Cluster§r\n${recipient.total}/4096 items\n\n§7Use to deconstruct.§r`;
                finalCritical.setDynamicProperty("cluster_contents", updatedRecipStr);
                container.setItem(recipient.slot, finalCritical);
            } else {
                recipient.item.setDynamicProperty("cluster_contents", updatedRecipStr);
                recipient.item.nameTag = `§4Matter Cluster§r\n${recipient.total}/4096 items\n\n§7Use to deconstruct.§r`;
                container.setItem(recipient.slot, recipient.item);
            }
        }
    }
}, 10);

const processedClustersThisTick = new Set();

function handleClusterDeconstruction(player, event, eventId) {
    if (!player) return;

    const equipment = player.getComponent("minecraft:equippable");
    if (!equipment) return;

    const mainHandItem = equipment.getEquipment(EquipmentSlot.Mainhand);
    if (!mainHandItem) return;

    const isNormalCluster = mainHandItem.typeId === "avaritia:matter_cluster";
    const isCriticalCluster = mainHandItem.typeId === "avaritia:critical_matter_cluster";

    if (isNormalCluster || isCriticalCluster) {
        if (processedClustersThisTick.has(player.id)) {
            event.cancel = true;
            return;
        }
        
        const savedData = mainHandItem.getDynamicProperty("cluster_contents");
        if (!savedData) return;

        event.cancel = true;
        processedClustersThisTick.add(player.id);

        system.run(() => {
            const dimension = player.dimension;
            const blocksToDrop = JSON.parse(savedData);
            const playerLoc = player.location;
            const dropLoc = { x: playerLoc.x, y: playerLoc.y + 0.2, z: playerLoc.z };

            for (const [blockId, amount] of Object.entries(blocksToDrop)) {
                let remaining = amount;
                while (remaining > 0) {
                    const countToDrop = Math.min(remaining, 64);
                    try {
                        const itemStack = new ItemStack(blockId, countToDrop);
                        dimension.spawnItem(itemStack, dropLoc);
                    } catch (e) {
                        dimension.runCommand(`give @p[name="${player.name}"] ${blockId} ${countToDrop}`);
                    }
                    remaining -= countToDrop;
                }
            }
            equipment.setEquipment(EquipmentSlot.Mainhand, undefined);
            
            system.runTimeout(() => {
                processedClustersThisTick.delete(player.id);
            }, 1);
        });
    }
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    handleClusterDeconstruction(event.player, event, "interact");
});

world.beforeEvents.itemUse.subscribe((event) => {
    handleClusterDeconstruction(event.source, event, "use");
});

function handleTransformation(player, event) {
    if (!player || !player.isSneaking) return;

    const equipment = player.getComponent("minecraft:equippable");
    if (!equipment) return;

    const mainHandItem = equipment.getEquipment(EquipmentSlot.Mainhand);
    if (!mainHandItem) return;

    let targetItemId = null;

    if (mainHandItem.typeId === "avaritia:world_breaker") {
        targetItemId = "avaritia:world_breaker_hammer";
    } else if (mainHandItem.typeId === "avaritia:world_breaker_hammer") {
        targetItemId = "avaritia:world_breaker";
    } else if (mainHandItem.typeId === "avaritia:planet_eater") {
        targetItemId = "avaritia:planet_destroyer"
    } else if (mainHandItem.typeId === "avaritia:planet_destroyer") {
        targetItemId = "avaritia:planet_eater"
    }

    if (targetItemId) {
        event.cancel = true;
        system.run(() => {
            const newItem = new ItemStack(targetItemId, mainHandItem.amount);
            equipment.setEquipment(EquipmentSlot.Mainhand, newItem);
        });
    }
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    handleTransformation(event.player, event);
});

world.beforeEvents.itemUse.subscribe((event) => {
    handleTransformation(event.source, event);
});

function isBreakableByTool(block, tool) {
    if (!block) return false;
    const id = block.typeId;
    if (id.includes("air") || id.includes("water") || id.includes("lava") || id.includes("portal")) {
        return false;
    }
    
    const validTags = [
        "minecraft:is_pickaxe_item_destructible",
        "minecraft:is_shovel_item_destructible"
    ];
    const hasMatchingTag = validTags.some(tag => block.hasTag(tag));
    const isUndestructable = UNDESTRUCTABLE_BLOCKS.some(pattern => {
        if (pattern instanceof RegExp) {
            return pattern.test(block.typeId);
        }
        return pattern === block.typeId;
    });
    if (tool === "avaritia:planet_destroyer" && (id.includes("_ore")|| isUndestructable || block.hasTag("minecraft:is_ore") || block.hasTag("ore"))) return false;
    if (hasMatchingTag || isUndestructable) return true;
}

function rollFortune10(baseAmount) {
    const fortuneRoll = Math.floor(Math.random() * 11); 
    let finalAmount = 1;
    for (let i = 0; i < baseAmount; i++){
        finalAmount += baseAmount * (1 + fortuneRoll);
    }
    return finalAmount;
}

function executeBlast(player, hitBlockLoc, tool) {
    system.run(() => {
        const dimension = player.dimension;
        const viewDirection = player.getViewDirection();
        const isCreative = player.getGameMode() === "Creative";


        let centerX = Math.floor(hitBlockLoc.x);
        let centerY = Math.floor(hitBlockLoc.y);
        let centerZ = Math.floor(hitBlockLoc.z);

        if (Math.abs(viewDirection.y) < 0.5) {
            centerY += 7;
        }

        let inventoryCluster = {};
        let totalBlocksMined = 0;
        const lootManager = world.getLootTableManager();
        let baseTool = new ItemStack("avaritia:world_breaker", 1);

        for (let x = -8; x <= 7; x++) {
            for (let y = -8; y <= 7; y++) {
                for (let z = -8; z <= 7; z++) {
                    const targetLoc = { x: centerX + x, y: centerY + y, z: centerZ + z };
                    if (targetLoc.y < -64 || targetLoc.y > 320) continue;

                    try {
                        const currentBlock = dimension.getBlock(targetLoc);
                        if (!currentBlock || currentBlock.isAir) continue;

                        if (isBreakableByTool(currentBlock, tool)) {
                            const blockPerm = currentBlock.permutation; 
                            const blockId = currentBlock.typeId;
                            
                            const isAnOreBlock = 
                                blockId.includes("_ore") || 
                                currentBlock.hasTag("minecraft:is_ore") ||
                                currentBlock.hasTag("ore"); 

                            const lootBase = lootManager.generateLootFromBlockPermutation(blockPerm, baseTool);

                            if (lootBase && lootBase.length > 0) {
                                for (let index = 0; index < lootBase.length; index++) {
                                    const itemStack = lootBase[index];
                                    const itemId = itemStack.typeId;
                                    let baseAmount = itemStack.amount;
                                    let finalAmount = 0;

                                    if (isAnOreBlock && blockId && itemId !== blockId) {
                                        finalAmount = rollFortune10(baseAmount);
                                    } else {
                                        finalAmount = baseAmount;
                                    }

                                    inventoryCluster[itemId] = (inventoryCluster[itemId] || 0) + finalAmount;
                                    totalBlocksMined += finalAmount;
                                }
                            } else {
                                inventoryCluster[blockId] = (inventoryCluster[blockId] || 0) + 1;
                                totalBlocksMined += 1;
                            }

                            currentBlock.setType("minecraft:air");
                        }
                    } catch (blockError) {
                        continue;
                    }
                }
            }
        }

        if (totalBlocksMined > 0) {
          spawnDistributedClusters(dimension, hitBlockLoc, inventoryCluster, isCreative);
        }
    });
}


world.afterEvents.playerStartBreakingBlock.subscribe((event) => {
    const player = event.player;
    const block = event.block;

    if (!player || player.typeId !== "minecraft:player") return;

    const equipment = player.getComponent("minecraft:equippable");
    const mainHandItem = equipment?.getEquipment(EquipmentSlot.Mainhand);

    if (mainHandItem && mainHandItem.typeId === "avaritia:world_breaker") {
        const isMatch = UNDESTRUCTABLE_BLOCKS.some(pattern => {
            if (pattern instanceof RegExp) {
                return pattern.test(block.typeId);
            }
            return pattern === block.typeId;
        });

        if (isMatch) {
            system.run(() => {
                const dimension = player.dimension;
                const blockId = block.typeId;
                dimension.runCommand(`setblock ${block.x} ${block.y} ${block.z} air destroy`);
                try {
                    const itemStack = new ItemStack(blockId, 1);
                    dimension.spawnItem(itemStack, { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 });
                } catch (error) {
                    dimension.runCommand(`give @p[name="${player.name}"] ${blockId}`);
                }
            });
        }
    }
});

world.beforeEvents.playerBreakBlock.subscribe((event) => {
    const player = event.player;
    const brokenBlock = event.block;
    const equipment = player.getComponent("minecraft:equippable");
    const mainHandItem = equipment?.getEquipment(EquipmentSlot.Mainhand);
    const blockPerm = brokenBlock.permutation;
    const blockId = brokenBlock.typeId;
    const blocLoc = brokenBlock.location;
    const dimension = player.dimension;

    if (mainHandItem && (mainHandItem.typeId === "avaritia:world_breaker_hammer" || mainHandItem.typeId === "avaritia:planet_destroyer")) {
        if (isBreakableByTool(brokenBlock, mainHandItem.typeId)){
            event.cancel = true;
            executeBlast(player, brokenBlock.location, mainHandItem.typeId);
        } else{
            executeBlast(player, brokenBlock.location, mainHandItem.typeId)
        }
    }
    if (mainHandItem && mainHandItem.typeId === "avaritia:world_breaker") {
        const lootManager = world.getLootTableManager();
        let baseTool = new ItemStack("avaritia:world_breaker", 1);
        const isAnOreBlock = blockId.includes("_ore") || brokenBlock.hasTag("minecraft:is_ore") || brokenBlock.hasTag("ore");
        if (isAnOreBlock) {
            const lootBase = lootManager.generateLootFromBlockPermutation(blockPerm, baseTool);
            if (lootBase && lootBase.length > 0 && lootBase.typeId !== blockId && isAnOreBlock) {
                const itemsToSpawn = [];
                for (let index = 0; index < lootBase.length; index++) {
                    const itemStack = lootBase[index];
                    let baseAmount = itemStack.amount;
                    let finalAmount = baseAmount;
                    if (isAnOreBlock) {
                        finalAmount = rollFortune10(baseAmount) - 1;
                    }
                    itemsToSpawn.push({ id: itemStack.typeId, amount: finalAmount });
                }
                system.run(() => {
                    const dropLoc = { x: blocLoc.x, y: blocLoc.y + 0.2, z: blocLoc.z };
                    for (const item of itemsToSpawn) {
                        if (item.amount > 0) {
                            dimension.spawnItem(new ItemStack(item.id, item.amount), dropLoc);
                        }
                    }
                });
            }
        }
    }
});

world.afterEvents.entityHitBlock.subscribe((event) => {
    const player = event.damagingEntity;
    const hitBlock = event.hitBlock;
    if (!player || player.typeId !== "minecraft:player") return;

    const equipment = player.getComponent("minecraft:equippable");
    const mainHandItem = equipment?.getEquipment(EquipmentSlot.Mainhand);
    
    if (mainHandItem && mainHandItem.typeId === "avaritia:world_breaker_hammer") {
        const isUnbreakable = UNDESTRUCTABLE_BLOCKS.some(pattern => {
            if (pattern instanceof RegExp) return pattern.test(hitBlock.typeId);
            return pattern === hitBlock.typeId;
        });

        if (isUnbreakable) {
            executeBlast(player, hitBlock.location, mainHandItem.typeId);
        }
    }
});

const veinMining_Config = {
  maxTotalBlocks: 5000, 
  affectedBlocks: {
    identifiers: [
      "_log", "_stem", "bamboo_block", "mangrove_roots", "_leaves", "wart_block", 
      "sapling", "flower", "fern", "vine", "crop", "wheat", "carrot", "potato", 
      "beetroot", "melon", "pumpkin", "sugar_cane", "cactus", "bamboo", "moss", 
      "spore_blossom", "glow_berries", "hanging_roots", "big_dripleaf", 
      "small_dripleaf", "lily_pad", "crimson_fungus", "warped_fungus",
      "grass", "tallgrass", "short_grass", "bush", "petals", "orchid", "allium", 
      "tulip", "daisy", "kelp", "kelp_plant", "glow_lichen", "lichen", "seagrass"
    ],
    tags: [
      "minecraft:logs", "minecraft:logs_that_burn", "log", "minecraft:leaves", 
      "leaves", "minecraft:crop", "minecraft:flower", "plant", "crop", 
      "flower", "fern", "vine", "bamboo", "sapling", "fungus"
    ]
  }
};

function getVegetationType(block) {
  if (!block) return null;
  const typeId = block.typeId;
  if (typeId === "minecraft:dirt" || typeId === "minecraft:farmland" || typeId === "minecraft:coarse_dirt" || typeId === "minecraft:rooted_dirt" || typeId === "minecraft:grass_block") {
    return null;
  }
  const blockTags = block.getTags();
  const isLog = veinMining_Config.affectedBlocks.tags.slice(0, 3).some(tag => block.hasTag(tag) || blockTags.includes(tag)) ||
                veinMining_Config.affectedBlocks.identifiers.slice(0, 4).some(suffix => typeId.includes(suffix));
  if (isLog) return "log";

  const isLeafOrFlora = veinMining_Config.affectedBlocks.tags.some(tag => block.hasTag(tag) || blockTags.includes(tag)) ||
                        veinMining_Config.affectedBlocks.identifiers.some(suffix => typeId.includes(suffix)) || typeId.includes("mushroom") || typeId.includes("fungus") || typeId.includes("moss");
  if (isLeafOrFlora) return "leaf";
  return null;
}

function findConnectedBlocks(startLocation, dimension) {
  const queue = [];
  const mappedBlocks = []; 
  const visited = new Set();
  const maxLimit = veinMining_Config.maxTotalBlocks;
  const OFFSETS_6D = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }
  ];
  const startKey = `${startLocation.x},${startLocation.y},${startLocation.z}`;
  visited.add(startKey);

  for (let i = 0; i < 6; i++) {
    const offset = OFFSETS_6D[i];
    queue.push({
      loc: {
        x: startLocation.x + offset.x,
        y: startLocation.y + offset.y,
        z: startLocation.z + offset.z
      },
      steps: 32,         
      isLeafMode: false  
    });
  }

  while (queue.length > 0) {
    const { loc, steps, isLeafMode } = queue.shift();
    const blockKey = `${loc.x},${loc.y},${loc.z}`;
    if (visited.has(blockKey) || steps <= 0) continue;
    visited.add(blockKey);

    try {
      const currentBlock = dimension.getBlock(loc);
      if (!currentBlock) continue;
      const type = getVegetationType(currentBlock);
      if (!type) continue; 
      if (mappedBlocks.length >= maxLimit) break;
      mappedBlocks.push(currentBlock);

      let nextSteps = steps - 1;
      let nextLeafMode = isLeafMode;
      if (type === "leaf") {
        nextSteps = isLeafMode ? nextSteps : 3;
        nextLeafMode = true; 
      }

      for (let i = 0; i < 6; i++) {
        const offset = OFFSETS_6D[i];
        const neighborPos = {
          x: loc.x + offset.x,
          y: loc.y + offset.y,
          z: loc.z + offset.z
        };
        const neighborKey = `${neighborPos.x},${neighborPos.y},${neighborPos.z}`;
        if (!visited.has(neighborKey)) {
          queue.push({ loc: neighborPos, steps: nextSteps, isLeafMode: nextLeafMode });
        }
      }
    } catch (e) {}
  }
  return mappedBlocks;
}

function removeBlocks(blocks, player, index = 0) {
  if (index >= blocks.length) return;
  const batchSize = 16; 
  const endIndex = Math.min(index + batchSize, blocks.length);
  const dimension = player.dimension;
  const isCreative = player.getGameMode() === "Creative";

  system.run(() => {
    for (let i = index; i < endIndex; i++) {
      const block = blocks[i];
      if (!block) continue;
      const loc = block.location;
      if (!isCreative) {
        dimension.runCommand(`setblock ${loc.x} ${loc.y} ${loc.z} air destroy`);
      } else {
        block.setType("minecraft:air")
      }
    }
    system.runTimeout(() => removeBlocks(blocks, player, endIndex), 1);
  });
}

function handleLeftClickMining(brokenBlockLocation, brokenBlockTypeId, brokenBlockTags, player) {
  const mockBlock = {
    typeId: brokenBlockTypeId,
    hasTag: (tag) => brokenBlockTags.includes(tag),
    getTags: () => brokenBlockTags
  };
  if (!getVegetationType(mockBlock)) return;
  const allBlocks = findConnectedBlocks(brokenBlockLocation, player.dimension);
  if (allBlocks.length > 0) {
    removeBlocks(allBlocks, player);
  }
}

function executeAxeBlast(player) {
  system.run(() => {
    const isCreative = player.getGameMode() === "Creative";
    const dimension = player.dimension;
    const pLoc = player.location;
    const px = Math.floor(pLoc.x);
    const py = Math.floor(pLoc.y);
    const pz = Math.floor(pLoc.z);
    const range = 13; 
    let inventoryCluster = {};
    let totalBlocksMined = 0;
    const lootManager = world.getLootTableManager();
    
    const baseTool = new ItemStack("avaritia:natures_ruin", 1);

    for (let x = -range; x <= range; x++) {
      for (let y = -3; y <= (range * 2 - 3); y++) {
        for (let z = -range; z <= range; z++) {
          const targetLoc = { x: px + x, y: py + y, z: pz + z };
          if (targetLoc.y < -64 || targetLoc.y > 320) continue;

          try {
            const currentBlock = dimension.getBlock(targetLoc);
            if (!currentBlock || currentBlock.isAir) continue;
            const blockId = currentBlock.typeId;

            if (blockId === "minecraft:grass_block" || blockId === "minecraft:mycelium" || blockId === "minecraft:podzol") {
              const topBlock = dimension.getBlock({ x: targetLoc.x, y: targetLoc.y + 1, z: targetLoc.z });
              
              if (topBlock && getVegetationType(topBlock)) {
                const blockPerm = topBlock.permutation;
                const blockLoot = lootManager.generateLootFromBlockPermutation(blockPerm, baseTool);

                if (blockLoot && blockLoot.length > 0) {
                  for (let i = 0; i < blockLoot.length; i++) {
                    const itemStack = blockLoot[i];
                    const itemId = itemStack.typeId;
                    const amount = itemStack.amount;

                    inventoryCluster[itemId] = (inventoryCluster[itemId] || 0) + amount;
                    totalBlocksMined += amount;
                  }
                }
                topBlock.setType("minecraft:air");
              }
              currentBlock.setType("minecraft:dirt");
              continue; 
            }

            if (getVegetationType(currentBlock)) {
              const blockPerm = currentBlock.permutation;
              const blockLoot = lootManager.generateLootFromBlockPermutation(blockPerm, baseTool);

              if (blockLoot && blockLoot.length > 0) {
                for (let i = 0; i < blockLoot.length; i++) {
                  const itemStack = blockLoot[i];
                  const itemId = itemStack.typeId;
                  const amount = itemStack.amount;

                  inventoryCluster[itemId] = (inventoryCluster[itemId] || 0) + amount;
                  totalBlocksMined += amount;
                }
              }
              currentBlock.setType("minecraft:air");
            }
          } catch (blockError) {
            continue;
          }
        }
      }
    }

    if (totalBlocksMined > 0) {
      spawnDistributedClusters(dimension, player.location, inventoryCluster, isCreative);
    }
  });
}


world.afterEvents.playerBreakBlock.subscribe((eventData) => {
  const { block, player, brokenBlockPermutation } = eventData;
  const equipment = player.getComponent("minecraft:equippable");
  const item = equipment?.getEquipment(EquipmentSlot.Mainhand);
  if (!item) return;

  const isNaturesRuin = item.typeId === "avaritia:natures_ruin" || item.hasTag("avaritia:natures_ruin");
  if (!player.isSneaking && isNaturesRuin) {
    handleLeftClickMining(block.location, brokenBlockPermutation.type.id, brokenBlockPermutation.getTags(), player);
  }
});

world.beforeEvents.itemUse.subscribe((eventData) => {
  const { itemStack, source: player } = eventData;
  const isNaturesRuin = itemStack.typeId === "avaritia:natures_ruin" || itemStack.hasTag("avaritia:natures_ruin");
  if (player.isSneaking && isNaturesRuin) {
    eventData.cancel = true; 
    executeAxeBlast(player);
  }
});

function executeHoeAOE(player, targetBlockLoc) {
    system.run(() => {
        const dimension = player.dimension;
        const isCreative = player.getGameMode() === "Creative";
        const lootManager = world.getLootTableManager();
        
        const baseTool = new ItemStack("avaritia:hoe_of_the_green_earth", 1); 

        const radius = 4;
        const centerX = Math.floor(targetBlockLoc.x);
        const centerY = Math.floor(targetBlockLoc.y);
        const centerZ = Math.floor(targetBlockLoc.z);

        let inventoryCluster = {};
        let totalItemsCaptured = 0;

        for (let x = -radius; x <= radius; x++) {
            for (let z = -radius; z <= radius; z++) {
                const groundLoc = { x: centerX + x, y: centerY, z: centerZ + z };
                
                try {
                    const block = dimension.getBlock(groundLoc);
                    if (!block) continue;

                    const id = block.typeId;

                    const isTillable = id === "minecraft:grass_block" || 
                                       id === "minecraft:dirt" || 
                                       id === "minecraft:coarse_dirt" || 
                                       id === "minecraft:rooted_dirt" || 
                                       id === "minecraft:podzol" || 
                                       id === "minecraft:mycelium";

                    if (isTillable) {
                        const topLoc1 = { x: groundLoc.x, y: groundLoc.y + 1, z: groundLoc.z };
                        const topLoc2 = { x: groundLoc.x, y: groundLoc.y + 2, z: groundLoc.z };

                        const topBlock1 = dimension.getBlock(topLoc1);
                        const topBlock2 = dimension.getBlock(topLoc2);

                        const hasTop1 = topBlock1 && !topBlock1.isAir;
                        const hasTop2 = topBlock2 && !topBlock2.isAir;

                        if (hasTop1 && hasTop2) {
                            continue; 
                        }

                        if (topBlock1 && !topBlock1.isAir) {
                            const blockPerm = topBlock1.permutation;

                            const blockLoot = lootManager.generateLootFromBlockPermutation(blockPerm, baseTool);

                            if (blockLoot && blockLoot.length > 0) {
                                for (let i = 0; i < blockLoot.length; i++) {
                                    const itemStack = blockLoot[i];
                                    const itemId = itemStack.typeId;
                                    const amount = itemStack.amount;

                                    inventoryCluster[itemId] = (inventoryCluster[itemId] || 0) + amount;
                                    totalItemsCaptured += amount;
                                }
                            }
                            
                            topBlock1.setType("minecraft:air");
                        }

                        block.setType("minecraft:farmland");

                    } else {
                        const isNonSolid = block.isAir || 
                                           id.includes("air") || 
                                           id.includes("water") || 
                                           id.includes("lava") || 
                                           id.includes("flowing");

                        if (isNonSolid) {
                            const underLoc = { x: groundLoc.x, y: groundLoc.y - 1, z: groundLoc.z };
                            const underBlock = dimension.getBlock(underLoc);

                            if (underBlock) {
                                const underId = underBlock.typeId;
                                
                                const isUnderSolid = !underBlock.isAir && 
                                                     !underId.includes("air") && 
                                                     !underId.includes("water") && 
                                                     !underId.includes("lava") && 
                                                     !underId.includes("flowing");

                                if (isUnderSolid) {
                                    block.setType("minecraft:farmland");
                                }
                            }
                        }
                    }
                    
                } catch (e) {
                }
            }
        }

        if (totalItemsCaptured > 0) {
            targetBlockLoc.y += 0.5;
            spawnDistributedClusters(dimension, targetBlockLoc, inventoryCluster, isCreative);
        }
    });
}

world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
    const player = event.player;
    if (!player) return;

    const equipment = player.getComponent("minecraft:equippable");
    const mainHandItem = equipment?.getEquipment(EquipmentSlot.Mainhand);

    if (mainHandItem && mainHandItem.typeId === "avaritia:hoe_of_the_green_earth") {
        const targetBlock = event.block;
        const id = targetBlock.typeId;

        if (id === "minecraft:grass_block" || id === "minecraft:dirt" || id === "minecraft:coarse_dirt" || id === "minecraft:farmland" || id === "minecraft:rooted_dirt" || id === "minecraft:podzol" || id === "minecraft:mycelium") {
            event.cancel = true;
            executeHoeAOE(player, targetBlock.location);
        }
    }
});
