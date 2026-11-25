import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { setActionBarSlot, clearActionBarSlot } from "./actionbar.js";
const trackerState = new Map();
function getState(player) {
    if (!trackerState.has(player.id)) {
        trackerState.set(player.id, {
            enabled: false,
            mode: "mob",
            target: "",
            radius: 64,
            results: [],
        });
    }
    return trackerState.get(player.id);
}
const COMMON_MOBS = [
    "creeper", "zombie", "skeleton", "spider", "enderman", "witch",
    "blaze", "wither_skeleton", "piglin", "hoglin", "phantom",
    "slime", "drowned", "husk", "stray", "pillager", "ravager",
    "cow", "pig", "sheep", "chicken", "horse", "wolf", "cat",
    "villager", "iron_golem", "snow_golem", "bat", "bee",
    "elder_guardian", "guardian", "shulker", "ender_dragon", "wither",
];
const COMMON_BLOCKS = [
    "diamond_ore", "deepslate_diamond_ore",
    "ancient_debris", "emerald_ore",
    "gold_ore", "iron_ore", "coal_ore",
    "chest", "spawner", "portal",
];
export function showTrackerMenu(player, backToMain) {
    system.run(() => {
        const state = getState(player);
        const gui = new ActionFormData();
        gui.title("§lMob & Block Tracker");
        gui.body(
            "§7Status: " + (state.enabled ? "§aACTIVE" : "§cOFF") +
            "\n§cNote: This feature may cause lag." +
            "\n§7Mode: §e" + (state.mode === "mob" ? "Mob" : "Block") +
            "\n§7Target: §e" + (state.target || "None") +
            "\n§7Radius: §e" + state.radius + " blocks" +
            (state.results.length > 0 ? "\n§7Found: §e" + state.results.length + " nearby" : "")
        );
        gui.button("Track a Mob\n§8Search for any mob", "textures/items/spawn_egg");
        gui.button("§8Track a Block\n§8Search for any block", "textures/items/diamond_pickaxe");
        gui.button("§8Change Radius\n§8Current: §8" + state.radius + " blocks", "textures/items/compass_item");
        if (state.enabled) {
            gui.button("§8Stop Tracking", "textures/ui/cancel");
        } else {
            gui.button("§8Start Tracking\n§8(set target first)", "textures/ui/toggle_on");
        }
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            const backIdx = state.enabled ? 4 : 4;
            if (res.canceled || res.selection === 4) {
                system.run(() => backToMain(player));
                return;
            }
            system.run(() => {
                if (res.selection === 0) showMobPicker(player, backToMain);
                if (res.selection === 1) showBlockPicker(player, backToMain);
                if (res.selection === 2) showRadiusPicker(player, backToMain);
                if (res.selection === 3) {
                    if (state.enabled) {
                        state.enabled = false;
                        clearActionBarSlot(player, "tracker_mob");
                        player.sendMessage("§6[Tracker] §cStopped tracking.");
                    } else {
                        if (!state.target) {
                            player.sendMessage("§cSet a target first!");
                        } else {
                            state.enabled = true;
                            player.sendMessage("§6[Tracker] §aNow tracking: §e" + state.target);
                        }
                    }
                    showTrackerMenu(player, backToMain);
                }
            });
        });
    });
}
function showMobPicker(player, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§lTrack a Mob");
        gui.body("§7Choose a common mob or enter custom name:");
        gui.button("Custom mob name...\n§8Type any mob ID", "textures/ui/color_plus");
        for (const mob of COMMON_MOBS) {
            gui.button("§8" + mob, "textures/items/spawn_egg");
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === COMMON_MOBS.length + 1) {
                system.run(() => showTrackerMenu(player, backToMain));
                return;
            }
            system.run(() => {
                if (res.selection === 0) {
                    showCustomInput(player, "mob", backToMain);
                } else {
                    const mob = COMMON_MOBS[res.selection - 1];
                    const state = getState(player);
                    state.mode = "mob";
                    state.target = mob;
                    state.enabled = true;
                    player.sendMessage("§6[Tracker] §aNow tracking mob: §e" + mob);
                    showTrackerMenu(player, backToMain);
                }
            });
        });
    });
}
function showBlockPicker(player, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§lTrack a Block");
        gui.body("§7Choose a common block or enter custom name:");
        gui.button("§8Custom block name...\n§8Type any block ID", "textures/ui/color_plus");
        for (const block of COMMON_BLOCKS) {
            gui.button("§8" + block, "textures/items/diamond_pickaxe");
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === COMMON_BLOCKS.length + 1) {
                system.run(() => showTrackerMenu(player, backToMain));
                return;
            }
            system.run(() => {
                if (res.selection === 0) {
                    showCustomInput(player, "block", backToMain);
                } else {
                    const block = COMMON_BLOCKS[res.selection - 1];
                    const state = getState(player);
                    state.mode = "block";
                    state.target = block;
                    state.enabled = true;
                    player.sendMessage("§6[Tracker] §aNow tracking block: §e" + block);
                    showTrackerMenu(player, backToMain);
                }
            });
        });
    });
}
function showCustomInput(player, mode, backToMain) {
    system.run(() => {
        const gui = new ModalFormData();
        gui.title(mode === "mob" ? "§lCustom Mob" : "§lCustom Block");
        gui.textField(
            mode === "mob"
                ? "Enter mob identifier\nExamples: creeper, zombie, skeleton, villager, cow\nNot working? You might be entering the wrong identifier.\nUse the exact mob ID without minecraft: prefix."
                : "Enter block identifier\nExamples: diamond_ore, chest, spawner, lava, water\nNot working? You might be entering the wrong identifier.\nUse the exact block ID without minecraft: prefix.",
            mode === "mob" ? "creeper" : "diamond_ore"
        );
        gui.show(player).then((res) => {
            if (res.canceled) {
                system.run(() => showTrackerMenu(player, backToMain));
                return;
            }
            system.run(() => {
                const input = res.formValues[0]?.trim().toLowerCase().replace(/^minecraft:/, "");
                if (!input) {
                    showTrackerMenu(player, backToMain);
                    return;
                }
                const state = getState(player);
                state.mode = mode;
                state.target = input;
                state.enabled = true;
                player.sendMessage("§6[Tracker] §aNow tracking " + mode + ": §e" + input);
                showTrackerMenu(player, backToMain);
            });
        });
    });
}
function showRadiusPicker(player, backToMain) {
    system.run(() => {
        const state = getState(player);
        const radii = [32, 64, 96, 128, 192, 256];
        const gui = new ActionFormData();
        gui.title("§lSearch Radius");
        gui.body("§7Larger radius = slower scan\n§7Recommended: 64-128 blocks");
        for (const r of radii) {
            gui.button((state.radius === r ? "§a" : "§f") + r + " blocks", "textures/items/compass_item");
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === radii.length) {
                system.run(() => showTrackerMenu(player, backToMain));
                return;
            }
            system.run(() => {
                state.radius = radii[res.selection];
                player.sendMessage("§6[Tracker] §fRadius: §e" + state.radius + " blocks");
                showTrackerMenu(player, backToMain);
            });
        });
    });
}
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const state = trackerState.get(player.id);
        if (!state || !state.enabled || !state.target) {
            clearActionBarSlot(player, "tracker_mob");
            continue;
        }
        try {
            const pos = player.location;
            const dim = player.dimension;
            const fullId = "minecraft:" + state.target;
            if (!state._lastResult) state._lastResult = "§6[Tracker] §7Scanning...";
            if (state.mode === "mob") {
                const entities = dim.getEntities({
                    location: pos,
                    maxDistance: state.radius,
                    type: fullId,
                });
                if (entities.length === 0) {
                    setActionBarSlot(player, "tracker_mob", state._lastResult || "§6[Tracker] §7No §e" + state.target + " §7nearby");
                    continue;
                }
                const sorted = entities.map(e => {
                    const dx = e.location.x - pos.x;
                    const dy = e.location.y - pos.y;
                    const dz = e.location.z - pos.z;
                    return { dist: Math.round(Math.sqrt(dx*dx+dy*dy+dz*dz)), x: Math.floor(e.location.x), y: Math.floor(e.location.y), z: Math.floor(e.location.z) };
                }).sort((a, b) => a.dist - b.dist);
                const top = sorted.slice(0, 3);
                const lines = top.map(e => "§e" + state.target + " §7X:" + e.x + " Y:" + e.y + " Z:" + e.z + " §8(" + e.dist + "m)");
                const extra = sorted.length > 3 ? "\n§7+" + (sorted.length - 3) + " more" : "";
                const mobResult = "§6[Tracker] §7" + sorted.length + " found:\n" + lines.join("\n") + extra;
                state._lastResult = mobResult;
                setActionBarSlot(player, "tracker_mob", mobResult);
            } else {
                const r = Math.min(state.radius, 96);
                const rawFound = [];
                const px = Math.floor(pos.x), py = Math.floor(pos.y), pz = Math.floor(pos.z);
                outer:
                for (let x = px - r; x <= px + r; x += 4) {
                    for (let y = Math.max(-64, py - r); y <= Math.min(320, py + r); y += 4) {
                        for (let z = pz - r; z <= pz + r; z += 4) {
                            try {
                                const block = dim.getBlock({ x, y, z });
                                if (block && block.typeId === fullId) {
                                    const dx = x-pos.x, dy2 = y-pos.y, dz2 = z-pos.z;
                                    rawFound.push({ x, y, z, dist: Math.round(Math.sqrt(dx*dx+dy2*dy2+dz2*dz2)) });
                                    if (rawFound.length >= 200) break outer;
                                }
                            } catch (_) {}
                        }
                    }
                }
                if (rawFound.length === 0) {
                    setActionBarSlot(player, "tracker_mob", state._lastResult || "§6[Tracker] §7No §e" + state.target + " §7nearby");
                    continue;
                }
                const groups = [];
                const used = new Array(rawFound.length).fill(false);
                for (let i = 0; i < rawFound.length; i++) {
                    if (used[i]) continue;
                    const group = [rawFound[i]];
                    used[i] = true;
                    for (let j = i + 1; j < rawFound.length; j++) {
                        if (used[j]) continue;
                        const dx = Math.abs(rawFound[i].x - rawFound[j].x);
                        const dy = Math.abs(rawFound[i].y - rawFound[j].y);
                        const dz = Math.abs(rawFound[i].z - rawFound[j].z);
                        if (dx <= 8 && dy <= 8 && dz <= 8) {
                            group.push(rawFound[j]);
                            used[j] = true;
                        }
                    }
                    group.sort((a, b) => a.dist - b.dist);
                    groups.push({ rep: group[0], size: group.length });
                }
                groups.sort((a, b) => a.rep.dist - b.rep.dist);
                const top = groups.slice(0, 3);
                const lines = top.map(g =>
                    "§a" + state.target +
                    (g.size > 1 ? " §8(x" + g.size + ")" : "") +
                    " §7X:" + g.rep.x + " Y:" + g.rep.y + " Z:" + g.rep.z +
                    " §8(" + g.rep.dist + "m)"
                );
                const extra = groups.length > 3 ? "\n§7+" + (groups.length - 3) + " more groups" : "";
                const blockResult = "§6[Tracker] §7" + groups.length + " group(s):\n" + lines.join("\n") + extra;
                state._lastResult = blockResult;
                setActionBarSlot(player, "tracker_mob", blockResult);
            }
        } catch (_) {}
    }
}, 1);