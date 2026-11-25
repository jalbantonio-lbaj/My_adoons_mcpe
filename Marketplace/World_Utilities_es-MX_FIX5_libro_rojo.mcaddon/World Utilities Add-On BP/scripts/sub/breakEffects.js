import { Block, Dimension, ItemStack, Player, system, world } from "@minecraft/server";
import { findOreId, getOres } from "./veinMiner";
import { DEEPDIGGERSHOVEL_STAT, EXCAVATORSHOVEL_STAT, EXPLOSIVEPICKAXE_STAT, MULTIBLOCPICKAXE_STAT, MINERESSENTIAL_STAT, QUARRYPICKAXE_STAT, SCOREBOARD_ID } from "../main";
import { Configs, getConfig } from "./config";
import { configFailedMessage } from './messenger'

const smeltableBlocks = [
    'minecraft:iron_ore',
    'minecraft:deepslate_iron_ore',
    'minecraft:gold_ore',
    'minecraft:deepslate_gold_ore',
    'minecraft:copper_ore',
    'minecraft:deepslate_copper_ore',
    'minecraft:ancient_debris',
    'minecraft:sand',
    'minecraft:red_sand'
]

const recipeMap = new Map()
    .set('minecraft:iron_ore', 'minecraft:raw_iron')
    .set('minecraft:deepslate_iron_ore', 'minecraft:raw_iron')
    .set('minecraft:gold_ore', 'minecraft:raw_gold')
    .set('minecraft:deepslate_gold_ore', 'minecraft:raw_gold')
    .set('minecraft:copper_ore', 'minecraft:raw_copper')
    .set('minecraft:deepslate_copper_ore', 'minecraft:raw_copper')
    .set('minecraft:ancient_debris', 'minecraft:ancient_debris')
    .set('minecraft:sand', 'minecraft:sand')
    .set('minecraft:red_sand', 'minecraft:red_sand')

const smeltMap = new Map()
    .set('minecraft:raw_iron', 'minecraft:iron_ingot')
    .set('minecraft:raw_copper', 'minecraft:copper_ingot')
    .set('minecraft:raw_gold', 'minecraft:gold_ingot')
    .set('minecraft:ancient_debris', 'minecraft:netherite_scrap')
    .set('minecraft:sand', 'minecraft:glass')
    .set('minecraft:red_sand', 'minecraft:glass')

const directShovelSmeltableBlocks = new Set([
    'minecraft:sand',
    'minecraft:red_sand'
])

const protectedUtilityBlocks = new Set([
    'gf_wu:vault',
    'gf_wu:bridge_builder1',
    'gf_wu:bridge_builder2',
    'gf_wu:bridge_builder3',
    'gf_wu:bridge_builder4'
])

const pendingDirectSmelts = new Map()

const unbreakableBlocks = [
    'minecraft:bedrock',
    'minecraft:fire',
    'minecraft:soul_fire',
    'minecraft:reinforced_deepslate',
    'minecraft:end_portal_frame',
    'minecraft:end_portal',
    'minecraft:portal',
    'minecraft:barrier',
    'minecraft:command_block',
    'minecraft:repeating_command_block',
    'minecraft:chain_command_block',
    'minecraft:structure_block',
    'minecraft:undyed_shulker_box',
    'minecraft:white_shulker_box',
    'minecraft:orange_shulker_box',
    'minecraft:magenta_shulker_box',
    'minecraft:light_blue_shulker_box',
    'minecraft:yellow_shulker_box',
    'minecraft:lime_shulker_box',
    'minecraft:pink_shulker_box',
    'minecraft:gray_shulker_box',
    'minecraft:cyan_shulker_box',
    'minecraft:purple_shulker_box',
    'minecraft:blue_shulker_box',
    'minecraft:brown_shulker_box',
    'minecraft:green_shulker_box',
    'minecraft:red_shulker_box',
    'minecraft:black_shulker_box'
]

