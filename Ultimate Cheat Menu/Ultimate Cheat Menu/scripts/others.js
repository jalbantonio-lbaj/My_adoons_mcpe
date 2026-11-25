import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

import { setActionBarSlot, clearActionBarSlot } from "./actionbar.js";

const toggleState = new Map();

const DEFAULT_STATE = {
    autoTotem:      false,
    godMode:        false,
    noFall:         false,
    antiKnockback:  false,
    autoEat:        false,
    autoSprint:     false,
    antiHunger:     false,
    infiniteBreath: false,
    lavaProof:      false,
    autocook:       false,
    lootMultiplier: 0,

    biomeDisplay:   false,
    blockLogger:    false,
};

function loadState(player) {
    try {
        const raw = player.getDynamicProperty("othersState");
        if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
    } catch (_) {}
    return { ...DEFAULT_STATE };
}

function saveState(player) {
    try {
        const state = toggleState.get(player.id);
        if (state) player.setDynamicProperty("othersState", JSON.stringify(state));
    } catch (_) {}
}

export function getOthersState(player) {
    if (!toggleState.has(player.id)) {
        toggleState.set(player.id, loadState(player));
    }
    return toggleState.get(player.id);
}

world.afterEvents.playerSpawn.subscribe((ev) => {
    if (!ev.initialSpawn) return;
    const player = ev.player;
    system.runTimeout(() => {
        const state = getOthersState(player);
        const effectKeys = ["godMode", "noFall", "antiKnockback", "infiniteBreath", "lavaProof", "autoSprint"];
        for (const key of effectKeys) {
            if (state[key]) {
                try { applyEffects(player, key); } catch (_) {}
            }
        }
    }, 20);
});

const TOGGLES = [
    { key: "autoTotem",      label: "Auto Totem",      desc: "Auto refill offhand totem",       icon: "textures/items/totem" },
    { key: "godMode",        label: "God Mode",        desc: "Take no damage at all",           icon: "textures/items/apple_golden" },
    { key: "noFall",         label: "No Fall Damage",  desc: "Fall without taking damage",      icon: "textures/items/feather" },
    { key: "antiKnockback",  label: "Anti Knockback",  desc: "Never get pushed back",           icon: "textures/items/bow_pulling_0" },
    { key: "autoEat",        label: "Auto Eat",        desc: "Auto eat food when hungry",       icon: "textures/items/bread" },
    { key: "autoSprint",     label: "Auto Sprint",     desc: "Always sprinting",                icon: "textures/items/sugar" },
    { key: "antiHunger",     label: "Anti Hunger",     desc: "Hunger bar never goes down",      icon: "textures/items/beef_cooked" },
    { key: "infiniteBreath", label: "Infinite Breath", desc: "Never drown underwater",          icon: "textures/items/fish_clownfish_raw" },
    { key: "lavaProof",      label: "Lava Proof",      desc: "Swim in lava, no fire damage",    icon: "textures/items/bucket_lava" },
    { key: "autocook",       label: "Auto Cook",       desc: "Animals drop cooked meat",        icon: "textures/items/porkchop_cooked" },

    { key: "biomeDisplay",   label: "Biome Display",   desc: "Show current biome in actionbar", icon: "textures/items/map_empty" },
    { key: "blockLogger",    label: "Block Logger",    desc: "Show broken block name + glow",   icon: "textures/items/diamond_pickaxe" },
];

const FOOD_ITEMS = [
    "minecraft:bread", "minecraft:cooked_beef", "minecraft:cooked_porkchop",
    "minecraft:cooked_chicken", "minecraft:cooked_mutton", "minecraft:cooked_rabbit",
    "minecraft:cooked_salmon", "minecraft:cooked_cod", "minecraft:baked_potato",
    "minecraft:carrot", "minecraft:apple", "minecraft:golden_apple",
    "minecraft:melon_slice", "minecraft:pumpkin_pie", "minecraft:cookie",
    "minecraft:mushroom_stew", "minecraft:rabbit_stew", "minecraft:beetroot_soup",
    "minecraft:suspicious_stew", "minecraft:dried_kelp", "minecraft:sweet_berries",
    "minecraft:glow_berries", "minecraft:beef", "minecraft:porkchop",
    "minecraft:chicken", "minecraft:mutton", "minecraft:rabbit", "minecraft:potato",
];

