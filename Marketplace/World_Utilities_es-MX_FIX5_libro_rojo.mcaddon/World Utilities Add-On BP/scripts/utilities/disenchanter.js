import { EquipmentSlot, world, ItemStack, BlockPermutation, Block, BlockComponentPlayerInteractEvent, BlockComponentPlayerBreakEvent, Dimension, Player, EntityEquippableComponent, system } from "@minecraft/server";
import { Configs, getConfig } from "../sub/config";
import { configFailedMessage, failed } from "../sub/messenger";
import { decrementHeldItem } from "../sub/util";

// Register the before event handler for canceling transactions
world.beforeEvents.playerInteractWithBlock.subscribe((e) => {
    const { block, player } = e;

    if (!player.isSneaking) return;
    
    // Check if it's a disenchanter block
    if (block.typeId !== 'gf_wu:disenchanter') return;
    
    const permutation = block.permutation;
    const hasItem = permutation.getState('gf_wu:has_item');
    
    // Only cancel if there's an active transaction
    if (!hasItem) return;

    e.cancel = true;
    
    // Handle the transaction cancellation
    cancelDisenchanterTransaction(block, player, true);
});

world.beforeEvents.playerBreakBlock.subscribe((e) => {
    const { block, player } = e;
    
    // Check if it's a disenchanter block
    if (block.typeId !== 'gf_wu:disenchanter') return;
    
    const permutation = block.permutation;
    const hasItem = permutation.getState('gf_wu:has_item');
    
    // Only cancel if there's an active transaction
    if (!hasItem) return;
    
    // Handle the transaction cancellation - always drop items regardless of config
    dropDisenchanterItems(block, player);
});

/**
 * Drop disenchanter items without config check (for when block is broken)
 * @param {Block} block 
 * @param {Player} player 
 */
function dropDisenchanterItems(block, player) {
    const { permutation, x, y, z } = block;
    const dimension = block.dimension;
    const dimensionId = dimension.id.split(':')[1];
    
    // Defer execution to next tick to ensure proper privileges
    system.run(() => {
        const spawnLocation = block.center();
        
        // Get the stored item
        const savedItem = fetchAndWipeItem(dimension, dimensionId, x, y, z);
        if (savedItem) {
            dimension.spawnItem(savedItem, spawnLocation);
        }
        
        // Return any books that were added
        const bookCount = permutation.getState('gf_wu:book_count');
        if (bookCount > 0) {
            dimension.spawnItem(new ItemStack('minecraft:book', bookCount), spawnLocation);
        }
        
        // Clear the dynamic property
        world.setDynamicProperty(`disenchanter:_${dimensionId}_${x}_${y}_${z}`);
        
        // Play sound
        player.playSound('block.itemframe.remove_item', { location: player.location });
    });
}

/**
 * Cancel the disenchanter transaction and return items
 * @param {Block} block 
 * @param {Player} player 
 */
function cancelDisenchanterTransaction(block, player, setPerm) {
    const { permutation, x, y, z } = block;
    const dimension = block.dimension;
    const dimensionId = dimension.id.split(':')[1];
    
    if (!getConfig(Configs.Disenchanter)) { configFailedMessage(player); return; }
    
    // Defer execution to next tick to ensure proper privileges
    system.run(() => {
        const spawnLocation = block.center();
        
        // Get the stored item
        const savedItem = fetchAndWipeItem(dimension, dimensionId, x, y, z);
        if (savedItem) {
            dimension.spawnItem(savedItem, spawnLocation);
        }
        
        // Return any books that were added
        const bookCount = permutation.getState('gf_wu:book_count');
        if (bookCount > 0) {
            dimension.spawnItem(new ItemStack('minecraft:book', bookCount), spawnLocation);
        }
        
        // Reset the block state
        if (setPerm){
            block.setPermutation(BlockPermutation.resolve('gf_wu:disenchanter'));
        }
        
        // Clear the dynamic property
        world.setDynamicProperty(`disenchanter:_${dimensionId}_${x}_${y}_${z}`);
        
        // Play cancel sound
        player.playSound('block.itemframe.remove_item', { location: player.location });
    });
}

