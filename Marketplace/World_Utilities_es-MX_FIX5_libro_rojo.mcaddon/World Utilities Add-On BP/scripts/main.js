import { world, system, ItemStack, BlockPermutation, EquipmentSlot, StructureSaveMode, GameMode, MolangVariableMap, BlockVolume, CommandPermissionLevel, ItemComponentTypes, EntityComponentTypes, PlayerPermissionLevel } from '@minecraft/server';

import { mineOres, mineTree, findOreId, findWoodId, getOres, findCropId, seedToBlock, isSeed } from './sub/veinMiner';
import { performExcavatorShovelBreak, performExplosivePickaxeBreak, performMultiblockPickaxeBreak, queueDirectSmelt, smeltNearestItem, tryProcessDirectSmeltItem } from './sub/breakEffects';
import { performAmethystBreak, performEndFrameBreak, performSpawnBreak, performSpawnChoose, placeSpawner } from './sub/blockPickup';
import { configFailedMessage, failed, failedChat, success } from './sub/messenger'
import { Configs, getConfig } from './sub/config';
import { showHomeMenu, showMainMenu, showChunkMenu, showCreativeMenu, showXpMenu, showUpdateMenu, usersInForm, showWarpsMenu, showFastplaceMenu } from './sub/ui';
import { isSlimeChunk } from './sub/borders';
import { decrementHeldItem, handleTriggerableItem, highlightChunks, loreToId, setupIdForLore, hasItemOrEffect, ensureTriggerableInventorySynced } from './sub/util';
import { uiManager } from '@minecraft/server-ui';
import { identifyOtherHalf, lockChest } from './sub/lock';
import { findPortalPadUnder, portalTriggered } from './utilities/portal_pad';
import { DisenchanterComponent, disenchanterLookedAt } from './utilities/disenchanter';
import { checkDoubleJump, getFuel, MAX_FUEL, updateFuel } from './utilities/jetpack';
import { SuctionHopperComponent } from './utilities/suction_hopper';
import { EmptyWateringCanComponent, WateringCanComponent } from './utilities/watering_can';
import { initializePlayerVaults, updatePlayerVaultView, cleanupPlayerVaultViews, cleanupOrphanedVaultVisuals, isPlayerVaultEntityType } from './player_vaults/index';

const CHEST_BLOCKS = ["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel", "minecraft:exposed_copper_chest", "minecraft:copper_chest", "minecraft:weathered_copper_chest", "minecraft:oxidized_copper_chest", "minecraft:waxed_copper_chest", "minecraft:waxed_exposed_copper_chest", "minecraft:waxed_weathered_copper_chest", "minecraft:waxed_oxidized_copper_chest"];
const SHULKER_BLOCKS = [
    "minecraft:undyed_shulker_box",
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
const STASH_SNATCHER_BLOCKS = [...CHEST_BLOCKS, ...SHULKER_BLOCKS, "minecraft:ender_chest"];
const STASH_SNATCHER_ID_DP = "gf_wu:stashSnatcherId";
const STASH_SNATCHER_SIZE_DP = "gf_wu:stashSnatcherSize";
const STASH_SNATCHER_NAME_DP = "gf_wu:stashSnatcherName";
const STASH_SNATCHER_TYPE_DP = "gf_wu:stashSnatcherType";
const PAIRABLE_CHEST_BLOCKS = CHEST_BLOCKS.filter(id => id !== "minecraft:barrel");
const SAFARI_NET_COUNT_DP = "gf_wu:safariNetCount";
const OCEAN_RIDER_FUEL_DP = "gf_wu:oceanRiderFuel";
const OCEAN_RIDER_ITEM_FUEL_DP = "gf_wu:oceanRiderItemFuel";
const OCEAN_RIDER_CONTROL_STATE_DP = "gf_wu:oceanRiderControlState";
const OCEAN_RIDER_LAST_WATER_LOCATION_DP = "gf_wu:oceanRiderLastWaterLocation";

const SCOREBOARD_ID = 'gf_wu:jig_computer.addon_stats'

const TREECAPITATOR_STAT = 'gf_wu:stat_treecapitator'
const VEINMINER_STAT = 'gf_wu:stat_veinminer'
const ENDFRAMEBREAKER_STAT = 'gf_wu:stat_endframebreaker'
const AMETHYSTBREAKER_STAT = 'gf_wu:stat_amethystbreaker'
const EXPLOSIVEPICKAXE_STAT = 'gf_wu:stat_explosivepickaxe'
const MULTIBLOCPICKAXE_STAT = 'gf_wu:stat_multiblockpickaxe'
const QUARRYPICKAXE_STAT = 'gf_wu:stat_quarrypickaxe'
const OMNITOOL_STAT = 'gf_wu:stat_omnitool'
const WRENCH_STAT = 'gf_wu:stat_wrench'
const VOIDCHEST_STAT = 'gf_wu:stat_voidchest'
const MINERESSENTIAL_STAT = 'gf_wu:stat_minersessential'
const EXCAVATORSHOVEL_STAT = 'gf_wu:stat_excavatorshovel'
const DEEPDIGGERSHOVEL_STAT = 'gf_wu:stat_deepdiggershovel'
const HARVESTEREHOE_STAT = 'gf_wu:stat_harvesterhoe'
const SAFARINET_STAT = 'gf_wu:stat_safarinet'
const EXPERIENCEEXTRACTOR_STAT = 'gf_wu:stat_experienceextractor'
const EXPERIENCEBOTTLE_STAT = 'gf_wu:stat_experiencebottle'
const MAGNET_STAT = 'gf_wu:stat_magnet'
const CHUNKMINION_STAT = 'gf_wu:stat_chunkminion'
const LOCK_STAT = 'gf_wu:stat_lock'

export const loreMap = {
    'gf_wu:guide_book': ['§r§7Interact to view information about the Add-On!'],
    'gf_wu:end_frame_breaker': ['§r§7Easily move end frames around!'],
    'gf_wu:explosive_pickaxe': ['§r§7Mine to create explosions around you!'],
    'gf_wu:multiblock_pickaxe': ['§r§7Break multiple blocks at the same time!'],
    'gf_wu:multiblock_pickaxe_netherite': ['§r§7Break multiple blocks at the same time!'],
    'gf_wu:omni_tool': ['§r§7No pickaxe, axe, or shovel? No problem!'],
    'gf_wu:omni_tool_netherite': ['§r§7No pickaxe, axe, or shovel? No problem!'],
    'gf_wu:spawner_wrench': ['§r§7Break a spawner to move it!'],
    'gf_wu:choose_spawner': ['§r§7Break a spawner to move it!'],
    'gf_wu:vein_miner': ['§r§7Interact to toggle!', '', '§r§7Status: §r§cDisabled'],
    'gf_wu:treecapitator': ['§r§7Interact to toggle!', '', '§r§7Status: §r§cDisabled'],
    'gf_wu:miners_essentials': ['§r§7Interact to toggle!', '', '§r§7Status: §r§cDisabled'],
    'gf_wu:void_chest_item': ['§r§7Interact to open a menu to place your trash!'],
    'gf_wu:void_chest': ['§r§7Interact to open a menu to place your trash!'],
    'gf_wu:safari_net': ['§r§7Pick up a mob and take it somewhere else!'],
    'gf_wu:excavator_shovel': ['§r§7Break multiple blocks at the same time!'],
    'gf_wu:excavator_shovel_netherite': ['§r§7Break multiple blocks at the same time!'],
    'gf_wu:harvester_hoe': ['§r§7Break crops to automatically harvest them!'],
    'gf_wu:harvester_hoe_netherite': ['§r§7Break crops to automatically harvest them!'],
    'gf_wu:update_book': ['§r§7Check all the changes in the latest update!'],
    'gf_wu:controller': ['§r§7Interact to edit the Add-On settings!'],
    'gf_wu:chunk_borders': ['§r§7Interact to toggle!', '', '§r§7Status: §r§cDisabled'],
    'gf_wu:homes': ['§r§7Interact to access your Homes menu!'],
    'gf_wu:miners_lantern': ['§r§7Hold or place in off-hand to emit light!'],
    'gf_wu:magnet': ['§r§7Interact to toggle!', '', '§r§7Status: §r§cDisabled'],
    'gf_wu:experience_bottle': ['§r§7Interact to transfer EXP to yourself!', '§r§7Experience: 0'],
    'gf_wu:lock': ['§r§7Interact with a chest to secure your items!'],
    'gf_wu:experience_extractor_item': ['§r§7Place and interact to store your EXP!'],
    'gf_wu:experience_extractor': ['§r§7Place and interact to store your EXP!'],
    'gf_wu:chunk_minion_spawn_egg': ['§r§7Place to keep this area always loaded!'],
    'gf_wu:fast_place': ['§r§7Interact to toggle!', '', '§r§7Status: §r§cDisabled'],
    'gf_wu:grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:black_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:blue_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:cyan_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:gray_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:green_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:light_blue_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:light_gray_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:lime_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:magenta_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:orange_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:pink_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:purple_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:red_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:white_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:yellow_grab_bag': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:black_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:blue_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:cyan_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:gray_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:green_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:light_blue_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:light_gray_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:lime_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:magenta_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:orange_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:pink_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:purple_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:red_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:white_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:yellow_grab_bag_empty': ['§r§7Place on the ground & interact to store items!'],
    'gf_wu:disenchanter': ['§r§7Place and interact to remove item enchants!'],
    'gf_wu:portal_pad': ['§r§7Place to travel up and down in your world!'],
    'gf_wu:jetpack': ['§r§7Equip in your Chestplate slot to fly!'],
    'gf_wu:scuba_tank': ['§r§7Equip in your off-hand to breathe underwater!', '', '§r§7Oxygen: 100%'],
    'gf_wu:warps': ['§r§7¡Interactúa para abrir el menú de teletransportes!'],
    'gf_wu:amethyst_breaker': ['§r§7Easily move Budding Amethyst around!'],
    'gf_wu:suction_hopper': ['§r§7Place to suck in nearby items!'],
    'gf_wu:watering_can': ['§r§7Use around crops to speed up growth!']
};

loreMap['gf_wu:safari_net_full'] = ["§r§7Picked up a mob, now take it somewhere else!"];
loreMap['gf_wu:quarry_pickaxe'] = ["§r§7Break all blocks within a 5x5 radius!"];
loreMap['gf_wu:quarry_pickaxe_netherite'] = ["§r§7Break all blocks within a 5x5 radius!"];
loreMap['gf_wu:deep_digger_shovel'] = ["§r§7Break all blocks within a 5x5 radius!"];
loreMap['gf_wu:deep_digger_shovel_netherite'] = ["§r§7Break all blocks within a 5x5 radius!"];
loreMap['gf_wu:bridge_builder'] = ["§r§7Interact to toggle!", "", "§r§7Status: §r§cDisabled"];
loreMap['gf_wu:stash_snatcher'] = ["§r§7Interact with a container to move it without emptying!"];
loreMap['gf_wu:stash_snatcher_full'] = ["§r§7Interact with a container to move it without emptying!"];
loreMap['gf_wu:tanning_rack'] = ["§r§7Place and interact to convert rotten flesh to leather!"];
loreMap['gf_wu:ocean_rider'] = ["§r§7Place in water and navigate the depths of the ocean!"];
loreMap['gf_wu:vault'] = ["§r§7Place and interact to open your personal vault!"];

const minonCooldownMap = new Map();

const grabBigListener = new Map();
const bridgeBuilderPlacements = new Map();
const BRIDGE_BUILDER_BLOCKS = ['gf_wu:bridge_builder1', 'gf_wu:bridge_builder2', 'gf_wu:bridge_builder3', 'gf_wu:bridge_builder4'];
const BRIDGE_BUILDER_DP = 'gf_wu:bridge_builder_placements';

function toBlockLocation(location, xOffset = 0, yOffset = 0, zOffset = 0) {
    return {
        x: Math.floor(location.x) + xOffset,
        y: Math.floor(location.y) + yOffset,
        z: Math.floor(location.z) + zOffset
    };
}

function safeGetBlock(dimension, location) {
    try {
        return dimension.getBlock({
            x: Math.floor(location.x),
            y: Math.floor(location.y),
            z: Math.floor(location.z)
        });
    } catch {
        return undefined;
    }
}

initializePlayerVaults(loreMap);

function getBlockFaceLocation(block, blockFace) {
    const location = { x: block.location.x, y: block.location.y, z: block.location.z };
    if (blockFace == 'Down') location.y -= 1
    else if (blockFace == 'Up') location.y += 1
    else if (blockFace == 'East') location.x += 1
    else if (blockFace == 'West') location.x -= 1
    else if (blockFace == 'South') location.z += 1
    else if (blockFace == 'North') location.z -= 1
    return location;
}

function getNextChunkMinionId() {
    const count = world.getDynamicProperty('gf_wu:chunkMinionCount');
    return typeof count === 'number' ? count + 1 : 1;
}

function setupChunkMinion(player, chunkMinion, location) {
    const id = getNextChunkMinionId();
    chunkMinion.setDynamicProperty('gf_wu:id', id);
    world.scoreboard.getObjective(SCOREBOARD_ID)?.addScore(CHUNKMINION_STAT, 1)
    highlightChunks(player.dimension, location, 0, 'gf_wu:chunk_minion_border_1')
    const chunkLocation = { x: Math.floor(location.x / 16) * 16, y: 128, z: Math.floor(location.z / 16) * 16 };
    const size = 1;
    player.dimension.runCommand(`tickingarea add ${chunkLocation.x + 15 * size} 0 ${chunkLocation.z + 15 * size} ${chunkLocation.x - 15 * (size - 1)} 0 ${chunkLocation.z - 15 * (size - 1)} gf_wu:chunk_${id}`);
    world.setDynamicProperty('gf_wu:chunkMinionCount', id)
    world.setDynamicProperty('gf_wu:ticking_areas', (world.getDynamicProperty('gf_wu:ticking_areas') ?? '') + `,${id}`)
}

function rotateChunkMinionToPlayer(chunkMinion, player) {
    try {
        const rotation = player.getRotation();
        chunkMinion.teleport(chunkMinion.location, { rotation: { x: 0, y: rotation.y + 180 } });
    } catch { }
}

function handleTanningRackInteraction(block, player, convertWholeStack = player.isSneaking) {
    const inventory = player.getComponent("inventory")?.container;
    const selectedSlot = player.selectedSlotIndex;
    const itemStack = inventory?.getItem(selectedSlot);

    if (itemStack?.typeId != 'minecraft:rotten_flesh') return;

    if (!getConfig(Configs.TanningRack)) {
        configFailedMessage(player);
        return;
    }

    const convertAmount = convertWholeStack ? itemStack.amount : 1;
    block.dimension.spawnItem(new ItemStack('minecraft:leather', convertAmount), {
        x: block.x + 0.5,
        y: block.y + 1.1,
        z: block.z + 0.5
    });
    block.dimension.playSound('dig.wool', block.center());
    block.dimension.spawnParticle('minecraft:crop_growth_emitter', {
        x: block.x + 0.5,
        y: block.y + 1,
        z: block.z + 0.5
    });

    if (player.getGameMode() == GameMode.Creative) return;

    const remainingAmount = itemStack.amount - convertAmount;
    if (remainingAmount <= 0) {
        inventory.setItem(selectedSlot);
        return;
    }

    itemStack.amount = remainingAmount;
    inventory.setItem(selectedSlot, itemStack);
}

function bridgeBuilderKey(dimensionId, location) {
    return `${dimensionId}:${location.x},${location.y},${location.z}`;
}

function saveBridgeBuilderPlacements() {
    if (bridgeBuilderPlacements.size === 0) {
        world.setDynamicProperty(BRIDGE_BUILDER_DP, undefined);
        return;
    }

    world.setDynamicProperty(BRIDGE_BUILDER_DP, JSON.stringify([...bridgeBuilderPlacements.values()]));
}

function loadBridgeBuilderPlacements() {
    bridgeBuilderPlacements.clear();

    const stored = world.getDynamicProperty(BRIDGE_BUILDER_DP);
    if (!stored) return;

    try {
        for (const placement of JSON.parse(stored)) {
            if (!placement?.dimensionId || !placement?.location || !placement?.originalTypeId || !placement?.key) continue;
            bridgeBuilderPlacements.set(placement.key, placement);
        }
    } catch {
        world.setDynamicProperty(BRIDGE_BUILDER_DP, undefined);
    }
}

function isBridgeBuilderBlock(typeId) {
    return BRIDGE_BUILDER_BLOCKS.includes(typeId);
}

function clearBridgeBuilderBlockItems(container) {
    if (!container) return;

    for (let slot = 0; slot < container.size; slot++) {
        if (isBridgeBuilderBlock(container.getItem(slot)?.typeId)) container.setItem(slot);
    }
}

function getBridgeLiquidType(typeId) {
    if (typeId?.includes('water')) return 'minecraft:water';
    if (typeId?.includes('lava')) return 'minecraft:lava';
    return undefined;
}

function restoreBridgeBuilderPlacement(placement) {
    const dimension = world.getDimension(placement.dimensionId);
    const block = safeGetBlock(dimension, placement.location);
    if (!block) return false;
    if (isBridgeBuilderBlock(block.typeId) || block.isAir) block.setType(placement.originalTypeId);
    bridgeBuilderPlacements.delete(placement.key);
    saveBridgeBuilderPlacements();
    return true;
}

function restoreBridgeBuilderPlacementsForPlayer(playerId) {
    for (const placement of [...bridgeBuilderPlacements.values()]) {
        if (placement.playerId == playerId) restoreBridgeBuilderPlacement(placement);
    }
}

function refreshBridgeBuilderPlacement(block, placement) {
    placement.durationMs = getConfig(Configs.BridgeBuilderDecaySeconds) * 1000;
    placement.expiresAtMs = Date.now() + placement.durationMs;
    if (block.typeId !== BRIDGE_BUILDER_BLOCKS[0]) block.setType(BRIDGE_BUILDER_BLOCKS[0]);
    saveBridgeBuilderPlacements();
}

function getBridgeBuilderForwardOffset(player) {
    const viewDirection = player.getViewDirection();
    if (Math.abs(viewDirection.x) > Math.abs(viewDirection.z)) return { x: Math.sign(viewDirection.x), z: 0 };
    return { x: 0, z: Math.sign(viewDirection.z) };
}

function placeBridgeBuilderBlockAt(player, targetLocation) {
    const dimension = player.dimension;
    const targetBlock = safeGetBlock(dimension, targetLocation);
    if (!targetBlock) return false;

    const key = bridgeBuilderKey(dimension.id, targetLocation);
    const existingPlacement = bridgeBuilderPlacements.get(key);
    if (existingPlacement && isBridgeBuilderBlock(targetBlock.typeId)) {
        refreshBridgeBuilderPlacement(targetBlock, existingPlacement);
        return true;
    }

    if (!targetBlock.isLiquid) return false;

    const originalTypeId = getBridgeLiquidType(targetBlock.typeId);
    if (!originalTypeId) return false;
    if (originalTypeId === 'minecraft:water' && !getConfig(Configs.BridgeBuilderWater)) return false;
    if (originalTypeId === 'minecraft:lava' && !getConfig(Configs.BridgeBuilderLava)) return false;

    targetBlock.setType(BRIDGE_BUILDER_BLOCKS[0]);
    bridgeBuilderPlacements.set(key, {
        key,
        dimensionId: dimension.id,
        location: targetLocation,
        playerId: player.id,
        originalTypeId,
        durationMs: getConfig(Configs.BridgeBuilderDecaySeconds) * 1000,
        expiresAtMs: Date.now() + (getConfig(Configs.BridgeBuilderDecaySeconds) * 1000)
    });
    saveBridgeBuilderPlacements();
    return true;
}

function tryPlaceBridgeBuilderBlock(player) {
    if (!getConfig(Configs.BridgeBuilder) || !hasItemOrEffect(player, 'gf_wu:bridge_builder_on')) return false;

    const dimension = player.dimension;
    const feetBlock = safeGetBlock(dimension, player.location);
    if (!feetBlock || feetBlock.isLiquid) return false;

    const forwardOffset = getBridgeBuilderForwardOffset(player);
    const currentLocation = toBlockLocation(player.location, 0, -1, 0);
    const forwardLocation = toBlockLocation(player.location, forwardOffset.x, -1, forwardOffset.z);

    const placedCurrent = placeBridgeBuilderBlockAt(player, currentLocation);
    const placedForward = placeBridgeBuilderBlockAt(player, forwardLocation);
    return placedCurrent || placedForward;
}

function updateBridgeBuilderPlacements() {
    let changed = false;
    const now = Date.now();

    for (const placement of bridgeBuilderPlacements.values()) {
        const dimension = world.getDimension(placement.dimensionId);
        const block = safeGetBlock(dimension, placement.location);
        if (!block) continue;

        if (!isBridgeBuilderBlock(block.typeId)) {
            if (block.isAir) block.setType(placement.originalTypeId);
            bridgeBuilderPlacements.delete(placement.key);
            changed = true;
            continue;
        }

        const durationMs = Math.max(placement.durationMs ?? (getConfig(Configs.BridgeBuilderDecaySeconds) * 1000), 1);
        const remainingMs = (placement.expiresAtMs ?? now) - now;
        if (remainingMs <= 0) {
            if (restoreBridgeBuilderPlacement(placement)) changed = true;
            continue;
        }

        const progress = Math.max(0, Math.min(1, 1 - (remainingMs / durationMs)));
        const stageIndex = Math.min(BRIDGE_BUILDER_BLOCKS.length - 1, Math.floor(progress * BRIDGE_BUILDER_BLOCKS.length));
        const desiredTypeId = BRIDGE_BUILDER_BLOCKS[stageIndex];
        if (block.typeId !== desiredTypeId) block.setType(desiredTypeId);
    }

    if (changed) saveBridgeBuilderPlacements();
}

function stashSnatcherStructureName(id) {
    return `gf_wu:stash_${id}`;
}

function quoteStructureName(name) {
    return `"${name}"`;
}

function getContainerLockBarriers(block) {
    return block.dimension.getEntitiesAtBlockLocation(block.y > -64 ? block.below() : block).filter(x => x.typeId.startsWith('gf_wu:lock_barrier'));
}

function isLockedContainerBlock(block) {
    if (!CHEST_BLOCKS.includes(block.typeId)) return false;
    const barriers = getContainerLockBarriers(block);
    const barrierLocations = barriers.flatMap(x => x.getDynamicProperty('gf_wu:chests').split('|').map(y => JSON.parse(y)));
    return barrierLocations.some(a => vectorEquals(a, block.location));
}

function getStashSnatcherData(block) {
    if (!STASH_SNATCHER_BLOCKS.includes(block.typeId)) return;

    if (isLockedContainerBlock(block)) return { error: 'locked' };

    if (CHEST_BLOCKS.includes(block.typeId)) {
        const inventory = block.getComponent('inventory')?.container;
        if (!inventory) return { error: 'unsupported' };
        if (inventory.size === 54) return { error: 'double' };
    }

    return { ok: true };
}

function canPlaceStoredContainer(dimension, origin, size) {
    for (let x = 0; x < size.x; x++) {
        for (let y = 0; y < size.y; y++) {
            for (let z = 0; z < size.z; z++) {
                const block = safeGetBlock(dimension, { x: origin.x + x, y: origin.y + y, z: origin.z + z });
                if (!block || !block.isAir) return false;
            }
        }
    }
    return true;
}

function wouldConnectToExistingChest(dimension, location, facing, chestType) {
    if (!PAIRABLE_CHEST_BLOCKS.includes(chestType)) return false;

    const dir = facing?.toLowerCase();
    let offsets;
    if (dir === 'north' || dir === 'south') offsets = [{ x: 1, z: 0 }, { x: -1, z: 0 }];
    else if (dir === 'east' || dir === 'west') offsets = [{ x: 0, z: 1 }, { x: 0, z: -1 }];
    else offsets = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];

    for (const o of offsets) {
        const neighbour = safeGetBlock(dimension, { x: location.x + o.x, y: location.y, z: location.z + o.z });
        if (!neighbour || neighbour.typeId !== chestType) continue;

        const neighbourDir = neighbour.permutation.getAllStates()['minecraft:cardinal_direction'];
        if (dir && neighbourDir && neighbourDir !== dir) continue;

        if (neighbour.getComponent('inventory')?.container?.size === 54) continue;

        return true;
    }

    return false;
}

