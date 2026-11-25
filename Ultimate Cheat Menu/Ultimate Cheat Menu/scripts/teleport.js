import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getProp, setProp, parseCoords } from "./helpers.js";
function showBringPlayer(player, backToMain) {
    system.run(() => {
        const others = world.getPlayers().filter(p => p.id !== player.id);
        const gui = new ActionFormData();
        gui.title("§lBring Player to Me");
        if (others.length === 0) {
            gui.body("§cNo other players online!");
            gui.button("§8Back", "textures/ui/undoArrow");
            gui.show(player).then(() => system.run(() => showTeleportMenu(player, backToMain)));
            return;
        }
        gui.body("§7Select a player to bring to you:");
        for (const p of others) {
            const dist = Math.round(Math.sqrt(
                Math.pow(p.location.x - player.location.x, 2) +
                Math.pow(p.location.y - player.location.y, 2) +
                Math.pow(p.location.z - player.location.z, 2)
            ));
            gui.button("§8" + p.name + "\n§7" + dist + "m away", "textures/ui/sidebar_icons/profile_screen_icon");
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === others.length) {
                system.run(() => showTeleportMenu(player, backToMain));
                return;
            }
            system.run(() => {
                const target = others[res.selection];
                try {
                    target.teleport(player.location, { dimension: player.dimension });
                    player.sendMessage("§a[TP] §f" + target.name + " §7brought to you!");
                    target.sendMessage("§6[TP] §fYou were teleported to §e" + player.name);
                } catch (_) {
                    player.sendMessage("§cFailed to bring player.");
                }
                showTeleportMenu(player, backToMain);
            });
        });
    });
}
function showTPtoPlayer(player, backToMain) {
    system.run(() => {
        const others = world.getPlayers().filter(p => p.id !== player.id);
        const gui = new ActionFormData();
        gui.title("§lTeleport to Player");
        if (others.length === 0) {
            gui.body("§cNo other players online!");
            gui.button("§8Back", "textures/ui/undoArrow");
            gui.show(player).then(() => system.run(() => showTeleportMenu(player, backToMain)));
            return;
        }
        gui.body("§7Select a player to teleport to:");
        for (const p of others) {
            const dist = Math.round(Math.sqrt(
                Math.pow(p.location.x - player.location.x, 2) +
                Math.pow(p.location.y - player.location.y, 2) +
                Math.pow(p.location.z - player.location.z, 2)
            ));
            gui.button("§8" + p.name + "\n§7" + dist + "m away", "textures/ui/icon_steve");
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === others.length) {
                system.run(() => showTeleportMenu(player, backToMain));
                return;
            }
            system.run(() => {
                const target = others[res.selection];
                try {
                    saveHistory(player);
                    player.teleport(target.location, { dimension: target.dimension });
                    player.sendMessage("§a[TP] §fTeleported to §e" + target.name);
                } catch (_) {
                    player.sendMessage("§cFailed to teleport.");
                }
                showTeleportMenu(player, backToMain);
            });
        });
    });
}
function showTPtoCoords(player, backToMain) {
    system.run(() => {
        const DIMS = [
            { label: "Overworld",  id: "minecraft:overworld" },
            { label: "Nether",     id: "minecraft:nether" },
            { label: "The End",    id: "minecraft:the_end" },
        ];
        const gui = new ModalFormData();
        gui.title("§lTeleport to Coords");
        gui.textField("§fX Y Z coordinates\n§7Example: 100 64 -200 or 100 ~ -200\n§7Use ~ to keep your current value", "0 64 0");
        gui.dropdown(
            "§fDimension",
            DIMS.map(d => d.label),
            { defaultValueIndex: 0 }
        );
        gui.show(player).then((res) => {
            if (res.canceled) {
                system.run(() => showTeleportMenu(player, backToMain));
                return;
            }
            system.run(() => {
                const val = res.formValues[0]?.trim();
                const dimIndex = res.formValues[1] ?? 0;
                if (!val) { showTPtoCoords(player, backToMain); return; }
                const target = parseCoords(val, player.location);
                if (!target) {
                    player.sendMessage("§cInvalid! Enter 3 values: X Y Z. You can use ~ for your current value.");
                    showTPtoCoords(player, backToMain);
                    return;
                }
                const x = Math.round(target.x);
                const y = Math.round(target.y);
                const z = Math.round(target.z);
                try {
                    saveHistory(player);
                    const targetDim = world.getDimension(DIMS[dimIndex].id);
                    player.teleport(target, { dimension: targetDim });
                    player.sendMessage("§a[TP] §fTeleported to §eX:" + x + " Y:" + y + " Z:" + z + " §7(" + DIMS[dimIndex].label + ")");
                } catch (_) {
                    player.sendMessage("§cFailed to teleport.");
                }
                showTeleportMenu(player, backToMain);
            });
        });
    });
}
const DIMENSIONS = [
    { label: "Overworld", id: "minecraft:overworld", desc: "Spawn area", icon: "textures/map/village_plains", spawn: { x: 0, y: 100, z: 0 }, platform: false },
    { label: "The Nether", id: "minecraft:nether", desc: "Fire resistance given", icon: "textures/blocks/netherrack", spawn: { x: 0, y: 64, z: 0 }, platform: false },
    { label: "The End", id: "minecraft:the_end", desc: "Obsidian platform, no portal", icon: "textures/blocks/end_stone", spawn: { x: 100, y: 49, z: 0 }, platform: true },
];