export class DisenchanterComponent {
    /** @param {BlockComponentPlayerInteractEvent} e  */
    onPlayerInteract(e) {

        const { player, block, dimension } = e;
        const { permutation, x, z, y } = block;
        const dimensionId = dimension.id.split(':')[1]

        if (!getConfig(Configs.Disenchanter)) { configFailedMessage(player); return }

        const equippable = player.getComponent('equippable')
        const itemStack = equippable.getEquipment(EquipmentSlot.Mainhand)
        if (!itemStack) return;

        const hasItem = permutation.getState('gf_wu:has_item')

        const enchantable = itemStack.getComponent('enchantable')
        const enchantCount = enchantable?.getEnchantments().length;
        if ((!enchantable || enchantCount === 0) && itemStack.typeId != 'minecraft:book') {
            failed({ translate: hasItem ? 'gf_wu:disenchanter.requires_book' : 'gf_wu:disenchanter.requires_enchanted_item' }, player);
            return
        }

        if (hasItem && world.getDynamicProperty(`disenchanter:_${dimensionId}_${x}_${y}_${z}`)) {
            if (itemStack.typeId != 'minecraft:book') failed({ translate: 'gf_wu:disenchanter.already_has_item' }, player);
            else addBook(block, permutation, x, y, z, dimension, dimensionId, player, equippable, itemStack);
            return;
        }

        if (itemStack.typeId == 'minecraft:book') { failed({ translate: 'gf_wu:disenchanter.add_item_first' }, player); return }

        const belowBlock = dimension.getBlock({ x: x, y: dimensionId == 'minecraft:overworld' ? -64 : 0, z: z })
        const oldPermutation = belowBlock.permutation
        belowBlock.setType('chest')
        const chest = belowBlock.getComponent('inventory').container
        chest.setItem(0, itemStack)
        dimension.runCommand(`execute positioned ${x} ${belowBlock.y} ${z} run structure save "gf_wu:disenchanter_${dimensionId}_${x}_${y}_${z}" ~ ~ ~ ~ ~ ~ false disk true`)
        chest.clearAll();
        belowBlock.setPermutation(oldPermutation);
        player.playSound('block.itemframe.add_item', { location: player.location })

        const booksNeeded = Math.max(enchantCount - (itemStack.typeId == 'minecraft:enchanted_book' ? 1 : 0), 0);
        equippable.setEquipment(EquipmentSlot.Mainhand)
        block.setPermutation(permutation.withState('gf_wu:has_item', true).withState('gf_wu:books_needed', booksNeeded))
        world.setDynamicProperty(`disenchanter:_${dimensionId}_${x}_${y}_${z}`, true)

        if (booksNeeded === 0) {
            completeDisenchant(block, dimension, dimensionId, x, y, z, player);
        }

    }
    
    /** @param {BlockComponentPlayerBreakEvent} e  */
    onPlayerDestroy(e) {
        const { destroyedBlockPermutation: permutation, dimension, block } = e;
        if (!permutation.getState('gf_wu:has_item')) return;
        
        // Always drop items when block is broken, regardless of config
        const dimensionId = dimension.id.split(':')[1];
        const { x, y, z } = block;
        const spawnLocation = block.center();
        
        // Get and drop the stored item
        const itemStack = fetchAndWipeItem(dimension, dimensionId, x, y, z);
        if (itemStack) {
            dimension.spawnItem(itemStack, spawnLocation);
        }
        
        // Drop any books that were added
        const bookCount = permutation.getState('gf_wu:book_count');
        if (bookCount > 0) {
            dimension.spawnItem(new ItemStack('minecraft:book', bookCount), spawnLocation);
        }
        
        // Clear the dynamic property
        world.setDynamicProperty(`disenchanter:_${dimensionId}_${x}_${y}_${z}`);
    }
}

const particles = ['chestplate', 'helmet', 'leggings', 'boots', 'sword', 'axe', 'hoe', 'shovel', 'pickaxe']

/**
 * @param {Block} block 
 * @param {Dimension} dimension 
 */
export function disenchanterLookedAt(block, dimension) {

    if (!getConfig(Configs.Disenchanter)) return;

    const spawnLocation = block.bottomCenter();
    const permutation = block.permutation;

    if (permutation.getState('gf_wu:has_item')) {
        const count = Math.min(Math.max(permutation.getState('gf_wu:books_needed') - permutation.getState('gf_wu:book_count'), 0), 15)
        if (count > 0) dimension.spawnParticle('gf_wu:number_' + count, spawnLocation)
    } else {
        dimension.spawnParticle('gf_wu:down_arrow', spawnLocation)
        if (system.currentTick % 19 == 0) dimension.spawnParticle('gf_wu:' + particles[Math.floor(Math.random() * particles.length)], spawnLocation)
    }
}