const unexplodableBlocks = [
    'minecraft:ancient_debris',
    'minecraft:anvil',
    'minecraft:netherite_block',
    'minecraft:crying_obsidian',
    'minecraft:obsidian',
    'minecraft:respawn_anchor',
    'minecraft:enchanting_table',
    'minecraft:ender_chest',
    'minecraft:lava',
    'minecraft:water',
    'minecraft:flowing_lava',
    'minecraft:flowing_water',
    'minecraft:bubble_column'
]

function safeGetBlock(dimension, location) {
    try {
        return dimension.getBlock(location)
    } catch {
        return undefined
    }
}

function isGrabBagBlock(block) {
    return block.hasTag('gf_wu:grab_bags') || block.hasTag('gf_wu:grab_bags_empty')
}

function isProtectedUtilityBlock(block) {
    return protectedUtilityBlocks.has(block.typeId) || isGrabBagBlock(block)
}

/**
 * Performs the 3x3 breaking 
 * @param {Player} player
 * @param {Block} block
 * @param {boolean} shouldSmelt 
 * @param {boolean} silktouch 
 * @param {number} fortuneLevel 
 */
function performMultiblockPickaxeBreak(player, block, shouldSmelt, silktouch, fortuneLevel, radius = 1, statId = MULTIBLOCPICKAXE_STAT) {

    /**@type {Block[]} */
    let blocks = []
    system.run(() => { world.scoreboard.getObjective(SCOREBOARD_ID).addScore(statId, 1) })

    switch (player.getBlockFromViewDirection({ includeLiquidBlocks: true, includePassableBlocks: true, maxDistance: 9 })?.face || snapToNearestDirection(player.getViewDirection())) {

        case 'South':
        case 'North':
        case '{"x":0,"y":0,"z":1}':
        case '{"x":0,"y":0,"z":-1}':

            blocks = getPlaneBlocks(block, radius, 'z')
            break;

        case 'Down':
        case 'Up':
        case '{"x":0,"y":-1,"z":0}':
        case '{"x":0,"y":1,"z":0}':

            blocks = getPlaneBlocks(block, radius, 'y')
            break;

        case 'East':
        case 'West':
        case '{"x":-1,"y":0,"z":0}':
        case '{"x":1,"y":0,"z":0}':

            blocks = getPlaneBlocks(block, radius, 'x')
            break;

        default:
            break;
    }

    blocks.filter(block => !block.isAir && !block.isLiquid).filter(block => !unbreakableBlocks.some(id => block.typeId == id)).filter(block => !isProtectedUtilityBlock(block)).forEach(block => {
        const newId = findOreId(block.permutation)
        if (!silktouch) {
            performFortune(block.type.id.split(':').pop(), block.dimension, block.location, fortuneLevel)
            system.run(() => {
                if (!["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel", "minecraft:copper_chest", "minecraft:exposed_copper_chest", "minecraft:weathered_copper_chest", "minecraft:oxidized_copper_chest", "minecraft:waxed_copper_chest", "minecraft:waxed_exposed_copper_chest", "minecraft:waxed_weathered_copper_chest", "minecraft:waxed_oxidized_copper_chest"].includes(block.typeId)) block.dimension.runCommand(`fill ${block.x} ${block.y} ${block.z} ${block.x} ${block.y} ${block.z} air destroy`);
            });
            if (shouldSmelt) smeltNearestItem(block.dimension, block.center(), 'minecraft:' + newId, true)
        } else { system.run(() => { block.dimension.spawnItem(block.permutation.getItemStack(), block.location); block.setType('air'); }); }
    })
}

/**
 * Performs the 3x3 breaking 
 * @param {Player} player
 * @param {Block} block
 * @param {boolean} silktouch
 */
