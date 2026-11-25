import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

function getItemTexture(typeId) {
    const key = typeId.replace("minecraft:", "");
    const textureExceptions = {
        "golden_sword": "gold_sword",
        "golden_axe": "gold_axe",
        "golden_pickaxe": "gold_pickaxe",
        "golden_shovel": "gold_shovel",
        "golden_hoe": "gold_hoe",
        "golden_helmet": "gold_helmet",
        "golden_chestplate": "gold_chestplate",
        "golden_leggings": "gold_leggings",
        "golden_boots": "gold_boots",
        "wooden_sword": "wood_sword",
        "wooden_axe": "wood_axe",
        "wooden_pickaxe": "wood_pickaxe",
        "wooden_shovel": "wood_shovel",
        "wooden_hoe": "wood_hoe",
        "bow": "bow_standby",
        "crossbow": "crossbow_standby",
        "fishing_rod": "fishing_rod_uncast",
        "book": "book_normal",
    };
    const textureName = textureExceptions[key] ?? key;
    const knownPrefixes = [
        "sword", "axe", "pickaxe", "shovel", "hoe",
        "helmet", "chestplate", "leggings", "boots",
        "bow", "crossbow", "trident", "fishing_rod",
        "flint_and_steel", "shears"
    ];
    const isKnown = knownPrefixes.some(prefix => key.endsWith(prefix) || key === prefix);
    if (!isKnown) return "textures/ui/inventory_icon";
    return `textures/items/${textureName}`;
}

export function showRepairMenu(player, backToMain) {
    const inventory = player.getComponent("inventory").container;

    const repairableItems = [];
    for (let i = 0; i < inventory.size; i++) {
        const item = inventory.getItem(i);
        if (!item) continue;
        const durability = item.getComponent("minecraft:durability");
        if (durability) {
            const maxDur = durability.maxDurability;
            const currentDamage = durability.damage;
            const currentDur = maxDur - currentDamage;
            repairableItems.push({
                slot: i,
                typeId: item.typeId,
                name: item.typeId.replace("minecraft:", "").replace(/_/g, " ").toUpperCase(),
                currentDur,
                maxDur
            });
        }
    }

    const gui = new ActionFormData();
    gui.title("§lItem Repairer");
    gui.button("§8« BACK TO MAIN MENU", "textures/ui/undoArrow");
    gui.button("§8Repair ALL Items", "textures/ui/confirm");

    if (repairableItems.length === 0) {
        gui.body("§eNo repairable items found in inventory.");
    } else {
        gui.body("§7Select an item to repair it fully.");
        repairableItems.forEach(item => {
            gui.button(
                `${item.name}\n§8Durability: §8${item.currentDur}§8/§8${item.maxDur}`,
                getItemTexture(item.typeId)
            );
        });
    }

    gui.show(player).then(res => {
        if (res.canceled) {
            system.run(() => backToMain(player));
            return;
        }

        if (res.selection === 0) {
            system.run(() => backToMain(player));
            return;
        }

        if (res.selection === 1) {

            system.run(() => {
                repairableItems.forEach(item => {
                    repairItem(player, item, inventory);
                });
                player.sendMessage("§aAll items repaired successfully!");
                showRepairMenu(player, backToMain);
            });
            return;
        }

        const selected = repairableItems[res.selection - 2];
        system.run(() => {
            repairItem(player, selected, inventory);
            player.sendMessage(`§a${selected.name} repaired successfully!`);
            showRepairMenu(player, backToMain);
        });
    });
}

function repairItem(player, item, inventory) {
    try {

        if (item.slot > 8) {
            inventory.swapItems(item.slot, 0, inventory);
            player.selectedSlotIndex = 0;
        } else {
            player.selectedSlotIndex = item.slot;
        }
        player.runCommand("replaceitem entity @s slot.weapon.mainhand 0 " +
            inventory.getItem(player.selectedSlotIndex).typeId);
    } catch (e) {

        try {
            const it = inventory.getItem(item.slot);
            if (it) {
                const dur = it.getComponent("minecraft:durability");
                if (dur) {
                    dur.damage = 0;
                    inventory.setItem(item.slot, it);
                }
            }
        } catch (e2) {}
    }
}