/**
 * @param {Block} block 
 * @param {BlockPermutation} permutation 
 * @param {number} x
 * @param {number} y
 * @param {number} z   
 * @param {string} dimensionId 
 * @param {Dimension} dimension
 * @param {Player} player
 * @param {EntityEquippableComponent} equippable  
 * @param {ItemStack} itemStack 
 */
function addBook(block, permutation, x, y, z, dimension, dimensionId, player, equippable, itemStack) {
    const bookCount = permutation.getState('gf_wu:book_count')
    if (bookCount == 15) { failed({ translate: 'gf_wu:disenchanter.books_full' }, player); return }
    decrementHeldItem(itemStack, equippable)
    block.setPermutation(permutation.withState('gf_wu:book_count', bookCount + 1))
    player.playSound('item.book.put', { location: player.location })

    if (bookCount + 1 < permutation.getState('gf_wu:books_needed')) return;

    completeDisenchant(block, dimension, dimensionId, x, y, z, player)

}

function completeDisenchant(block, dimension, dimensionId, x, y, z, player) {
    player.playSound('block.end_portal_frame.fill', { location: block })
    dimension.spawnParticle('minecraft:water_evaporation_bucket_emitter', block.center())
    world.setDynamicProperty(`disenchanter:_${dimensionId}_${x}_${y}_${z}`)

    const savedItem = fetchAndWipeItem(dimension, dimensionId, x, y, z);
    if (!savedItem) {
        block.setPermutation(BlockPermutation.resolve('gf_wu:disenchanter'))
        return;
    }

    const enchantable = savedItem.getComponent('enchantable');
    const spawnLocation = block.center()

    enchantable.getEnchantments().forEach(enchant => {
        const book = new ItemStack('enchanted_book')
        book.getComponent('enchantable').addEnchantment(enchant)
        dimension.spawnItem(book, spawnLocation)
    })

    enchantable.removeAllEnchantments()
    if (savedItem.typeId != 'minecraft:enchanted_book') dimension.spawnItem(savedItem, spawnLocation)

    block.setPermutation(BlockPermutation.resolve('gf_wu:disenchanter'))
}

/**
 * @param {Dimension} dimension 
 * @param {string} dimensionId 
 * @param {number} x 
 * @param {number} y 
 * @param {number} z 
 * @returns 
 */
function fetchAndWipeItem(dimension, dimensionId, x, y, z) {
    const bottomBlock = dimension.getBlock({ x: x, y: dimensionId == 'minecraft:overworld' ? -64 : 0, z: z });
    const previousPermutation = bottomBlock.permutation;
    
    try {
        // Load the structure
        dimension.runCommand(`structure load "gf_wu:disenchanter_${dimensionId}_${x}_${y}_${z}" ${x} ${bottomBlock.y} ${z}`)
        
        // Check if the block is now a chest
        const inventoryComponent = bottomBlock.getComponent('inventory');
        if (!inventoryComponent) {
            dimension.runCommand(`structure delete "gf_wu:disenchanter_${dimensionId}_${x}_${y}_${z}"`)
            return null;
        }
        
        const chestInventory = inventoryComponent.container;
        if (!chestInventory) {
            bottomBlock.setPermutation(previousPermutation);
            dimension.runCommand(`structure delete "gf_wu:disenchanter_${dimensionId}_${x}_${y}_${z}"`)
            return null;
        }
        
        const itemStack = chestInventory.getItem(0);
        chestInventory.clearAll();
        bottomBlock.setPermutation(previousPermutation);
        dimension.runCommand(`structure delete "gf_wu:disenchanter_${dimensionId}_${x}_${y}_${z}"`)
        return itemStack;
        
    } catch (error) {
        console.error(`Error in fetchAndWipeItem: ${error.message}`);
        // Try to restore the block state
        try {
            bottomBlock.setPermutation(previousPermutation);
        } catch (restoreError) {
            console.error(`Failed to restore block permutation: ${restoreError.message}`);
        }
        // Try to clean up the structure
        try {
            dimension.runCommand(`structure delete "gf_wu:disenchanter_${dimensionId}_${x}_${y}_${z}"`)
        } catch (deleteError) {
            console.error(`Failed to delete structure: ${deleteError.message}`);
        }
        return null;
    }
}
