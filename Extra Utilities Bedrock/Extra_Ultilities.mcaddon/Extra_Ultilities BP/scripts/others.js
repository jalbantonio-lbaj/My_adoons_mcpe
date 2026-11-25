import { world, ItemStack } from "@minecraft/server"

const monstros = [
    "minecraft:zombie",
    "minecraft:spider",
    "minecraft:skeleton",
    "minecraft:enderman"
];

world.beforeEvents.worldInitialize.subscribe(initEvent => {
    initEvent.blockComponentRegistry.registerCustomComponent("extra_utilities:placed", {
        onPlace(event) {

            const block = event.block

            if (block.typeId === 'extra_utilities:trash_can') {

                let entity = block.dimension.spawnEntity('extra_utilities:trash_can', block.center());
                entity.nameTag = 'extra_utilities.trash_can'
            }
        }
    });
});


world.beforeEvents.worldInitialize.subscribe(initEvent => {
    initEvent.blockComponentRegistry.registerCustomComponent("extra_utilities:tick", {
        onTick(event) {
            const block = event.block;
            const dimension = event.dimension
            const monster = monstros[Math.floor(Math.random() * monstros.length)];

            const pos = {
                x: block.location.x + 0.5,
                y: block.location.y + 1,
                z: block.location.z + 0.5
            };
            const setPos = [//grass position
                "~1~~",
                "~-1~~",
                "~~~1",
                "~~~-1"
            ];
            const { x, y, z } = block.location;
            const bLoc = block.location;

            const neighbor = [//neighbor detect
                dimension.getBlock({ x: x + 1, y, z }),//east
                dimension.getBlock({ x: x - 1, y, z }),//west
                dimension.getBlock({ x, y, z: z + 1 }),//south
                dimension.getBlock({ x, y, z: z - 1 })//north
            ];
            const hasGrass = neighbor.some(nb => nb?.typeId === "minecraft:grass_block");//check if the neighbor is grass

            const setPosRandom = setPos[Math.floor(Math.random() * setPos.length)];//set random position for grass

            if (block.typeId === "extra_utilities:cursed_earth") {//spawn monster
                block.dimension.spawnEntity(monster, pos);

                if (block.typeId === "extra_utilities:cursed_earth" && hasGrass) {//put cursed grass
                    block.dimension.runCommand(`execute positioned ${bLoc.x} ${bLoc.y} ${bLoc.z} run fill ${setPosRandom} ${setPosRandom} extra_utilities:cursed_earth replace grass_block`);
                }

                const dayTime = world.getTimeOfDay();

                if (dayTime >= 0 && dayTime <= 12000) {
                    let hasAir = true;

                    for (let yy = y + 1; yy <= 319; yy++) {
                        const blockInTop = dimension.getBlock({ x, y: yy, z });

                        if (blockInTop?.typeId !== "minecraft:air") {
                            hasAir = false;
                            break;
                        }
                    }
                    if (hasAir) {
                        console.warn("chegou aqui");
                        block.dimension.runCommand(`execute positioned ${bLoc.x} ${bLoc.y} ${bLoc.z} run setblock ~~1~ fire`);
                        block.setType('minecraft:dirt');
                    }
                }
            };
            if (block.typeId === "extra_utilities:grid") {
                block.setType('minecraft:air');
            }
        }
    });
});

world.beforeEvents.worldInitialize.subscribe(initEvent => {
    initEvent.blockComponentRegistry.registerCustomComponent("extra_utilities:grid", {
        onTick(event) {
            const block = event.block;

            if (block.typeId === "extra_utilities:grid") {
                console.warn("pirus")
            }
        }
    });
});


world.afterEvents.entityDie.subscribe((event) => {
    const entity = event.deadEntity;
    const player = event.damageSource?.damagingEntity;

    if (!player || player.typeId !== "minecraft:player") return;

    const dimension = entity.dimension;

    const x = Math.floor(entity.location.x);
    const y = Math.floor(entity.location.y);
    const z = Math.floor(entity.location.z);

    const dayTime = world.getTimeOfDay();

    let found = false;

    for (let dx = -8; dx <= 8 && !found; dx++) {
        for (let dz = -8; dz <= 8 && !found; dz++) {
            for (let dy = -2; dy <= 2 && !found; dy++) {

                const cx = x + dx;
                const cy = y + dy;
                const cz = z + dz;

                const center = dimension.getBlock({ x: cx, y: cy, z: cz });

                if (!center || center.typeId !== "minecraft:enchanting_table") {
                    continue;
                }

                const redstoneBlocks = [
                    dimension.getBlock({ x: cx + 1, y: cy, z: cz }),
                    dimension.getBlock({ x: cx + 1, y: cy, z: cz - 1 }),
                    dimension.getBlock({ x: cx + 1, y: cy, z: cz + 1 }),
                    dimension.getBlock({ x: cx - 1, y: cy, z: cz }),
                    dimension.getBlock({ x: cx - 1, y: cy, z: cz - 1 }),
                    dimension.getBlock({ x: cx - 1, y: cy, z: cz + 1 }),
                    dimension.getBlock({ x: cx, y: cy, z: cz + 1 }),
                    dimension.getBlock({ x: cx, y: cy, z: cz - 1 })
                ];

                const validStructure = redstoneBlocks.every(
                    block => block?.typeId === "minecraft:redstone_wire"
                );

                if (!validStructure) continue;

                if (dayTime < 17500 || dayTime > 19000) continue;

                const inv = player.getComponent("minecraft:inventory");
                const container = inv?.container;

                if (!container) continue;

                for (let slot = 0; slot < container.size; slot++) {
                    const item = container.getItem(slot);

                    if (item?.typeId === "extra_utilities:division_sigil") {

                        container.setItem(
                            slot,
                            new ItemStack(
                                "extra_utilities:division_sigil_activated",
                                1
                            )
                        );

                        for (let i = 0; i < 6; i++) {
                            const pos = {
                                x: cx + Math.floor(Math.random() * 5) - 2,
                                y: cy + 1,
                                z: cz + Math.floor(Math.random() * 5) - 2
                            };

                            dimension.spawnEntity(
                                monstros[Math.floor(Math.random() * monstros.length)],
                                pos
                            );
                        }

                        dimension.runCommand(
                            `execute positioned ${cx} ${cy} ${cz} run function cursed_earth`
                        );

                        found = true;
                        break;
                    }
                }
            }
        }
    }
});


