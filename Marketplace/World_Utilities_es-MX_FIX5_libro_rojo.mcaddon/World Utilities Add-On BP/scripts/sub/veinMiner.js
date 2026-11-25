import { Block, BlockPermutation, system, world } from "@minecraft/server";
import { performFortune, smeltNearestItem } from './breakEffects'
import { TREECAPITATOR_STAT, VEINMINER_STAT, SCOREBOARD_ID } from "../main";
import { Configs, getConfig } from "./config";

function applyExtraDurabilityDamage(player, itemStack, extraDamage) {
    if (!player || !itemStack || extraDamage <= 0 || player.getGameMode() == 'Creative') return;
    const equippable = player.getComponent('equippable');
    const durability = itemStack.getComponent('durability');
    if (!durability) return;

    const unbreaking = itemStack.getComponent('enchantable')?.getEnchantment('unbreaking')?.level || 0;
    for (let i = 0; i < extraDamage; i++) {
        const chanceToDamage = 100 / (unbreaking + 1);
        if ((Math.random() * 100) > chanceToDamage) continue;
        try {
            durability.damage += 1;
            equippable.setEquipment('Mainhand', itemStack);
        } catch {
            equippable.setEquipment('Mainhand');
            player.playSound('random.break', { location: player.location });
            return;
        }
    }
}

function isTreeLeafBlock(blockId) {
    return (
        blockId.includes('leaves') ||
        blockId.includes('_leaf') ||
        blockId.includes('foliage') ||
        blockId.includes('needle') ||
        blockId.includes('canopy') ||
        blockId.includes('wart_block')
    )
}

function isSameBopTreeFamily(treeId, blockId) {
    if (treeId.includes('redwood') && blockId.includes('redwood')) return true;
    if (treeId.includes('pine') && blockId.includes('pine')) return true;
    if (treeId.includes('umbran') && blockId.includes('umbran')) return true;
    return false;
}

function isTreeWoodDurabilityBlock(block) {
    const blockId = block.typeId.split(':').pop().replace('lit_', '')
    if (isTreeLeafBlock(blockId)) return false;

    return isTreeWoodBlock(blockId)
}

function isBopTreeId(id) {
    return id.includes('redwood') || id.includes('pine') || id.includes('umbran')
}

function isTreeWoodBlock(blockId) {
    return (
        blockId.includes('_log') ||
        blockId.includes('_stem') ||
        blockId.includes('_roots') ||
        blockId.includes('_wood') ||
        blockId.includes('_knot') ||
        blockId.includes('_branch')
    )
}

function shouldIncludeBopTreeBlock(treeId, blockId) {
    if (!isSameBopTreeFamily(treeId, blockId)) return false;
    if (isTreeLeafBlock(blockId)) return getConfig(Configs.CapitatorLeafBreak);
    return isTreeWoodBlock(blockId);
}

/**
 * Get blocks in a 3x3x3 cube centered on the current block not including the current block
 * @param {Block} block
 * @returns {Array<Block>}
 */
function getNeighbours(block) {
    return [
        block.above(),
        block.below(),
        block.east(),
        block.north(),
        block.south(),
        block.west(),
        block.south().east(),
        block.south().west(),
        block.north().east(),
        block.north().west(),
        block.above().east(),
        block.above().west(),
        block.above().north(),
        block.above().south(),
        block.below().east(),
        block.below().west(),
        block.below().north(),
        block.below().south(),
        block.above().south().east(),
        block.above().south().west(),
        block.above().north().east(),
        block.above().north().west(),
        block.below().south().east(),
        block.below().south().west(),
        block.below().north().east(),
        block.below().north().west()
    ]
}

/**
 * Get the vein of connected blocks
 * @param {Block} startBlock
 * @param {string} id
 * @returns {Array<Block>}
 */
function getVein(startBlock, id) {

    const blocks = [];
    const visited = new Set()
    const toSearch = [startBlock]

    visited.add(JSON.stringify(startBlock.location))

    const isWood = (
        id.includes('_log') ||
        id.includes('_stem') ||
        id.includes('_roots') ||
        id === 'pine_knot' ||
        id === 'umbran_knot' ||
        isBopTreeId(id)
    ) || (id.includes('_leaf') && getConfig(Configs.CapitatorLeafBreak))

    while (toSearch.length > 0 && blocks.length <= 512) {

        const current = toSearch.shift()
        blocks.push(current)

        getNeighbours(current).forEach(block => {

            if (block.isAir || block.isLiquid) return;

            const blockId = block.typeId.split(':').pop().replace('lit_', '')

            if (!visited.has(JSON.stringify(block.location)) && (
                blockId == id ||
                (id === 'pine_log' && blockId === 'pine_knot') ||
                (id === 'umbran_log' && blockId === 'umbran_knot') ||
                (isBopTreeId(id) && shouldIncludeBopTreeBlock(id, blockId)) ||
                (isWood && getConfig(Configs.CapitatorLeafBreak) && (
                    (blockId.includes('azalea_leaves') && id == 'oak_log') ||
                    blockId == id.replace('_log', '_leaves') ||
                    blockId == id.replace('_log', '_leaf') ||
                    (blockId.includes('wart_block') && id.includes('_stem'))
                ))
            )) {
                visited.add(JSON.stringify(block.location))
                if (Math.sqrt(Math.pow(block.x - startBlock.x, 2) + Math.pow(block.z - startBlock.z, 2)) < 7 && isWood) toSearch.push(block)
                else toSearch.push(block)
            }

        })
    }

    return blocks

}

