import { world } from '@minecraft/server';

world.beforeEvents.worldInitialize.subscribe(eventData => {
    eventData.blockComponentRegistry.registerCustomComponent('tunekeshi:spawn_loot', {
        onTick(e) {
            const block = e.block;
            const dimension = block.dimension;
            const blockLocation = block.location;
            let command = '';

            switch (block.typeId) {
                case 'tunekeshi:blaze_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "blaze_farm"`;
                    break;
                case 'tunekeshi:piglin_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "piglin_farm"`;
                    break;
                case 'tunekeshi:witch_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "entities/witch"`;
                    break;
                case 'tunekeshi:creeper_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "entities/creeper"`;
                    break;
                case 'tunekeshi:enderman_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "entities/enderman"`;
                    break;
                case 'tunekeshi:iron_golem_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "entities/iron_golem"`;
                    break;
                case 'tunekeshi:phantom_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "phantom_farm"`;
                    break;
                case 'tunekeshi:skeleton_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "entities/skeleton"`;
                    break;
                case 'tunekeshi:slime_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "entities/slime"`;
                    break;
                case 'tunekeshi:wither_skeleton_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "entities/wither_skeleton"`;
                    break;
                case 'tunekeshi:zombie_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "entities/zombie"`;
                    break;
                case 'tunekeshi:vindicator_farm':
                    command = `loot spawn ${blockLocation.x} ${blockLocation.y} ${blockLocation.z} loot "entities/raider_drops"`;
                    break;
                default:
                    return;
            }

            if (command) {
                dimension.runCommandAsync(command);
                const xpAmount = Math.floor(Math.random() * 6);
                for (let i = 0; i < xpAmount; i++) {
                    dimension.runCommandAsync(`summon xp_orb ${blockLocation.x} ${blockLocation.y} ${blockLocation.z}`);
                }
            }
        }
    });
});