import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { showAdminMenu, isOperatorsOnly, isPermittedPlayer, isStickNameCheckOn } from "./adminmenu.js";
import { showGamemodeMenu } from "./gamemode.js";
import { showEnchantMenu } from "./enchants.js";
import { showWaypointsMenu } from "./waypoints.js";
import { showEffectsMenu } from "./effects.js";
import { showTimeMenu } from "./time.js";
import { showWeatherMenu } from "./weather.js";
import { showTeleportMenu } from "./teleport.js";
import { showCommandConsole } from "./commands.js";
import { showXpManager } from "./xp.js";
import { showUtilitiesMenu } from "./utilities.js";
import { showPlayerMonitor } from "./playermonitor.js";
import { showDeathLocations } from "./death.js";
import { showGamerulesMenu } from "./gamerules.js";
import { showMagnetMenu } from "./magnet.js";
import { showChestFinder } from "./chestfinder.js";
import { showTreecapMenu } from "./treecapitator.js";
import { showVeinMinerMenu } from "./veinminer.js";
import { showOthersMenu } from "./others.js";
import { showOreHighlighter } from "./orehighlighter.js";
import { showPlayerTracker } from "./playertracker.js";
import { showPlayerAlert } from "./playersalert.js";
import { showCoordsLogger } from "./coordslogger.js";
import { showClock } from "./clock.js";
import { showTrackerMenu } from "./tracker.js";
import { showNotesMenu } from "./notes.js";
import { showAboutMenu } from "./about.js";
import { showCropHarvester } from "./cropharvester.js";
import { showEnchantBookMenu } from "./enchantmentbook.js";
import { showRepairMenu } from "./repair.js";
import { showSmartConsole } from "./smartconsole.js";
import { showDeathBackpack } from "./deathbackpack.js";
import { showAutoSmelt } from "./autosmelt.js";
import { showDurabilityAlert } from "./durabilityalert.js";
import { showDangerRadar } from "./dangerradar.js";
import { showStructureLocator, showBiomeLocator } from "./structurelocator.js";
import { showPortalCalc } from "./portalcalc.js";
import { showInventorySorter } from "./invsorter.js";
import { showStats } from "./stats.js";
import "./inventoryalert.js";
import "./onjoin.js";

import { getAllowedFeatures } from "./adminmenu.js";