/**
 * Starts the tree vein miner
 * @param {Block} startBlock 
 * @param {string} id
 */
function mineTree(startBlock, id, silkTouch = false, player, itemStack) {

    const blocks = getVein(startBlock, id)
    let i = 0;

    const highest = findHighest(blocks)

    world.scoreboard.getObjective(SCOREBOARD_ID).addScore(TREECAPITATOR_STAT, 1)

    if (!id.includes('root') && !isBopTreeId(id) && getNeighbours(highest).filter(block => !block.isAir && !block.isLiquid).filter(block => isTreeLeafBlock(block.typeId)).length < 3) return;

    if (getConfig(Configs.TreeCapitatorBlockDurability)) {
        const woodBlocks = blocks.filter(block => !block.isAir && !block.isLiquid && isTreeWoodDurabilityBlock(block));
        applyExtraDurabilityDamage(player, itemStack, Math.max(woodBlocks.length - 1, 0));
    }

    const run = system.runInterval(() => {

        if (i >= blocks.length) { system.clearRun(run); return; }

        const block = blocks[i]

        if (block.isAir || block.isLiquid) {
            i++
            return;
        }

        if (silkTouch && isTreeLeafBlock(block.typeId.split(':').pop())) {
            block.dimension.playSound('dig.grass', block)
            block.dimension.spawnItem(block.permutation.getItemStack(), block.location);
            block.setType('air');
        } else {
            block.dimension.runCommand(`fill ${block.x} ${block.y} ${block.z} ${block.x} ${block.y} ${block.z} air destroy`)
        }

        i++

    }, 0)

}

/**
 * Starts the ore vein miner
 * @param {Block} startBlock 
 * @param {string} id
 * @param {boolean} shouldSmelt
 * @param {boolean} silkTouch
 * @param {number} fortuneLevel
 */
function mineOres(startBlock, id, shouldSmelt, silkTouch, fortuneLevel, player, itemStack) {

    const blocks = getVein(startBlock, id)
    let i = 0;

    if (id == 'gravel') blocks.sort((x, y) => x.y < y.y)

    const perm = BlockPermutation.resolve(id)

    world.scoreboard.getObjective(SCOREBOARD_ID).addScore(VEINMINER_STAT, 1)

    if (getConfig(Configs.VeinMinerBlockDurability)) {
        applyExtraDurabilityDamage(player, itemStack, Math.max(blocks.length - 1, 0));
    }

    const run = system.runInterval(() => {

        if (i >= blocks.length) { if (shouldSmelt) smeltNearestItem(startBlock.dimension, blocks.pop().center(), perm.type.id, true); system.clearRun(run); return; }

        const block = blocks[i]

        if (block.isAir || block.isLiquid) { i++; return; }

        if (!silkTouch) {
            performFortune(block.type.id.split(':').pop(), block.dimension, block.location, fortuneLevel)
            block.dimension.runCommand(`fill ${block.x} ${block.y} ${block.z} ${block.x} ${block.y} ${block.z} air destroy`)
            if (shouldSmelt) smeltNearestItem(block.dimension, block.center(), perm.type.id, true)
        } else {
            block.dimension.playSound('dig.stone', block)
            block.dimension.spawnItem(block.permutation.getItemStack(), block.location);
            block.setType('air');
        }

        i++

    }, 0)

}

/**
 * Returns the highest block in the array
 * @param {Array<Block>} arr 
 * @returns {Block}
 */
function findHighest(arr) {
    let highest = arr[0]
    for (let i = 0; i < arr.length; i++) {
        const block = arr[i];
        if (block.y > highest.y) highest = block
    }
    return highest;
}

/**
 * @param {BlockPermutation} permutation
 * @returns {string}
 */
function findWoodId(permutation) {
    const id = permutation.type.id.split(':').pop()
    return (
        id.includes('_log') ||
        id.includes('_stem') ||
        id.includes('_roots') ||
        id.includes('_wood') ||
        id.includes('_knot') ||
        id.includes('_branch')
    ) ? id : undefined;
}

/**
 * @param {BlockPermutation} permutation
 * @returns {("quartz_ore"|"coal_ore"|"deepslate_gold_ore"|"deepslate_coal_ore"|"nether_gold_ore"|"iron_ore"|"copper_ore"|"lapis_ore"|"deepslate_copper_ore"|"deepslate_lapis_ore"|"deepslate_iron_ore"|"gold_ore"|"diamond_ore"|"emerald_ore"|"redstone_ore"|"lit_redstone_ore"|"deepslate_diamond_ore"|"deepslate_emerald_ore"|"deepslate_redstone_ore"|"lit_deepslate_redstone_ore"|"ancient_debris")}
 */
