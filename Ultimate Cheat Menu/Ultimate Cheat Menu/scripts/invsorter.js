import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const HOTBAR_END = 9;

function sortRange(player, start, end) {
    const container = player.getComponent("inventory")?.container;
    if (!container) return 0;

    const items = [];
    for (let i = start; i < end; i++) {
        const item = container.getItem(i);
        if (item) items.push(item);
    }

    if (items.length === 0) return 0;

    const merged = [];
    for (const item of items) {
        let remaining = item.amount;

        for (const target of merged) {
            if (remaining <= 0) break;
            if (!target.isStackableWith(item)) continue;

            const space = target.maxAmount - target.amount;
            if (space <= 0) continue;

            const move = Math.min(space, remaining);
            target.amount += move;
            remaining -= move;
        }

        while (remaining > 0) {
            const leftover = item.clone();
            leftover.amount = Math.min(remaining, item.maxAmount);
            merged.push(leftover);
            remaining -= leftover.amount;
        }
    }

    merged.sort((a, b) => {
        const nameCompare = a.typeId.localeCompare(b.typeId);
        if (nameCompare !== 0) return nameCompare;
        return b.amount - a.amount;
    });

    for (let i = start; i < end; i++) {
        const index = i - start;
        container.setItem(i, index < merged.length ? merged[index] : undefined);
    }

    return merged.length;
}

export function showInventorySorter(player, backToMain) {
    system.run(() => {
        const container = player.getComponent("inventory")?.container;
        const used = container ? container.size - container.emptySlotsCount : 0;

        const gui = new ActionFormData();
        gui.title("§lInventory Sorter");
        gui.body(
            "§7Slots used: §e" + used + "§7/§e" + (container?.size ?? 36) + "\n\n" +
            "§7Merges partial stacks together and sorts everything alphabetically.\n" +
            "§8Enchanted and damaged items are never merged."
        );
        gui.button("§8Sort Main Inventory\n§7Leaves your hotbar untouched", "textures/ui/icon_recipe_construction");
        gui.button("§8Sort Everything\n§7Includes the hotbar", "textures/ui/icon_recipe_equipment");
        gui.button("§8Back", "textures/ui/undoArrow");

        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) {
                system.run(() => backToMain(player));
                return;
            }
            system.run(() => {
                const container = player.getComponent("inventory")?.container;
                if (!container) return;

                const start = res.selection === 0 ? HOTBAR_END : 0;
                const stacks = sortRange(player, start, container.size);

                if (stacks === 0) player.sendMessage("§e[Sorter] §fNothing to sort.");
                else player.sendMessage("§a[Sorter] §fSorted into §e" + stacks + " §fstacks.");

                showInventorySorter(player, backToMain);
            });
        });
    });
}
