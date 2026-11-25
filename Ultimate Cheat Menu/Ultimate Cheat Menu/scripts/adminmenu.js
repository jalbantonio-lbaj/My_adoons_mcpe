import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const SETTINGS_KEY = "cheatmenu:operators_only";
const PERMITTED_KEY = "cheatmenu:permitted_players";
const STICK_NAME_KEY = "cheatmenu:stick_name_check";

const ALL_FEATURES = [
    "Game Mode",
    "Enchantments",
    "Enchantment Books",
    "Effects",
    "Time",
    "Weather",
    "Teleport",
    "Commands",
    "Get XP",
    "Utilities",
    "Player Monitor",
    "Death Locations",
    "Waypoints",
    "Gamerules",
    "Item Magnet",
    "Chest Finder",
    "Tree Capitator",
    "Vein Miner",
    "Others",
    "Ore Highlighter",
    "Player Tracker",
    "Player Alert",
    "Coords Logger",
    "World Clock",
    "Mob & Block Tracker",
    "Crop Harvester",
    "Notes",
    "About",
    "Item Repairer",
    "Smart Console",
    "Death Backpack",
    "Auto Smelt",
    "Durability Alert",
    "Danger Radar",
    "Structure Locator",
    "Biome Locator",
    "Portal Calculator",
    "Inventory Sorter",
    "Stats",
];

export function isOperatorsOnly() {
    try {
        const val = world.getDynamicProperty(SETTINGS_KEY);
        return val === undefined ? false : val;
    } catch {
        return true;
    }
}

export function isStickNameCheckOn() {
    try {
        const val = world.getDynamicProperty(STICK_NAME_KEY);
        return val === undefined ? false : val;
    } catch {
        return false;
    }
}

