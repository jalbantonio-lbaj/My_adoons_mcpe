import { Block, Player, ItemStack, world, Container } from "@minecraft/server";
import { success } from "./messenger";
import { LOCK_STAT, SCOREBOARD_ID } from "../main";

/**
 * @param {Block} block 
 * @param {Player} player
 */
function lockChest(block, player) {

    const spawnLocation = block.bottomCenter();
    spawnLocation.y -= 0.1;
    const chest = block.getComponent('inventory').container;
    const direction = block.permutation.getState('minecraft:cardinal_direction');

    world.scoreboard.getObjective(SCOREBOARD_ID)?.addScore(LOCK_STAT, 1)

    if (chest.size == 54) {

        const otherBlock = identifyOtherHalf(block, chest);
        let entity;

        if (direction.endsWith('th')) spawnLocation.x -= (block.bottomCenter().x - otherBlock.bottomCenter().x) / 2
        else spawnLocation.z -= (block.bottomCenter().z - otherBlock.bottomCenter().z) / 2;

        if (direction.endsWith('st')) {
            block.dimension.runCommand(`summon gf_wu:lock_barrier_double ${spawnLocation.x} ${spawnLocation.y} ${spawnLocation.z.toFixed(1)} 90 0`)
            entity = block.dimension.getEntities({ location: spawnLocation, maxDistance: 2 }).filter(x => x.typeId == 'gf_wu:lock_barrier_double')[0] //TODO: Replace with .spawnEntity once initialRotation field released
        } else entity = block.dimension.spawnEntity('gf_wu:lock_barrier_double', spawnLocation)

        entity.setDynamicProperty('gf_wu:owner', player.id);
        entity.setDynamicProperty('gf_wu:chests', `${JSON.stringify(otherBlock.location)}|${JSON.stringify(block.location)}`)
    } else {
        const entity = block.dimension.spawnEntity('gf_wu:lock_barrier' + (block.typeId.includes('barrel') ? '_barrel' : ''), spawnLocation)
        entity.setDynamicProperty('gf_wu:owner', player.id);
        entity.setDynamicProperty('gf_wu:chests', `${JSON.stringify(block.location)}`);
    }
    success({ translate: 'gf_wu:chest.locked' }, player);
}

/**
 * @param {Block} block 
 * @param {Container} blockInventory 
 * @returns {Block}
 */
function identifyOtherHalf(block, blockInventory) {

    if (!blockInventory) blockInventory = block.getComponent('inventory').container;
    const direction = block.permutation.getState('minecraft:cardinal_direction');

    const matches = [block.north(), block.east(), block.west(), block.south()].filter(block => !block.isAir && !block.isLiquid).filter(x => x.typeId == block.typeId && x.permutation.getState('minecraft:cardinal_direction') == direction);
    if (matches.length == 1) return matches[0];
    else {
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const matchInventory = match.getComponent('inventory').container
            const oldItem = matchInventory.getItem(0)
            const testItem = new ItemStack('barrier')
            const date = Date.now()
            testItem.setLore([`${date}`])
            matchInventory.setItem(0, testItem)
            if (blockInventory.getItem(0)?.getLore()?.[0] == date) { matchInventory.setItem(0, oldItem); return match }
            matchInventory.setItem(0, oldItem)
        }
    }
}

export { lockChest, identifyOtherHalf }