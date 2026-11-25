import { system, world, EnchantmentTypes } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const selectedEnchant = new Map();

world.afterEvents.playerLeave.subscribe((ev) => selectedEnchant.delete(ev.playerId));

const enchantOptions = [
    { name: "Sharpness V", id: "sharpness", level: 5 },
    { name: "Smite V", id: "smite", level: 5 },
    { name: "Bane of Arthropods V", id: "bane_of_arthropods", level: 5 },
    { name: "Fire Aspect II", id: "fire_aspect", level: 2 },
    { name: "Looting III", id: "looting", level: 3 },
    { name: "Knockback II", id: "knockback", level: 2 },
    { name: "Efficiency V", id: "efficiency", level: 5 },
    { name: "Silk Touch I", id: "silk_touch", level: 1 },
    { name: "Fortune III", id: "fortune", level: 3 },
    { name: "Protection IV", id: "protection", level: 4 },
    { name: "Fire Protection IV", id: "fire_protection", level: 4 },
    { name: "Blast Protection IV", id: "blast_protection", level: 4 },
    { name: "Projectile Protection IV", id: "projectile_protection", level: 4 },
    { name: "Thorns III", id: "thorns", level: 3 },
    { name: "Unbreaking III", id: "unbreaking", level: 3 },
    { name: "Mending I", id: "mending", level: 1 },
    { name: "Respiration III", id: "respiration", level: 3 },
    { name: "Aqua Affinity I", id: "aqua_affinity", level: 1 },
    { name: "Depth Strider III", id: "depth_strider", level: 3 },
    { name: "Frost Walker II", id: "frost_walker", level: 2 },
    { name: "Feather Falling IV", id: "feather_falling", level: 4 },
    { name: "Soul Speed III", id: "soul_speed", level: 3 },
    { name: "Swift Sneak III", id: "swift_sneak", level: 3 },
    { name: "Power V", id: "power", level: 5 },
    { name: "Punch II", id: "punch", level: 2 },
    { name: "Flame I", id: "flame", level: 1 },
    { name: "Infinity I", id: "infinity", level: 1 },
    { name: "Multishot I", id: "multishot", level: 1 },
    { name: "Piercing IV", id: "piercing", level: 4 },
    { name: "Quick Charge III", id: "quick_charge", level: 3 },
    { name: "Loyalty III", id: "loyalty", level: 3 },
    { name: "Impaling V", id: "impaling", level: 5 },
    { name: "Riptide III", id: "riptide", level: 3 },
    { name: "Channeling I", id: "channeling", level: 1 },
    { name: "Density V", id: "density", level: 5 },
    { name: "Breach IV", id: "breach", level: 4 },
    { name: "Wind Burst III", id: "wind_burst", level: 3 }
];

const maxEnchants = [
    { id: "mending", level: 1 }, { id: "unbreaking", level: 3 },
    { id: "sharpness", level: 5 }, { id: "fire_aspect", level: 2 },
    { id: "looting", level: 3 }, { id: "knockback", level: 2 },
    { id: "efficiency", level: 5 }, { id: "fortune", level: 3 }, { id: "silk_touch", level: 1 },
    { id: "protection", level: 4 }, { id: "thorns", level: 3 },
    { id: "feather_falling", level: 4 }, { id: "depth_strider", level: 3 },
    { id: "soul_speed", level: 3 }, { id: "respiration", level: 3 },
    { id: "aqua_affinity", level: 1 }, { id: "swift_sneak", level: 3 },
    { id: "power", level: 5 }, { id: "punch", level: 2 }, { id: "flame", level: 1 },
    { id: "infinity", level: 1 },
    { id: "piercing", level: 4 }, { id: "quick_charge", level: 3 }, { id: "multishot", level: 1 },
    { id: "impaling", level: 5 }, { id: "loyalty", level: 3 }, { id: "channeling", level: 1 },
    { id: "density", level: 5 }, { id: "breach", level: 4 }, { id: "wind_burst", level: 3 }
];

