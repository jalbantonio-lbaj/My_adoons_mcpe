import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const STATE_KEY = "autoSmeltState";

const ORE_SMELTS = {
    "minecraft:raw_iron": "minecraft:iron_ingot",
    "minecraft:raw_gold": "minecraft:gold_ingot",
    "minecraft:raw_copper": "minecraft:copper_ingot",
    "minecraft:ancient_debris": "minecraft:netherite_scrap",
};

const EXTRA_SMELTS = {
    "minecraft:cobblestone": "minecraft:stone",
    "minecraft:cobbled_deepslate": "minecraft:deepslate",
    "minecraft:sand": "minecraft:glass",
    "minecraft:red_sand": "minecraft:glass",
    "minecraft:clay_ball": "minecraft:brick",
    "minecraft:netherrack": "minecraft:nether_brick",
    "minecraft:wet_sponge": "minecraft:sponge",
    "minecraft:cactus": "minecraft:green_dye",
    "minecraft:kelp": "minecraft:dried_kelp",
    "minecraft:chorus_fruit": "minecraft:popped_chorus_fruit",
    "minecraft:sea_pickle": "minecraft:lime_dye",
};

const states = new Map();

function loadState(player) {
    try {
        const raw = player.getDynamicProperty(STATE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { active: false, mode: "ores" };
}

function saveState(player) {
    try {
        const data = states.get(player.id);
        if (data) player.setDynamicProperty(STATE_KEY, JSON.stringify(data));
    } catch (_) {}
}

export function getAutoSmeltState(player) {
    if (!states.has(player.id)) states.set(player.id, loadState(player));
    return states.get(player.id);
}

function getSmeltMap(mode) {
    return mode === "all" ? { ...ORE_SMELTS, ...EXTRA_SMELTS } : ORE_SMELTS;
}

world.afterEvents.playerBreakBlock.subscribe((ev) => {
    const player = ev.player;
    const data = getAutoSmeltState(player);
    if (!data.active) return;

    const dimension = ev.dimension;
    const loc = ev.block.location;
    const smeltMap = getSmeltMap(data.mode);

    system.runTimeout(() => {
        try {
            const items = dimension.getEntities({
                location: { x: loc.x + 0.5, y: loc.y + 0.5, z: loc.z + 0.5 },
                maxDistance: 3,
                type: "minecraft:item",
            });

            let smelted = 0;
            for (const entity of items) {
                try {
                    const comp = entity.getComponent("item");
                    if (!comp) continue;
                    const stack = comp.itemStack;
                    const result = smeltMap[stack.typeId];
                    if (!result) continue;

                    const amount = stack.amount;
                    entity.remove();
                    dimension.spawnItem(new ItemStack(result, amount), { x: loc.x + 0.5, y: loc.y + 0.5, z: loc.z + 0.5 });
                    smelted += amount;
                } catch (_) {}
            }

            if (smelted > 0) {
                try { player.addExperience(smelted); } catch (_) {}
            }
        } catch (_) {}
    }, 2);
});

export function showAutoSmelt(player, backToMain) {
    system.run(() => {
        const data = getAutoSmeltState(player);
        const smeltMap = getSmeltMap(data.mode);
        const count = Object.keys(smeltMap).length;

        const gui = new ActionFormData();
        gui.title("§lAuto Smelt");
        gui.body(
            "§7Status: " + (data.active ? "§aACTIVE" : "§cINACTIVE") + "\n" +
            "§7Mode: §f" + (data.mode === "all" ? "All Smeltables" : "Ores Only") + "\n" +
            "§7Recipes active: §e" + count + "\n\n" +
            "§7Mined blocks are smelted instantly.\n" +
            "§8Works with Vein Miner. XP is granted like a furnace."
        );
        gui.button(data.active ? "§8Turn OFF" : "§8Turn ON", data.active ? "textures/ui/cancel" : "textures/ui/check");
        gui.button("§8Mode: " + (data.mode === "all" ? "All Smeltables" : "Ores Only") + "\n§7Tap to switch", "textures/ui/refresh_light");
        gui.button("§8Back", "textures/ui/undoArrow");

        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) {
                system.run(() => backToMain(player));
                return;
            }
            system.run(() => {
                if (res.selection === 0) {
                    data.active = !data.active;
                    saveState(player);
                    player.sendMessage(data.active ? "§a[Auto Smelt] ON" : "§c[Auto Smelt] OFF");
                } else if (res.selection === 1) {
                    data.mode = data.mode === "all" ? "ores" : "all";
                    saveState(player);
                    player.sendMessage("§a[Auto Smelt] §fMode: §e" + (data.mode === "all" ? "All Smeltables" : "Ores Only"));
                }
                showAutoSmelt(player, backToMain);
            });
        });
    });
}