function performExcavatorShovelBreak(player, block, silktouch, shouldSmelt = false, radius = 1, statId = EXCAVATORSHOVEL_STAT) {

    /**@type {Block[]} */
    let blocks = []

    system.run(() => { world.scoreboard.getObjective(SCOREBOARD_ID).addScore(statId, 1) })

    switch (player.getBlockFromViewDirection({ includeLiquidBlocks: true, includePassableBlocks: true, maxDistance: 9 })?.face || snapToNearestDirection(player.getViewDirection())) {

        case 'South':
        case 'North':
        case '{"x":0,"y":0,"z":1}':
        case '{"x":0,"y":0,"z":-1}':

            blocks = getPlaneBlocks(block, radius, 'z')
            break;

        case 'Down':
        case 'Up':
        case '{"x":0,"y":-1,"z":0}':
        case '{"x":0,"y":1,"z":0}':

            blocks = getPlaneBlocks(block, radius, 'y')
            break;

        case 'East':
        case 'West':
        case '{"x":-1,"y":0,"z":0}':
        case '{"x":1,"y":0,"z":0}':

            blocks = getPlaneBlocks(block, radius, 'x')
            break;

        default:
            break;
    }

    blocks.filter(block => !block.isAir && !block.isLiquid).filter(block => block.hasTag('minecraft:is_shovel_item_destructible')).filter(block => !isProtectedUtilityBlock(block)).forEach(block => {
        let usesDirectTrackedSmelt = false;

        if (!silktouch && shouldSmelt && directShovelSmeltableBlocks.has(block.typeId)) {
            usesDirectTrackedSmelt = queueDirectSmelt(block.dimension.id, block.location, block.typeId);
        }

        if (!silktouch) {
            system.run(() => {
                block.dimension.runCommand(`fill ${block.x} ${block.y} ${block.z} ${block.x} ${block.y} ${block.z} air destroy`)
            })
            if (shouldSmelt && !usesDirectTrackedSmelt) smeltNearestItem(block.dimension, block.center(), block.typeId, true)
        }
        else { system.run(() => { block.dimension.spawnItem(block.permutation.getItemStack(), block.location); block.setType('air'); }); }
    })

}

function queueDirectSmelt(dimensionId, location, blockTypeId) {
    if (!directShovelSmeltableBlocks.has(blockTypeId)) return false;

    const key = `${dimensionId}:${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`
    pendingDirectSmelts.set(key, blockTypeId)
    return true;
}

function tryProcessDirectSmeltItem(entity) {
    const itemStack = entity.getComponent('item')?.itemStack;
    if (!itemStack) return false;
    if (itemStack.typeId != 'minecraft:sand' && itemStack.typeId != 'minecraft:red_sand') return false;

    const location = entity.location;
    const key = `${entity.dimension.id}:${Math.floor(location.x)},${Math.floor(location.y)},${Math.floor(location.z)}`
    const sourceBlockId = pendingDirectSmelts.get(key)
    if (!sourceBlockId) return false;
    if (recipeMap.get(sourceBlockId) != itemStack.typeId) return false;

    const smeltedId = smeltMap.get(itemStack.typeId)
    if (!smeltedId) return false;

    const newStack = new ItemStack(smeltedId, itemStack.amount)
    entity.dimension.spawnItem(newStack, entity.location)
    entity.remove()
    pendingDirectSmelts.delete(key)
    system.run(() => {
        world.scoreboard.getObjective(SCOREBOARD_ID)?.addScore(MINERESSENTIAL_STAT, itemStack.amount)
    })
    return true;
}

function getPlaneBlocks(center, radius, axis) {
    const blocks = []
    for (let a = -radius; a <= radius; a++) {
        for (let b = -radius; b <= radius; b++) {
            if (a == 0 && b == 0) continue;
            let location;
            if (axis == 'z') location = { x: center.x + a, y: center.y + b, z: center.z }
            else if (axis == 'y') location = { x: center.x + a, y: center.y, z: center.z + b }
            else location = { x: center.x, y: center.y + a, z: center.z + b }
            const block = safeGetBlock(center.dimension, location)
            if (block) blocks.push(block)
        }
    }
    return blocks
}