function clearStoredContainerInventory(block) {
    const container = block?.getComponent('inventory')?.container;
    if (!container) return;

    for (let slot = 0; slot < container.size; slot++) {
        try {
            container.setItem(slot);
        } catch {
            return;
        }
    }
}

function orientStoredContainerBlocks(dimension, origin, size, direction) {
    const stateDirection = direction?.toLowerCase();
    if (!stateDirection) return;

    for (let x = 0; x < size.x; x++) {
        for (let y = 0; y < size.y; y++) {
            for (let z = 0; z < size.z; z++) {
                const block = safeGetBlock(dimension, {
                    x: origin.x + x,
                    y: origin.y + y,
                    z: origin.z + z
                });
                if (!block || !STASH_SNATCHER_BLOCKS.includes(block.typeId)) continue;

                const states = block.permutation.getAllStates();
                if (!Object.hasOwn(states, 'minecraft:cardinal_direction')) continue;

                try {
                    block.setPermutation(block.permutation.withState('minecraft:cardinal_direction', stateDirection));
                } catch { }
            }
        }
    }
}

function updateStashSnatcherLore(itemStack, label, id) {
    const display = label ? label.replace(/\b\w/g, char => char.toUpperCase()) : 'Container';
    itemStack.setLore([
        "§r§7Pick up supported storage blocks and place them back later!",
        `§r§7Stored: ${display}`
    ]);
}

function damageStashSnatcher(player, itemStack) {
    if (player.getGameMode() === GameMode.Creative || !getConfig(Configs.StashSnatcherDurability)) return itemStack;

    const clone = itemStack.clone();
    const d = clone.getComponent('durability');
    try {
        d.damage += 1;
        return clone;
    } catch {
        player.getComponent('equippable').setEquipment('Mainhand');
        player.playSound('random.break', { location: player.location });
        return undefined;
    }
}

function getSafariNetStructureId(itemStack) {
    const structureId = itemStack?.getDynamicProperty(SAFARI_NET_COUNT_DP);
    return typeof structureId === 'number' && structureId >= 0 ? structureId : undefined;
}

function isFilledSafariNet(itemStack) {
    return !!itemStack && (
        itemStack.typeId === 'gf_wu:safari_net_full' ||
        (itemStack.typeId === 'gf_wu:safari_net' && getSafariNetStructureId(itemStack) !== undefined)
    );
}

function getMountedOceanRider(player) {
    try {
        const entity = player.getComponent('riding')?.entityRidingOn;
        if (entity?.typeId === 'gf_wu:ocean_rider') return entity;
    } catch { }
    return undefined;
}

function getOceanRiderFuel(entity) {
    return Math.max(Math.min(entity.getDynamicProperty(OCEAN_RIDER_FUEL_DP) ?? MAX_FUEL, MAX_FUEL), 0);
}

function updateOceanRiderFuel(entity, step) {
    const nextFuel = Math.max(Math.min(getOceanRiderFuel(entity) + step, MAX_FUEL), 0);
    entity.setDynamicProperty(OCEAN_RIDER_FUEL_DP, nextFuel);
    return nextFuel;
}

function isWaterBlock(block) {
    return block?.typeId?.includes('water');
}

function isOceanRiderInWater(oceanRider) {
    const bodyBlock = safeGetBlock(oceanRider.dimension, oceanRider.location);
    const belowBlock = safeGetBlock(oceanRider.dimension, {
        x: oceanRider.location.x,
        y: oceanRider.location.y - 0.5,
        z: oceanRider.location.z
    });
    return isWaterBlock(bodyBlock) || isWaterBlock(belowBlock);
}

function keepOceanRiderOverWater(oceanRider) {
    const supportBlock = safeGetBlock(oceanRider.dimension, {
        x: oceanRider.location.x,
        y: oceanRider.location.y - 0.5,
        z: oceanRider.location.z
    });

    if (isWaterBlock(supportBlock)) {
        oceanRider.setDynamicProperty(OCEAN_RIDER_LAST_WATER_LOCATION_DP, oceanRider.location);
        return true;
    }

    const lastWaterLocation = oceanRider.getDynamicProperty(OCEAN_RIDER_LAST_WATER_LOCATION_DP);
    if (!lastWaterLocation) return false;

    try {
        oceanRider.teleport(lastWaterLocation, {
            keepVelocity: false,
            rotation: oceanRider.getRotation()
        });
    } catch { }

    return false;
}

function canPlaceOceanRiderAt(dimension, blockLocation) {
    const waterBlock = safeGetBlock(dimension, blockLocation);
    const topBlock = safeGetBlock(dimension, { x: blockLocation.x, y: blockLocation.y + 1, z: blockLocation.z });
    if (!isWaterBlock(waterBlock) || !topBlock || (!topBlock.isAir && !topBlock.isLiquid)) return false;

    const center = {
        x: blockLocation.x + 0.5,
        y: blockLocation.y + 0.2,
        z: blockLocation.z + 0.5
    };

    return dimension.getEntities({ type: 'gf_wu:ocean_rider', location: center, maxDistance: 1.5 }).length === 0;
}

function findOceanRiderPlacementBlock(player, maxDistance = 6) {
    const viewDirection = player.getViewDirection();
    const start = player.getHeadLocation();

    for (let distance = 1; distance <= maxDistance; distance += 0.5) {
        const sample = {
            x: start.x + viewDirection.x * distance,
            y: start.y + viewDirection.y * distance,
            z: start.z + viewDirection.z * distance
        };
        const block = safeGetBlock(player.dimension, sample);
        if (isWaterBlock(block)) return block;
    }

    return undefined;
}

function syncOceanRiderControlState(oceanRider) {
    const desiredState = getOceanRiderFuel(oceanRider) > 0 ? `speed_${getConfig(Configs.OceanRiderSpeed)}` : 'disabled';
    const currentState = oceanRider.getDynamicProperty(OCEAN_RIDER_CONTROL_STATE_DP);
    if (currentState === desiredState) return;

    try {
        if (desiredState === 'disabled') oceanRider.triggerEvent('gf_wu:disable_control');
        else oceanRider.triggerEvent(`gf_wu:control_${desiredState}`);
        oceanRider.setDynamicProperty(OCEAN_RIDER_CONTROL_STATE_DP, desiredState);
    } catch { }
}

function disableOceanRider(oceanRider) {
    setOceanRiderMovingState(oceanRider, false);

    try {
        oceanRider.triggerEvent('gf_wu:disable_control');
        oceanRider.setDynamicProperty(OCEAN_RIDER_CONTROL_STATE_DP, 'disabled');
    } catch { }
}

function disableOceanRiderForMountedPlayer(player, oceanRider) {
    disableOceanRider(oceanRider);

    try {
        oceanRider.getComponent('rideable')?.ejectRider(player);
    } catch {
        try {
            oceanRider.getComponent('rideable')?.ejectRiders();
        } catch { }
    }
}

function ejectDisabledOceanRiderPassengers() {
    if (getConfig(Configs.OceanRider)) return;

    dimensions.forEach(dimension => {
        dimension.getEntities({ type: 'gf_wu:ocean_rider' }).forEach(oceanRider => {
            disableOceanRider(oceanRider);

            try {
                oceanRider.getComponent('rideable')?.getRiders()?.forEach(rider => {
                    if (rider.typeId === 'minecraft:player') disableOceanRiderForMountedPlayer(rider, oceanRider);
                });
            } catch {
                try {
                    oceanRider.getComponent('rideable')?.ejectRiders();
                } catch { }
            }
        });
    });
}

function setOceanRiderMovingState(oceanRider, isMoving) {
    try {
        if (oceanRider.getProperty('gf_wu:is_moving') === isMoving) return;
        oceanRider.setProperty('gf_wu:is_moving', isMoving);
    } catch { }
}

function hasOceanRiderMovementInput(player) {
    try {
        const movement = player.inputInfo?.getMovementVector?.();
        if (movement && (Math.abs(movement.x) > 0.01 || Math.abs(movement.y) > 0.01)) return true;
    } catch { }

    return player.isJumping || player.isSneaking;
}

function updateOceanRiderState(player, oceanRider) {
    const isOverWater = keepOceanRiderOverWater(oceanRider);
    if (!isOverWater) {
        disableOceanRider(oceanRider);
        return;
    }

    syncOceanRiderControlState(oceanRider);
    const currentFuel = getOceanRiderFuel(oceanRider);
    setOceanRiderMovingState(oceanRider, currentFuel > 0 && hasOceanRiderMovementInput(player));

    if (currentFuel > 0 && !player.isJumping && !player.isSneaking && isOceanRiderInWater(oceanRider)) {
        let verticalVelocity = 0;
        try {
            verticalVelocity = oceanRider.getVelocity().y;
        } catch { }

        try {
            oceanRider.applyImpulse({ x: 0, y: -verticalVelocity, z: 0 });
        } catch { }
    }

    if (currentFuel <= 0 || system.currentTick % 2 !== 0) return;

    let velocity = { x: 0, y: 0, z: 0 };
    try {
        velocity = oceanRider.getVelocity();
    } catch { }

    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    if (speed < 0.015) return;

    updateOceanRiderFuel(oceanRider, -1);
    syncOceanRiderControlState(oceanRider);
}