const textureExceptions = {
    "golden_sword": "gold_sword", "golden_axe": "gold_axe", "golden_pickaxe": "gold_pickaxe",
    "golden_shovel": "gold_shovel", "golden_hoe": "gold_hoe", "golden_helmet": "gold_helmet",
    "golden_chestplate": "gold_chestplate", "golden_leggings": "gold_leggings", "golden_boots": "gold_boots",
    "wooden_sword": "wood_sword", "wooden_axe": "wood_axe", "wooden_pickaxe": "wood_pickaxe",
    "wooden_shovel": "wood_shovel", "wooden_hoe": "wood_hoe", "bow": "bow_standby",
    "crossbow": "crossbow_standby", "fishing_rod": "fishing_rod_uncast", "book": "book_normal"
};

function getItemTexture(typeId) {
    const key = typeId.replace("minecraft:", "");
    const textureName = textureExceptions[key] ?? key;
    const knownPrefixes = ["sword", "axe", "pickaxe", "shovel", "hoe", "helmet", "chestplate", "leggings", "boots", "bow", "crossbow", "trident", "fishing_rod", "flint_and_steel", "shears", "book"];
    const isKnown = knownPrefixes.some(prefix => key.endsWith(prefix) || key === prefix);
    return isKnown ? `textures/items/${textureName}` : "textures/ui/inventory_icon";
}

export function showEnchantMenu(player, backToMain) {
    const gui = new ActionFormData()
        .title("§lENCHANT MENU")
        .body(selectedEnchant.has(player.id) ? `§7Selected: §e${selectedEnchant.get(player.id).name}` : "Choose your mode:")
        .button("§8« BACK TO MAIN")
        .button("AUTO MAX ENCHANT")
        .button("SELECT CUSTOM ENCHANT")
        .button("REMOVE ENCHANTMENTS");

    gui.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === 0) { if (backToMain) backToMain(player); return; }
        if (res.selection === 1) { selectedEnchant.delete(player.id); showInventoryList(player, "max", backToMain); }
        else if (res.selection === 2) showCustomPicker(player, backToMain);
        else if (res.selection === 3) showClearMenu(player, backToMain);
    });
}

function showClearMenu(player, backToMain) {
    new ActionFormData()
        .title("§lClear Enchantments")
        .button("§8« BACK")
        .button("REMOVE ALL ENCHANTS")
        .button("REMOVE SPECIFIC ENCHANT")
        .show(player).then((res) => {
            if (res.canceled || res.selection === 0) return showEnchantMenu(player, backToMain);
            if (res.selection === 1) showInventoryList(player, "clear_all", backToMain);
            else showSpecificClearPicker(player, backToMain);
        });
}

function showSpecificClearPicker(player, backToMain) {
    const gui = new ActionFormData().title("§lRemove Specific Enchant").button("§8« BACK");
    enchantOptions.forEach(en => gui.button(`Remove ${en.name}`));
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 0) return showClearMenu(player, backToMain);
        selectedEnchant.set(player.id, enchantOptions[res.selection - 1]);
        showInventoryList(player, "clear_specific", backToMain);
    });
}

function showCustomPicker(player, backToMain) {
    const gui = new ActionFormData().title("§lPick an Enchant").button("§8« BACK");
    enchantOptions.forEach(en => gui.button(en.name));
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 0) return showEnchantMenu(player, backToMain);
        selectedEnchant.set(player.id, enchantOptions[res.selection - 1]);
        showInventoryList(player, "custom", backToMain);
    });
}

