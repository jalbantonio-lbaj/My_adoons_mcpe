import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const ALL_ORES = [
    { id: "minecraft:coal_ore",              name: "Coal Ore" },
    { id: "minecraft:deepslate_coal_ore",    name: "Deepslate Coal" },
    { id: "minecraft:iron_ore",              name: "Iron Ore" },
    { id: "minecraft:deepslate_iron_ore",    name: "Deepslate Iron" },
    { id: "minecraft:copper_ore",            name: "Copper Ore" },
    { id: "minecraft:deepslate_copper_ore",  name: "Deepslate Copper" },
    { id: "minecraft:gold_ore",              name: "Gold Ore" },
    { id: "minecraft:deepslate_gold_ore",    name: "Deepslate Gold" },
    { id: "minecraft:redstone_ore",          name: "Redstone Ore" },
    { id: "minecraft:deepslate_redstone_ore",name: "Deepslate Redstone" },
    { id: "minecraft:lapis_ore",             name: "Lapis Ore" },
    { id: "minecraft:deepslate_lapis_ore",   name: "Deepslate Lapis" },
    { id: "minecraft:diamond_ore",           name: "Diamond Ore" },
    { id: "minecraft:deepslate_diamond_ore", name: "Deepslate Diamond" },
    { id: "minecraft:emerald_ore",           name: "Emerald Ore" },
    { id: "minecraft:deepslate_emerald_ore", name: "Deepslate Emerald" },
    { id: "minecraft:nether_gold_ore",       name: "Nether Gold" },
    { id: "minecraft:quartz_ore",            name: "Nether Quartz" },
    { id: "minecraft:ancient_debris",        name: "Ancient Debris" },
];

const PICKAXE_ITEMS = new Set([
    "minecraft:wooden_pickaxe", "minecraft:stone_pickaxe", "minecraft:iron_pickaxe",
    "minecraft:golden_pickaxe", "minecraft:diamond_pickaxe", "minecraft:netherite_pickaxe",
]);

const veinState = new Map();

function loadState(player) {
    try {
        const raw = player.getDynamicProperty("veinMinerState");
        if (raw) {
            const s = JSON.parse(raw);
            s.selectedOres = new Set(s.selectedOres);
            return s;
        }
    } catch (_) {}
    return {
        enabled: false,
        autoPickup: false,
        selectedOres: new Set(ALL_ORES.map(o => o.id)),
    };
}

function saveState(player) {
    try {
        const s = veinState.get(player.id);
        if (!s) return;
        player.setDynamicProperty("veinMinerState", JSON.stringify({
            enabled: s.enabled,
            autoPickup: s.autoPickup,
            selectedOres: [...s.selectedOres],
        }));
    } catch (_) {}
}

export function getVeinState(player) {
    if (!veinState.has(player.id)) {
        veinState.set(player.id, loadState(player));
    }
    return veinState.get(player.id);
}

export function showVeinMinerMenu(player, backToMain) {
    system.run(() => {
        const state = getVeinState(player);
        const gui = new ActionFormData();
        gui.title("§lVein Miner");
        gui.body(
            "§7Selected ores: §e" + state.selectedOres.size + " §7/ " + ALL_ORES.length +
            "\n§7Max blocks per vein: §e64"
        );
        gui.button((state.enabled ? "§aVein Miner: ON" : "§cVein Miner: OFF") + "\n§7Tap to toggle", "textures/items/diamond_pickaxe");
        gui.button((state.autoPickup ? "§aAuto Magnet: ON" : "§cAuto Magnet: OFF") + "\n§7Items attract to you", "textures/items/compass_item");
        gui.button("Select Ores\n§8Choose which ores to mine", "textures/items/diamond");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 3) { system.run(() => backToMain(player)); return; }
            system.run(() => {
                if (res.selection === 0) {
                    state.enabled = !state.enabled;
                    saveState(player);
                    player.sendMessage("§6[Vein Miner] §fVein Miner: " + (state.enabled ? "§aON" : "§cOFF"));
                }
                if (res.selection === 1) {
                    state.autoPickup = !state.autoPickup;
                    saveState(player);
                    player.sendMessage("§6[Vein Miner] §fAuto Magnet: " + (state.autoPickup ? "§aON" : "§cOFF"));
                }
                if (res.selection === 2) { showOreSelector(player, backToMain); return; }
                showVeinMinerMenu(player, backToMain);
            });
        });
    });
}