function getPermittedPlayers() {
    try {
        const raw = world.getDynamicProperty(PERMITTED_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function savePermittedPlayers(list) {
    world.setDynamicProperty(PERMITTED_KEY, JSON.stringify(list));
}

export function isPermittedPlayer(player) {
    const list = getPermittedPlayers();
    return list.some(p => p.id === player.id);
}

export function getAllowedFeatures(player) {
    const isOp = (player.commandPermissionLevel !== undefined && player.commandPermissionLevel > 0);
    if (isOp) return ALL_FEATURES;

    const list = getPermittedPlayers();
    const entry = list.find(p => p.id === player.id);
    if (!entry) return [];
    const allowed = entry.allowedFeatures ?? ALL_FEATURES;
    const expanded = [];
    for (const feature of allowed) {
        if (feature === "Structure and Biome Locator") {
            expanded.push("Structure Locator", "Biome Locator");
            continue;
        }
        expanded.push(feature);
    }
    return expanded;
}

export function showAdminMenu(player, backMenu) {
    const currentSetting = isOperatorsOnly();
    const stickNameCheck = isStickNameCheckOn();
    const permittedList = getPermittedPlayers();

    const gui = new ActionFormData();
    gui.title("§lAdmin Settings");

    gui.button("§8« Back to Main", "textures/ui/undoArrow");

    gui.button(
        currentSetting
            ? "Operators Only: ON\n§8Click to turn OFF"
            : "Operators Only: OFF\n§8Click to turn ON",
        "textures/ui/settings_glyph_color_2x"
    );

    gui.button(
        stickNameCheck
            ? "Stick Name Check: ON\n§8Only 'ucm' named sticks work"
            : "Stick Name Check: OFF\n§8Any stick opens menu",
        "textures/items/stick"
    );

    gui.button("Give Permission to Player\n§8Select a player & set their features", "textures/ui/plus");

    for (const p of permittedList) {
        const count = (p.allowedFeatures ?? ALL_FEATURES).length;
        gui.button(`${p.name}\n§8${count}/${ALL_FEATURES.length} features allowed`, "textures/ui/icon_steve");
    }

    gui.show(player).then(res => {
        if (res.canceled) { system.run(() => backMenu(player)); return; }

        if (res.selection === 0) {
            system.run(() => backMenu(player));
            return;
        }

        if (res.selection === 1) {
            const newVal = !currentSetting;
            try {
                world.setDynamicProperty(SETTINGS_KEY, newVal);
                player.sendMessage(newVal
                    ? "Operators Only: §aON §r— Only operators and permitted players can open the menu."
                    : "Operators Only: §cOFF §r— Everyone can open the menu."
                );
            } catch (e) {
                player.sendMessage("§cError saving: " + e);
            }
            system.run(() => showAdminMenu(player, backMenu));
            return;
        }

        if (res.selection === 2) {
            const newVal = !stickNameCheck;
            try {
                world.setDynamicProperty(STICK_NAME_KEY, newVal);
                player.sendMessage(newVal
                    ? "Stick Name Check: §aON §r— Only sticks named 'ucm' will open the menu."
                    : "Stick Name Check: §cOFF §r— Any stick will open the menu."
                );
            } catch (e) {
                player.sendMessage("§cError saving: " + e);
            }
            system.run(() => showAdminMenu(player, backMenu));
            return;
        }

        if (res.selection === 3) {
            system.run(() => showGivePermissionMenu(player, backMenu));
            return;
        }

        const permIndex = res.selection - 4;
        if (permIndex >= 0 && permIndex < permittedList.length) {
            system.run(() => showManagePermissionMenu(player, permittedList[permIndex], backMenu));
        }
    });
}

function showGivePermissionMenu(player, backMenu) {
    const onlinePlayers = world.getPlayers().filter(p => p.id !== player.id);
    const permittedList = getPermittedPlayers();
    const eligible = onlinePlayers.filter(p => !permittedList.some(pp => pp.id === p.id));

    if (eligible.length === 0) {
        player.sendMessage("§eNo eligible players online to give permission to!");
        system.run(() => showAdminMenu(player, backMenu));
        return;
    }

    const modal = new ModalFormData();
    modal.title("§lSelect Player");
    modal.dropdown("Select Player:", eligible.map(p => p.name));

    modal.show(player).then(res => {
        if (res.canceled) { system.run(() => showAdminMenu(player, backMenu)); return; }

        system.run(() => {
            const target = eligible[res.formValues[0]];
            if (!target) { showAdminMenu(player, backMenu); return; }
            showFeatureSelectMenu(
                player,
                { name: target.name, id: target.id, allowedFeatures: [...ALL_FEATURES] },
                backMenu,
                true
            );
        });
    });
}

function showFeatureSelectMenu(player, targetEntry, backMenu, isNew = false) {
    const allowed = new Set(targetEntry.allowedFeatures ?? ALL_FEATURES);

    const gui = new ActionFormData();
    gui.title(`§lPermissions: ${targetEntry.name}`);

    gui.button("Save Permissions\n§8Tap here when done to save", "textures/ui/settings_glyph_color_2x");

    for (const feature of ALL_FEATURES) {
        const on = allowed.has(feature);
        gui.button(
            `${feature}\n§8${on ? "Enabled" : "Disabled"}`,
            on ? "textures/ui/check" : "textures/ui/cancel"
        );
    }

    gui.show(player).then(res => {
        if (res.canceled) {
            system.run(() => showManagePermissionMenu(player, targetEntry, backMenu));
            return;
        }

        system.run(() => {
            if (res.selection === 0) {
                const selectedFeatures = ALL_FEATURES.filter(f => allowed.has(f));
                const updatedEntry = { ...targetEntry, allowedFeatures: selectedFeatures };
                const list = getPermittedPlayers();

                if (isNew) {
                    list.push(updatedEntry);
                } else {
                    const idx = list.findIndex(p => p.id === targetEntry.id);
                    if (idx !== -1) list[idx] = updatedEntry;
                }

                savePermittedPlayers(list);
                player.sendMessage(`Permissions saved for ${targetEntry.name}! Allowed: ${selectedFeatures.length}/${ALL_FEATURES.length} features.`);

                const onlineTarget = world.getPlayers().find(p => p.id === targetEntry.id);
                if (onlineTarget) {
                    onlineTarget.sendMessage(`${player.name} has updated your menu permissions!`);
                }

                showAdminMenu(player, backMenu);
                return;
            }

            const featureIndex = res.selection - 1;
            if (featureIndex >= 0 && featureIndex < ALL_FEATURES.length) {
                const tapped = ALL_FEATURES[featureIndex];
                if (allowed.has(tapped)) {
                    allowed.delete(tapped);
                } else {
                    allowed.add(tapped);
                }

                showFeatureSelectMenu(
                    player,
                    { ...targetEntry, allowedFeatures: [...allowed] },
                    backMenu,
                    isNew
                );
            }
        });
    });
}

function showManagePermissionMenu(player, targetEntry, backMenu) {
    const gui = new ActionFormData();
    gui.title(`§lManage: ${targetEntry.name}`);
    gui.button("§8« Back to Admin", "textures/ui/undoArrow");
    gui.button("Edit Feature Permissions\n§7Change which features they can use", "textures/ui/settings_glyph_color_2x");
    gui.button(`Remove All Permissions\n§7${targetEntry.name} will lose all menu access`, "textures/ui/cancel");

    gui.show(player).then(res => {
        if (res.canceled || res.selection === 0) {
            system.run(() => showAdminMenu(player, backMenu));
            return;
        }

        if (res.selection === 1) {
            system.run(() => showFeatureSelectMenu(player, targetEntry, backMenu, false));
            return;
        }

        if (res.selection === 2) {
            system.run(() => showRemoveConfirmMenu(player, targetEntry, backMenu));
        }
    });
}

function showRemoveConfirmMenu(player, targetEntry, backMenu) {
    const gui = new ActionFormData();
    gui.title("§lAre You Sure?");
    gui.body(`Are you sure you want to remove menu access from §e${targetEntry.name}§r?\n\nThis will remove all their permissions and they will no longer be able to open the menu.`);
    gui.button("§cYes, Remove Access", "textures/ui/cancel");
    gui.button("§aNo, Go Back", "textures/ui/undoArrow");

    gui.show(player).then(res => {
        if (res.canceled || res.selection === 1) {
            system.run(() => showManagePermissionMenu(player, targetEntry, backMenu));
            return;
        }

        if (res.selection === 0) {
            system.run(() => {
                const list = getPermittedPlayers();
                savePermittedPlayers(list.filter(p => p.id !== targetEntry.id));
                player.sendMessage(`All permissions removed from ${targetEntry.name}.`);

                const onlineTarget = world.getPlayers().find(p => p.id === targetEntry.id);
                if (onlineTarget) {
                    onlineTarget.sendMessage(`${player.name} has removed your menu permissions.`);
                }
                showAdminMenu(player, backMenu);
            });
        }
    });
}