function buildLanding(player, dimension, attempt) {
    if (attempt > 60) return;
    system.runTimeout(() => {
        let landed = false;
        try {
            const loc = player.location;
            const bx = Math.floor(loc.x);
            const by = Math.floor(loc.y);
            const bz = Math.floor(loc.z);
            const below = dimension.getBlock({ x: bx, y: by - 1, z: bz });
            if (below) {
                if (below.isAir || below.isLiquid) {
                    for (let dx = -2; dx <= 2; dx++) {
                        for (let dz = -2; dz <= 2; dz++) {
                            const floor = dimension.getBlock({ x: bx + dx, y: by - 1, z: bz + dz });
                            if (floor && (floor.isAir || floor.isLiquid)) floor.setType("minecraft:obsidian");
                        }
                    }
                }
                for (let dy = 0; dy <= 2; dy++) {
                    const head = dimension.getBlock({ x: bx, y: by + dy, z: bz });
                    if (head && !head.isAir && !head.isLiquid) head.setType("minecraft:air");
                }
                landed = true;
            }
        } catch (_) {}
        if (!landed) buildLanding(player, dimension, attempt + 1);
    }, 2);
}

function travelToDimension(player, dim, backToMain) {
    if (dim.id === player.dimension.id) {
        player.sendMessage("§e[TP] §fYou're already in the §e" + dim.label + " §fdimension!");
        showDimensionMenu(player, backToMain);
        return;
    }
    try {
        saveHistory(player);
        const dimension = world.getDimension(dim.id);
        player.addEffect("resistance", 200, { amplifier: 4, showParticles: false });
        player.addEffect("slow_falling", 200, { amplifier: 0, showParticles: false });
        if (dim.id === "minecraft:nether") player.addEffect("fire_resistance", 600, { amplifier: 0, showParticles: false });
        player.teleport(dim.spawn, { dimension });
        if (dim.platform) buildLanding(player, dimension, 0);
        player.sendMessage("§a[TP] §fArrived in §e" + dim.label + " §7(X:" + dim.spawn.x + " Y:" + dim.spawn.y + " Z:" + dim.spawn.z + ")");
    } catch (_) {
        player.sendMessage("§cFailed to change dimension.");
        showDimensionMenu(player, backToMain);
    }
}

function showDimensionConfirm(player, dim, backToMain) {
    system.run(() => {
        const loc = player.location;
        const current = player.dimension.id.replace("minecraft:", "");
        const gui = new ActionFormData();
        gui.title("§lTravel to " + dim.label);
        gui.body(
            "§7Destination: §e" + dim.label + "\n" +
            "§7Coordinates: §fX:" + dim.spawn.x + " Y:" + dim.spawn.y + " Z:" + dim.spawn.z + "\n\n" +
            "§7From: §f" + current + " §7(X:" + Math.round(loc.x) + " Y:" + Math.round(loc.y) + " Z:" + Math.round(loc.z) + ")\n" +
            "§8Your current spot is saved to TP History.\n\n" +
            "§c§lWARNING!\n" +
            "§cTravelling using Dimension Travel may result in your DEATH.\n" +
            "§cYou can land inside blocks, in lava, or take fall damage.\n" +
            "§cDrop your valuable items in a chest first.\n\n" +
            "§fTeleport there anyway?"
        );
        gui.button("§8Teleport There", dim.icon);
        gui.button("§8Cancel", "textures/ui/cancel");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 1) {
                system.run(() => showDimensionMenu(player, backToMain));
                return;
            }
            system.run(() => travelToDimension(player, dim, backToMain));
        });
    });
}