// Helper function to check if a block/item is a grab bag
const isGrabBag = (typeId) => {
    return typeId === 'gf_wu:grab_bag' ||
        typeId === 'gf_wu:black_grab_bag' ||
        typeId === 'gf_wu:blue_grab_bag' ||
        typeId === 'gf_wu:cyan_grab_bag' ||
        typeId === 'gf_wu:gray_grab_bag' ||
        typeId === 'gf_wu:green_grab_bag' ||
        typeId === 'gf_wu:light_blue_grab_bag' ||
        typeId === 'gf_wu:light_gray_grab_bag' ||
        typeId === 'gf_wu:lime_grab_bag' ||
        typeId === 'gf_wu:magenta_grab_bag' ||
        typeId === 'gf_wu:orange_grab_bag' ||
        typeId === 'gf_wu:pink_grab_bag' ||
        typeId === 'gf_wu:purple_grab_bag' ||
        typeId === 'gf_wu:red_grab_bag' ||
        typeId === 'gf_wu:white_grab_bag' ||
        typeId === 'gf_wu:yellow_grab_bag' ||
        typeId === 'gf_wu:grab_bag_empty' ||
        typeId === 'gf_wu:black_grab_bag_empty' ||
        typeId === 'gf_wu:blue_grab_bag_empty' ||
        typeId === 'gf_wu:cyan_grab_bag_empty' ||
        typeId === 'gf_wu:gray_grab_bag_empty' ||
        typeId === 'gf_wu:green_grab_bag_empty' ||
        typeId === 'gf_wu:light_blue_grab_bag_empty' ||
        typeId === 'gf_wu:light_gray_grab_bag_empty' ||
        typeId === 'gf_wu:lime_grab_bag_empty' ||
        typeId === 'gf_wu:magenta_grab_bag_empty' ||
        typeId === 'gf_wu:orange_grab_bag_empty' ||
        typeId === 'gf_wu:pink_grab_bag_empty' ||
        typeId === 'gf_wu:purple_grab_bag_empty' ||
        typeId === 'gf_wu:red_grab_bag_empty' ||
        typeId === 'gf_wu:white_grab_bag_empty' ||
        typeId === 'gf_wu:yellow_grab_bag_empty';
};

function recoverGrabBagDrop(player, dimension, location, blockId) {
    const { x, y, z } = location;
    const entityId = world.getDynamicProperty(`grab_bag:${dimension.id}_${x}_${y}_${z}`);
    const grabBag = world.getEntity(entityId);
    const inventory = grabBag?.getComponent('inventory')?.container;
    if (!inventory) return;

    const isEmpty = inventory.emptySlotsCount == 5;
    const baseTypeId = blockId.replace('_empty', '');
    const bagTypeId = isEmpty ? (baseTypeId + '_empty') : baseTypeId;
    const bagItem = new ItemStack(bagTypeId);

    if (getConfig(Configs.GrabBag)) {
        if (isEmpty) {
            bagItem.setLore(loreMap[baseTypeId] || loreMap['gf_wu:grab_bag']);
        } else {
            const bottomLocation = { x, y: dimension.id == 'minecraft:overworld' ? -64 : 0, z };
            const bottomBlock = dimension.getBlock(bottomLocation);
            const previous = bottomBlock.permutation;
            bottomBlock.setType('chest');
            const chest = bottomBlock.getComponent('inventory').container;
            const bagCount = world.getDynamicProperty('grabBagCount');
            const lore = [setupIdForLore(`${bagCount}`)];
            for (let i = 0; i < 5; i++) {
                const element = inventory.getItem(i);
                if (element) {
                    chest.setItem(i, element);
                    lore.push('§r§7' + format(element.typeId) + (element.amount > 1 ? ' x' + element.amount : ''));
                }
            }
            dimension.runCommand(`execute positioned ${bottomLocation.x} ${bottomLocation.y} ${bottomLocation.z} run structure save gf_wu:grabBag_${bagCount} ~ ~ ~ ~ ~ ~ false disk true`);
            chest.clearAll();
            bottomBlock.setPermutation(previous);
            world.setDynamicProperty('grabBagCount', bagCount + 1);
            bagItem.setLore([...(loreMap[blockId] || loreMap['gf_wu:grab_bag'])].concat(lore));
        }
        if (player.getGameMode() !== GameMode.Creative || bagItem.getLore().length > 1) {
            dimension.spawnItem(bagItem, location);
        }
    } else {
        for (let i = 0; i < 5; i++) {
            const element = inventory.getItem(i);
            if (element) dimension.spawnItem(element, location);
        }
        bagItem.setLore(loreMap[blockId] || loreMap['gf_wu:grab_bag']);
        if (player.getGameMode() !== GameMode.Creative) dimension.spawnItem(bagItem, location);
    }

    grabBag.triggerEvent('exit');
    world.setDynamicProperty(`grab_bag:${dimension.id}_${x}_${y}_${z}`);
}

const sneakMap = new Map();
const jumpMap = new Map();

const pickaxeTiers = new Map([
    ['minecraft:wooden_pickaxe', 4],
    ['minecraft:golden_pickaxe', 4],
    ['minecraft:copper_pickaxe', 10],
    ['minecraft:stone_pickaxe', 10],
    ['minecraft:iron_pickaxe', 19],
    ['minecraft:diamond_pickaxe', 99],
    ['minecraft:netherite_pickaxe', 99],
    ['gf_wu:explosive_pickaxe', 99],
    ['gf_wu:multiblock_pickaxe', 99],
    ['gf_wu:multiblock_pickaxe_netherite', 99],
    ['gf_wu:quarry_pickaxe', 99],
    ['gf_wu:quarry_pickaxe_netherite', 99],
    ['gf_wu:omni_tool', 99],
    ['gf_wu:omni_tool_netherite', 99],
    ['re_of:prismatic_pickaxe', 99], // Combine Ores Pickaxes
    ['re_of:netherforge_pickaxe', 99],
    ['re_of:emeraldium_pickaxe', 99],
    ['re_of:luxorite_pickaxe', 99],
    ['re_of:coppered_netherite_pickaxe', 99],
    ['re_of:coppered_gold_pickaxe', 99],
    ['re_of:coppered_iron_pickaxe', 99],
    ['re_of:coppered_diamond_pickaxe', 99],
    ['re_of:coppered_emerald_pickaxe', 99],
    ['re_of:aurorite_pickaxe', 99],
    ['re_of:abyssalite_pickaxe', 99],
    ['re_of:pyronite_pickaxe', 99],
    ['re_of:gemsteel_pickaxe', 99],
    ['re_of:goldsteel_pickaxe', 99],
    ['re_of:nethergem_pickaxe', 99],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_wood_binding_primative', 4], // Tinkers Construct Pickaxes
    ['ftb_tc:pickaxe_handle_ardite_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_bone_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_cobalt_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_diamond_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_gold_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_hepatizon_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_iron_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_manyullyn_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_netherite_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_pig_iron_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_queens_slime_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_rock_stone_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_rose_gold_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_slimesteel_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_wood_head_wood_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_ardite_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_bone_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_cobalt_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_diamond_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_gold_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_hepatizon_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_iron_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_manyullyn_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_netherite_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_pig_iron_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_queens_slime_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_rock_stone_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_rose_gold_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_slimesteel_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_wood_head_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_ardite_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_bone_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_cobalt_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_diamond_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_gold_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_hepatizon_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_iron_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_manyullyn_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_netherite_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_pig_iron_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_queens_slime_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_rock_stone_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_rose_gold_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_slimesteel_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_wood_head_rose_gold_binding_primative', 4],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_ardite_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_bone_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_cobalt_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_diamond_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_gold_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_hepatizon_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_iron_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_manyullyn_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_netherite_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_pig_iron_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_queens_slime_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_rock_stone_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_rose_gold_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_slimesteel_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_wood_head_rock_stone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_ardite_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_bone_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_cobalt_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_diamond_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_gold_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_hepatizon_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_iron_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_manyullyn_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_netherite_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_pig_iron_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_queens_slime_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_rock_stone_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_rose_gold_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_slimesteel_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_wood_head_bone_binding_primative', 10],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_ardite_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_bone_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_cobalt_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_diamond_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_gold_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_hepatizon_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_iron_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_manyullyn_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_netherite_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_pig_iron_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_queens_slime_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_rock_stone_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_rose_gold_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_slimesteel_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_wood_head_iron_binding_primative', 19],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_ardite_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_bone_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_cobalt_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_diamond_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_gold_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_hepatizon_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_iron_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_manyullyn_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_netherite_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_pig_iron_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_queens_slime_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rock_stone_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rose_gold_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_slimesteel_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_wood_head_pig_iron_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_ardite_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_bone_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_cobalt_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_diamond_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_gold_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_hepatizon_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_iron_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_manyullyn_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_netherite_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_pig_iron_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_queens_slime_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rock_stone_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rose_gold_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_slimesteel_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_wood_head_diamond_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_ardite_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_bone_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_cobalt_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_diamond_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_gold_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_hepatizon_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_iron_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_manyullyn_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_netherite_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_pig_iron_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_queens_slime_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rock_stone_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rose_gold_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_slimesteel_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_wood_head_cobalt_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_ardite_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_bone_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_cobalt_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_diamond_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_gold_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_hepatizon_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_iron_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_manyullyn_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_netherite_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_pig_iron_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_queens_slime_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rock_stone_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rose_gold_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_slimesteel_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_wood_head_slimesteel_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_ardite_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_bone_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_cobalt_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_diamond_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_gold_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_hepatizon_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_iron_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_manyullyn_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_netherite_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_pig_iron_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_queens_slime_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rock_stone_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rose_gold_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_slimesteel_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_wood_head_amethyst_bronze_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_ardite_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_bone_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_cobalt_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_diamond_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_gold_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_hepatizon_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_iron_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_manyullyn_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_netherite_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_pig_iron_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_queens_slime_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rock_stone_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rose_gold_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_slimesteel_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_wood_head_netherite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_ardite_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_bone_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_cobalt_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_diamond_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_gold_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_hepatizon_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_iron_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_manyullyn_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_netherite_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_pig_iron_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_queens_slime_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rock_stone_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rose_gold_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_slimesteel_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_wood_head_ardite_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_ardite_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_bone_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_cobalt_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_diamond_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_gold_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_hepatizon_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_iron_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_manyullyn_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_netherite_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_pig_iron_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_queens_slime_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rock_stone_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rose_gold_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_slimesteel_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_wood_head_queens_slime_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_ardite_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_bone_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_cobalt_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_diamond_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_gold_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_hepatizon_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_iron_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_manyullyn_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_netherite_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_pig_iron_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_queens_slime_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rock_stone_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rose_gold_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_slimesteel_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_wood_head_manyullyn_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_amethyst_bronze_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_ardite_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_bone_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_cobalt_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_diamond_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_gold_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_hepatizon_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_iron_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_manyullyn_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_netherite_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_pig_iron_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_queens_slime_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rock_stone_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_rose_gold_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_slimesteel_head_hepatizon_binding_primative', 99],
    ['ftb_tc:pickaxe_handle_wood_head_hepatizon_binding_primative', 99]])

system.afterEvents.scriptEventReceive.subscribe(({ sourceEntity }) => {
    sourceEntity.remove();
}, { namespaces: ['gf_wu_barrier'] })

system.afterEvents.scriptEventReceive.subscribe(event => {

    const { sourceEntity } = event;

    if (!sourceEntity) return;

    const player = sourceEntity.dimension.getPlayers({ location: sourceEntity.location })[0];

    if (sourceEntity.typeId != 'gf_wu:void_chest_entity') return;

    if (!getConfig(Configs.VoidChest)) { configFailedMessage(player); return }

    const inventory = sourceEntity.getComponent('inventory')?.container
    if (!inventory) return;

    let count = 0;

    for (let i = 0; i < inventory.size; i++) {
        count += inventory.getItem(i)?.amount || 0
    }

    if (count > 0) world.scoreboard.getObjective(SCOREBOARD_ID)?.addScore(VOIDCHEST_STAT, count)

    inventory.clearAll()

}, { namespaces: ['gf_wu'] })

