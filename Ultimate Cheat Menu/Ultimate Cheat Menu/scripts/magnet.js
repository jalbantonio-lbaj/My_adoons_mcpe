import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const magnetActive = new Map();
const magnetIntervals = new Map();

function loadState(player) {
    try {
        const raw = player.getDynamicProperty("magnetState");
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { active: false, radius: 10, mode: "all", items: [] };
}

function saveState(player) {
    try {
        const data = magnetActive.get(player.id);
        if (data) player.setDynamicProperty("magnetState", JSON.stringify({ active: data.active, radius: data.radius, mode: data.mode, items: data.items }));
    } catch (_) {}
}

export function getMagnetState(player) {
    if (!magnetActive.has(player.id)) {
        magnetActive.set(player.id, loadState(player));
    }
    return magnetActive.get(player.id);
}

world.afterEvents.playerSpawn.subscribe((ev) => {
    if (!ev.initialSpawn) return;
    const player = ev.player;
    system.runTimeout(() => {
        const data = getMagnetState(player);
        if (data.active) {
            data.active = false;
            toggleMagnet(player, () => {});
        }
    }, 20);
});

export function showMagnetMenu(player, backToMain) {
    const data = getMagnetState(player);
    const gui = new ActionFormData();
    gui.title("Item Magnet");
    gui.body(
        `§eMagnet Status: ${data.active ? "§aACTIVE" : "§cINACTIVE"}\n` +
        `§7Radius: §f${data.radius} blocks\n` +
        `§7Mode: §f${data.mode === "all" ? "All Items" : "Selected Items Only"}\n` +
        `§7Selected Items: §f${data.items.length === 0 ? "None" : data.items.join(", ")}`
    );
    gui.button(data.active ? "§cStop Magnet" : "§aStart Magnet", data.active ? "textures/ui/cancel" : "textures/ui/check");
    gui.button("§8Set Radius", "textures/ui/refresh_light");
    gui.button("Select Specific Items", "textures/ui/color_plus");
    gui.button("§8Collect All Items", "textures/ui/icon_recipe_construction");
    gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 4) { system.run(() => backToMain(player)); return; }
        if (res.selection === 0) { system.run(() => toggleMagnet(player, backToMain)); return; }
        if (res.selection === 1) { system.run(() => showRadiusInput(player, backToMain)); return; }
        if (res.selection === 2) { system.run(() => showItemSelector(player, backToMain)); return; }
        if (res.selection === 3) { system.run(() => { collectItems(player); showMagnetMenu(player, backToMain); }); return; }
    });
}

function toggleMagnet(player, backToMain) {
    const data = getMagnetState(player);
    if (data.active) {
        data.active = false;
        const interval = magnetIntervals.get(player.id);
        if (interval) { system.clearRun(interval); magnetIntervals.delete(player.id); }
        player.sendMessage("§cItem Magnet STOPPED!");
    } else {
        data.active = true;
        const interval = system.runInterval(() => {
            if (!data.active) return;
            collectItems(player);
        }, 10);
        magnetIntervals.set(player.id, interval);
        player.sendMessage(`§aItem Magnet ACTIVE! Radius: §e${data.radius} §ablocks`);
    }
    saveState(player);
    showMagnetMenu(player, backToMain);
}

function collectItems(player) {
    try {
        const data = getMagnetState(player);
        const nearbyEntities = player.dimension.getEntities({ location: player.location, maxDistance: data.radius, type: "minecraft:item" });
        for (const entity of nearbyEntities) {
            try {
                const itemComp = entity.getComponent("item");
                if (!itemComp) continue;
                const itemType = itemComp.itemStack.typeId.replace("minecraft:", "");
                if (data.mode === "specific" && data.items.length > 0) {
                    if (!data.items.includes(itemType)) continue;
                }
                player.runCommand(`tp @e[type=item,r=${data.radius}] @s`);
                break;
            } catch (_) {}
        }
    } catch (_) {}
}

function showRadiusInput(player, backToMain) {
    const form = new ModalFormData();
    form.title("Set Magnet Radius");
    form.textField("§eRadius (1-50 blocks):\n§7How far items will be pulled", "10");
    form.show(player).then((res) => {
        if (res.canceled) { system.run(() => showMagnetMenu(player, backToMain)); return; }
        const radius = parseInt(res.formValues[0]);
        system.run(() => {
            if (isNaN(radius) || radius < 1 || radius > 50) {
                player.sendMessage("§cInvalid radius! Enter 1-50.");
                showMagnetMenu(player, backToMain);
                return;
            }
            const data = getMagnetState(player);
            data.radius = radius;
            saveState(player);
            player.sendMessage(`§aRadius set to §e${radius} §ablocks!`);
            showMagnetMenu(player, backToMain);
        });
    });
}

function showItemSelector(player, backToMain) {
    const data = getMagnetState(player);
    const gui = new ActionFormData();
    gui.title("Item Filter");
    gui.body(
        `§7Current Mode: §f${data.mode === "all" ? "All Items" : "Specific Items"}\n` +
        `§7Selected: §f${data.items.length === 0 ? "None" : data.items.join(", ")}\n\n` +
        `§eSelect mode below:`
    );
    gui.button("§8Collect ALL Items", "textures/ui/check");
    gui.button("Collect SPECIFIC Items", "textures/ui/color_plus");
    gui.button("§8Clear Selected Items", "textures/ui/cancel");
    gui.button("§8« BACK", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 3) { system.run(() => showMagnetMenu(player, backToMain)); return; }
        if (res.selection === 0) {
            system.run(() => {
                data.mode = "all";
                saveState(player);
                player.sendMessage("§aMagnet will collect ALL items!");
                showMagnetMenu(player, backToMain);
            });
            return;
        }
        if (res.selection === 1) { system.run(() => showAddItemInput(player, backToMain)); return; }
        if (res.selection === 2) {
            system.run(() => {
                data.items = [];
                data.mode = "all";
                saveState(player);
                player.sendMessage("§cSelected items cleared! Back to ALL mode.");
                showMagnetMenu(player, backToMain);
            });
            return;
        }
    });
}

function showAddItemInput(player, backToMain) {
    const data = getMagnetState(player);
    const form = new ModalFormData();
    form.title("Add Specific Item");
    form.textField(
        `§eItem Name:\n§7e.g. diamond, iron_ingot, oak_log\n§7Current list: §f${data.items.join(", ") || "Empty"}`,
        "diamond"
    );
    form.show(player).then((res) => {
        if (res.canceled) { system.run(() => showMagnetMenu(player, backToMain)); return; }
        const itemName = res.formValues[0]?.trim().toLowerCase();
        system.run(() => {
            if (!itemName) { player.sendMessage("§cInvalid item name!"); showMagnetMenu(player, backToMain); return; }
            if (data.items.includes(itemName)) { player.sendMessage(`§e${itemName} §7is already in the list!`); showMagnetMenu(player, backToMain); return; }
            if (data.items.length >= 10) { player.sendMessage("§cMax 10 items allowed!"); showMagnetMenu(player, backToMain); return; }
            data.items.push(itemName);
            data.mode = "specific";
            saveState(player);
            player.sendMessage(`§a"§e${itemName}§a" added to magnet list!`);
            showMagnetMenu(player, backToMain);
        });
    });
}

export function restartMagnet(player) {
    const data = getMagnetState(player);
    if (!data.active) return;
    const interval = system.runInterval(() => {
        if (!data.active) return;
        collectItems(player);
    }, 10);
    magnetIntervals.set(player.id, interval);
}