/**
 * Performs the fake explosion from the explosive pickaxe
 * @param {Player} player
 * @param {Block} block
 * @param {number} loop
 * @param {boolean} shouldSmelt 
 * @param {boolean} silktouch 
 * @param {number} fortuneLevel 
 */
function performExplosivePickaxeBreak(player, block, loop = 2, shouldSmelt, silktouch, fortuneLevel) {

    if (!getConfig(Configs.ExplosivePickaxe)) { configFailedMessage(player); return }

    if (loop == 2) {
        block.dimension.playSound('random.explode', block.location, { pitch: 1, volume: 4 })
        player.dimension.spawnParticle('minecraft:huge_explosion_emitter', block.location)
        world.scoreboard.getObjective(SCOREBOARD_ID).addScore(EXPLOSIVEPICKAXE_STAT, 1)
    }

    for (let i = 0; i <= 32; i++) {
        const ray = player.dimension.getBlockFromRay(block.center(), randomDirection(i, 33), { maxDistance: Math.random() * (10.2 - 9.2) + 9.2 })
        if (ray && !unbreakableBlocks.some(id => ray.block.typeId == id) && !unexplodableBlocks.some(id => ray.block.typeId == id) && !isProtectedUtilityBlock(ray.block)) {
            try {
                if (!silktouch) {
                    performFortune(ray.block.type.id.split(':').pop(), block.dimension, block.location, fortuneLevel)
                    if (!["minecraft:chest", "minecraft:trapped_chest", "minecraft:barrel", "minecraft:copper_chest", "minecraft:exposed_copper_chest", "minecraft:weathered_copper_chest", "minecraft:oxidized_copper_chest", "minecraft:waxed_copper_chest", "minecraft:waxed_exposed_copper_chest", "minecraft:waxed_weathered_copper_chest", "minecraft:waxed_oxidized_copper_chest"].includes(ray.block.typeId)) ray.block.dimension.runCommand(`fill ${ray.block.x} ${ray.block.y} ${ray.block.z} ${ray.block.x} ${ray.block.y} ${ray.block.z} air destroy`)
                    if (shouldSmelt) smeltNearestItem(ray.block.dimension, ray.block.center(), ray.block.typeId, true)
                }
                else { ray.block.dimension.spawnItem(ray.block.permutation.getItemStack(), ray.block.location); ray.block.setType('air'); }
            } catch (error) {
                // Command queue full
            }
        }
    }

    if (loop > 0) { system.runTimeout(() => performExplosivePickaxeBreak(player, block, loop - 1, shouldSmelt, silktouch), 2) }

}

/**
 * Performs fortune 3 on a given ore block
 * @param {("quartz_ore"|"coal_ore"|"deepslate_gold_ore"|"deepslate_coal_ore"|"nether_gold_ore"|"iron_ore"|"copper_ore"|"lapis_ore"|"deepslate_copper_ore"|"deepslate_lapis_ore"|"deepslate_iron_ore"|"gold_ore"|"diamond_ore"|"emerald_ore"|"redstone_ore"|"lit_redstone_ore"|"deepslate_diamond_ore"|"deepslate_emerald_ore"|"deepslate_redstone_ore"|"lit_deepslate_redstone_ore"|"ancient_debris")} blockId 
 * @param {Dimension} dimension
 * @param {import("@minecraft/server").Vector3} location 
 * @param {0|1|2|3} fortuneLevel 
 */
