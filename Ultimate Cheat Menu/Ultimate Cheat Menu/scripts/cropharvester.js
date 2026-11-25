import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const harvestState = new Map();

const CROPS = {
    "minecraft:wheat":       { maxAge: 7, drop: "minecraft:wheat",       dropAmt: 1, seed: "minecraft:wheat_seeds",    seedAmt: 2 },
    "minecraft:carrots":     { maxAge: 7, drop: "minecraft:carrot",      dropAmt: 2, seed: "minecraft:carrot",         seedAmt: 0 },
    "minecraft:potatoes":    { maxAge: 7, drop: "minecraft:potato",      dropAmt: 2, seed: "minecraft:potato",         seedAmt: 0 },
    "minecraft:beetroot":    { maxAge: 3, drop: "minecraft:beetroot",    dropAmt: 1, seed: "minecraft:beetroot_seeds", seedAmt: 1 },
    "minecraft:nether_wart": { maxAge: 3, drop: "minecraft:nether_wart", dropAmt: 2, seed: "minecraft:nether_wart",    seedAmt: 0 },
};

export function getCropHarvesterState(player) {
    if (!harvestState.has(player.id)) {
        try {
            const raw = player.getDynamicProperty("cropHarvesterState");
            harvestState.set(player.id, raw ? JSON.parse(raw) : { enabled: false, radius: 5 });
        } catch (_) { harvestState.set(player.id, { enabled: false, radius: 5 }); }
    }
    return harvestState.get(player.id);
}

function saveState(player) {
    try { player.setDynamicProperty("cropHarvesterState", JSON.stringify(harvestState.get(player.id))); } catch (_) {}
}

function giveItemToPlayer(player, itemId, amount) {
    try {
        const inv = player.getComponent("inventory");
        if (!inv) { player.dimension.spawnItem(new ItemStack(itemId, amount), player.location); return; }
        const container = inv.container;
        const item = new ItemStack(itemId, amount);
        const leftover = container.addItem(item);
        if (leftover) {
            player.dimension.spawnItem(leftover, player.location);
        }
    } catch (_) {}
}

export function showCropHarvester(player, backToMain) {
    system.run(() => {
        const state = getCropHarvesterState(player);
        const gui = new ActionFormData();
        gui.title("§lCrop Harvester");
        gui.body(
            "§7Status: " + (state.enabled ? "§aENABLED" : "§cDISABLED") +
            "\n§7Radius: §e" + state.radius + " blocks" +
            "\n\n§7Auto harvests fully grown crops nearby,\n§7gives items directly to your inventory\n§7and replants seeds automatically."
        );
        gui.button(state.enabled ? "§cDisable" : "§aEnable", "textures/ui/toggle_on");
        gui.button("§8Change Radius\n§8Current: §8" + state.radius + " blocks", "textures/items/compass_item");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) { system.run(() => backToMain(player)); return; }
            system.run(() => {
                if (res.selection === 0) {
                    state.enabled = !state.enabled;
                    saveState(player);
                    player.sendMessage("§6[Crop Harvester] §f" + (state.enabled ? "§aEnabled" : "§cDisabled"));
                }
                if (res.selection === 1) { showRadiusPicker(player, backToMain); return; }
                showCropHarvester(player, backToMain);
            });
        });
    });
}

function showRadiusPicker(player, backToMain) {
    system.run(() => {
        const state = getCropHarvesterState(player);
        const radii = [3, 5, 7, 10];
        const gui = new ActionFormData();
        gui.title("§lHarvest Radius");
        for (const r of radii) {
            gui.button((state.radius === r ? "§a✔ " : "§f") + r + " blocks", "textures/items/compass_item");
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === radii.length) { system.run(() => showCropHarvester(player, backToMain)); return; }
            system.run(() => {
                state.radius = radii[res.selection];
                saveState(player);
                player.sendMessage("§6[Crop Harvester] §fRadius: §e" + state.radius + " blocks");
                showCropHarvester(player, backToMain);
            });
        });
    });
}

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const state = harvestState.get(player.id);
        if (!state || !state.enabled) continue;

        try {
            const pos = player.location;
            const dim = player.dimension;
            const r = state.radius;
            const px = Math.floor(pos.x);
            const py = Math.floor(pos.y);
            const pz = Math.floor(pos.z);

            for (let x = px - r; x <= px + r; x++) {
                for (let y = py - 3; y <= py + 3; y++) {
                    for (let z = pz - r; z <= pz + r; z++) {
                        try {
                            const block = dim.getBlock({ x, y, z });
                            if (!block) continue;

                            const cropInfo = CROPS[block.typeId];
                            if (!cropInfo) continue;

                            const age = block.permutation.getState("growth") ??
                                        block.permutation.getState("age") ?? 0;

                            if (age < cropInfo.maxAge) continue;

                            const cropTypeId = block.typeId;

                            block.setType("minecraft:air");

                            giveItemToPlayer(player, cropInfo.drop, cropInfo.dropAmt);
                            if (cropInfo.seedAmt > 0) {
                                giveItemToPlayer(player, cropInfo.seed, cropInfo.seedAmt);
                            }

                            system.runTimeout(() => {
                                try {
                                    const below = dim.getBlock({ x, y: y - 1, z });
                                    if (!below) return;
                                    const belowId = below.typeId;
                                    if (belowId === "minecraft:farmland" || belowId === "minecraft:soul_sand") {
                                        const spot = dim.getBlock({ x, y, z });
                                        if (spot && spot.typeId === "minecraft:air") {
                                            spot.setType(cropTypeId);
                                        }
                                    }
                                } catch (_) {}
                            }, 3);

                        } catch (_) {}
                    }
                }
            }
        } catch (_) {}
    }
}, 20);