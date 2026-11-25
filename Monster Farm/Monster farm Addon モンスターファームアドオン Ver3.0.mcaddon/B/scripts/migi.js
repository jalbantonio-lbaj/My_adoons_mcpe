import { world, EquipmentSlot } from "@minecraft/server";

world.beforeEvents.worldInitialize.subscribe(eventData => {
    eventData.blockComponentRegistry.registerCustomComponent('tunekeshi:migi_kurikku', {
        onPlayerInteract: e => {
            const { block, player } = e;
            if (!player) return;

            const blockId = block.typeId;
            const dimension = block.dimension;
            const blockLocation = block.location;
            const equipment = player.getComponent("minecraft:equippable");
            const mainHandItem = equipment?.getEquipment(EquipmentSlot.Mainhand);
            if (!mainHandItem || mainHandItem.typeId !== 'minecraft:gold_ingot') return;
            let command = '';
            if (blockId === 'tunekeshi:piglin_farm') {
                command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "entities/piglin_barter"`;
            }
            if (command) {
                dimension.runCommandAsync(command);
                player.runCommandAsync("clear @s minecraft:gold_ingot 0 1");
            }
        },
    });
});