function performFortune(blockId, dimension, location, fortuneLevel = 0) {

    if (!blockId || fortuneLevel == 0) return;

    blockId = blockId.replace('lit_', '').replace('deepslate_', '')

    if (!getOres().includes(blockId) || blockId == 'ancient_debris') return;

    const count = blockId == 'copper_ore' ? randomIntBetween(2, 5) : (blockId == 'nether_gold_ore' ? randomIntBetween(2, 6) : (blockId == 'lapis_ore' ? randomIntBetween(4, 9) : (blockId == 'redstone_ore' ? randomIntBetween(4, 5) : 1)))

    let i = Math.floor(Math.random() * (fortuneLevel + 2)) - 1
    if (i < 0) i = 0
    const bonus = i * count

    if (!bonus) return;

    const loot = getLoot(blockId)

    system.run(() => {
        if (blockId == 'coal_ore' || blockId == 'diamond_ore' || blockId == 'emerald_ore' || blockId == 'gold_ore' || blockId == 'quartz_ore' || blockId == 'iron_ore') dimension.spawnItem(new ItemStack(loot, bonus), location)
        if (blockId == 'copper_ore') dimension.spawnItem(new ItemStack(loot, bonus), location)
        if (blockId == 'nether_gold_ore') dimension.spawnItem(new ItemStack(loot, bonus), location)
        if (blockId == 'lapis_ore') dimension.spawnItem(new ItemStack(loot, bonus), location)
        if (blockId == 'redstone_ore') dimension.spawnItem(new ItemStack(loot, bonus), location)
    })

}

function randomDirection(i, totalRays) {
    const phi = Math.acos(1 - 2 * (i + 0.5) / totalRays);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;

    const x = Math.cos(theta) * Math.sin(phi);
    const y = Math.sin(theta) * Math.sin(phi);
    const z = Math.cos(phi);

    return { x, y, z };
}

function randomIntBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get the loot item for an ore block
 * @param {string} id 
 * @returns {string}
 */
function getLoot(id) {
    if (id == 'coal_ore') return 'coal'
    else if (id == 'diamond_ore') return 'diamond'
    else if (id == 'emerald_ore') return 'emerald'
    else if (id == 'gold_ore') return 'raw_gold'
    else if (id == 'iron_ore') return 'raw_iron'
    else if (id == 'copper_ore') return 'raw_copper'
    else if (id == 'quartz_ore') return 'quartz'
    else if (id == 'nether_gold_ore') return 'gold_nugget'
    else if (id == 'lapis_ore') return 'lapis_lazuli'
    else if (id == 'redstone_ore') return 'redstone'
    else return undefined
}

function getSmeltables() {
    return smeltMap
}

/**
 * 
 * @param {Dimension} dimension 
 * @param {import("@minecraft/server").Vector3} location 
 * @param {string} id
 * @returns 
 */
async function smeltNearestItem(dimension, location, id, repeat = false) {

    if (!smeltableBlocks.includes(id)) return;

    if (repeat) system.run(() => { smeltNearestItem(dimension, location, id) })

    dimension.getEntities({ type: 'minecraft:item', maxDistance: 1.5, location: location }).forEach(i => {

        const l = i.location
        const itemStack = i.getComponent('item').itemStack

        if (!recipeMap.has(id)) return;

        if (recipeMap.get(id) != itemStack.typeId) return;

        system.run(() => {
            world.scoreboard.getObjective(SCOREBOARD_ID)?.addScore(MINERESSENTIAL_STAT, 1);
        })

        const newStack = new ItemStack(smeltMap.get(recipeMap.get(id)))
        newStack.amount = itemStack.amount
        i.kill()
        dimension.spawnItem(newStack, l)

    })
}

function snapToNearestDirection(vector) {
    var northSouth = Math.abs(vector.z);
    var eastWest = Math.abs(vector.x);
    var upDown = Math.abs(vector.y);

    if (upDown >= northSouth && upDown >= eastWest) {
        return { x: 0, y: Math.sign(vector.y), z: 0 };
    } else if (northSouth >= eastWest) {
        return { x: 0, y: 0, z: Math.sign(vector.z) };
    } else {
        return { x: Math.sign(vector.x), y: 0, z: 0 };
    }
}

export { performMultiblockPickaxeBreak, performFortune, performExplosivePickaxeBreak, performExcavatorShovelBreak, getSmeltables, smeltNearestItem, queueDirectSmelt, tryProcessDirectSmeltItem }