function enchantSlot(player, slot, expectedTypeId, list) {
    const container = player.getComponent("inventory").container;
    const item = container.getItem(slot);

    if (!item || item.typeId !== expectedTypeId) return { ok: false, reason: "moved" };

    const enchantable = item.getComponent("enchantable");
    if (!enchantable) return { ok: false, reason: "not_enchantable" };

    let applied = 0;
    for (const entry of list) {
        const type = EnchantmentTypes.get(entry.id);
        if (!type) continue;

        if (enchantable.getEnchantment(type)) enchantable.removeEnchantment(type);
        if (!enchantable.canAddEnchantment({ type, level: entry.level })) continue;

        enchantable.addEnchantment({ type, level: entry.level });
        applied++;
    }

    if (applied === 0) return { ok: false, reason: "incompatible" };

    container.setItem(slot, item);
    return { ok: true, applied };
}

function showInventoryList(player, mode, backToMain) {
    const inventory = player.getComponent("inventory").container;
    const gui = new ActionFormData();
    const chosen = selectedEnchant.get(player.id);

    let title = "Select Item";
    if (mode === "max") title = "§lMax Enchanter";
    else if (mode === "clear_all") title = "§lClear All Enchants";
    else if (mode === "clear_specific") title = `§eRemoving: ${chosen?.name}`;
    else title = `§3Applying: ${chosen?.name}`;

    gui.title(title).button("§8« BACK");

    const allItems = [];
    for (let i = 0; i < inventory.size; i++) {
        const item = inventory.getItem(i);
        if (item && item.typeId !== "minecraft:stick") {
            const displayName = item.typeId.replace("minecraft:", "").replace(/_/g, " ").toUpperCase();
            allItems.push({ slot: i, typeId: item.typeId, name: displayName });
        }
    }

    allItems.forEach(item => gui.button(item.name, getItemTexture(item.typeId)));

    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 0) return showEnchantMenu(player, backToMain);
        const selected = allItems[res.selection - 1];

        system.run(() => {
            const item = inventory.getItem(selected.slot);
            if (!item || item.typeId !== selected.typeId) {
                player.onScreenDisplay.setActionBar("§cThat item moved — pick it again.");
                return showInventoryList(player, mode, backToMain);
            }
            const enchantable = item.getComponent("enchantable");

            if (mode === "clear_all") {
                if (!enchantable) {
                    player.onScreenDisplay.setActionBar(`§c${selected.name} cannot hold enchantments.`);
                } else {
                    enchantable.removeAllEnchantments();
                    inventory.setItem(selected.slot, item);
                    player.onScreenDisplay.setActionBar(`§aRemoved all enchants from §f${selected.name}`);
                }
            }
            else if (mode === "clear_specific") {
                const type = EnchantmentTypes.get(chosen.id);
                if (!enchantable || !type || !enchantable.getEnchantment(type)) {
                    player.onScreenDisplay.setActionBar(`§f${selected.name} §cdoes not have §e${chosen.name}§c.`);
                } else {
                    enchantable.removeEnchantment(type);
                    inventory.setItem(selected.slot, item);
                    player.onScreenDisplay.setActionBar(`§aRemoved §e${chosen.name}§a from §f${selected.name}`);
                }
            }
            else if (mode === "max") {
                const result = enchantSlot(player, selected.slot, selected.typeId, maxEnchants);
                if (result.ok) player.onScreenDisplay.setActionBar(`§6Maxed out §f${selected.name} §7(${result.applied} enchants)`);
                else if (result.reason === "not_enchantable") player.onScreenDisplay.setActionBar(`§c${selected.name} cannot hold enchantments.`);
                else player.onScreenDisplay.setActionBar(`§cNothing could be applied to §f${selected.name}§c.`);
            }
            else {
                const result = enchantSlot(player, selected.slot, selected.typeId, [{ id: chosen.id, level: chosen.level }]);
                if (result.ok) player.onScreenDisplay.setActionBar(`§bApplied ${chosen.name} to §f${selected.name}`);
                else if (result.reason === "not_enchantable") player.onScreenDisplay.setActionBar(`§c${selected.name} cannot hold enchantments.`);
                else player.onScreenDisplay.setActionBar(`§e${chosen.name} §cdoesn't fit on §f${selected.name}§c.`);
            }

            showInventoryList(player, mode, backToMain);
        });
    });
}