function applyEffects(player, key) {
    const dur = 999999;
    try {
        if (key === "godMode") {
            player.addEffect("resistance", dur, { amplifier: 255, showParticles: false });
            player.addEffect("fire_resistance", dur, { amplifier: 255, showParticles: false });
            player.addEffect("regeneration", dur, { amplifier: 255, showParticles: false });
        }
        if (key === "noFall") {
            player.addEffect("slow_falling", dur, { amplifier: 255, showParticles: false });
        }
        if (key === "antiKnockback") {
            player.addEffect("resistance", dur, { amplifier: 255, showParticles: false });
        }
        if (key === "infiniteBreath") {
            player.addEffect("water_breathing", dur, { amplifier: 0, showParticles: false });
        }
        if (key === "lavaProof") {
            player.addEffect("fire_resistance", dur, { amplifier: 255, showParticles: false });
        }
        if (key === "autoSprint") {
            player.addEffect("speed", dur, { amplifier: 1, showParticles: false });
        }
    } catch (_) {}
}

function removeEffects(player, key) {
    try {
        if (key === "godMode") {
            player.removeEffect("resistance");
            player.removeEffect("fire_resistance");
            player.removeEffect("regeneration");
        }
        if (key === "noFall") {
            player.removeEffect("slow_falling");
        }
        if (key === "antiKnockback") {
            const state = getOthersState(player);
            if (!state.godMode) player.removeEffect("resistance");
        }
        if (key === "infiniteBreath") {
            player.removeEffect("water_breathing");
        }
        if (key === "lavaProof") {
            const state = getOthersState(player);
            if (!state.godMode) player.removeEffect("fire_resistance");
        }
        if (key === "autoSprint") {
            player.removeEffect("speed");
        }

        if (key === "biomeDisplay") {
            clearActionBarSlot(player, "biome");
        }

        if (key === "blockLogger") {
            clearActionBarSlot(player, "blocklog");
            try { player.removeEffect("glowing"); } catch (_) {}
        }
    } catch (_) {}
}

export function showOthersMenu(player, backToMain) {
    system.run(() => {
        const state = getOthersState(player);
        const gui = new ActionFormData();
        gui.title("§lOthers");
        gui.body("§7Tap a toggle to enable or disable it:");

        for (const t of TOGGLES) {
            const on = state[t.key];
            gui.button(
                (on ? "§aON §f" : "§cOFF §f") + t.label + "\n§7" + t.desc,
                t.icon
            );
        }

        gui.button("Sort Inventory\n§8Sort items by category", "textures/ui/icon_recipe_construction");
        gui.button("§8Loot Multiplier\n§8" + (state.lootMultiplier > 0 ? "§aON §7(x" + state.lootMultiplier + ")" : "§cOFF"), "textures/items/diamond_sword");
        gui.button("§8Back to Main", "textures/ui/undoArrow");

        gui.show(player).then((res) => {
            if (res.canceled || res.selection === TOGGLES.length + 2) {
                system.run(() => backToMain(player));
                return;
            }
            system.run(() => {
                if (res.selection === TOGGLES.length) {
                    sortInventory(player);
                    player.sendMessage("§6[Others] §fInventory sorted.");
                    showOthersMenu(player, backToMain);
                    return;
                }
                if (res.selection === TOGGLES.length + 1) {
                    showLootMultiplierMenu(player, backToMain);
                    return;
                }
                const t = TOGGLES[res.selection];
                state[t.key] = !state[t.key];
                player.sendMessage("§6[Others] §f" + t.label + ": " + (state[t.key] ? "§aON" : "§cOFF"));
                if (state[t.key]) {
                    applyEffects(player, t.key);
                } else {
                    removeEffects(player, t.key);
                }
                saveState(player);
                showOthersMenu(player, backToMain);
            });
        });
    });
}

const SORT_ORDER = [
    "sword", "pickaxe", "axe", "shovel", "hoe", "bow", "crossbow", "trident", "shield",
    "helmet", "chestplate", "leggings", "boots",
    "totem", "golden_apple", "potion", "food", "meat", "fish", "bread", "carrot", "apple",
    "coal", "iron", "gold", "diamond", "emerald", "netherite", "lapis", "redstone", "quartz",
    "log", "planks", "stone", "cobblestone", "dirt", "sand", "gravel",
    "chest", "furnace", "crafting", "anvil",
    "torch", "ladder", "door", "trapdoor", "fence",
    "arrow", "flint",
];

function getSortKey(typeId) {
    const id = typeId.replace("minecraft:", "");
    for (let i = 0; i < SORT_ORDER.length; i++) {
        if (id.includes(SORT_ORDER[i])) return i;
    }
    return SORT_ORDER.length;
}