system.beforeEvents.startup.subscribe(({ blockComponentRegistry, itemComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent('gf_wu:experience_extractor', {
        onPlayerInteract({ player }) {
            if (!getConfig(Configs.ExperienceExtractor)) { configFailedMessage(player); return }
            showXpMenu(player)
        }
    })

    blockComponentRegistry.registerCustomComponent('gf_wu:tanning_rack', {
        onPlayerInteract({ player, block }) {
            if (!getConfig(Configs.TanningRack)) { configFailedMessage(player); return; }
            if (player.isSneaking) return;
            handleTanningRackInteraction(block, player, false);
        }
    })

    blockComponentRegistry.registerCustomComponent('gf_wu:disenchanter', new DisenchanterComponent())
    blockComponentRegistry.registerCustomComponent('gf_wu:suction_hopper', new SuctionHopperComponent())

    itemComponentRegistry.registerCustomComponent('gf_wu:watering_can', new WateringCanComponent())
    itemComponentRegistry.registerCustomComponent('gf_wu:empty_watering_can', new EmptyWateringCanComponent())

    itemComponentRegistry.registerCustomComponent('gf_wu:experience_bottle', {
        onUse({ source, itemStack }) {
            let xpAmount = parseInt(itemStack.getLore()?.[1].split(' ')[1]);
            if (!xpAmount) return;
            while (xpAmount > 0) {
                const amount = Math.min(16777216, xpAmount);
                source.addExperience(amount)
                xpAmount -= amount
            }
            world.scoreboard.getObjective(SCOREBOARD_ID)?.addScore(EXPERIENCEBOTTLE_STAT, xpAmount);
            source.playSound('random.orb')
            source.getComponent('equippable')?.setEquipment('Mainhand')
            source.playSound('random.glass')
        }
    })

    itemComponentRegistry.registerCustomComponent('gf_wu:show_form', {
        onUse({ itemStack, source }) {
            switch (itemStack.typeId) {
                case 'gf_wu:guide_book': showMainMenu(source)
                    break;
                case 'gf_wu:controller': showCreativeMenu(source)
                    break;
                case 'gf_wu:update_book': showUpdateMenu(source)
                    break;
                case 'gf_wu:homes': showHomeMenu(source)
                    break;
                case 'gf_wu:warps': showWarpsMenu(source)
                    break;
            }
        }
    })

    itemComponentRegistry.registerCustomComponent('gf_wu:triggerable_item', {
        onUse({ itemStack, source }) {
            const typeId = itemStack.typeId.replace('_on', '')
            switch (typeId) {
                case 'gf_wu:treecapitator': handleTriggerableItem(source, itemStack, Configs.TreeCapitator, typeId, loreMap[typeId][0])
                    break;
                case 'gf_wu:vein_miner': handleTriggerableItem(source, itemStack, Configs.VeinMiner, typeId, loreMap[typeId][0])
                    break;
                case 'gf_wu:miners_essentials': handleTriggerableItem(source, itemStack, Configs.MinersEssentials, typeId, loreMap[typeId][0])
                    break;
                case 'gf_wu:chunk_borders': handleTriggerableItem(source, itemStack, Configs.ChunkBorders, typeId, loreMap[typeId][0])
                    break;
                case 'gf_wu:bridge_builder': handleTriggerableItem(source, itemStack, Configs.BridgeBuilder, typeId, loreMap[typeId][0])
                    break;
                case 'gf_wu:magnet': handleTriggerableItem(source, itemStack, Configs.Magnet, typeId, loreMap[typeId][0])
                    break;
                case 'gf_wu:fast_place':
                    if (!source.isSneaking) handleTriggerableItem(source, itemStack, Configs.FastPlace, typeId, loreMap[typeId][0]);
                    else showFastplaceMenu(source)
                    break;
            }
        }
    })

    itemComponentRegistry.registerCustomComponent('gf_wu:tool_durability', {
        onBeforeDurabilityDamage(e) {
            const itemStack = e.itemStack;

            if (!itemStack?.typeId?.startsWith('gf_wu:')) return;

            e.durabilityDamage = 0;
        },

        onHitEntity(e) {
            return;
        },

        onMineBlock(e) {
            const { source: player, itemStack } = e;
            if (!itemStack) return;
            if (player.getGameMode() === 'Creative') return;

            if (
                (itemStack.typeId === "gf_wu:excavator_shovel" && !getConfig(Configs.ExcavatorShovelDurability)) ||
                (itemStack.typeId === "gf_wu:excavator_shovel_netherite" && !getConfig(Configs.ExcavatorShovelDurability)) ||
                (itemStack.typeId === "gf_wu:explosive_pickaxe" && !getConfig(Configs.ExplosivePickaxeDurability)) ||
                (itemStack.typeId === "gf_wu:harvester_hoe" && !getConfig(Configs.HarvesterHoeDurability)) ||
                (itemStack.typeId === "gf_wu:harvester_hoe_netherite" && !getConfig(Configs.HarvesterHoeDurability)) ||
                (itemStack.typeId === "gf_wu:multiblock_pickaxe" && !getConfig(Configs.MultiblockPickaxeDurability)) ||
                (itemStack.typeId === "gf_wu:multiblock_pickaxe_netherite" && !getConfig(Configs.MultiblockPickaxeDurability)) ||
                (itemStack.typeId === "gf_wu:quarry_pickaxe" && !getConfig(Configs.QuarryPickaxeDurability)) ||
                (itemStack.typeId === "gf_wu:quarry_pickaxe_netherite" && !getConfig(Configs.QuarryPickaxeDurability)) ||
                (itemStack.typeId === "gf_wu:deep_digger_shovel" && !getConfig(Configs.DeepDiggerShovelDurability)) ||
                (itemStack.typeId === "gf_wu:deep_digger_shovel_netherite" && !getConfig(Configs.DeepDiggerShovelDurability)) ||
                (itemStack.typeId === "gf_wu:omni_tool" && !getConfig(Configs.OmniToolDurability)) ||
                (itemStack.typeId === "gf_wu:omni_tool_netherite" && !getConfig(Configs.OmniToolDurability)) ||
                (itemStack.typeId === "gf_wu:safari_net") ||
                (itemStack.typeId === "gf_wu:safari_net_full") ||
                (itemStack.typeId === "gf_wu:watering_can") ||
                (itemStack.typeId === "gf_wu:watering_can_filled") ||
                (itemStack.typeId === "gf_wu:end_frame_breaker") ||
                (itemStack.typeId === "gf_wu:amethyst_breaker")
            ) return;

            // Unbreaking roll
            const unbLvl = itemStack.getComponent('enchantable')?.getEnchantment('unbreaking')?.level || 0;
            const chanceToDamage = 100 / (unbLvl + 1);
            if ((Math.random() * 100) > chanceToDamage) return;

            const d = itemStack.getComponent('durability');
            try {
                d.damage += 1;
                player.getComponent('equippable').setEquipment('Mainhand', itemStack);
            } catch {
                player.getComponent('equippable').setEquipment('Mainhand');
                player.playSound('random.break', { location: player.location });
            }
        }
    });

})

const fastPlaceBlockBlackList = [
    'gf_wu:grab_bag',
    'gf_wu:black_grab_bag',
    'gf_wu:blue_grab_bag',
    'gf_wu:cyan_grab_bag',
    'gf_wu:gray_grab_bag',
    'gf_wu:green_grab_bag',
    'gf_wu:light_blue_grab_bag',
    'gf_wu:light_gray_grab_bag',
    'gf_wu:lime_grab_bag',
    'gf_wu:magenta_grab_bag',
    'gf_wu:orange_grab_bag',
    'gf_wu:pink_grab_bag',
    'gf_wu:purple_grab_bag',
    'gf_wu:red_grab_bag',
    'gf_wu:white_grab_bag',
    'gf_wu:yellow_grab_bag',
    'gf_wu:grab_bag_empty',
    'gf_wu:black_grab_bag_empty',
    'gf_wu:blue_grab_bag_empty',
    'gf_wu:cyan_grab_bag_empty',
    'gf_wu:gray_grab_bag_empty',
    'gf_wu:green_grab_bag_empty',
    'gf_wu:light_blue_grab_bag_empty',
    'gf_wu:light_gray_grab_bag_empty',
    'gf_wu:lime_grab_bag_empty',
    'gf_wu:magenta_grab_bag_empty',
    'gf_wu:orange_grab_bag_empty',
    'gf_wu:pink_grab_bag_empty',
    'gf_wu:purple_grab_bag_empty',
    'gf_wu:red_grab_bag_empty',
    'gf_wu:white_grab_bag_empty',
    'gf_wu:yellow_grab_bag_empty',
    'gf_wu:void_chest',
    'gf_wu:vault',
    "minecraft:undyed_shulker_box",
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
]

world.afterEvents.playerPlaceBlock.subscribe(event => {
    const { block, player, dimension } = event;

    const tags = player.getTags()
    const tag = tags.find(tag => tag.startsWith('gfwu:fastplace'))
    if (!tag) return;

    if (!hasItemOrEffect(player, 'gf_wu:fast_place_on')) return;

    if (!getConfig(Configs.FastPlace)) { configFailedMessage(player); return }

    if (fastPlaceBlockBlackList.includes(block.typeId)) { failedChat({ translate: 'gf_wu:fast_place.incompatible_block' }, player); return }

    const length = parseInt(tag.slice(14, -1))
    const direction = tag.slice(-1)
    let blockFace = player.getBlockFromViewDirection().face;

    let offset = { x: 0, y: 0, z: 0 }
    const { x, y, z, permutation } = block;

    if (direction == 'h' && (blockFace == 'Up' || blockFace == 'Down')) blockFace = getInvertedCardinalDirection(player.getViewDirection())

    if (blockFace == 'East') offset.x = -1
    else if (blockFace == 'West') offset.x = 1
    else if (blockFace == 'South') offset.z = -1
    else if (blockFace == 'North') offset.z = 1

    if (direction == 'v') { offset.x = 0; offset.z = 0, offset.y = 1 }

    const isCreative = player.getGameMode() == GameMode.Creative

    for (let i = 1; i < length; i++) {
        const otherBlock = dimension.getBlock({ x: offset.x * i + x, z: offset.z * i + z, y: y + offset.y * i })
        if (!otherBlock.isAir) continue;
        if (!isCreative && !player.runCommand(`testfor @s[hasitem={item=${block.typeId}}]`).successCount) break;
        otherBlock.setPermutation(permutation)
        if (!isCreative) player.runCommand(`clear @s ${block.typeId} 0 1`)
    }

})

system.afterEvents.scriptEventReceive.subscribe(event => {
    const { sourceEntity } = event;
    if (!sourceEntity) return;
    if (!getConfig(Configs.FastPlace)) return;
    if (hasItemOrEffect(sourceEntity, 'gf_wu:fast_place_on')) sourceEntity.onScreenDisplay.setActionBar({ translate: 'gf_wu:fast_place.is_active' })
}, { namespaces: ['gf_wu_warn'] })

world.beforeEvents.playerBreakBlock.subscribe(event => {
    const { block } = event;
    if (!isBridgeBuilderBlock(block.typeId)) return;

    event.cancel = true;
    const key = bridgeBuilderKey(block.dimension.id, block.location);
    const placement = bridgeBuilderPlacements.get(key);

    system.run(() => {
        if (placement) restoreBridgeBuilderPlacement(placement);
        else if (safeGetBlock(block.dimension, block.location)?.typeId === block.typeId) block.setType('minecraft:air');
    });
})

world.afterEvents.playerPlaceBlock.subscribe(event => {
    const { block } = event;
    if (!isBridgeBuilderBlock(block.typeId)) return;

    block.setType('minecraft:air');
})

world.afterEvents.playerPlaceBlock.subscribe(event => {
    const { block, dimension, player } = event;

    const chest = block.getComponent('inventory').container;

    if (chest.size != 54) return;

    const otherBlock = identifyOtherHalf(block, chest)

    if (!dimension.getEntitiesAtBlockLocation(otherBlock.below()).filter(x => x.typeId.startsWith('gf_wu:lock_barrier')).flatMap(x => x.getDynamicProperty('gf_wu:chests').split('|').map(y => JSON.parse(y))).some(loc => vectorEquals(loc, otherBlock.location))) return;

    block.setType('air'); dimension.spawnItem(new ItemStack('chest'), block.center());
    failed({ translate: 'gf_wu:cannot_place_chest' }, player)

}, { blockTypes: ['minecraft:chest', 'minecraft:trapped_chest'] })

world.afterEvents.playerPlaceBlock.subscribe(({ block }) => {

    block.dimension.spawnEntity('gf_wu:void_chest_entity', block.bottomCenter()).nameTag = 'Cofre de vacío'

}, { blockTypes: ['gf_wu:void_chest'] })

world.afterEvents.playerPlaceBlock.subscribe(({ block, player, dimension }) => {

    const entity = block.dimension.spawnEntity('gf_wu:grab_bag_entity', block.bottomCenter())
    entity.nameTag = 'Bolsa de almacenamiento';
    const { x, y, z } = block.location
    world.setDynamicProperty(`grab_bag:${dimension.id}_${x}_${y}_${z}`, entity.id)

    if (!grabBigListener.has(player.id)) return;

    const encodedNum = grabBigListener.get(player.id);
    const num = encodedNum
        .replace(/§v/g, "-")  // Convert §v back to -
        .replace(/§(.)/g, "$1")  // Convert §X back to X (where X is any character)
        .trim();

    const inventory = entity.getComponent('inventory').container;
    const bottomLocation = { x: x, y: dimension.id == 'minecraft:overworld' ? -64 : 0, z: z };
    const bottomBlock = dimension.getBlock(bottomLocation);
    const previous = bottomBlock.permutation;
    dimension.runCommand(`structure load gf_wu:grabBag_${num} ${bottomLocation.x} ${bottomLocation.y} ${bottomLocation.z}`)
    const chest = bottomBlock.getComponent('inventory').container;
    for (let i = 0; i < 5; i++) {
        const element = chest.getItem(i);
        if (element) inventory.setItem(i, element)
    }

    // Convert empty bag to filled variant when items are loaded
    if (inventory.emptySlotsCount < 5 && block.typeId.endsWith('_empty')) {
        const filledTypeId = block.typeId.replace('_empty', '');
        block.setType(filledTypeId);
    }
    dimension.runCommand(`structure delete "gf_wu:grabBag_${num}"`)
    chest.clearAll();
    bottomBlock.setPermutation(previous);
    grabBigListener.delete(player.id)

}, { blockTypes: ['gf_wu:grab_bag', 'gf_wu:black_grab_bag', 'gf_wu:blue_grab_bag', 'gf_wu:cyan_grab_bag', 'gf_wu:gray_grab_bag', 'gf_wu:green_grab_bag', 'gf_wu:light_blue_grab_bag', 'gf_wu:light_gray_grab_bag', 'gf_wu:lime_grab_bag', 'gf_wu:magenta_grab_bag', 'gf_wu:orange_grab_bag', 'gf_wu:pink_grab_bag', 'gf_wu:purple_grab_bag', 'gf_wu:red_grab_bag', 'gf_wu:white_grab_bag', 'gf_wu:yellow_grab_bag', 'gf_wu:grab_bag_empty', 'gf_wu:black_grab_bag_empty', 'gf_wu:blue_grab_bag_empty', 'gf_wu:cyan_grab_bag_empty', 'gf_wu:gray_grab_bag_empty', 'gf_wu:green_grab_bag_empty', 'gf_wu:light_blue_grab_bag_empty', 'gf_wu:light_gray_grab_bag_empty', 'gf_wu:lime_grab_bag_empty', 'gf_wu:magenta_grab_bag_empty', 'gf_wu:orange_grab_bag_empty', 'gf_wu:pink_grab_bag_empty', 'gf_wu:purple_grab_bag_empty', 'gf_wu:red_grab_bag_empty', 'gf_wu:white_grab_bag_empty', 'gf_wu:yellow_grab_bag_empty'] })

world.afterEvents.entityDie.subscribe(event => {

    const { deadEntity: player } = event;
    const { dimension } = player;

    const location = player.location;

    if (usersInForm.get(player.id)) { uiManager.closeAllForms(player); usersInForm.set(player.id, false) }

    if (!getConfig(Configs.DeathWaypoint)) return;

    player.sendMessage([{ translate: 'gf_wu:death_waypoint.message' }, ` §cX:§r ${Math.floor(location.x)} §aY:§r ${Math.floor(location.y)} §bZ:§r ${Math.floor(location.z)}`, { translate: 'gf_wu:death_waypoint.in' }, dimension.id.split(':').pop().replace(/_/g, ' ')])

    if (location.y < 0 && dimension.id.includes('end')) { location.y = 1; dimension.getBlock(location).below().setType('bedrock') };

    const waypoint = dimension.spawnEntity('gf_wu:death_waypoint', location)
    const inventory = waypoint.getComponent('inventory').container;
    waypoint.setDynamicProperty('gf_wu:owner', player.id)

    const playerRot = player.getRotation()
    dimension.getEntities({ type: 'item', location: player.location, maxDistance: 10 }).forEach(entity => {
        const entityRot = entity.getRotation()
        if (entityRot.x.toFixed(3) != playerRot.x.toFixed(3) && entityRot.y.toFixed(3) != playerRot.y.toFixed(3) && entityRot.x != 0 && entityRot.y != 0) return;
        inventory.addItem(entity.getComponent('item').itemStack);
        entity.remove();
    })

    const run = system.runInterval(() => {

        if (!waypoint.isValid || inventory === undefined || inventory?.emptySlotsCount == 54) { system.clearRun(run); if (dimension.id.includes('end')) dimension.getBlock(waypoint.location).below().setType('air'); if (waypoint.isValid) waypoint.remove(); return }

        let lastItem;

        for (let i = 27; i < inventory.size; i++) {
            if (!inventory.getItem(i)) continue;
            lastItem = i
        }

        if (!lastItem) return;

        for (let i = 0; i < 27; i++) {
            if (inventory.getItem(i)) continue;
            inventory.moveItem(lastItem, i, inventory)
            break;
        }

    }, 10)

}, { entityTypes: ['minecraft:player'] })

world.beforeEvents.playerBreakBlock.subscribe(event => {

    const { block, itemStack, player } = event;

    const enchantable = itemStack?.getComponent('enchantable');
    const hasSilkTouch = enchantable?.hasEnchantment('silk_touch');

    if (CHEST_BLOCKS.includes(block.typeId)) {
        const barriers = block.dimension.getEntitiesAtBlockLocation(block.y > -64 ? block.below() : block).filter(x => x.typeId.startsWith('gf_wu:lock_barrier'))
        const barrierLocations = barriers.flatMap(x => x.getDynamicProperty('gf_wu:chests').split('|').map(y => JSON.parse(y)))
        if (barrierLocations.some(a => vectorEquals(a, block.location))) {
            const target = barriers[0];
            if (player.getGameMode() != 'Creative') {
                event.cancel = true;
                system.run(() => {
                    failed({ translate: 'gf_wu:chest.is_locked' }, player)
                })
            } else {
                system.run(() => {
                    target.remove();
                })
            }
        }
    }

    if (isGrabBag(block.typeId)) {
        const blockId = block.typeId;
        const blockLocation = { ...block.location };
        const { dimension } = block;
        event.cancel = true;
        system.run(() => {
            try {
                block.setType('air');
                recoverGrabBagDrop(player, dimension, blockLocation, blockId);
            } catch (error) {
                console.warn(error);
            }
        });
        return;
    }

    switch (itemStack?.typeId) {
        case 'gf_wu:excavator_shovel':
        case 'gf_wu:excavator_shovel_netherite':
            if (!getConfig(Configs.ExcavatorShovel)) { system.run(() => { configFailedMessage(player) }); event.cancel = true; return }
            if (getConfig(Configs.MinersEssentials) && hasItemOrEffect(player, 'gf_wu:miners_essentials_on')) {
                queueDirectSmelt(block.dimension.id, block.location, block.typeId);
            }
            performExcavatorShovelBreak(player, block, hasSilkTouch, getConfig(Configs.MinersEssentials) && hasItemOrEffect(player, 'gf_wu:miners_essentials_on'));
            break;
        case 'gf_wu:deep_digger_shovel':
        case 'gf_wu:deep_digger_shovel_netherite':
            if (!getConfig(Configs.DeepDiggerShovel)) { system.run(() => { configFailedMessage(player) }); event.cancel = true; return }
            if (getConfig(Configs.MinersEssentials) && hasItemOrEffect(player, 'gf_wu:miners_essentials_on')) {
                queueDirectSmelt(block.dimension.id, block.location, block.typeId);
            }
            performExcavatorShovelBreak(player, block, hasSilkTouch, getConfig(Configs.MinersEssentials) && hasItemOrEffect(player, 'gf_wu:miners_essentials_on'), 2, DEEPDIGGERSHOVEL_STAT);
            break;
        case 'gf_wu:omni_tool':
        case 'gf_wu:omni_tool_netherite':
            if (!getConfig(Configs.OmniTool)) { system.run(() => { configFailedMessage(player) }); event.cancel = true; }
            break;
        case 'gf_wu:explosive_pickaxe':
            if (!getConfig(Configs.ExplosivePickaxe)) { system.run(() => { configFailedMessage(player) }); event.cancel = true; }
            break;
        case 'gf_wu:harvester_hoe':
        case 'gf_wu:harvester_hoe_netherite':
            if (!getConfig(Configs.HarvesterHoe)) { system.run(() => { configFailedMessage(player) }); event.cancel = true; }
            break;
        case 'gf_wu:multiblock_pickaxe':
        case 'gf_wu:multiblock_pickaxe_netherite':
            if (!getConfig(Configs.MultiblockPickaxe)) { system.run(() => { configFailedMessage(player) }); event.cancel = true; return }
            performMultiblockPickaxeBreak(player, block, getConfig(Configs.MinersEssentials) && hasItemOrEffect(player, 'gf_wu:miners_essentials_on'), hasSilkTouch, enchantable.getEnchantment('fortune')?.level);
            break;
        case 'gf_wu:quarry_pickaxe':
        case 'gf_wu:quarry_pickaxe_netherite':
            if (!getConfig(Configs.QuarryPickaxe)) { system.run(() => { configFailedMessage(player) }); event.cancel = true; return }
            performMultiblockPickaxeBreak(player, block, getConfig(Configs.MinersEssentials) && hasItemOrEffect(player, 'gf_wu:miners_essentials_on'), hasSilkTouch, enchantable.getEnchantment('fortune')?.level, 2, QUARRYPICKAXE_STAT);
            break;
    }

})

world.beforeEvents.playerBreakBlock.subscribe(event => {
    const { block, player, itemStack } = event;

    if (!itemStack || (itemStack.typeId !== 'gf_wu:harvester_hoe' && itemStack.typeId !== 'gf_wu:harvester_hoe_netherite')) return;

    const brokenBlockPermutation = block.permutation;
    const blockTypeId = brokenBlockPermutation.type.id;

    if (blockTypeId === 'pod_farm:corn_seeds') {
        const layer = brokenBlockPermutation.getState('pod_farm:layer');

        if (layer === 0 || layer === 1 || layer === 2) {
            event.cancel = true;

            system.run(() => {
                const cropId = findCropId(brokenBlockPermutation);

                if (!getConfig(Configs.HarvesterHoe) && cropId) {
                    configFailedMessage(player);
                    return;
                }
                else if (cropId) {
                    let baseBlock = block;
                    if (layer === 1) {
                        baseBlock = block.below();
                    } else if (layer === 2) {
                        baseBlock = block.below().below();
                    }

                    const isFullyGrown = checkCornFullyGrown(baseBlock);

                    if (isFullyGrown) {
                        world.scoreboard.getObjective(SCOREBOARD_ID).addScore(HARVESTEREHOE_STAT, 1);

                        const blocksToBreak = [baseBlock, baseBlock.above(), baseBlock.above().above()];

                        blocksToBreak.forEach(cornBlock => {
                            try {
                                if (cornBlock && cornBlock.typeId === 'pod_farm:corn_seeds') {
                                    cornBlock.setType('air');
                                }
                            } catch (error) {

                            }
                        });

                        const cornItem = new ItemStack('pod_farm:corn', 1);
                        baseBlock.dimension.spawnItem(cornItem, baseBlock.location);

                        player.dimension.getEntities({ location: baseBlock.location, maxDistance: 1.5, type: 'item' }).forEach(item => {
                            const itemStack = item.getComponent('item').itemStack;
                            if (itemStack.typeId.includes('pod_farm:corn')) {
                                try {
                                    player.getComponent('inventory').container.addItem(itemStack);
                                    item.remove();
                                } catch (error) {
                                    item.teleport(player.location, { keepVelocity: false });
                                }
                            }
                        });

                        const freshCornPermutation = BlockPermutation.resolve('pod_farm:corn_seeds', {
                            'pod_farm:growth': 0,
                            'pod_farm:layer': 0
                        });

                        system.run(() => {
                            baseBlock.setPermutation(freshCornPermutation);
                        });

                        // Damage the harvester hoe
                        if (player.getGameMode() !== 'Creative' && getConfig(Configs.HarvesterHoeDurability)) {
                            const unbLvl = itemStack.getComponent('enchantable')?.getEnchantment('unbreaking')?.level || 0;
                            const chanceToDamage = 100 / (unbLvl + 1);
                            if ((Math.random() * 100) <= chanceToDamage) {
                                const d = itemStack.getComponent('durability');
                                try {
                                    d.damage += 1;
                                    player.getComponent('equippable').setEquipment('Mainhand', itemStack);
                                } catch {
                                    player.getComponent('equippable').setEquipment('Mainhand');
                                    player.playSound('random.break', { location: player.location });
                                }
                            }
                        }
                    } else {
                        const blocksToRemove = [];

                        const layer1Block = baseBlock.above();
                        const layer2Block = baseBlock.above().above();

                        if (layer1Block && layer1Block.typeId === 'pod_farm:corn_seeds') {
                            blocksToRemove.push(layer1Block);
                        }

                        if (layer2Block && layer2Block.typeId === 'pod_farm:corn_seeds') {
                            blocksToRemove.push(layer2Block);
                        }

                        blocksToRemove.forEach(cornBlock => {
                            try {
                                cornBlock.setType('air');
                            } catch (error) {
                            }
                        });

                        const freshCornPermutation = BlockPermutation.resolve('pod_farm:corn_seeds', {
                            'pod_farm:growth': 0,
                            'pod_farm:layer': 0
                        });

                        system.run(() => {
                            baseBlock.setPermutation(freshCornPermutation);
                        });

                        // Damage the harvester hoe
                        if (player.getGameMode() !== 'Creative' && getConfig(Configs.HarvesterHoeDurability)) {
                            const unbLvl = itemStack.getComponent('enchantable')?.getEnchantment('unbreaking')?.level || 0;
                            const chanceToDamage = 100 / (unbLvl + 1);
                            if ((Math.random() * 100) <= chanceToDamage) {
                                const d = itemStack.getComponent('durability');
                                try {
                                    d.damage += 1;
                                    player.getComponent('equippable').setEquipment('Mainhand', itemStack);
                                } catch {
                                    player.getComponent('equippable').setEquipment('Mainhand');
                                    player.playSound('random.break', { location: player.location });
                                }
                            }
                        }
                    }
                }
            });
        }
    }
});

function checkCornFullyGrown(baseBlock) {
    try {
        // Check layer 0 (base)
        if (!baseBlock || baseBlock.typeId !== 'pod_farm:corn_seeds') {
            return false;
        }
        const layer0 = baseBlock.permutation.getState('pod_farm:layer');
        const growth0 = baseBlock.permutation.getState('pod_farm:growth');
        if (layer0 !== 0 || growth0 !== 6) {
            return false;
        }

        // Check layer 1 (middle)
        const middleBlock = baseBlock.above();
        if (!middleBlock || middleBlock.typeId !== 'pod_farm:corn_seeds') {
            return false;
        }
        const layer1 = middleBlock.permutation.getState('pod_farm:layer');
        const growth1 = middleBlock.permutation.getState('pod_farm:growth');
        if (layer1 !== 1 || growth1 !== 6) {
            return false;
        }

        // Check layer 2 (top)
        const topBlock = baseBlock.above().above();
        if (!topBlock || topBlock.typeId !== 'pod_farm:corn_seeds') {
            return false;
        }
        const layer2 = topBlock.permutation.getState('pod_farm:layer');
        const growth2 = topBlock.permutation.getState('pod_farm:growth');
        if (layer2 !== 2 || growth2 !== 6) {
            return false;
        }

        return true;
    } catch (error) {
        return false;
    }
}

world.afterEvents.playerBreakBlock.subscribe(event => {

    const { block, brokenBlockPermutation, player, itemStackBeforeBreak } = event;

    const blockId = brokenBlockPermutation.type.id
    const dimension = player.dimension;
    const { x, y, z } = block.location

    if (hasItemOrEffect(player, 'gf_wu:miners_essentials_on')) {
        if (getConfig(Configs.MinersEssentials)) {
            const usedExcavator =
                itemStackBeforeBreak?.typeId == 'gf_wu:excavator_shovel' ||
                itemStackBeforeBreak?.typeId == 'gf_wu:excavator_shovel_netherite' ||
                itemStackBeforeBreak?.typeId == 'gf_wu:deep_digger_shovel' ||
                itemStackBeforeBreak?.typeId == 'gf_wu:deep_digger_shovel_netherite';
            if (!(usedExcavator && (blockId == 'minecraft:sand' || blockId == 'minecraft:red_sand'))) {
                smeltNearestItem(dimension, block.location, blockId, true)
            }
        }
        else configFailedMessage(player)
    }

    if (blockId == 'gf_wu:void_chest') try {
        block.dimension.getEntities({ type: 'gf_wu:void_chest_entity', location: block })[0].triggerEvent('poof')
    } catch (error) { }

    if (isGrabBag(blockId)) try {
        const entityId = world.getDynamicProperty(`grab_bag:${dimension.id}_${x}_${y}_${z}`)
        const grabBag = world.getEntity(entityId)
        const inventory = grabBag.getComponent('inventory').container;
        // Determine if bag is empty or filled, return appropriate variant
        const isEmpty = inventory.emptySlotsCount == 5;
        const baseTypeId = blockId.replace('_empty', '');
        const bagTypeId = isEmpty ? (baseTypeId + '_empty') : baseTypeId;
        const bagItem = new ItemStack(bagTypeId);
        if (getConfig(Configs.GrabBag)) {
            if (isEmpty) {
                bagItem.setLore(loreMap[baseTypeId] || loreMap['gf_wu:grab_bag'])
            } else {
                const bottomLocation = { x: block.x, y: dimension.id == 'minecraft:overworld' ? -64 : 0, z: block.z };
                const bottomBlock = dimension.getBlock(bottomLocation);
                const previous = bottomBlock.permutation;
                bottomBlock.setType('chest');
                const chest = bottomBlock.getComponent('inventory').container;
                const bagCount = world.getDynamicProperty('grabBagCount');
                const lore = [setupIdForLore(`${bagCount}`)]
                for (let i = 0; i < 5; i++) {
                    const element = inventory.getItem(i);
                    if (element) { chest.setItem(i, element); lore.push('§r§7' + format(element.typeId) + (element.amount > 1 ? ' x' + element.amount : '')) }
                }
                dimension.runCommand(`execute positioned ${bottomLocation.x} ${bottomLocation.y} ${bottomLocation.z} run structure save gf_wu:grabBag_${bagCount} ~ ~ ~ ~ ~ ~ false disk true`)
                chest.clearAll();
                bottomBlock.setPermutation(previous);
                world.setDynamicProperty('grabBagCount', bagCount + 1);
                bagItem.setLore([...(loreMap[blockId] || loreMap['gf_wu:grab_bag'])].concat(lore))
            }
            if (player.getGameMode() !== GameMode.Creative || bagItem.getLore().length > 1) dimension.spawnItem(bagItem, block)
        } else {
            for (let i = 0; i < 5; i++) {
                const element = inventory.getItem(i);
                if (element) dimension.spawnItem(element, block)
            }
            bagItem.setLore(loreMap[blockId] || loreMap['gf_wu:grab_bag'])
            if (player.getGameMode() !== GameMode.Creative) dimension.spawnItem(bagItem, block)
        }
        grabBag.triggerEvent('exit');
        world.setDynamicProperty(`grab_bag:${dimension.id}_${x}_${y}_${z}`)
    } catch (error) {
        console.warn(error)
    }

    if (itemStackBeforeBreak) {

        switch (itemStackBeforeBreak.typeId) {

            case 'gf_wu:explosive_pickaxe': performExplosivePickaxeBreak(player, block, undefined, getConfig(Configs.MinersEssentials) && hasItemOrEffect(player, 'gf_wu:miners_essentials_on'), itemStackBeforeBreak.getComponent('enchantable').hasEnchantment('silk_touch'), itemStackBeforeBreak.getComponent('enchantable').getEnchantment('fortune')?.level)
                break;
            case 'gf_wu:omni_tool':
            case 'gf_wu:omni_tool_netherite': world.scoreboard.getObjective(SCOREBOARD_ID).addScore(OMNITOOL_STAT, 1)
                break;
            case 'gf_wu:harvester_hoe':
            case 'gf_wu:harvester_hoe_netherite':
                // Handle non-corn crops here
                const cropId = findCropId(brokenBlockPermutation);

                // Skip corn seeds as they're handled in beforeEvent
                if (brokenBlockPermutation.type.id === 'pod_farm:corn_seeds') return;

                if (!getConfig(Configs.HarvesterHoe) && cropId) {
                    configFailedMessage(player);
                    return;
                }
                else if (cropId) {
                    system.run(() => {
                        world.scoreboard.getObjective(SCOREBOARD_ID).addScore(HARVESTEREHOE_STAT, 1);

                        // Your original item collection code for other crops
                        player.dimension.getEntities({ location: block.location, maxDistance: 1.5, type: 'item' }).forEach(item => {
                            const itemStack = item.getComponent('item').itemStack;
                            if (itemStack.typeId.includes(cropId.split('_').slice(0, -2)) ||
                                (itemStack.typeId == 'melon' && cropId == 'melon_block') ||
                                (itemStack.typeId.includes('pod_farm:corn') && cropId == 'pod_farm:corn')) {
                                try {
                                    player.getComponent('inventory').container.addItem(itemStack);
                                    item.remove();
                                } catch (error) {
                                    item.teleport(player.location, { keepVelocity: false });
                                }
                            }
                        });

                        if (!isSeed(cropId)) return;
                        if (cropId == 'pitcher_pod' && brokenBlockPermutation.getState('growth') == 4) return;

                        let perm = {};

                        // Handle replanting
                        try {
                            player.runCommand(`clear @s pod_farm:${cropId} 0 1`);
                            perm = BlockPermutation.resolve(seedToBlock("pod_farm:" + cropId));
                        } catch (e) {
                            player.runCommand(`clear @s ${cropId} 0 1`);
                            perm = BlockPermutation.resolve(seedToBlock(cropId));
                        }

                        if (cropId == 'cocoa_beans') {
                            block.setPermutation(brokenBlockPermutation.withState('age', 0));
                        } else if (cropId == 'pitcher_pod' && brokenBlockPermutation.getState('upper_block_bit') && brokenBlockPermutation.getState('growth') == 3) {
                            block.below().setPermutation(perm);
                        } else {
                            block.setPermutation(perm);
                        }

                        // Damage the harvester hoe
                        if (player.getGameMode() !== 'Creative' && getConfig(Configs.HarvesterHoeDurability)) {
                            const currentItem = player.getComponent('equippable').getEquipment('Mainhand');
                            if (currentItem && (currentItem.typeId === 'gf_wu:harvester_hoe' || currentItem.typeId === 'gf_wu:harvester_hoe_netherite')) {
                                const unbLvl = currentItem.getComponent('enchantable')?.getEnchantment('unbreaking')?.level || 0;
                                const chanceToDamage = 100 / (unbLvl + 1);
                                if ((Math.random() * 100) <= chanceToDamage) {
                                    const d = currentItem.getComponent('durability');
                                    try {
                                        d.damage += 1;
                                        player.getComponent('equippable').setEquipment('Mainhand', currentItem);
                                    } catch {
                                        player.getComponent('equippable').setEquipment('Mainhand');
                                        player.playSound('random.break', { location: player.location });
                                    }
                                }
                            }
                        }
                    });
                }
                break;
        }

    }

    const id = findWoodId(brokenBlockPermutation)

    if (!itemStackBeforeBreak && !id) return;

    if (id) {

        try {
            if (hasItemOrEffect(player, 'gf_wu:treecapitator_on')) {
                if (!getConfig(Configs.TreeCapitator)) { configFailedMessage(player); return }
                else mineTree(block, id, !itemStackBeforeBreak ? false : itemStackBeforeBreak.getComponent('enchantable')?.hasEnchantment('silk_touch'), player, itemStackBeforeBreak)
            }
        } catch (error) {
            // Avoid error from hasItem()
        }

    } else {

        const gravelConfig = getConfig(Configs.VeinminerGravel)

        const id2 = findOreId(brokenBlockPermutation)?.replace('lit_', '') || (gravelConfig && blockId.includes('gravel') ? 'gravel' : undefined)

        if (!id2) return;

        if (id2 !== 'gravel') {
            if (pickaxeTiers.get(itemStackBeforeBreak.typeId) === undefined) return;
            if (pickaxeTiers.get(itemStackBeforeBreak.typeId) < getOres().indexOf(id2)) return;
        }

        if (!itemStackBeforeBreak && id2 != 'gravel') return;

        try {
            if (hasItemOrEffect(player, 'gf_wu:vein_miner_on')) {
                if (!getConfig(Configs.VeinMiner)) { configFailedMessage(player); return }
                else mineOres(block, id2, getConfig(Configs.MinersEssentials) && hasItemOrEffect(player, 'gf_wu:miners_essentials_on'), itemStackBeforeBreak.getComponent('enchantable').hasEnchantment('silk_touch'), itemStackBeforeBreak.getComponent('enchantable').getEnchantment('fortune')?.level, player, itemStackBeforeBreak)
            }
        } catch (error) {
            // Avoid error from hasItem()
        }

    }

})

world.afterEvents.entityHitBlock.subscribe(event => {

    const source = event.damagingEntity
    const itemStack = source.getComponent('equippable').getEquipment('Mainhand')
    const block = event.hitBlock
    const blockId = block.typeId

    if (!itemStack) return;

    if (itemStack.typeId == 'gf_wu:spawner_wrench' && blockId.includes('mob_spawner') && !getConfig(Configs.ChooseSpawner)) performSpawnBreak(source, itemStack, block)
    else if (itemStack.typeId == 'gf_wu:spawner_wrench' && blockId.includes('mob_spawner') && getConfig(Configs.ChooseSpawner)) performSpawnChoose(source, itemStack, block)
    else if (itemStack.typeId == 'gf_wu:end_frame_breaker' && blockId.includes('end_portal_frame')) performEndFrameBreak(source, itemStack, block)
    else if (itemStack.typeId == 'gf_wu:amethyst_breaker' && blockId.includes('budding_amethyst')) performAmethystBreak(source, itemStack, block)

})

world.afterEvents.itemUse.subscribe(event => {

    const { itemStack, source } = event;

    if (itemStack.typeId == 'gf_wu:ocean_rider') {
        if (!getConfig(Configs.OceanRider)) { configFailedMessage(source); return; }

        const placementBlock = findOceanRiderPlacementBlock(source);
        if (!placementBlock) {
            failed({ translate: 'gf_wu:ocean_rider.no_water' }, source);
            return;
        }

        if (!canPlaceOceanRiderAt(source.dimension, placementBlock.location)) {
            failed({ translate: 'gf_wu:ocean_rider.no_space' }, source);
            return;
        }

        const spawnLocation = {
            x: placementBlock.location.x + 0.5,
            y: placementBlock.location.y + 0.2,
            z: placementBlock.location.z + 0.5
        };
        const oceanRider = source.dimension.spawnEntity('gf_wu:ocean_rider', spawnLocation);
        const storedFuel = itemStack.getDynamicProperty(OCEAN_RIDER_ITEM_FUEL_DP);
        oceanRider.setDynamicProperty(OCEAN_RIDER_FUEL_DP, typeof storedFuel === 'number' ? storedFuel : MAX_FUEL);

        if (source.getGameMode() !== GameMode.Creative) decrementHeldItem(itemStack, source.getComponent('equippable'));
        return;
    }

    if (itemStack.typeId != 'minecraft:coal' && itemStack.typeId != 'minecraft:charcoal') return;

    const mountedOceanRider = getMountedOceanRider(source);
    if (mountedOceanRider && getConfig(Configs.OceanRider)) {
        if (getOceanRiderFuel(mountedOceanRider) === MAX_FUEL) return;
        updateOceanRiderFuel(mountedOceanRider, MAX_FUEL * 0.1)
        decrementHeldItem(itemStack, source.getComponent('equippable'))
        source.playSound('fire.ignite')
        return;
    }

    if (!getConfig(Configs.Jetpack)) return;

    if (getFuel(source) == MAX_FUEL) return;
    updateFuel(source, MAX_FUEL * 0.1)
    decrementHeldItem(itemStack, source.getComponent('equippable'))
    source.playSound('fire.ignite')

})

world.afterEvents.itemStartUseOn.subscribe(event => {
    const { itemStack, source: player, block, blockFace } = event
    if (!itemStack) return;

    if (!itemStack.typeId.startsWith('gf_wu') || itemStack.typeId.includes('void')) return;

    if (!getConfig(Configs.Durability)) return;

    const component = itemStack.getComponent('durability')
    if ((itemStack.typeId == 'gf_wu:omni_tool' || itemStack.typeId == 'gf_wu:omni_tool_netherite') && !getConfig(Configs.OmniToolDurability)) return;

    if (!(itemStack.hasTag('minecraft:is_shovel') && block.typeId == 'minecraft:grass_path') && !(itemStack.hasTag('minecraft:is_hoe') && block.typeId == 'minecraft:farmland') && !(itemStack.hasTag('minecraft:is_axe') && (block.typeId.includes('log') || block.typeId.includes('stem') || block.typeId.includes('wood') || block.typeId.includes('hyphae')))) return;

    if (itemStack.hasTag('minecraft:is_hoe')) player.playSound('use.gravel', { location: block })
    if (itemStack.hasTag('minecraft:is_axe') && (block.typeId.includes('log') || block.typeId.includes('stem') || block.typeId.includes('wood') || block.typeId.includes('hyphae'))) player.playSound('use.wood', { location: block })
    if (itemStack.hasTag('minecraft:is_shovel')) player.playSound('use.grass', { location: block })

    if (player.getGameMode() == 'Creative') return;

    try {
        component.damage += 1
        player.getComponent('equippable').setEquipment('Mainhand', itemStack)
    } catch (er) {
        player.getComponent('equippable').setEquipment('Mainhand')
        player.playSound('random.break', { location: player.location })
    }

});

world.beforeEvents.playerInteractWithBlock.subscribe(event => {
    const { block, player, itemStack, isFirstEvent } = event;
    if (block.typeId != 'gf_wu:tanning_rack') return;
    if (itemStack?.typeId != 'minecraft:rotten_flesh') return;
    if (!player.isSneaking) return;

    event.cancel = true;
    if (!isFirstEvent) return;

    system.run(() => {
        handleTanningRackInteraction(block, player, true);
    });
});

const shovelPathDurabilitySnapshot = new Map();

function isRefundableCustomShovel(itemStack) {
    const id = itemStack?.typeId;
    return id === 'gf_wu:excavator_shovel' || id === 'gf_wu:excavator_shovel_netherite'
        || id === 'gf_wu:deep_digger_shovel' || id === 'gf_wu:deep_digger_shovel_netherite';
}

function customShovelDurabilityEnabled(itemStack) {
    if (!getConfig(Configs.Durability)) return false;
    const id = itemStack.typeId;
    if (id === 'gf_wu:excavator_shovel' || id === 'gf_wu:excavator_shovel_netherite') return getConfig(Configs.ExcavatorShovelDurability);
    if (id === 'gf_wu:deep_digger_shovel' || id === 'gf_wu:deep_digger_shovel_netherite') return getConfig(Configs.DeepDiggerShovelDurability);
    return true;
}

world.beforeEvents.playerInteractWithBlock.subscribe(event => {
    const { player, itemStack } = event;
    if (!isRefundableCustomShovel(itemStack)) return;
    if (customShovelDurabilityEnabled(itemStack)) return;
    if (player.getGameMode() === 'Creative') return;
    const damage = itemStack.getComponent('durability')?.damage;
    if (typeof damage === 'number') shovelPathDurabilitySnapshot.set(player.id, damage);
});

world.afterEvents.playerInteractWithBlock.subscribe(event => {
    const { player, itemStack } = event;
    const snapshot = shovelPathDurabilitySnapshot.get(player.id);
    shovelPathDurabilitySnapshot.delete(player.id);
    if (snapshot === undefined) return;
    if (!isRefundableCustomShovel(itemStack)) return;

    system.run(() => {
        const currentItem = player.getComponent('equippable').getEquipment('Mainhand');
        if (!currentItem || currentItem.typeId !== itemStack.typeId) return;
        const d = currentItem.getComponent('durability');
        if (!d || d.damage === snapshot) return;
        d.damage = snapshot;
        player.getComponent('equippable').setEquipment('Mainhand', currentItem);
    });
});

world.beforeEvents.playerInteractWithBlock.subscribe(event => {
    const { block, player, itemStack, blockFace, isFirstEvent } = event;

    if (itemStack?.typeId === 'gf_wu:stash_snatcher_full') {
        event.cancel = true;
        if (!isFirstEvent) return;

        const spawnLocation = { ...block.location };
        if (blockFace == 'Down') spawnLocation.y -= 1
        else if (blockFace == 'Up') spawnLocation.y += 1
        else if (blockFace == 'East') spawnLocation.x += 1
        else if (blockFace == 'West') spawnLocation.x -= 1
        else if (blockFace == 'South') spawnLocation.z += 1
        else if (blockFace == 'North') spawnLocation.z -= 1

        const stashId = itemStack.getDynamicProperty(STASH_SNATCHER_ID_DP);
        const size = JSON.parse(itemStack.getDynamicProperty(STASH_SNATCHER_SIZE_DP) ?? '{"x":1,"y":1,"z":1}');
        if (stashId === undefined) return;
        const placedDirection = getInvertedCardinalDirection(player.getViewDirection());
        const storedType = itemStack.getDynamicProperty(STASH_SNATCHER_TYPE_DP);

        system.runTimeout(() => {
            if (!canPlaceStoredContainer(player.dimension, spawnLocation, size)) {
                failed({ translate: 'gf_wu:stash_snatcher.no_space' }, player);
                return;
            }

            if (typeof storedType === 'string' && wouldConnectToExistingChest(player.dimension, spawnLocation, placedDirection, storedType)) {
                failed({ translate: 'gf_wu:stash_snatcher.would_connect' }, player);
                return;
            }

            const structureName = quoteStructureName(stashSnatcherStructureName(stashId));

            try {
                player.dimension.runCommand(`structure load ${structureName} ${spawnLocation.x} ${spawnLocation.y} ${spawnLocation.z}`);
            } catch {
                failed({ translate: 'gf_wu:stash_snatcher.unsupported' }, player);
                return;
            }

            orientStoredContainerBlocks(player.dimension, spawnLocation, size, placedDirection);

            try {
                player.dimension.runCommand(`structure delete ${structureName}`);
            } catch {
                // Best-effort cleanup only. Placement already succeeded.
            }

            let emptyItem = new ItemStack('gf_wu:stash_snatcher');
            emptyItem.getComponent('durability').damage = itemStack.getComponent('durability')?.damage ?? 0;
            emptyItem = damageStashSnatcher(player, emptyItem);

            if (emptyItem) {
                emptyItem.setLore(loreMap['gf_wu:stash_snatcher']);
                player.getComponent('equippable').setEquipment('Mainhand', emptyItem);
            }

            success({ translate: 'gf_wu:stash_snatcher.placed' }, player);
        }, 1);
        return;
    }
});

world.beforeEvents.playerInteractWithEntity.subscribe(event => {
    const { target, player, itemStack } = event;
    if (target.typeId == 'gf_wu:grab_bag_entity' && !getConfig(Configs.GrabBag)) { event.cancel = true; system.run(() => { configFailedMessage(player) }); return }
    if (!target.typeId.startsWith('gf_wu:lock')) return;
    event.cancel = true;
    if (player.isSneaking) return;
    system.run(() => {
        if (player.getGameMode() == 'Creative' || (target.getDynamicProperty('gf_wu:owner') == player.id && itemStack?.typeId == 'gf_wu:lock')) {
            success({ translate: 'gf_wu:chest.unlocked' }, player)
            target.remove();
        } else failed({ translate: 'gf_wu:chest.is_locked' }, player)
    })
})

// Handle harvester hoe tilling durability
world.afterEvents.playerInteractWithBlock.subscribe(event => {
    const { block, player, itemStack } = event;
    if (!itemStack || (itemStack.typeId !== 'gf_wu:harvester_hoe' && itemStack.typeId !== 'gf_wu:harvester_hoe_netherite')) return;

    // Check if dirt/grass was tilled to farmland
    const blockTypeId = block.typeId;
    if (blockTypeId === 'minecraft:farmland') {
        // Damage the harvester hoe for tilling
        if (player.getGameMode() !== 'Creative' && getConfig(Configs.HarvesterHoeDurability)) {
            system.run(() => {
                const currentItem = player.getComponent('equippable').getEquipment('Mainhand');
                if (currentItem && (currentItem.typeId === 'gf_wu:harvester_hoe' || currentItem.typeId === 'gf_wu:harvester_hoe_netherite')) {
                    const unbLvl = currentItem.getComponent('enchantable')?.getEnchantment('unbreaking')?.level || 0;
                    const chanceToDamage = 100 / (unbLvl + 1);
                    if ((Math.random() * 100) <= chanceToDamage) {
                        const d = currentItem.getComponent('durability');
                        try {
                            d.damage += 1;
                            player.getComponent('equippable').setEquipment('Mainhand', currentItem);
                        } catch {
                            player.getComponent('equippable').setEquipment('Mainhand');
                            player.playSound('random.break', { location: player.location });
                        }
                    }
                }
            });
        }
    }
});

function captureSingleStashBlock(player, block, sourceItem) {
    const stashId = world.getDynamicProperty('gf_wu:stashSnatcherCount') || 1;
    const structureName = stashSnatcherStructureName(stashId);
    const loc = block.location;
    const label = block.typeId.split(':').pop().replaceAll('_', ' ');
    const capturedType = block.typeId;

    try {
        block.dimension.runCommand(`execute positioned ${loc.x} ${loc.y} ${loc.z} run structure save ${quoteStructureName(structureName)} ~ ~ ~ ~ ~ ~ false disk true`);
    } catch {
        failed({ translate: 'gf_wu:stash_snatcher.unsupported' }, player);
        return;
    }

    clearStoredContainerInventory(block);
    block.setType('minecraft:air');

    const fullItem = new ItemStack('gf_wu:stash_snatcher_full');
    fullItem.setDynamicProperty(STASH_SNATCHER_ID_DP, stashId);
    fullItem.setDynamicProperty(STASH_SNATCHER_SIZE_DP, JSON.stringify({ x: 1, y: 1, z: 1 }));
    fullItem.setDynamicProperty(STASH_SNATCHER_NAME_DP, label);
    fullItem.setDynamicProperty(STASH_SNATCHER_TYPE_DP, capturedType);

    const previousDamage = sourceItem.getComponent('durability')?.damage ?? 0;
    fullItem.getComponent('durability').damage = previousDamage;
    updateStashSnatcherLore(fullItem, label, stashId);
    player.getComponent('equippable').setEquipment('Mainhand', fullItem);
    world.setDynamicProperty('gf_wu:stashSnatcherCount', stashId + 1);
    success({ translate: 'gf_wu:stash_snatcher.captured' }, player);
}

world.beforeEvents.playerInteractWithBlock.subscribe(event => {
    const { block, player, itemStack, isFirstEvent } = event;
    if (itemStack?.typeId !== 'gf_wu:stash_snatcher') return;
    if (!STASH_SNATCHER_BLOCKS.includes(block.typeId)) return;

    event.cancel = true;

    if (!getConfig(Configs.StashSnatcher)) {
        system.run(() => configFailedMessage(player));
        return;
    }

    if (!isFirstEvent) return;

    system.run(() => {
        const stashData = getStashSnatcherData(block);
        if (!stashData) return;
        if (stashData.error === 'locked') { failed({ translate: 'gf_wu:stash_snatcher.locked' }, player); return; }
        if (stashData.error === 'double') { failed({ translate: 'gf_wu:stash_snatcher.double_chest' }, player); return; }
        if (stashData.error) { failed({ translate: 'gf_wu:stash_snatcher.unsupported' }, player); return; }

        captureSingleStashBlock(player, block, itemStack);
    })
})

world.beforeEvents.playerInteractWithBlock.subscribe(event => {
    const { block, player, itemStack } = event;
    if (!CHEST_BLOCKS.includes(block.typeId)) return;
    const barriers = block.dimension.getEntitiesAtBlockLocation(block.y > -64 ? block.below() : block).filter(x => x.typeId.startsWith('gf_wu:lock_barrier'))
    const barrierLocations = barriers.flatMap(x => x.getDynamicProperty('gf_wu:chests').split('|').map(y => JSON.parse(y)))
    if (!barrierLocations.some(a => vectorEquals(a, block.location))) return;
    const target = barriers[0];
    event.cancel = true;
    if (player.isSneaking) return;
    system.run(() => {
        if (player.getGameMode() == 'Creative' || (target.getDynamicProperty('gf_wu:owner') == player.id && itemStack?.typeId == 'gf_wu:lock')) {
            success({ translate: 'gf_wu:chest.unlocked' }, player)
            target.remove();
        } else failed({ translate: 'gf_wu:chest.is_locked' }, player)
    })
})

world.beforeEvents.playerInteractWithBlock.subscribe(event => {

    const { block, itemStack, player, blockFace, isFirstEvent } = event;

    if (!itemStack) return;

    const blockId = block.typeId
    const lore = itemStack.getLore()
    const spawnLocation = block.location;

    if (isGrabBag(itemStack.typeId) && lore?.[1]) grabBigListener.set(player.id, lore[1])

    if (blockFace == 'Down') spawnLocation.y -= 1
    else if (blockFace == 'Up') spawnLocation.y += 1
    else if (blockFace == 'East') spawnLocation.x += 1
    else if (blockFace == 'West') spawnLocation.x -= 1
    else if (blockFace == 'South') spawnLocation.z += 1
    else if (blockFace == 'North') spawnLocation.z -= 1

    const structureId = getSafariNetStructureId(itemStack)

    if (itemStack.typeId == 'gf_wu:suction_hopper' && !getConfig(Configs.SuctionHopper)) { event.cancel = true; system.run(() => configFailedMessage(player)) }

    if (isFilledSafariNet(itemStack) && structureId !== undefined) {
        event.cancel = true;
        if (!event.isFirstEvent) return;

        system.run(() => {
            // Release the stored mob
            player.playSound('dig.cloth', { location: spawnLocation });
            player.dimension.spawnParticle('minecraft:crop_growth_emitter', spawnLocation);
            player.runCommand(`structure load gf_wu:safari_${structureId} ${spawnLocation.x} ${spawnLocation.y} ${spawnLocation.z}`);
            player.runCommand(`structure delete gf_wu:safari_${structureId}`);

            const equippable = player.getComponent('equippable');

            if (getConfig(Configs.SafariNetDurability) && player.getGameMode() != GameMode.Creative) {
                const dura = itemStack.getComponent('durability');
                try {
                    dura.damage += 1;
                    const emptyNet = new ItemStack('gf_wu:safari_net');
                    emptyNet.getComponent('durability').damage = dura.damage;
                    emptyNet.setLore(loreMap['gf_wu:safari_net']);
                    equippable.setEquipment('Mainhand', emptyNet);
                } catch (_err) {
                    equippable.setEquipment('Mainhand');
                    player.playSound('random.break', { location: player.location });
                }
            } else {
                const emptyNet = new ItemStack('gf_wu:safari_net');
                emptyNet.setLore(loreMap['gf_wu:safari_net']);
                equippable.setEquipment('Mainhand', emptyNet);
            }
        });
    }

    if (itemStack.typeId == 'gf_wu:spawner_wrench' && isFirstEvent && blockId.includes('mob_spawner') && !getConfig(Configs.ChooseSpawner)) { event.cancel = true, system.run(() => performSpawnBreak(player, itemStack, block)) }

    if (itemStack.typeId == 'gf_wu:spawner_wrench' && isFirstEvent && blockId.includes('mob_spawner') && getConfig(Configs.ChooseSpawner)) { event.cancel = true, system.run(() => performSpawnChoose(player, itemStack, block)) }

    if (itemStack.typeId == 'gf_wu:end_frame_breaker' && blockId.includes('end_portal_frame')) { event.cancel = true, system.run(() => performEndFrameBreak(player, itemStack, block, true)) }

    if (itemStack.typeId == 'gf_wu:amethyst_breaker' && blockId.includes('budding_amethyst')) { event.cancel = true, system.run(() => performAmethystBreak(player, itemStack, block, true)) }

    if (itemStack.typeId == 'minecraft:mob_spawner') {
        if (lore[0]?.slice(4) && !lore[0].includes('+DATA')) event.cancel = true
        system.run(() => { placeSpawner(player, itemStack, block, blockFace); })
    }

    if (itemStack.typeId == 'gf_wu:lock' && (["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel", "minecraft:exposed_copper_chest", "minecraft:copper_chest", "minecraft:weathered_copper_chest", "minecraft:oxidized_copper_chest", "minecraft:waxed_copper_chest", "minecraft:waxed_exposed_copper_chest", "minecraft:waxed_weathered_copper_chest", "minecraft:waxed_oxidized_copper_chest"].includes(block.typeId)) && !player.isSneaking) {

        if (block.dimension.getEntitiesAtBlockLocation(block.below()).filter(x => x.typeId.startsWith('gf_wu:lock_barrier')).flatMap(x => x.getDynamicProperty('gf_wu:chests').split('|').map(y => JSON.parse(y))).some(loc => vectorEquals(loc, block.location))) return;

        if (!getConfig(Configs.Lock)) { event.cancel = true; system.run(() => { configFailedMessage(player) }); return };

        event.cancel = true;
        system.run(() => { lockChest(block, player) })

    }

    if (itemStack.typeId == 'gf_wu:chunk_minion_spawn_egg') {
        event.cancel = true;
        if (!isFirstEvent) return;

        if (!getConfig(Configs.MaxChunkMinions)) { system.run(() => { configFailedMessage(player) }); return };
        if (['overworld', 'nether', 'the_end'].map(id => world.getDimension(id)).flatMap(dimension => dimension.getEntities({ type: 'gf_wu:chunk_minion' })).length >= getConfig(Configs.MaxChunkMinions)) {
            system.run(() => {
                failed({ translate: 'gf_wu:chunk_minion_limit' }, player);
            })
            return;
        }
        const lastSpawnTick = minonCooldownMap.get(player.id);
        if (lastSpawnTick !== undefined && system.currentTick - lastSpawnTick < 40) return;

        const spawnBlockLocation = getBlockFaceLocation(block, blockFace);
        const spawnLocation = {
            x: spawnBlockLocation.x + 0.5,
            y: spawnBlockLocation.y,
            z: spawnBlockLocation.z + 0.5
        };

        system.run(() => {
            try {
                const chunkMinion = player.dimension.spawnEntity('gf_wu:chunk_minion', spawnLocation);
                rotateChunkMinionToPlayer(chunkMinion, player);
                chunkMinion.triggerEvent('minecraft:entity_spawned');
                setupChunkMinion(player, chunkMinion, spawnBlockLocation);
                minonCooldownMap.set(player.id, system.currentTick);
                itemStack.getComponent('cooldown')?.startCooldown(player);
                if (player.getGameMode() !== GameMode.Creative) decrementHeldItem(itemStack, player.getComponent('equippable'));
            } catch {
                failed('Could not place Chunk Minion here.', player);
            }
        });
    }

})

world.afterEvents.dataDrivenEntityTrigger.subscribe(({ entity }) => {
    const itemStack = new ItemStack('gf_wu:chunk_minion_spawn_egg')
    itemStack.setLore(loreMap['gf_wu:chunk_minion_spawn_egg'])
    entity.dimension.spawnItem(itemStack, entity.location);
    entity.dimension.runCommand(`tickingarea remove gf_wu:chunk_${entity.getDynamicProperty('gf_wu:id')}`);
    entity.remove();
}, { eventTypes: ['poof'], entityTypes: ['gf_wu:chunk_minion'] })

world.afterEvents.entityHitEntity.subscribe(event => {
    const { hitEntity: target, damagingEntity: player } = event;
    if (target.typeId == 'gf_wu:chunk_minion') { showChunkMenu(player, target, target.getProperty('gf_wu:size')); return }
    if (target.typeId !== 'gf_wu:ocean_rider') return;

    const riders = target.getComponent('rideable')?.getRiders() ?? [];
    if (riders.length > 0) return;

    system.run(() => {
        const oceanRiderItem = new ItemStack('gf_wu:ocean_rider');
        oceanRiderItem.setDynamicProperty(OCEAN_RIDER_ITEM_FUEL_DP, getOceanRiderFuel(target));
        oceanRiderItem.setLore(loreMap['gf_wu:ocean_rider']);
        target.dimension.spawnItem(oceanRiderItem, target.location);
        target.remove();
    });
}, { entityTypes: ['minecraft:player'] })

world.beforeEvents.playerInteractWithEntity.subscribe(event => {

    const { player: source, target: entity, itemStack } = event;

    if (entity.typeId == 'gf_wu:chunk_minion') { system.run(() => { showChunkMenu(source, entity, entity.getProperty('gf_wu:size')) }); return }
    if (entity.typeId == 'gf_wu:ocean_rider') {
        event.cancel = true;
        if (!getConfig(Configs.OceanRider)) { system.run(() => configFailedMessage(source)); return; }

        system.run(() => {
            try {
                entity.getComponent('rideable')?.addRider(source);
            } catch { }
        });
        return;
    }

    if (entity.typeId == 'gf_wu:death_waypoint') {
        const ownerId = entity.getDynamicProperty('gf_wu:owner')
        if (!getConfig(Configs.DeathWaypointAccessibleToAll) && ownerId !== undefined && ownerId !== source.id) {
            event.cancel = true
            system.run(() => failed({ translate: 'gf_wu:death_waypoint.private' }, source))
        };
        return;
    }

    if (!itemStack || itemStack.typeId != 'gf_wu:safari_net') return;
    if (!getConfig(Configs.SafariNet)) { configFailedMessage(source); return }
    if (getSafariNetStructureId(itemStack) !== undefined) return;
    if (entity.typeId == 'minecraft:player' || entity.typeId == 'gf_wu:void_chest_entity' || entity.typeId == 'gf_wu:grab_bag_entity' || entity.typeId == 'minecraft:item' || entity.typeId == 'gf_wu:chunk_minion' || entity.typeId == 'gf_wu:ocean_rider' || entity.typeId == 'minecraft:warden' || entity.typeId == 'minecraft:ender_dragon' ||  isPlayerVaultEntityType(entity.typeId)) return;

    event.cancel = true;

    const netCount = world.getDynamicProperty('gf_wu:safariNetCount') || 0;
    system.run(() => {
        entity.runCommand(`structure save gf_wu:safari_${netCount} ~ ~ ~ ~ ~ ~ true disk false`);
        source.dimension.spawnParticle('minecraft:crop_growth_emitter', entity.location);

        const entityId = entity.typeId.split(':').pop()[0].toUpperCase() + entity.typeId.split(':').pop().slice(1).replace(/_/g, ' ');
        const fullNet = new ItemStack('gf_wu:safari_net_full');
        fullNet.setLore([loreMap['gf_wu:safari_net_full'][0], `§r§7${entity.nameTag ? entityId + " (" + entity.nameTag + ")" : entityId}`]);
        fullNet.setDynamicProperty(SAFARI_NET_COUNT_DP, netCount);
        try {
            const sourceDurability = itemStack.getComponent('durability')?.damage;
            if (typeof sourceDurability === 'number') fullNet.getComponent('durability').damage = sourceDurability;
        } catch (error) { }

        // re-equip with updated item state
        source.getComponent('equippable')?.setEquipment('Mainhand', fullNet);

        // clean up and stat
        entity.getComponent('riding')?.entityRidingOn?.remove();
        entity.dimension.getEntitiesAtBlockLocation(entity.location).filter(x => x.id !== entity.id && x.typeId != 'minecraft:player').forEach(x => x.remove());
        entity.getComponent('rideable')?.getRiders().forEach(x => x.remove());
        source.playSound('step.web', { location: entity.location });
        entity.remove();

        world.scoreboard.getObjective(SCOREBOARD_ID)?.addScore(SAFARINET_STAT, 1);
        world.setDynamicProperty('gf_wu:safariNetCount', netCount + 1);
    });

})

world.beforeEvents.explosion.subscribe(event => {
    event.setImpactedBlocks(event.getImpactedBlocks().filter(block => {
        if (isBridgeBuilderBlock(block.typeId)) return false;
        if (["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel", "minecraft:exposed_copper_chest", "minecraft:copper_chest", "minecraft:weathered_copper_chest", "minecraft:oxidized_copper_chest", "minecraft:waxed_copper_chest", "minecraft:waxed_exposed_copper_chest", "minecraft:waxed_weathered_copper_chest", "minecraft:waxed_oxidized_copper_chest"].includes(block.typeId)) {
            if (block.dimension.getEntitiesAtBlockLocation(block.below()).filter(x => x.typeId.startsWith('gf_wu:lock_barrier')).flatMap(x => x.getDynamicProperty('gf_wu:chests').split('|').map(y => JSON.parse(y))).some(loc => vectorEquals(loc, block.location))) return false;
        }
        return true;
    }))
})


world.afterEvents.pistonActivate.subscribe(event => {
    const { dimension, isExpanding, piston, block: pistonBlock } = event;

    const offset = [{ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }][pistonBlock.permutation.getState('facing_direction')]

    if (!isExpanding) { offset.x *= -1; offset.y *= -1; offset.z *= -1 }

    piston.getAttachedBlocksLocations().forEach(async location => {
        const oldLocation = location;
        const newLocation = { x: oldLocation.x + offset.x, y: oldLocation.y + offset.y, z: oldLocation.z + offset.z };

        const newBlock = dimension.getBlock(newLocation)

        const entityId = world.getDynamicProperty(`grab_bag:${dimension.id}_${oldLocation.x}_${oldLocation.y}_${oldLocation.z}`)
        if (!entityId) return;
        const entity = world.getEntity(entityId)

        await system.waitTicks(2);

        if (!isGrabBag(newBlock.typeId) || !entity) return;

        entity.teleport(newBlock.bottomCenter(), { keepVelocity: false })
        world.setDynamicProperty(`grab_bag:${dimension.id}_${oldLocation.x}_${oldLocation.y}_${oldLocation.z}`)
        world.setDynamicProperty(`grab_bag:${dimension.id}_${newLocation.x}_${newLocation.y}_${newLocation.z}`, entityId)
    })
})

world.afterEvents.playerSpawn.subscribe(async (event) => {

    if (!world.scoreboard.getObjective(SCOREBOARD_ID)) { world.scoreboard.addObjective(SCOREBOARD_ID); }

    const player = event.player;
    const playerPosition = player.location;
    const dimension = player.dimension;

    if (!player.getDynamicProperty('gf_wu:has_book')) {
        player.setDynamicProperty('gf_wu:has_book', true)
        dimension.spawnItem(new ItemStack('gf_wu:guide_book', 1), playerPosition);
    }
    if (!player.getDynamicProperty('gf_wu:has_update_book')) {
        player.setDynamicProperty('gf_wu:has_update_book', true)
        dimension.spawnItem(new ItemStack('gf_wu:update_book', 1), playerPosition);
    }
    if (!player.getDynamicProperty('gf_wu:has_config')) {
        if (player.getGameMode() != 'Creative') return;
        player.setDynamicProperty('gf_wu:has_config', true)
        dimension.spawnItem(new ItemStack('gf_wu:controller', 1), playerPosition);
    }

});

world.afterEvents.playerLeave.subscribe(event => {
    restoreBridgeBuilderPlacementsForPlayer(event.playerId);
});

let dimensions = [];
system.run(() => {
    dimensions = ['overworld', 'nether', 'the_end'].map(id => world.getDimension(id))
})

system.beforeEvents.startup.subscribe(() => {
    system.run(() => {
        loadBridgeBuilderPlacements();
    });
})

system.runInterval(() => {
    updateBridgeBuilderPlacements();
}, 2)

system.runInterval(() => {

    const scubaEnabled = getConfig(Configs.ScubaTank)
    const jetpackEnabled = getConfig(Configs.Jetpack)

    /** */
    const uniqueDisenchanters = new Map()
    const activePlayerIds = new Set()
    const activeOceanRiderIds = new Set()

    ejectDisabledOceanRiderPassengers();

    world.getAllPlayers().forEach(player => {
        activePlayerIds.add(player.id);

        const inventory = player.getComponent('inventory')?.container
        clearBridgeBuilderBlockItems(inventory);

        ensureTriggerableInventorySynced(player);

        try {
            const viewBlock = player.getBlockFromViewDirection()?.block
            if (viewBlock?.typeId == 'gf_wu:disenchanter') uniqueDisenchanters.set(JSON.stringify(viewBlock.location) + viewBlock.dimension.id, viewBlock)
        } catch (error) { /* Incase in an unloaded chunk */ }

        updatePlayerVaultView(player);

        if (!sneakMap.has(player.id)) sneakMap.set(player.id, player.isSneaking)
        else {
            const currentValue = sneakMap.get(player.id)
            if (player.isSneaking != currentValue) { // Sneak pressed/released
                if (currentValue == 0) { // Pressed
                    try {
                        const standingOnBlock = player.dimension.getBlock(player.location).below()
                        const portalPad = findPortalPadUnder(standingOnBlock)
                        if (portalPad) portalTriggered(player, portalPad, -1)
                    } catch (error) { }
                }
                sneakMap.set(player.id, !currentValue)
            }
        }

        if (!jumpMap.has(player.id)) jumpMap.set(player.id, player.isJumping)
        else {
            const currentValue = jumpMap.get(player.id)
            if (player.isJumping != currentValue) { // Jump pressed/released
                if (currentValue == 0) { // Pressed
                    checkDoubleJump(player)
                    try {
                        const standingOnBlock = player.dimension.getBlock(player.location).below()
                        const portalPad = findPortalPadUnder(standingOnBlock)
                        if (portalPad) portalTriggered(player, portalPad, 1)
                    } catch (error) { }
                }
                jumpMap.set(player.id, !currentValue)
            }
        }

        if (!inventory) return;

        const equippable = player.getComponent('equippable');
        const offhandSlot = equippable.getEquipmentSlot(EquipmentSlot.Offhand);
        const chestSlot = equippable.getEquipmentSlot(EquipmentSlot.Chest);
        const mountedOceanRider = getMountedOceanRider(player);

        let hasMinersEssentials = hasItemOrEffect(player, 'gf_wu:miners_essentials_on');
        let hasChunkBorders = hasItemOrEffect(player, 'gf_wu:chunk_borders_on');
        let hasBridgeBuilder = hasItemOrEffect(player, 'gf_wu:bridge_builder_on');
        let hasMagnet = hasItemOrEffect(player, 'gf_wu:magnet_on');
        let selectedItemActionBar;
        const actionBarLines = [];

        for (let i = 0; i < inventory.size; i++) {

            const itemStack = inventory.getItem(i);
            if (!itemStack || !itemStack.typeId.startsWith('gf_wu:')) continue;

            const lore = loreMap[itemStack.typeId];

            if (itemStack.getLore().length == 0 && lore) {
                itemStack.setLore(lore)
                inventory.setItem(i, itemStack)
            }

            if (itemStack.typeId == 'gf_wu:miners_essentials_on') hasMinersEssentials = true
            else if (itemStack.typeId == 'gf_wu:chunk_borders_on') hasChunkBorders = true
            else if (itemStack.typeId == 'gf_wu:bridge_builder_on') hasBridgeBuilder = true
            else if (itemStack.typeId == 'gf_wu:magnet_on') hasMagnet = true
            else if (scubaEnabled && itemStack.typeId == 'gf_wu:scuba_tank') {
                const existingOxygen = itemStack.getDynamicProperty('oxygen');
                let bar;
                if (existingOxygen === undefined) {
                    itemStack.setDynamicProperty('oxygen', 6000)
                    bar = getBar(6000, 6000);
                    const lore = loreMap['gf_wu:scuba_tank']
                    lore[2] = '§r§7Oxygen: ' + bar.split(' ').pop().replace(/[^0-9]/g, '') + '%'
                    itemStack.setLore(lore)
                    inventory.setItem(i, itemStack)
                }
                if (bar === undefined) bar = getBar(itemStack.getDynamicProperty('oxygen'), 6000)
                if (i == player.selectedSlotIndex) selectedItemActionBar = bar
            } if (jetpackEnabled && itemStack.typeId == 'gf_wu:jetpack' && i == player.selectedSlotIndex) selectedItemActionBar = getBar(getFuel(player), MAX_FUEL)

        }

        if (offhandSlot.isValid && offhandSlot.hasItem() && offhandSlot.typeId == 'gf_wu:scuba_tank' && player.getGameMode() != GameMode.Creative) {
            if (scubaEnabled) {
                const existingOxygen = Math.max(Math.min(offhandSlot.getDynamicProperty('oxygen') ?? 6000, 6000), 0);
                const isUnderwater = player.dimension.getBlock(player.getHeadLocation()).typeId.includes('water');
                let nextOxygen = existingOxygen;
                if (isUnderwater) {
                    nextOxygen = Math.max(existingOxygen - 1, 0);
                } else if (existingOxygen < 6000 && system.currentTick % 2 == 0) {
                    nextOxygen = Math.min(existingOxygen + 1, 6000);
                }
                if (nextOxygen !== existingOxygen) offhandSlot.setDynamicProperty('oxygen', nextOxygen);
                if (nextOxygen > 0 && isUnderwater) player.addEffect('water_breathing', 10, { showParticles: false })
                const bar = getBar(nextOxygen, 6000)
                const lore = loreMap['gf_wu:scuba_tank']
                lore[2] = '§r§7Oxygen: ' + bar.split(' ').pop().replace(/[^0-9]/g, '') + '%'
                offhandSlot.setLore(lore)
                actionBarLines.push(`§bOxygen ${bar}`);
            } else if (system.currentTick % 40 == 0) configFailedMessage(player)
        }

        if (!mountedOceanRider && chestSlot.isValid && chestSlot.hasItem() && chestSlot.typeId == 'gf_wu:jetpack' && player.getGameMode() != GameMode.Creative) {
            if (jetpackEnabled) actionBarLines.push(`§6Fuel ${getBar(getFuel(player), MAX_FUEL)}`)
            else if (system.currentTick % 40 == 0) configFailedMessage(player)
        }

        if (hasBridgeBuilder && getConfig(Configs.BridgeBuilder)) {
            tryPlaceBridgeBuilderBlock(player);
            if ((!chestSlot.isValid || !chestSlot.hasItem() || chestSlot.typeId != 'gf_wu:jetpack') &&
                (!offhandSlot.isValid || !offhandSlot.hasItem() || offhandSlot.typeId != 'gf_wu:scuba_tank') &&
                system.currentTick % 40 == 0) {
                player.onScreenDisplay.setActionBar({ translate: 'gf_wu:bridge_builder.is_active' });
            }
        }

        if (mountedOceanRider && getConfig(Configs.OceanRider)) {
            activeOceanRiderIds.add(mountedOceanRider.id);
            updateOceanRiderState(player, mountedOceanRider);
            const oceanRiderActionBar = getBar(getOceanRiderFuel(mountedOceanRider), MAX_FUEL);
            actionBarLines.push(`§6Fuel ${oceanRiderActionBar}`);
        } else if (mountedOceanRider) {
            disableOceanRiderForMountedPlayer(player, mountedOceanRider);
            if (system.currentTick % 40 == 0) configFailedMessage(player);
        }

        if (player.hasTag('minersEssentials') && !hasMinersEssentials) { player.removeTag('minersEssentials'); player.removeEffect('haste') }
        if (!player.hasTag('minersEssentials') && hasMinersEssentials) { player.addTag('minersEssentials'); player.addEffect('haste', 20000000, { amplifier: 0, showParticles: false }) }

        if (getConfig(Configs.MinersLatern) && !player.hasTag('minersLanternEnabled')) player.addTag('minersLanternEnabled')
        else if (!getConfig(Configs.MinersLatern) && player.hasTag('minersLanternEnabled')) player.removeTag('minersLanternEnabled')

        if (hasMagnet && getConfig(Configs.Magnet)) {
            const range = getConfig(Configs.MagnetRange);
            const item = player.dimension.getEntities({ location: player.location, maxDistance: range, type: 'minecraft:item' })[0]
            if (item) {
                item.teleport(player.location)
                world.scoreboard.getObjective(SCOREBOARD_ID).addScore(MAGNET_STAT, 1)
            }
            if (getConfig(Configs.MagnetEffectsXp)) {
                const xp = player.dimension.getEntities({ location: player.location, maxDistance: range, type: 'minecraft:xp_orb' })[0]
                if (xp) {
                    xp.teleport(player.location)
                    // world.scoreboard.getObjective(SCOREBOARD_ID).addScore(MAGNET_STAT, 1) //TODO Add stat for magnet and xp orbs
                }
            }
        }

        if (actionBarLines.length > 0) {
            player.onScreenDisplay.setActionBar(actionBarLines.join('\n'));
        } else if (selectedItemActionBar) {
            player.onScreenDisplay.setActionBar(selectedItemActionBar);
        }

        if (!hasChunkBorders || system.currentTick % 80 !== 0 || !getConfig(Configs.ChunkBorders)) return;

        try {
            const location = { x: Math.floor(player.location.x / 16) * 16, y: 128, z: Math.floor(player.location.z / 16) * 16 }
            player.dimension.spawnParticle('gf_wu:' + (isSlimeChunk(location) && player.dimension.id == 'minecraft:overworld' ? 'slime_' : '') + 'chunk_border', { x: location.x + 8, y: location.y, z: location.z + 8 })
        } catch (error) { }

    })

    cleanupPlayerVaultViews(activePlayerIds);
    cleanupOrphanedVaultVisuals(dimensions);

    dimensions.forEach(dimension => {
        dimension.getEntities({ type: 'gf_wu:ocean_rider' }).forEach(oceanRider => {
            if (!activeOceanRiderIds.has(oceanRider.id)) setOceanRiderMovingState(oceanRider, false);
        })
    })

    uniqueDisenchanters.forEach(block => disenchanterLookedAt(block, block.dimension))

    if (system.currentTick % 10 !== 0) return;

    dimensions.forEach(dimension => {
        dimension.getEntities({ type: 'gf_wu:death_waypoint' }).forEach(waypoint => {
            const inventory = waypoint.getComponent('inventory').container;

            if (inventory.emptySlotsCount == 54) { waypoint.remove(); return }

            let lastItem;

            for (let i = 27; i < inventory.size; i++) {
                if (!inventory.getItem(i)) continue;
                lastItem = i
            }

            if (!lastItem) return;

            for (let i = 0; i < 27; i++) {
                if (inventory.getItem(i)) continue;
                inventory.moveItem(lastItem, i, inventory)
                break;
            }

        })
    })

    // Check all grab bags for empty→filled conversion
    dimensions.forEach(dimension => {
        dimension.getEntities({ type: 'gf_wu:grab_bag_entity' }).forEach(entity => {
            try {
                const inventory = entity.getComponent('inventory').container;
                const location = entity.location;
                const blockLocation = { x: Math.floor(location.x), y: Math.floor(location.y), z: Math.floor(location.z) };
                const block = dimension.getBlock(blockLocation);

                if (!block || !isGrabBag(block.typeId)) return;

                const isEmpty = inventory.emptySlotsCount == 5;
                const isEmptyVariant = block.typeId.endsWith('_empty');

                // Convert empty variant to filled when items are added
                if (!isEmpty && isEmptyVariant) {
                    const filledTypeId = block.typeId.replace('_empty', '');
                    block.setType(filledTypeId);
                }
                // Convert filled variant to empty when all items are removed
                else if (isEmpty && !isEmptyVariant) {
                    const emptyTypeId = block.typeId + '_empty';
                    block.setType(emptyTypeId);
                }
            } catch (error) {
                // Block may be unloaded or entity removed
            }
        });
    });

}, 0)

world.afterEvents.entitySpawn.subscribe(event => {
    const { entity } = event;
    if (!entity.isValid) return;
    if (tryProcessDirectSmeltItem(entity)) return;
    const itemStack = entity.getComponent('item')?.itemStack
    if (!itemStack || !itemStack.typeId.startsWith('gf_wu:')) return;
    const lore = loreMap[itemStack.typeId];
    if (itemStack.getLore().length > 0 || !lore) return;
    itemStack.setLore(lore)
    entity.dimension.spawnItem(itemStack, entity.location)
    entity.remove()
})

system.beforeEvents.startup.subscribe((init) => {
    const controller = {
        name: "gf_wf:controller",
        description: "Configuration for World Utilities Addon",
        permissionLevel: CommandPermissionLevel.Any,
        cheatsRequired: false
    };
    init.customCommandRegistry.registerCommand(controller, controller_ui);
});

function controller_ui(origin) {
    system.run(() => {
        showCreativeMenu(origin.sourceEntity);
    });
}

/**
 * @param {import('@minecraft/server').Vector3} a 
 * @param {import('@minecraft/server').Vector3} b 
 */
function vectorEquals(a, b) {
    return a.x.toFixed(1) == b.x.toFixed(1) && a.y.toFixed(1) == b.y.toFixed(1) && a.z.toFixed(1) == b.z.toFixed(1);
}

function getBar(current, max) {
    const percentage = Math.floor((current / max) * 100)
    let bar = '§a'
    for (let i = 0; i < 30 * (percentage / 100); i++) {
        bar += '|'
    }
    bar += '§c'
    for (let i = 0; i < 30 - (30 * (percentage / 100)); i++) {
        bar += '|'
    }
    bar += '§a (' + percentage + '%)'
    return bar
}

function getInvertedCardinalDirection(viewVector) {
    const { x, z } = viewVector;

    if (Math.abs(x) > Math.abs(z)) {
        return x > 0 ? "West" : "East";
    } else {
        return z > 0 ? "North" : "South";
    }
}

function format(str) {
    return str.split(':')[1].split('_').map(id => id[0].toUpperCase() + id.slice(1)).join(' ')
}

export const ENDFRAMEBREAKER_LORE = loreMap["gf_wu:end_frame_breaker"][0]
export const AMETHYSTBREAKER_LORE = loreMap["gf_wu:amethyst_breaker"][0]
export const WATERINGCAN_LORE = loreMap["gf_wu:watering_can"][0]
export const WRENCH_LORE = loreMap["gf_wu:spawner_wrench"][0]
export const CHOOSE_LORE = loreMap["gf_wu:choose_spawner"][0]
export const EXPERIENCEBOTTLE_LORE = loreMap["gf_wu:experience_bottle"][0]

export { SCOREBOARD_ID, TREECAPITATOR_STAT, ENDFRAMEBREAKER_STAT, EXPLOSIVEPICKAXE_STAT, MULTIBLOCPICKAXE_STAT, QUARRYPICKAXE_STAT, VEINMINER_STAT, WRENCH_STAT, MINERESSENTIAL_STAT, EXCAVATORSHOVEL_STAT, DEEPDIGGERSHOVEL_STAT, EXPERIENCEEXTRACTOR_STAT, LOCK_STAT, vectorEquals, AMETHYSTBREAKER_STAT }

const validItems = [
    "gf_wu:spawner_wrench",
    "gf_wu:end_frame_breaker",
    "gf_wu:safari_net",
    "gf_wu:safari_net_full",
    "gf_wu:amethyst_breaker",
];

function extractUsesLeft(loreLines) {
    // looks for the first "Uses: <number>" anywhere in the lore
    for (const line of loreLines) {
        const m = line.match(/Uses:\s*(\d+)/i);
        if (m) return Number(m[1]);
    }
    return null; // not found
}

system.runInterval(() => {
    world.getPlayers().forEach((player) => {
        const container = player.getComponent(EntityComponentTypes.Inventory)?.container;
        if (!container) return;

        for (let slot = 0; slot < container.size; slot++) {
            const item = container.getItem(slot);
            if (!item || !validItems.includes(item.typeId)) continue;

            const dura = item.getComponent(ItemComponentTypes.Durability);
            if (!dura) continue;

            const max = dura.maxDurability ?? 0;
            if (max <= 0) continue;


            const usesLeftFromLore = extractUsesLeft(item.getLore() ?? []);
            if (usesLeftFromLore == null) continue;

            const usesLeft = Math.max(0, Math.min(max, usesLeftFromLore));

            const desiredDamage = max - usesLeft;

            try {
                dura.damage = desiredDamage;
            } catch {
                const fresh = new ItemStack(item.typeId, item.amount);
                const freshDura = fresh.getComponent(ItemComponentTypes.Durability);
                if (freshDura) freshDura.damage = desiredDamage;
                fresh.setLore(loreMap[item.typeId] ?? []);
                container.setItem(slot, fresh);
                continue;
            }

            const newLore = loreMap[item.typeId] ?? [];
            item.setLore(newLore);

            container.setItem(slot, item);
        }
    });
}, 20);
