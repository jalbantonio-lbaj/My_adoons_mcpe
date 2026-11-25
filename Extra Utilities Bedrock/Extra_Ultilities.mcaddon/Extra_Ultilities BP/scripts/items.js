import { world, system, ItemStack, EquipmentSlot } from "@minecraft/server";

let mobData = [];//0 age , 1 color, 2 variant

const plants = [
    "minecraft:short_dry_grass",
    "minecraft:short_grass",
    "minecraft:tall_dry_grass",
    "minecraft:tall_grass",
    "minecraft:carrots",
    "minecraft:wheat",
    "minecraft:potatoes",
    "minecraft:beetroot",
    "minecraft:crimson_fungus",
    "minecraft:warped_fungus",
    "minecraft:crimson_roots",
    "minecraft:warped_roots",
    "minecraft:nether_sprouts",
    "minecraft:weeping_vines",
    "minecraft:twisting_vines",
    "minecraft:nether_wart",
    "minecraft:bush",
    "minecraft:deadbush",
    "minecraft:firefly_bush",
    "minecraft:fern",
    "minecraft:large_fern",
    "minecraft:reeds"
]

world.beforeEvents.worldInitialize.subscribe((eventData) => {
    eventData.itemComponentRegistry.registerCustomComponent("extra_utilities:hit", {
        onHitEntity(event) {
            const player = event.attackingEntity;
            const target = event.hitEntity;

            const equippable = player.getComponent("minecraft:equippable");
            const item = equippable?.getEquipment(EquipmentSlot.Mainhand);

            if (!item || item.typeId !== "extra_utilities:golden_lasso") return;

            // ===== BABY / ADULT =====
            if (!target.hasComponent("minecraft:is_baby")) {
                mobData[0] = "adult";
            } else {
                mobData[0] = "baby";
            }

            // ===== COLOR (sheep etc) =====
            const colorComp = target.getComponent("minecraft:color");
            if (colorComp) {
                mobData[1] = colorComp.value;
            } else {
                mobData[1] = undefined;
            }
            // ===== REMOVE MOB =====
            const targetName = target.typeId;
            target.remove();

            // ===== ITEM LORE =====
            const newItem = new ItemStack("extra_utilities:golden_lasso_on", 1);
            newItem.setLore([`§7${targetName}`]);

            equippable.setEquipment(EquipmentSlot.Mainhand, newItem);
        }
    });
});


world.afterEvents.entityHitBlock.subscribe((event) => {
    const damagingEntity = event.damagingEntity;
    const hitBlock = event.hitBlock;

    const equippable = damagingEntity.getComponent("minecraft:equippable");
    const item = equippable?.getEquipment(EquipmentSlot.Mainhand);

    if (!item || item.typeId !== "extra_utilities:golden_lasso_on") return;

    const spawnPos = {
        x: hitBlock.location.x + 0.5,
        y: hitBlock.location.y + 1,
        z: hitBlock.location.z + 0.5
    };

    const mobId = item.getLore()[0].replace("§7", "");

    const dimension = damagingEntity.dimension;

    // ===== SPAWN ENTITY =====
    const spawned = dimension.spawnEntity(mobId, spawnPos);

    // ===== BABY / ADULT =====
    if (mobData[0] === "baby") {
        spawned.triggerEvent("minecraft:entity_born");
    } else if (mobData[0] === "adult") {
        spawned.triggerEvent("minecraft:ageable_grow_up");
    }

    // ===== COLOR =====
    const colorComp = spawned.getComponent("minecraft:color");
    if (colorComp && mobData[1] !== undefined) {
        colorComp.value = mobData[1];
    }

    // ===== RESET ITEM =====
    const newItem = new ItemStack("extra_utilities:golden_lasso", 1);
    equippable.setEquipment(EquipmentSlot.Mainhand, newItem);

    // reset data
    mobData[0] = undefined;
    mobData[1] = undefined;
});

world.afterEvents.itemUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;

    if (!item || item.typeId !== "extra_utilities:angel_block") return;

    // Se estiver mirando em qualquer bloco,
    // deixa o placement vanilla cuidar disso.
    const hit = player.getBlockFromViewDirection({
        maxDistance: 6
    });

    if (hit) return;

    const view = player.getViewDirection();
    const loc = player.location;

    const pos = {
        x: Math.floor(loc.x + view.x * 2),
        y: Math.floor(loc.y + view.y * 2),
        z: Math.floor(loc.z + view.z * 2)
    };

    player.dimension.setBlockType(
        pos,
        "extra_utilities:angel_block"
    );
});