function sortInventory(player) {
    try {
        const inv = player.getComponent("inventory");
        if (!inv || !inv.container) return;
        const container = inv.container;
        const items = [];
        for (let i = 0; i < container.size; i++) {
            const item = container.getItem(i);
            if (item) items.push(item);
        }
        items.sort((a, b) => {
            const ka = getSortKey(a.typeId);
            const kb = getSortKey(b.typeId);
            if (ka !== kb) return ka - kb;
            return a.typeId.localeCompare(b.typeId);
        });
        for (let i = 0; i < container.size; i++) container.setItem(i, undefined);
        for (let i = 0; i < items.length; i++) container.setItem(i, items[i]);
    } catch (_) {}
}

function formatBiome(biomeId) {
    return biomeId
        .replace("minecraft:", "")
        .split("_")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const state = toggleState.get(player.id);
        if (!state) continue;
        try {
            const effectKeys = ["godMode", "noFall", "antiKnockback", "infiniteBreath", "lavaProof", "autoSprint"];
            for (const key of effectKeys) {
                if (state[key]) applyEffects(player, key);
            }

            if (state.autoTotem) {
                const equippable = player.getComponent("equippable");
                if (equippable) {
                    const offhand = equippable.getEquipment("Offhand");
                    if (!offhand || offhand.typeId !== "minecraft:totem_of_undying") {
                        const inv = player.getComponent("inventory");
                        if (inv && inv.container) {
                            const container = inv.container;
                            for (let i = 0; i < container.size; i++) {
                                const item = container.getItem(i);
                                if (item && item.typeId === "minecraft:totem_of_undying") {
                                    equippable.setEquipment("Offhand", new ItemStack("minecraft:totem_of_undying", 1));
                                    if (item.amount > 1) { item.amount -= 1; container.setItem(i, item); }
                                    else container.setItem(i, undefined);
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (state.autoSprint) {
                try {
                    const existing = player.getEffect("speed");
                    if (!existing || existing.duration < 100) {
                        player.addEffect("speed", 300, { amplifier: 1, showParticles: false });
                    }
                } catch (_) {}
            }

            if (state.antiHunger) {
                const hunger = player.getComponent("player.hunger");
                if (hunger && hunger.currentValue < 20) hunger.setCurrentValue(20);
            }

            if (state.autoEat) {
                const hunger = player.getComponent("player.hunger");
                if (hunger && hunger.currentValue < 18) {
                    const inv = player.getComponent("inventory");
                    if (inv && inv.container) {
                        const container = inv.container;
                        for (let i = 0; i < container.size; i++) {
                            const item = container.getItem(i);
                            if (item && FOOD_ITEMS.includes(item.typeId)) {
                                hunger.setCurrentValue(Math.min(20, hunger.currentValue + 6));
                                if (item.amount > 1) { item.amount -= 1; container.setItem(i, item); }
                                else container.setItem(i, undefined);
                                break;
                            }
                        }
                    }
                }
            }

            if (state.lavaProof && player.isOnFire) {
                player.extinguishFire(false);
            }

            if (state.biomeDisplay) {
                try {
                    const biomeId = player.dimension.getBiome(player.location)?.id ?? "Unknown";
                    setActionBarSlot(player, "biome", "§eBiome: §f" + formatBiome(biomeId));
                } catch (_) {
                    setActionBarSlot(player, "biome", "§eBiome: §7Unknown");
                }
            }

        } catch (_) {}
    }
}, 5);

const RAW_TO_COOKED = {
    "minecraft:beef":     "minecraft:cooked_beef",
    "minecraft:porkchop": "minecraft:cooked_porkchop",
    "minecraft:chicken":  "minecraft:cooked_chicken",
    "minecraft:mutton":   "minecraft:cooked_mutton",
    "minecraft:rabbit":   "minecraft:cooked_rabbit",
    "minecraft:cod":      "minecraft:cooked_cod",
    "minecraft:salmon":   "minecraft:cooked_salmon",
};

world.afterEvents.entityDie.subscribe((ev) => {
    const entity = ev.deadEntity;
    const killer = ev.damageSource?.damagingEntity;
    if (!killer || killer.typeId !== "minecraft:player") return;
    const state = toggleState.get(killer.id);
    if (!state || !state.autocook) return;

    system.runTimeout(() => {
        try {
            const pos = entity.location;
            const dim = entity.dimension;
            const items = dim.getEntities({ location: pos, maxDistance: 3, type: "minecraft:item" });
            for (const itemEntity of items) {
                try {
                    const comp = itemEntity.getComponent("item");
                    if (!comp) continue;
                    const cooked = RAW_TO_COOKED[comp.itemStack.typeId];
                    if (!cooked) continue;
                    const amount = comp.itemStack.amount;
                    itemEntity.remove();
                    dim.spawnItem(new ItemStack(cooked, amount), pos);
                } catch (_) {}
            }
        } catch (_) {}
    }, 5);
});

world.afterEvents.playerBreakBlock.subscribe((ev) => {
    const player = ev.player;
    const state = toggleState.get(player.id);
    if (!state || !state.blockLogger) return;

    try {
        const blockName = formatBiome(ev.brokenBlockPermutation.type.id);
        setActionBarSlot(player, "blocklog", "Broke: §f" + blockName);

        player.addEffect("glowing", 60, { amplifier: 0, showParticles: false });

        system.runTimeout(() => {
            const currentState = toggleState.get(player.id);
            if (currentState && currentState.blockLogger) {
                clearActionBarSlot(player, "blocklog");
            }
        }, 60);
    } catch (_) {}
});

function showLootMultiplierMenu(player, backToMain) {
    system.run(() => {
        const state = getOthersState(player);
        const OPTIONS = [
            { label: "OFF",  mult: 0   },
            { label: "x10",  mult: 10  },
            { label: "x20",  mult: 20  },
            { label: "x30",  mult: 30  },
            { label: "x40",  mult: 40  },
            { label: "x50",  mult: 50  },
            { label: "x60",  mult: 60  },
            { label: "x70",  mult: 70  },
            { label: "x80",  mult: 80  },
            { label: "x90",  mult: 90  },
            { label: "x100", mult: 100 },
        ];

        const currentLabel = state.lootMultiplier === 0 ? "OFF" : "x" + state.lootMultiplier;
        const gui = new ActionFormData();
        gui.title("§lLoot Multiplier");
        gui.body("§7Current: §e" + currentLabel + "\n§7Select how much loot multiplies on kill:");

        for (const opt of OPTIONS) {
            gui.button((state.lootMultiplier === opt.mult ? "§a" : "§f") + opt.label, "textures/items/diamond_sword");
        }
        gui.button("§8Back", "textures/ui/undoArrow");

        gui.show(player).then((res) => {
            if (res.canceled || res.selection === OPTIONS.length) {
                system.run(() => showOthersMenu(player, backToMain));
                return;
            }
            system.run(() => {
                const opt = OPTIONS[res.selection];
                state.lootMultiplier = opt.mult;
                saveState(player);
                if (opt.mult === 0) {
                    player.sendMessage("§6[Loot Multiplier] §cDisabled");
                } else {
                    player.sendMessage("§6[Loot Multiplier] §fSet to §e" + opt.label);
                }
                showLootMultiplierMenu(player, backToMain);
            });
        });
    });
}

world.afterEvents.entityDie.subscribe((ev) => {
    const entity = ev.deadEntity;
    const killer = ev.damageSource?.damagingEntity;
    if (!killer || killer.typeId !== "minecraft:player") return;
    if (entity.typeId === "minecraft:player") return;

    const state = toggleState.get(killer.id);
    if (!state || !state.lootMultiplier) return;

    const pos = { x: entity.location.x, y: entity.location.y, z: entity.location.z };
    const dim = entity.dimension;
    const multiplier = state.lootMultiplier;

    system.run(() => system.run(() => system.run(() => {
        try {
            const items = dim.getEntities({ location: pos, maxDistance: 6, type: "minecraft:item" });
            for (const itemEntity of items) {
                try {
                    const comp = itemEntity.getComponent("item");
                    if (!comp) continue;
                    const typeId = comp.itemStack.typeId;
                    const origAmount = comp.itemStack.amount;
                    itemEntity.remove();
                    let remaining = origAmount * multiplier;
                    while (remaining > 0) {
                        const stackSize = Math.min(64, remaining);
                        dim.spawnItem(new ItemStack(typeId, stackSize), pos);
                        remaining -= stackSize;
                    }
                } catch (_) {}
            }
        } catch (_) {}
    })));
});

export function reapplyOthersEffects(player) {
    const state = getOthersState(player);
    const effectKeys = ["godMode", "noFall", "antiKnockback", "infiniteBreath", "lavaProof", "autoSprint"];
    for (const key of effectKeys) {
        if (state[key]) {
            try { applyEffects(player, key); } catch (_) {}
        }
    }
}