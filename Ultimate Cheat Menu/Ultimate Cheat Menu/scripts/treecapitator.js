import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const LOG_BLOCKS = new Set([
    "minecraft:oak_log", "minecraft:spruce_log", "minecraft:birch_log",
    "minecraft:jungle_log", "minecraft:acacia_log", "minecraft:dark_oak_log",
    "minecraft:mangrove_log", "minecraft:cherry_log", "minecraft:bamboo_block",
    "minecraft:crimson_stem", "minecraft:warped_stem",
    "minecraft:stripped_oak_log", "minecraft:stripped_spruce_log",
    "minecraft:stripped_birch_log", "minecraft:stripped_jungle_log",
    "minecraft:stripped_acacia_log", "minecraft:stripped_dark_oak_log",
    "minecraft:stripped_mangrove_log", "minecraft:stripped_cherry_log",
    "minecraft:stripped_crimson_stem", "minecraft:stripped_warped_stem",
    "minecraft:pale_oak_log", "minecraft:stripped_pale_oak_log",
]);

const LEAF_BLOCKS = new Set([
    "minecraft:oak_leaves", "minecraft:spruce_leaves", "minecraft:birch_leaves",
    "minecraft:jungle_leaves", "minecraft:acacia_leaves", "minecraft:dark_oak_leaves",
    "minecraft:mangrove_leaves", "minecraft:cherry_leaves",
    "minecraft:azalea_leaves", "minecraft:flowering_azalea_leaves",
    "minecraft:pale_oak_leaves",
]);

const AXE_ITEMS = new Set([
    "minecraft:wooden_axe", "minecraft:stone_axe", "minecraft:iron_axe", "minecraft:copper_axe",
    "minecraft:golden_axe", "minecraft:diamond_axe", "minecraft:netherite_axe",
]);

const treecapState = new Map();

function loadState(player) {
    try {
        const raw = player.getDynamicProperty("treecapState");
        if (raw !== undefined && raw !== null) return raw === true || raw === "true";
    } catch (_) { }
    return false;
}

function saveState(player, val) {
    try { player.setDynamicProperty("treecapState", val); } catch (_) { }
}

export function getTreecapState(player) { return treecapState.get(player.id) ?? loadState(player); }
export function isTreecapEnabled(player) {
    if (!treecapState.has(player.id)) {
        treecapState.set(player.id, loadState(player));
    }
    return treecapState.get(player.id) === true;
}

export function showTreecapMenu(player, backToMain) {
    system.run(() => {
        const enabled = isTreecapEnabled(player);
        const gui = new ActionFormData();
        gui.title("§lTree Capitator");
        gui.body(
            "§7Status: " + (enabled ? "§aENABLED" : "§cDISABLED") +
            "\n\n§7When enabled, breaking any log with an axe will\n§7automatically chop down the entire tree.\n\n§7Max logs per tree: §e150\n§7Note: §7Only works on trees with leaves attached."
        );
        gui.button(enabled ? "§cDisable Tree Capitator" : "§aEnable Tree Capitator", "textures/items/diamond_axe");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 1) { system.run(() => backToMain(player)); return; }
            if (res.selection === 0) {
                system.run(() => {
                    const newState = !enabled;
                    treecapState.set(player.id, newState);
                    saveState(player, newState);
                    player.sendMessage("§6[Tree Capitator] §f" + (newState ? "§aEnabled" : "§cDisabled"));
                    showTreecapMenu(player, backToMain);
                });
            }
        });
    });
}

function findConnectedLogs(dimension, startX, startY, startZ, targetType) {
    const found = [];
    const visited = new Set();
    const queue = [{ x: startX, y: startY, z: startZ }];
    const MAX_LOGS = 150;
    while (queue.length > 0 && found.length < MAX_LOGS) {
        const { x, y, z } = queue.shift();
        const key = x + "," + y + "," + z;
        if (visited.has(key)) continue;
        visited.add(key);
        let block;
        try { block = dimension.getBlock({ x, y, z }); } catch (_) { continue; }
        if (!block || block.typeId !== targetType) continue;
        found.push({ x, y, z });
        const neighbors = [
            { x: x + 1, y, z }, { x: x - 1, y, z },
            { x, y, z: z + 1 }, { x, y, z: z - 1 },
            { x, y: y + 1, z },
            { x: x + 1, y: y + 1, z }, { x: x - 1, y: y + 1, z },
            { x, y: y + 1, z: z + 1 }, { x, y: y + 1, z: z - 1 },
        ];
        for (const n of neighbors) {
            const nkey = n.x + "," + n.y + "," + n.z;
            if (!visited.has(nkey)) queue.push(n);
        }
    }
    return found;
}

function hasLeavesNearby(dimension, logs) {
    for (const { x, y, z } of logs) {
        for (let dx = -2; dx <= 2; dx++) {
            for (let dy = -1; dy <= 3; dy++) {
                for (let dz = -2; dz <= 2; dz++) {
                    try {
                        const block = dimension.getBlock({ x: x + dx, y: y + dy, z: z + dz });
                        if (block && LEAF_BLOCKS.has(block.typeId)) return true;
                    } catch (_) { }
                }
            }
        }
    }
    return false;
}

function breakLogsSequentially(dimension, logs, index, player) {
    if (index >= logs.length) return;
    system.run(() => {
        const { x, y, z } = logs[index];
        try {
            const block = dimension.getBlock({ x, y, z });
            if (block && LOG_BLOCKS.has(block.typeId)) {
                dimension.runCommand("setblock " + x + " " + y + " " + z + " air destroy");
            }
        } catch (_) { }
        breakLogsSequentially(dimension, logs, index + 1, player);
    });
}

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const player = ev.player;
    if (!isTreecapEnabled(player)) return;
    const block = ev.block;
    if (!LOG_BLOCKS.has(block.typeId)) return;
    const heldItem = player.getComponent("equippable")?.getEquipment("Mainhand");
    if (!heldItem || !AXE_ITEMS.has(heldItem.typeId)) return;
    const { x, y, z } = block.location;
    const dimension = player.dimension;
    const logType = block.typeId;

    const logs = findConnectedLogs(dimension, x, y, z, logType);
    if (logs.length <= 1) return;

    if (!hasLeavesNearby(dimension, logs)) return;

    ev.cancel = true;
    system.run(() => {
        breakLogsSequentially(dimension, logs, 0, player);
    });
});