//sicklesssss
world.afterEvents.playerBreakBlock.subscribe((event) => {
    const player = event.player;

    const equippable = player.getComponent("minecraft:equippable");
    const item = equippable?.getEquipment(EquipmentSlot.Mainhand);

    if (!item) return;

    const dimension = player.dimension;
    const loc = event.block.location;
    console.warn("foi item")

    let radius = 0;

    switch (item.typeId) {
        case "extra_utilities:sickle_wood":
            radius = 1; // 3x3
            break;

        case "extra_utilities:sickle_stone":
            radius = 2; // 5x5
            break;

        case "extra_utilities:sickle_iron":
            radius = 3; // 7x7
            break;

        case "extra_utilities:sickle_gold":
            radius = 1; // 7x7
            break;

        case "extra_utilities:sickle_diamond":
            radius = 4; // 9x9
            break;

        default:
            return;
    }

    for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
            const pos = {
                x: loc.x + x,
                y: loc.y,
                z: loc.z + z
            };

            const block = dimension.getBlock(pos);

            if (!block) continue;

            if (plants.includes(block.typeId)) {
                dimension.runCommand(
                    `setblock ${pos.x} ${pos.y} ${pos.z} air destroy`
                );
                const durability = item.getComponent("minecraft:durability");

                if (durability) {
                    durability.damage++;

                    if (durability.damage >= durability.maxDurability) {
                        equippable.setEquipment(EquipmentSlot.Mainhand);
                        player.playSound("random.break");
                        return;
                    }

                    equippable.setEquipment(EquipmentSlot.Mainhand, item);
                }
            }
        }
    }
});
//BUILDER WAND

world.beforeEvents.worldInitialize.subscribe((eventData) => {
    eventData.itemComponentRegistry.registerCustomComponent("fm:nntz_on_use", {
        onUse(event) {
            const player = event.source;
            const item = event.itemStack;

            if (item.typeId !== "extra_utilities:builderswand") return;

            const view = player.getBlockFromViewDirection();

            if (!view) return;

            const startBlock = view.block;
            const face = view.face;

            const placeDirections = {
                Up: { x: 0, y: 1, z: 0 },
                Down: { x: 0, y: -1, z: 0 },
                North: { x: 0, y: 0, z: -1 },
                South: { x: 0, y: 0, z: 1 },
                East: { x: 1, y: 0, z: 0 },
                West: { x: -1, y: 0, z: 0 }
            };

            const placeDir = placeDirections[face];

            let neighbors;

            switch (face) {
                case "Up":
                case "Down":
                    neighbors = [
                        { x: 1, y: 0, z: 0 },
                        { x: -1, y: 0, z: 0 },
                        { x: 0, y: 0, z: 1 },
                        { x: 0, y: 0, z: -1 }
                    ];
                    break;

                case "North":
                case "South":
                    neighbors = [
                        { x: 1, y: 0, z: 0 },
                        { x: -1, y: 0, z: 0 },
                        { x: 0, y: 1, z: 0 },
                        { x: 0, y: -1, z: 0 }
                    ];
                    break;

                case "East":
                case "West":
                    neighbors = [
                        { x: 0, y: 1, z: 0 },
                        { x: 0, y: -1, z: 0 },
                        { x: 0, y: 0, z: 1 },
                        { x: 0, y: 0, z: -1 }
                    ];
                    break;
            }

            const queue = [startBlock];
            const visited = new Set();
            const connectedBlocks = [];

            while (queue.length > 0 && connectedBlocks.length < 9) {
                const block = queue.shift();

                const key = `${block.location.x},${block.location.y},${block.location.z}`;

                if (visited.has(key)) continue;
                visited.add(key);

                if (block.typeId !== startBlock.typeId) continue;

                connectedBlocks.push(block);

                for (const offset of neighbors) {
                    const neighbor = block.dimension.getBlock({
                        x: block.location.x + offset.x,
                        y: block.location.y + offset.y,
                        z: block.location.z + offset.z
                    });

                    if (neighbor) {
                        queue.push(neighbor);
                    }
                }
            }

            for (const block of connectedBlocks) {
                const targetPos = {
                    x: block.location.x + placeDir.x,
                    y: block.location.y + placeDir.y,
                    z: block.location.z + placeDir.z
                };

                const targetBlock = block.dimension.getBlock(targetPos);

                const inventory = player.getComponent("minecraft:inventory")?.container;

                if (targetBlock && (targetBlock.typeId === "minecraft:air" || targetBlock.typeId === "extra_utilities:grid")) {

                    let found = false;

                    for (let i = 0; i < inventory.size; i++) {
                        const stack = inventory.getItem(i);

                        if (!stack) continue;

                        if (stack.typeId !== startBlock.typeId) continue;

                        found = true;

                        targetBlock.setType(startBlock.typeId);

                        if (stack.amount > 1) {
                            stack.amount--;
                            inventory.setItem(i, stack);
                        } else {
                            inventory.setItem(i);
                        }

                        break;
                    }
                    if (!found) break;
                }
            }
        }
    });
});


const previews = new Map();

function removePreview(player) {
    const oldPreview = previews.get(player.id);

    if (!oldPreview) return;

    for (const pos of oldPreview.positions) {
        const block = player.dimension.getBlock(pos);

        if (block?.typeId === "extra_utilities:grid") {
            block.setType("minecraft:air");
        }
    }

    previews.delete(player.id);
}