export function showMainMenu(player) {
    const gui = new ActionFormData();
    gui.title("§lULTIMATE CHEAT MENU");

    const isOp = (player.commandPermissionLevel !== undefined && player.commandPermissionLevel > 0);
    const allowedFeatures = getAllowedFeatures(player);

    const BUTTONS = [
        { label: "Game Mode",           icon: "textures/items/nether_star",                      fn: showGamemodeMenu },
        { label: "Enchantments",        icon: "textures/items/book_enchanted",                   fn: showEnchantMenu },
        { label: "Enchantment Books",   icon: "textures/items/book_enchanted",                   fn: showEnchantBookMenu },
        { label: "Effects",             icon: "textures/ui/wind_charged_effect",                 fn: showEffectsMenu },
        { label: "Time",                icon: "textures/items/clock_item",                       fn: showTimeMenu },
        { label: "Weather",             icon: "textures/ui/cloud_only_storage",                  fn: showWeatherMenu },
        { label: "Teleport",            icon: "textures/ui/friendsbutton/navbar-friends-icon",   fn: showTeleportMenu },
        { label: "Commands",            icon: "textures/ui/color_plus",                          fn: showCommandConsole },
        { label: "Get XP",              icon: "textures/items/experience_bottle",                fn: showXpManager },
        { label: "Utilities",           icon: "textures/ui/icon_recipe_construction",            fn: showUtilitiesMenu },
        { label: "Player Monitor",      icon: "textures/ui/multiplayer_glyph_color",             fn: showPlayerMonitor },
        { label: "Death Locations",     icon: "textures/ui/ErrorGlyph",                         fn: showDeathLocations },
        { label: "Waypoints",           icon: "textures/ui/icon_recipe_construction",            fn: showWaypointsMenu },
        { label: "Gamerules",           icon: "textures/ui/settings_glyph_color_2x",            fn: showGamerulesMenu },
        { label: "Item Magnet",         icon: "textures/ui/icon_recipe_construction",            fn: showMagnetMenu },
        { label: "Chest Finder",        icon: "textures/items/compass_item",                     fn: showChestFinder },
        { label: "Tree Capitator",      icon: "textures/items/diamond_axe",                      fn: showTreecapMenu },
        { label: "Vein Miner",          icon: "textures/items/diamond_pickaxe",                  fn: showVeinMinerMenu },
        { label: "Others",              icon: "textures/ui/toggle_on",                           fn: showOthersMenu },
        { label: "Ore Highlighter",     icon: "textures/items/diamond",                          fn: showOreHighlighter },
        { label: "Player Tracker",      icon: "textures/ui/multiplayer_glyph_color",             fn: showPlayerTracker },
        { label: "Player Alert",        icon: "textures/ui/ErrorGlyph",                         fn: showPlayerAlert },
        { label: "Coords Logger",       icon: "textures/items/compass_item",                     fn: showCoordsLogger },
        { label: "World Clock",         icon: "textures/items/clock_item",                       fn: showClock },
        { label: "Mob & Block Tracker", icon: "textures/items/spawn_egg",                        fn: showTrackerMenu },
        { label: "Crop Harvester",      icon: "textures/items/wheat",                            fn: showCropHarvester },
        { label: "Notes",               icon: "textures/items/book_writable",                    fn: showNotesMenu },
        { label: "About",               icon: "textures/ui/infobulb",                            fn: showAboutMenu },
        { label: "Item Repairer",       icon: "textures/ui/anvil_icon",                          fn: showRepairMenu },
        { label: "Smart Console",       icon: "textures/ui/color_plus",                          fn: showSmartConsole },
        { label: "Death Backpack",      icon: "textures/items/minecart_chest",                   fn: showDeathBackpack },
        { label: "Auto Smelt",          icon: "textures/items/iron_ingot",                       fn: showAutoSmelt },
        { label: "Durability Alert",    icon: "textures/ui/anvil_icon",                          fn: showDurabilityAlert },
        { label: "Danger Radar",        icon: "textures/items/spawn_egg",                        fn: showDangerRadar },
        { label: "Structure Locator",   icon: "textures/items/map_filled",                       fn: showStructureLocator },
        { label: "Biome Locator",       icon: "textures/ui/mashup_world",                        fn: showBiomeLocator },
        { label: "Portal Calculator",   icon: "textures/blocks/obsidian",                        fn: showPortalCalc },
        { label: "Inventory Sorter",    icon: "textures/ui/icon_recipe_construction",            fn: showInventorySorter },
        { label: "Stats",               icon: "textures/ui/icon_book_writable",                  fn: showStats },
    ];

    if (isOp) gui.button("Admin", "textures/ui/op");

    const visibleButtons = isOp
        ? BUTTONS
        : BUTTONS.filter(b => allowedFeatures.includes(b.label));

    for (const btn of visibleButtons) {
        gui.button(btn.label, btn.icon);
    }

    gui.show(player).then(res => {
        if (res.canceled) return;

        let sel = res.selection;

        if (isOp) {
            if (sel === 0) { system.run(() => showAdminMenu(player, showMainMenu)); return; }
            sel -= 1;
        }

        const clicked = visibleButtons[sel];
        if (clicked) {
            system.run(() => clicked.fn(player, showMainMenu));
        }
    });
}

world.afterEvents.itemUse.subscribe(ev => {
    if (ev.itemStack.typeId !== "minecraft:stick") return;

    const item = ev.itemStack;
    const player = ev.source;

    if (isStickNameCheckOn()) {
        const stickName = item.nameTag;
        if (!stickName || stickName.toLowerCase() !== "ucm") return;
    }

    if (isOperatorsOnly()) {
        const isOp = (player.commandPermissionLevel !== undefined && player.commandPermissionLevel > 0);
        if (!isOp && !isPermittedPlayer(player)) {
            player.sendMessage("§cYou do not have permission to open this menu!");
            return;
        }
    }

    showMainMenu(player);
});