function findOreId(permutation) {
    const id = permutation?.type.id.split(':').pop()
    return getOres().includes(id) ? id : undefined;
}

/**
 * @param {BlockPermutation} permutation
 * @returns {("")}
 */
function findCropId(permutation) {
    const id = permutation.getItemStack().typeId.split(':').pop()
    return getCrops().includes(id) ? id : undefined;
}

function isSeed(cropId) {
    if (!getCrops().includes(cropId)) return false;
    if (["torchflower", "pitcher_plant", "sweet_berries", "red_mushroom", "brown_mushroom", "sea_pickle", "crimson_fungs", "warped_fungus", "pumpkin", "melon_block"].includes(cropId)) return false;
    return true
}

function seedToBlock(cropId) {
    const seedToBlockMap = {
        // Existing mappings
        "wheat_seeds": "wheat",
        "carrot": "carrots",
        "beetroot_seeds": "beetroot",
        "potato": "potatoes",
        "melon_seeds": "melon_stem",
        "pumpkin_seeds": "pumpkin_stem",
        "torchflower_seeds": "torchflower_crop",
        "pitcher_pod": "pitcher_crop",
        "cocoa_beans": "cocoa",
        "nether_wart": "nether_wart",

        // Farming Add-On seed-to-plant mappings
        "pod_farm:broccoli_seeds": "pod_farm:broccoli_plant",
        "pod_farm:cauliflower_seeds": "pod_farm:cauliflower_plant",
        "pod_farm:corn_seeds": "pod_farm:corn_plant",
        "pod_farm:cotton_seeds": "pod_farm:cotton_plant",
        "pod_farm:ginger_seeds": "pod_farm:ginger_plant",
        "pod_farm:kohlrabi_seeds": "pod_farm:kohlrabi_plant",
        "pod_farm:lettuce_seeds": "pod_farm:lettuce_plant",
        "pod_farm:mustard_seeds": "pod_farm:mustard_plant",
        "pod_farm:oat_seeds": "pod_farm:oat_plant",
        "pod_farm:onion_seeds": "pod_farm:onion_plant",
        "pod_farm:rice_seeds": "pod_farm:rice_plant"
    }
    return seedToBlockMap[cropId]
}

/**
 * Returns a list of ores
 * @returns {("quartz_ore"|"coal_ore"|"deepslate_gold_ore"|"deepslate_coal_ore"|"nether_gold_ore"|"iron_ore"|"copper_ore"|"lapis_ore"|"deepslate_copper_ore"|"deepslate_lapis_ore"|"deepslate_iron_ore"|"gold_ore"|"diamond_ore"|"emerald_ore"|"redstone_ore"|"lit_redstone_ore"|"deepslate_diamond_ore"|"deepslate_emerald_ore"|"deepslate_redstone_ore"|"lit_deepslate_redstone_ore"|"ancient_debris")[]}
 */
function getOres() {
    return [
        'quartz_ore',
        'coal_ore',
        'deepslate_gold_ore',
        'deepslate_coal_ore',
        'nether_gold_ore',
        'iron_ore',
        'copper_ore',
        'lapis_ore',
        'deepslate_copper_ore',
        'deepslate_lapis_ore',
        'deepslate_iron_ore',
        'gold_ore',
        'diamond_ore',
        'emerald_ore',
        'redstone_ore',
        'lit_redstone_ore',
        'deepslate_diamond_ore',
        'deepslate_emerald_ore',
        'deepslate_redstone_ore',
        'lit_deepslate_redstone_ore',
        'ancient_debris' // only diamond pickaxe or better
    ]
}

function getCrops() {
    return [
        // Existing vanilla crops
        "wheat_seeds", "carrot", "beetroot_seeds", "potato",
        "melon_seeds", "pumpkin_seeds", "torchflower_seeds", "pitcher_pod",
        "torchflower", "pitcher_plant", "cocoa_beans", "sweet_berries",
        "red_mushroom", "brown_mushroom", "sea_pickle", "nether_wart",
        "crimson_fungs", "warped_fungus", "pumpkin", "melon_block",

        // Farming Add-On crops
        "broccoli_seeds",
        "broccoli",
        "cauliflower_seeds",
        "cauliflower",
        "corn_seeds",
        "corn",
        "cotton_seeds",
        "cotton",
        "ginger_seeds",
        "ginger",
        "kohlrabi_seeds",
        "kohlrabi",
        "lettuce_seeds",
        "lettuce",
        "mustard_seeds",
        "mustard",
        "oat_seeds",
        "oat",
        "onion_seeds",
        "onion",
        "rice_seeds",
        "rice"
    ]
}

export { mineTree, mineOres, getOres, findWoodId, findOreId, findCropId, isSeed, seedToBlock }