function showOreSelector(player, backToMain) {
    system.run(() => {
        const state = getVeinState(player);
        const gui = new ActionFormData();
        gui.title("§lSelect Ores");
        gui.body("§7Tap an ore to toggle it ON or OFF:");
        for (const ore of ALL_ORES) {
            const active = state.selectedOres.has(ore.id);
            gui.button("§8" + ore.name + "\n" + (active ? "§aON" : "§cOFF"), "textures/items/diamond_pickaxe");
        }
        gui.button("§8Select All", "textures/ui/color_plus");
        gui.button("§8Deselect All", "textures/ui/cancel");
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === ALL_ORES.length + 2) { system.run(() => showVeinMinerMenu(player, backToMain)); return; }
            system.run(() => {
                if (res.selection === ALL_ORES.length) {
                    ALL_ORES.forEach(o => state.selectedOres.add(o.id));
                    player.sendMessage("§6[Vein Miner] §fAll ores selected.");
                } else if (res.selection === ALL_ORES.length + 1) {
                    state.selectedOres.clear();
                    player.sendMessage("§6[Vein Miner] §fAll ores deselected.");
                } else {
                    const ore = ALL_ORES[res.selection];
                    if (state.selectedOres.has(ore.id)) {
                        state.selectedOres.delete(ore.id);
                        player.sendMessage("§6[Vein Miner] §f" + ore.name + " §7removed.");
                    } else {
                        state.selectedOres.add(ore.id);
                        player.sendMessage("§6[Vein Miner] §f" + ore.name + " §7added.");
                    }
                }
                saveState(player);
                showOreSelector(player, backToMain);
            });
        });
    });
}

function findVein(dimension, startX, startY, startZ, targetType) {
    const found = [];
    const visited = new Set();
    const queue = [{ x: startX, y: startY, z: startZ }];
    const MAX = 64;
    while (queue.length > 0 && found.length < MAX) {
        const { x, y, z } = queue.shift();
        const key = x + "," + y + "," + z;
        if (visited.has(key)) continue;
        visited.add(key);
        let block;
        try { block = dimension.getBlock({ x, y, z }); } catch (_) { continue; }
        if (!block || block.typeId !== targetType) continue;
        found.push({ x, y, z });
        const neighbors = [
            { x: x+1, y, z }, { x: x-1, y, z },
            { x, y: y+1, z }, { x, y: y-1, z },
            { x, y, z: z+1 }, { x, y, z: z-1 },
        ];
        for (const n of neighbors) {
            const nkey = n.x + "," + n.y + "," + n.z;
            if (!visited.has(nkey)) queue.push(n);
        }
    }
    return found;
}

function breakAndPickup(dimension, blocks, index, player, oreType, autoPickup) {
    if (index >= blocks.length) {
        if (autoPickup) system.run(() => startMagnet(player, 60));
        return;
    }
    system.run(() => {
        const { x, y, z } = blocks[index];
        try { dimension.runCommand("setblock " + x + " " + y + " " + z + " air destroy"); } catch (_) {}
        breakAndPickup(dimension, blocks, index + 1, player, oreType, autoPickup);
    });
}

function startMagnet(player, ticksLeft) {
    if (ticksLeft <= 0) return;
    system.run(() => {
        try {
            const pos = player.location;
            const entities = player.dimension.getEntities({ location: pos, maxDistance: 8, type: "minecraft:item" });
            for (const entity of entities) {
                try {
                    const ePos = entity.location;
                    const dx = pos.x - ePos.x;
                    const dy = pos.y - ePos.y;
                    const dz = pos.z - ePos.z;
                    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                    if (dist < 0.5) continue;
                    const speed = 0.4;
                    entity.applyImpulse({ x: (dx/dist)*speed, y: (dy/dist)*speed+0.05, z: (dz/dist)*speed });
                } catch (_) {}
            }
        } catch (_) {}
        startMagnet(player, ticksLeft - 1);
    });
}

world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    const player = ev.player;
    const state = getVeinState(player);
    if (!state.enabled) return;
    const block = ev.block;
    if (!state.selectedOres.has(block.typeId)) return;
    const heldItem = player.getComponent("equippable")?.getEquipment("Mainhand");
    if (!heldItem || !PICKAXE_ITEMS.has(heldItem.typeId)) return;
    const { x, y, z } = block.location;
    const dimension = player.dimension;
    const oreType = block.typeId;
    const vein = findVein(dimension, x, y, z, oreType);
    if (vein.length <= 1) return;
    ev.cancel = true;
    system.run(() => {
        player.sendMessage("§6[Vein Miner] §7Mining §e" + vein.length + " §7blocks" + (state.autoPickup ? " §7(auto pickup)" : "") + "...");
        breakAndPickup(dimension, vein, 0, player, oreType, state.autoPickup);
    });
});