system.runInterval(() => {
    for (const player of world.getPlayers()) {

        const item = player.getComponent("minecraft:equippable")
            ?.getEquipment("Mainhand");

        if (!item || item.typeId !== "extra_utilities:builderswand") {
            removePreview(player);
            continue;
        }

        const view = player.getBlockFromViewDirection({
            maxDistance: 8
        });

        if (!view) {
            removePreview(player);
            continue;
        }

        const startBlock = view.block;
        const face = view.face;

        const currentKey =
            `${startBlock.location.x},${startBlock.location.y},${startBlock.location.z},${face}`;

        const oldPreview = previews.get(player.id);

        if (oldPreview?.key === currentKey)
            continue;

        removePreview(player);

        const placeDirections = {
            Up: { x: 0, y: 1, z: 0 },
            Down: { x: 0, y: -1, z: 0 },
            North: { x: 0, y: 0, z: -1 },
            South: { x: 0, y: 0, z: 1 },
            East: { x: 1, y: 0, z: 0 },
            West: { x: -1, y: 0, z: 0 }
        };

        const placeDir = placeDirections[face];

        if (!placeDir)
            continue;

        let neighbors = [];

        switch (face) {

            case "Up":
            case "Down":
                neighbors = [
                    { x: 1, y: 0, z: 0 },
                    { x: -1, y: 0, z: 0 },
                    { x: 0, y: 0, z: 1 },
                    { x: 0, y: 0, z: -1 }
                ];
                break;

            case "North":
            case "South":
                neighbors = [
                    { x: 1, y: 0, z: 0 },
                    { x: -1, y: 0, z: 0 },
                    { x: 0, y: 1, z: 0 },
                    { x: 0, y: -1, z: 0 }
                ];
                break;

            case "East":
            case "West":
                neighbors = [
                    { x: 0, y: 1, z: 0 },
                    { x: 0, y: -1, z: 0 },
                    { x: 0, y: 0, z: 1 },
                    { x: 0, y: 0, z: -1 }
                ];
                break;
        }

        const queue = [startBlock];
        const visited = new Set();
        const connectedBlocks = [];

        while (queue.length > 0 && connectedBlocks.length < 9) {

            const block = queue.shift();

            if (!block) continue;

            const key =
                `${block.location.x},${block.location.y},${block.location.z}`;

            if (visited.has(key))
                continue;

            visited.add(key);

            if (block.typeId !== startBlock.typeId)
                continue;

            connectedBlocks.push(block);

            for (const offset of neighbors) {

                const neighbor = block.dimension.getBlock({
                    x: block.location.x + offset.x,
                    y: block.location.y + offset.y,
                    z: block.location.z + offset.z
                });

                if (neighbor)
                    queue.push(neighbor);
            }
        }

        const previewPositions = [];

        for (const block of connectedBlocks) {

            const targetPos = {
                x: block.location.x + placeDir.x,
                y: block.location.y + placeDir.y,
                z: block.location.z + placeDir.z
            };

            const targetBlock =
                block.dimension.getBlock(targetPos);

            if (!targetBlock)
                continue;

            if (targetBlock.typeId === "minecraft:air") {

                targetBlock.setType("extra_utilities:grid");

                previewPositions.push(targetPos);
            }
        }

        previews.set(player.id, {
            key: currentKey,
            positions: previewPositions
        });
    }
}, 2);

//DESTRUCTION WAND


world.afterEvents.entityHitBlock.subscribe((event) => {

    const player = event.damagingEntity;

    if (!player || player.typeId !== "minecraft:player")
        return;

    const item = player.getComponent("minecraft:equippable")
        ?.getEquipment(EquipmentSlot.Mainhand);

    if (!item || item.typeId !== "extra_utilities:destructionwand")
        return;

    const block = event.hitBlock;
    const face = event.blockFace;

    const positions = [];

    switch (face) {

        case "Up":
        case "Down":

            for (let x = -1; x <= 1; x++) {
                for (let z = -1; z <= 1; z++) {
                    positions.push({
                        x: block.location.x + x,
                        y: block.location.y,
                        z: block.location.z + z
                    });
                }
            }
            break;

        case "North":
        case "South":

            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    positions.push({
                        x: block.location.x + x,
                        y: block.location.y + y,
                        z: block.location.z
                    });
                }
            }
            break;

        case "East":
        case "West":

            for (let y = -1; y <= 1; y++) {
                for (let z = -1; z <= 1; z++) {
                    positions.push({
                        x: block.location.x,
                        y: block.location.y + y,
                        z: block.location.z + z
                    });
                }
            }
            break;
    }

    for (const pos of positions) {

        player.dimension.runCommand(
            `setblock ${pos.x} ${pos.y} ${pos.z} air destroy`
        );
    }
});