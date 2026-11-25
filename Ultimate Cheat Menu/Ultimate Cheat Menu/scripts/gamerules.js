import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
const BOOLEAN_RULES = [
    { name: "Keep Inventory",         rule: "keepInventory",        icon: "textures/ui/icon_recipe_construction",  default: false },
    { name: "Mob Griefing",           rule: "mobGriefing",          icon: "textures/ui/icon_recipe_construction",  default: true  },
    { name: "PVP",                    rule: "pvp",                  icon: "textures/items/diamond_sword",          default: true  },
    { name: "Fire Spread",            rule: "doFireTick",           icon: "textures/items/flint_and_steel",        default: true  },
    { name: "TNT Explodes",           rule: "tntExplodes",          icon: "textures/blocks/tnt_side",              default: true  },
    { name: "Mob Spawning",           rule: "doMobSpawning",        icon: "textures/items/spawn_egg",              default: true  },
    { name: "Mob Loot",               rule: "doMobLoot",            icon: "textures/items/diamond",                default: true  },
    { name: "Tile Drops",             rule: "doTileDrops",          icon: "textures/blocks/grass_side_carried",    default: true  },
    { name: "Natural Regen",          rule: "naturalRegeneration",  icon: "textures/ui/heart",       default: true  },
    { name: "Fall Damage",            rule: "fallDamage",           icon: "textures/ui/slow_falling_effect",        default: true  },
    { name: "Fire Damage",            rule: "fireDamage",           icon: "textures/ui/fire_resistance_effect",        default: true  },
    { name: "Drowning Damage",        rule: "drowningDamage",       icon: "textures/ui/water_breathing_effect",    default: true  },
    { name: "Weather Cycle",          rule: "doWeatherCycle",       icon: "textures/ui/cloud_only_storage",        default: true  },
    { name: "Show Coordinates",       rule: "showCoordinates",      icon: "textures/items/compass_item",               default: false },
    { name: "Immediate Respawn",      rule: "immediateRespawn",     icon: "textures/items/bed_red",            default: false },
    { name: "Daylight Cycle",         rule: "doDaylightCycle",      icon: "textures/items/clock_item",             default: true  },
    { name: "Entity Drops",           rule: "doEntityDrops",        icon: "textures/items/leather",                default: true  },
    { name: "Insomnia",               rule: "doInsomnia",           icon: "textures/items/bed_red",                default: true  },
    { name: "Freeze Damage",          rule: "freezeDamage",         icon: "textures/ui/frozen_effect",      default: true  },
    { name: "Respawn Blocks Explode", rule: "respawnBlocksExplode", icon: "textures/blocks/respawn_anchor_top",    default: true  },
];

const NUM_RULES = [
    { name: "Random Tick Speed",  rule: "randomTickSpeed",           min: 0, max: 4096,  default: 3     },
    { name: "Spawn Radius",       rule: "spawnRadius",               min: 0, max: 128,   default: 5     },
    { name: "Max Command Chain",  rule: "maxCommandChainLength",     min: 0, max: 65536, default: 65536 },
    { name: "Function Cmd Limit", rule: "functionCommandLimit",      min: 1, max: 20000, default: 10000 },
    { name: "Players Sleeping",   rule: "playersSleepingPercentage", min: 0, max: 100,   default: 100   },
];
export function showGamerulesMenu(player, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§lGamerules Panel");
        gui.body("§7Choose a category:");
        gui.button("§8Boolean Rules\n§8Toggle ON or OFF", "textures/ui/toggle_on");
        gui.button("Numeric Rules\n§8Set custom values", "textures/ui/color_plus");
        gui.button("§8Reset to Defaults\n§8Restore all gamerules", "textures/ui/refresh_light");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 3) {
                system.run(() => backToMain(player));
                return;
            }
            if (res.selection === 0) system.run(() => showBooleanRules(player, backToMain));
            if (res.selection === 1) system.run(() => showNumericRules(player, backToMain));
            if (res.selection === 2) system.run(() => resetAllGamerules(player, backToMain));
        });
    });
}
function resetAllGamerules(player, backToMain) {
    system.run(() => {
        let count = 0;
        for (const gr of BOOLEAN_RULES) {
            try { world.gameRules[gr.rule] = gr.default; count++; } catch (_) {}
        }
        for (const nr of NUM_RULES) {
            try { world.gameRules[nr.rule] = nr.default; count++; } catch (_) {}
        }
        player.sendMessage("§6[Gamerules] §fAll gamerules reset to default. §7(" + count + " rules restored)");
        system.run(() => showGamerulesMenu(player, backToMain));
    });
}
function showBooleanRules(player, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§lBoolean Gamerules");
        gui.body("§7Tap a rule to toggle it ON or OFF:");
        for (const gr of BOOLEAN_RULES) {
            let status = "§7UNKNOWN";
            try {
                const val = world.gameRules[gr.rule];
                status = val ? "§aON" : "§cOFF";
            } catch (_) {}
            gui.button("§8" + gr.name + "\n" + status, gr.icon);
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === BOOLEAN_RULES.length) {
                system.run(() => showGamerulesMenu(player, backToMain));
                return;
            }
            const selected = BOOLEAN_RULES[res.selection];
            system.run(() => {
                try {
                    const current = world.gameRules[selected.rule];
                    world.gameRules[selected.rule] = !current;
                    player.sendMessage("§6[Gamerules] §f" + selected.name + " §7set to " + (!current ? "§aON" : "§cOFF"));
                } catch (e) {
                    player.sendMessage("§cFailed to toggle " + selected.name);
                }
                showBooleanRules(player, backToMain);
            });
        });
    });
}
function showNumericRules(player, backToMain) {
    system.run(() => {
        const gui = new ModalFormData();
        gui.title("§lNumeric Gamerules");
        for (const nr of NUM_RULES) {
            let current = nr.default;
            try {
                const fetched = world.gameRules[nr.rule];
                if (fetched !== undefined && fetched !== null) current = fetched;
            } catch (_) {}
            gui.textField(
                "§f" + nr.name + " §7(" + nr.min + " to " + nr.max + ")\n§7Current: §e" + current,
                String(current)
            );
        }
        gui.show(player).then((res) => {
            if (res.canceled) {
                system.run(() => showGamerulesMenu(player, backToMain));
                return;
            }
            system.run(() => {
                res.formValues.forEach((raw, i) => {
                    const nr = NUM_RULES[i];
                    if (!raw || raw.trim() === "") return;
                    const val = parseInt(raw, 10);
                    if (isNaN(val)) return;
                    const clamped = Math.min(nr.max, Math.max(nr.min, val));
                    try {
                        world.gameRules[nr.rule] = clamped;
                        player.sendMessage("§6[Gamerules] §f" + nr.name + " §7set to §e" + clamped);
                    } catch (e) {}
                });
                showGamerulesMenu(player, backToMain);
            });
        });
    });
}