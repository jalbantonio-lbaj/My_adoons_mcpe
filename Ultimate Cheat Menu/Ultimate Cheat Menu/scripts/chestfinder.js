import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const CHEST_BLOCKS = [
    "minecraft:chest",
    "minecraft:trapped_chest",
    "minecraft:ender_chest",
    "minecraft:barrel",
    "minecraft:shulker_box",
    "minecraft:undyed_shulker_box",
    "minecraft:dispenser",
    "minecraft:dropper",
    "minecraft:hopper",
    "minecraft:furnace",
    "minecraft:blast_furnace",
    "minecraft:smoker",
];

const CHEST_LABELS = {
    "minecraft:chest": "Chest",
    "minecraft:trapped_chest": "Trapped Chest",
    "minecraft:ender_chest": "Ender Chest",
    "minecraft:barrel": "Barrel",
    "minecraft:shulker_box": "Shulker Box",
    "minecraft:undyed_shulker_box": "Shulker Box",
    "minecraft:dispenser": "Dispenser",
    "minecraft:dropper": "Dropper",
    "minecraft:hopper": "Hopper",
    "minecraft:furnace": "Furnace",
    "minecraft:blast_furnace": "Blast Furnace",
    "minecraft:smoker": "Smoker",
};

export function showChestFinder(player, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§lChest Finder");
        gui.body("§7Choose search radius:");
        gui.button("§8Small §8(16 blocks)", "textures/items/compass_item");
        gui.button("§8Medium §8(32 blocks)", "textures/items/compass_item");
        gui.button("§8Large §8(64 blocks)", "textures/items/compass_item");
        gui.button("Custom Radius", "textures/ui/color_plus");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 4) {
                system.run(() => backToMain(player));
                return;
            }
            if (res.selection === 0) system.run(() => searchChests(player, 16, backToMain));
            if (res.selection === 1) system.run(() => searchChests(player, 32, backToMain));
            if (res.selection === 2) system.run(() => searchChests(player, 64, backToMain));
            if (res.selection === 3) system.run(() => showCustomRadius(player, backToMain));
        });
    });
}

function showCustomRadius(player, backToMain) {
    system.run(() => {
        const gui = new ModalFormData();
        gui.title("§lCustom Radius");
        gui.textField("§fSearch Radius §7(1 to 128)\n§7Enter number of blocks:", "32");
        gui.show(player).then((res) => {
            if (res.canceled) {
                system.run(() => showChestFinder(player, backToMain));
                return;
            }
            system.run(() => {
                const raw = res.formValues[0];
                if (!raw || raw.trim() === "") {
                    system.run(() => showChestFinder(player, backToMain));
                    return;
                }
                const val = parseInt(raw, 10);
                if (isNaN(val) || val < 1) {
                    system.run(() => showChestFinder(player, backToMain));
                    return;
                }
                const radius = Math.min(128, val);
                searchChests(player, radius, backToMain);
            });
        });
    });
}

function searchChests(player, radius, backToMain) {
    system.run(() => {
        const pos = player.location;
        const dim = player.dimension;
        const found = [];
        const minX = Math.floor(pos.x) - radius;
        const maxX = Math.floor(pos.x) + radius;
        const minY = Math.max(-64, Math.floor(pos.y) - radius);
        const maxY = Math.min(320, Math.floor(pos.y) + radius);
        const minZ = Math.floor(pos.z) - radius;
        const maxZ = Math.floor(pos.z) + radius;
        player.sendMessage("§6[Chest Finder] §7Searching in " + radius + " block radius...");
        let x = minX;
        function searchChunk() {
            const chunkEnd = Math.min(x + 8, maxX);
            for (; x <= chunkEnd; x++) {
                for (let y = minY; y <= maxY; y++) {
                    for (let z = minZ; z <= maxZ; z++) {
                        try {
                            const block = dim.getBlock({ x, y, z });
                            if (!block) continue;
                            const typeId = block.typeId;
                            if (CHEST_BLOCKS.includes(typeId)) {
                                const dx = x - Math.floor(pos.x);
                                const dy = y - Math.floor(pos.y);
                                const dz = z - Math.floor(pos.z);
                                const dist = Math.round(Math.sqrt(dx * dx + dy * dy + dz * dz));
                                found.push({ label: CHEST_LABELS[typeId] || typeId, x, y, z, dist });
                            }
                        } catch (_) {}
                    }
                }
            }
            if (x <= maxX) {
                system.run(() => searchChunk());
            } else {
                system.run(() => showResults(player, found, radius, backToMain));
            }
        }
        searchChunk();
    });
}

function showResults(player, found, radius, backToMain) {
    system.run(() => {
        if (found.length === 0) {
            const gui = new ActionFormData();
            gui.title("§lChest Finder");
            gui.body("§cNo storage blocks found within " + radius + " blocks.\n\n§7Try a larger radius.");
            gui.button("§8Search Again", "textures/items/compass_item");
            gui.button("§8Back to Main", "textures/ui/undoArrow");
            gui.show(player).then((res) => {
                if (res.canceled || res.selection === 1) {
                    system.run(() => backToMain(player));
                } else {
                    system.run(() => showChestFinder(player, backToMain));
                }
            });
            return;
        }
        found.sort((a, b) => a.dist - b.dist);
        const results = found.slice(0, 20);
        const gui = new ActionFormData();
        gui.title("§lChest Finder Results");
        gui.body("§7Found §e" + found.length + " §7storage blocks within §e" + radius + " §7blocks.\n§7Tap one to teleport to it.");
        for (const r of results) {
            gui.button("§8" + r.label + "\n§7X:" + r.x + " Y:" + r.y + " Z:" + r.z + " §e(" + r.dist + "m)", "textures/items/compass_item");
        }
        gui.button("§8Search Again", "textures/items/compass_item");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled) {
                system.run(() => backToMain(player));
                return;
            }
            if (res.selection === results.length) {
                system.run(() => showChestFinder(player, backToMain));
                return;
            }
            if (res.selection === results.length + 1) {
                system.run(() => backToMain(player));
                return;
            }
            const target = results[res.selection];
            system.run(() => {
                try {
                    player.teleport(
                        { x: target.x + 0.5, y: target.y + 1, z: target.z + 0.5 },
                        { dimension: player.dimension }
                    );
                    player.sendMessage("§6[Chest Finder] §fTeleported to §e" + target.label + " §7at X:" + target.x + " Y:" + target.y + " Z:" + target.z);
                } catch (_) {
                    player.sendMessage("§cFailed to teleport.");
                }
                system.run(() => showResults(player, found, radius, backToMain));
            });
        });
    });
}