function showDimensionMenu(player, backToMain) {
    system.run(() => {
        const current = player.dimension.id.replace("minecraft:", "");
        const gui = new ActionFormData();
        gui.title("§lDimension Travel");
        gui.body("§7You are in: §e" + current + "\n§7Jump straight to any dimension:");
        for (const dim of DIMENSIONS) {
            const here = dim.id === player.dimension.id;
            gui.button("§8" + dim.label + "\n" + (here ? "§a✔ You are here" : "§7" + dim.desc), dim.icon);
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === DIMENSIONS.length) {
                system.run(() => showTeleportMenu(player, backToMain));
                return;
            }
            system.run(() => {
                const dim = DIMENSIONS[res.selection];
                if (dim.id === player.dimension.id) {
                    player.sendMessage("§e[TP] §fYou're already in the §e" + dim.label + " §fdimension!");
                    showDimensionMenu(player, backToMain);
                    return;
                }
                showDimensionConfirm(player, dim, backToMain);
            });
        });
    });
}
function saveHistory(player) {
    try {
        const loc = player.location;
        const dim = player.dimension.id.replace("minecraft:", "");
        const entry = {
            x: Math.round(loc.x * 10) / 10,
            y: Math.round(loc.y * 10) / 10,
            z: Math.round(loc.z * 10) / 10,
            dim: dim,
        };
        const history = getProp(player, "tpHistory") || [];
        history.push(entry);
        if (history.length > 20) history.shift();
        setProp(player, "tpHistory", history);
    } catch (_) {}
}
function showClearConfirm(player, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§l§cDANGER!");
        gui.body("§cWARNING\n\n§fDelete ALL saved teleport history?\n\n§eThis cannot be undone!");
        gui.button("§8YES - Delete Forever", "textures/ui/cancel");
        gui.button("§8No - Keep History", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 1) {
                system.run(() => showHistoryMenu(player, backToMain));
                return;
            }
            system.run(() => {
                setProp(player, "tpHistory", undefined);
                player.sendMessage("§c[TP] History cleared!");
                showHistoryMenu(player, backToMain);
            });
        });
    });
}
function showHistoryMenu(player, backToMain) {
    system.run(() => {
        const history = getProp(player, "tpHistory") || [];
        const gui = new ActionFormData();
        gui.title("§lTP History");
        if (history.length === 0) {
            gui.body("§7No history yet.\n§7Teleport somewhere first!");
        } else {
            gui.body("§7Total: §e" + history.length + " §7locations\n§7Tap to return:");
            for (let i = history.length - 1; i >= 0; i--) {
                const p = history[i];
                const dimLabel = p.dim ? " §8(" + p.dim + ")" : "";
                gui.button("§8#" + (i + 1) + " X:" + p.x + " Y:" + p.y + " Z:" + p.z + dimLabel, "textures/ui/refresh_light");
            }
        }
        gui.button("§8Clear History", "textures/ui/cancel");
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === history.length + 1) {
                system.run(() => showTeleportMenu(player, backToMain));
                return;
            }
            if (res.selection === history.length) {
                system.run(() => showClearConfirm(player, backToMain));
                return;
            }
            system.run(() => {
                const realIndex = (history.length - 1) - res.selection;
                const target = history[realIndex];
                try {
                    const dimId = target.dim ? "minecraft:" + target.dim : player.dimension.id;
                    const targetDim = world.getDimension(dimId);
                    player.teleport({ x: target.x, y: target.y, z: target.z }, { dimension: targetDim });
                    player.sendMessage("§a[TP] §fReturned to X:" + target.x + " Y:" + target.y + " Z:" + target.z + (target.dim ? " §7(" + target.dim + ")" : ""));
                } catch (_) {
                    player.sendMessage("§cFailed to teleport.");
                }
                showHistoryMenu(player, backToMain);
            });
        });
    });
}
export function showTeleportMenu(player, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§lTeleport");
        gui.button("Bring Player to Me",         "textures/ui/sidebar_icons/profile_screen_icon");
        gui.button("Teleport Me to Player",       "textures/ui/icon_steve");
        gui.button("Teleport to Coordinates",     "textures/map/village_plains");
        gui.button("Dimension Travel",            "textures/blocks/end_stone");
        gui.button("§8View History",              "textures/ui/icon_book_writable");
        gui.button("§8« Back to Main",            "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 5) {
                system.run(() => backToMain(player));
                return;
            }
            system.run(() => {
                if (res.selection === 0) showBringPlayer(player, backToMain);
                if (res.selection === 1) showTPtoPlayer(player, backToMain);
                if (res.selection === 2) showTPtoCoords(player, backToMain);
                if (res.selection === 3) showDimensionMenu(player, backToMain);
                if (res.selection === 4) showHistoryMenu(player, backToMain);
            });
        });
    });
}