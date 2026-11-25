import { world, system } from "@minecraft/server";
import { setActionBarSlot, clearActionBarSlot } from "./actionbar.js";
import { ActionFormData } from "@minecraft/server-ui";

const HIGHLIGHTABLE_ORES = [
    { id: "minecraft:diamond_ore",             name: "Diamond",           color: "" },
    { id: "minecraft:deepslate_diamond_ore",    name: "Deepslate Diamond", color: "" },
    { id: "minecraft:emerald_ore",             name: "Emerald",           color: "§a" },
    { id: "minecraft:deepslate_emerald_ore",    name: "Deepslate Emerald", color: "§a" },
    { id: "minecraft:ancient_debris",          name: "Ancient Debris",    color: "§4" },
    { id: "minecraft:gold_ore",                name: "Gold",              color: "§e" },
    { id: "minecraft:deepslate_gold_ore",       name: "Deepslate Gold",    color: "§e" },
    { id: "minecraft:iron_ore",                name: "Iron",              color: "§7" },
    { id: "minecraft:deepslate_iron_ore",       name: "Deepslate Iron",    color: "§7" },
    { id: "minecraft:coal_ore",                name: "Coal",              color: "§8" },
    { id: "minecraft:deepslate_coal_ore",       name: "Deepslate Coal",    color: "§8" },
    { id: "minecraft:copper_ore",              name: "Copper",            color: "§6" },
    { id: "minecraft:deepslate_copper_ore",     name: "Deepslate Copper",  color: "§6" },
    { id: "minecraft:lapis_ore",               name: "Lapis",             color: "§9" },
    { id: "minecraft:deepslate_lapis_ore",      name: "Deepslate Lapis",   color: "§9" },
    { id: "minecraft:redstone_ore",            name: "Redstone",          color: "§c" },
    { id: "minecraft:deepslate_redstone_ore",   name: "Deepslate Redstone",color: "§c" },
    { id: "minecraft:nether_gold_ore",         name: "Nether Gold",       color: "§e" },
    { id: "minecraft:quartz_ore",              name: "Nether Quartz",     color: "§f" },
];

const highlightState = new Map();

function loadState(player) {
    try {
        const raw = player.getDynamicProperty("oreHighlighterState");
        if (raw) {
            const s = JSON.parse(raw);
            s.selectedOres = new Set(s.selectedOres);
            return s;
        }
    } catch (_) {}
    return {
        enabled: false,
        mode: "actionbar",
        radius: 16,
        selectedOres: new Set(HIGHLIGHTABLE_ORES.map(o => o.id)),
    };
}

function saveState(player) {
    try {
        const s = highlightState.get(player.id);
        if (!s) return;
        player.setDynamicProperty("oreHighlighterState", JSON.stringify({
            enabled: s.enabled,
            mode: s.mode,
            radius: s.radius,
            selectedOres: [...s.selectedOres],
        }));
    } catch (_) {}
}

export function getOreHighlighterState(player) {
    if (!highlightState.has(player.id)) {
        highlightState.set(player.id, loadState(player));
    }
    return highlightState.get(player.id);
}

export function showOreHighlighter(player, backToMain) {
    system.run(() => {
        const state = getOreHighlighterState(player);
        const modeLabel = state.mode === "actionbar" ? "ActionBar (HUD)" : "Chat List";
        const gui = new ActionFormData();
        gui.title("§lOre Highlighter");
        gui.body(
            "§7Status: " + (state.enabled ? "§aENABLED" : "§cDISABLED") +
            "\n§7Mode: §e" + modeLabel +
            "\n§7Radius: §e" + state.radius + " blocks" +
            "\n§7Selected: §e" + state.selectedOres.size + " §7/ " + HIGHLIGHTABLE_ORES.length + " ores"
        );
        gui.button(state.enabled ? "§cDisable Highlighter" : "§aEnable Highlighter", "textures/items/diamond");
        gui.button("§8Display Mode\n§8ActionBar or Chat", "textures/ui/icon_recipe_construction");
        gui.button("Select Ores\n§8Choose which ores to highlight", "textures/items/gold_ingot");
        gui.button("§8Change Radius\n§8Current: §8" + state.radius + " blocks", "textures/items/compass_item");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 4) { system.run(() => backToMain(player)); return; }
            system.run(() => {
                if (res.selection === 0) {
                    state.enabled = !state.enabled;
                    saveState(player);
                    player.sendMessage("§6[Ore Highlighter] §f" + (state.enabled ? "§aEnabled" : "§cDisabled"));
                    showOreHighlighter(player, backToMain);
                }
                if (res.selection === 1) showModeMenu(player, backToMain);
                if (res.selection === 2) showOreSelectMenu(player, backToMain);
                if (res.selection === 3) showRadiusMenu(player, backToMain);
            });
        });
    });
}

function showModeMenu(player, backToMain) {
    system.run(() => {
        const state = getOreHighlighterState(player);
        const gui = new ActionFormData();
        gui.title("§lDisplay Mode");
        gui.body(
            "§7Choose how ore locations are shown:\n\n" +
            "§eActionBar§7: Shows closest ore on your HUD\n\n" +
            "Chat List§7: One-time scan sends full list to chat"
        );
        gui.button((state.mode === "actionbar" ? "§aSelected §f" : "§f") + "ActionBar §7(HUD display)", "textures/ui/icon_recipe_construction");
        gui.button((state.mode === "chat" ? "§aSelected §f" : "§f") + "Chat List §7(on-demand scan)", "textures/ui/chat_send");
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) { system.run(() => showOreHighlighter(player, backToMain)); return; }
            system.run(() => {
                if (res.selection === 0) { state.mode = "actionbar"; player.sendMessage("§6[Ore Highlighter] §fMode: §eActionBar"); }
                if (res.selection === 1) { state.mode = "chat"; player.sendMessage("§6[Ore Highlighter] §fMode: Chat List"); }
                saveState(player);
                showOreHighlighter(player, backToMain);
            });
        });
    });
}

function showOreSelectMenu(player, backToMain) {
    system.run(() => {
        const state = getOreHighlighterState(player);
        const gui = new ActionFormData();
        gui.title("§lSelect Ores");
        gui.body("§7Tap an ore to toggle ON or OFF:");
        for (const ore of HIGHLIGHTABLE_ORES) {
            const on = state.selectedOres.has(ore.id);
            gui.button(ore.color + ore.name + "\n" + (on ? "§aON" : "§cOFF"), "textures/items/diamond_pickaxe");
        }
        gui.button("§8Select All", "textures/ui/color_plus");
        gui.button("§8Deselect All", "textures/ui/cancel");
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === HIGHLIGHTABLE_ORES.length + 2) { system.run(() => showOreHighlighter(player, backToMain)); return; }
            system.run(() => {
                if (res.selection === HIGHLIGHTABLE_ORES.length) {
                    HIGHLIGHTABLE_ORES.forEach(o => state.selectedOres.add(o.id));
                    player.sendMessage("§6[Ore Highlighter] §fAll ores selected.");
                } else if (res.selection === HIGHLIGHTABLE_ORES.length + 1) {
                    state.selectedOres.clear();
                    player.sendMessage("§6[Ore Highlighter] §fAll ores deselected.");
                } else {
                    const ore = HIGHLIGHTABLE_ORES[res.selection];
                    if (state.selectedOres.has(ore.id)) { state.selectedOres.delete(ore.id); }
                    else { state.selectedOres.add(ore.id); }
                }
                saveState(player);
                showOreSelectMenu(player, backToMain);
            });
        });
    });
}

function showRadiusMenu(player, backToMain) {
    system.run(() => {
        const state = getOreHighlighterState(player);
        const gui = new ActionFormData();
        gui.title("§lSearch Radius");
        gui.body("§7Choose scan radius:");
        gui.button("§88 blocks §8(fast)", "textures/items/compass_item");
        gui.button("§816 blocks §8(default)", "textures/items/compass_item");
        gui.button("§832 blocks §8(slower)", "textures/items/compass_item");
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 3) { system.run(() => showOreHighlighter(player, backToMain)); return; }
            system.run(() => {
                const radii = [8, 16, 32];
                state.radius = radii[res.selection];
                saveState(player);
                player.sendMessage("§6[Ore Highlighter] §fRadius: §e" + state.radius + " blocks");
                showOreHighlighter(player, backToMain);
            });
        });
    });
}

function scanOres(player) {
    const state = highlightState.get(player.id);
    if (!state) return [];
    const pos = player.location;
    const dim = player.dimension;
    const r = state.radius;
    const found = [];
    for (let x = Math.floor(pos.x) - r; x <= Math.floor(pos.x) + r; x++) {
        for (let y = Math.max(-64, Math.floor(pos.y) - r); y <= Math.min(320, Math.floor(pos.y) + r); y++) {
            for (let z = Math.floor(pos.z) - r; z <= Math.floor(pos.z) + r; z++) {
                try {
                    const block = dim.getBlock({ x, y, z });
                    if (!block) continue;
                    if (state.selectedOres.has(block.typeId)) {
                        const ore = HIGHLIGHTABLE_ORES.find(o => o.id === block.typeId);
                        if (!ore) continue;
                        const dx = x - pos.x, dy = y - pos.y, dz = z - pos.z;
                        found.push({ x, y, z, ore, dist: Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz)) });
                    }
                } catch (_) {}
                if (found.length >= 100) return found;
            }
        }
    }
    found.sort((a, b) => a.dist - b.dist);
    return found;
}

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const state = highlightState.get(player.id);
        if (!state || !state.enabled || state.mode !== "actionbar") { clearActionBarSlot(player, "ore"); continue; }
        try {
            const found = scanOres(player);
            if (found.length === 0) { setActionBarSlot(player, "ore", "§6[Ore ESP] §7No ores nearby"); continue; }
            const lines = found.slice(0, 3).map(f =>
                f.ore.color + f.ore.name + " §7X:" + f.x + " Y:" + f.y + " Z:" + f.z + " §8(" + f.dist + "m)"
            );
            setActionBarSlot(player, "ore", lines.join("\n"));
        } catch (_) {}
    }
}, 1);

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const state = highlightState.get(player.id);
        if (!state || !state.enabled || state.mode !== "chat") continue;
        try {
            const found = scanOres(player);
            if (found.length === 0) { player.sendMessage("§6[Ore ESP] §7No ores found within §e" + state.radius + " §7blocks."); continue; }
            player.sendMessage("§6[Ore ESP] §7Found §e" + found.length + " §7ore(s):");
            found.slice(0, 15).forEach(f => {
                player.sendMessage(f.ore.color + f.ore.name + " §7X:" + f.x + " Y:" + f.y + " Z:" + f.z + " §8(" + f.dist + "m)");
            });
            if (found.length > 15) player.sendMessage("§7... and §e" + (found.length - 15) + " §7more.");
        } catch (_) {}
    }
}, 60);