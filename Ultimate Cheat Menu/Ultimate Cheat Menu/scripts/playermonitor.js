import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
export function showPlayerMonitor(player, backToMain) {
    system.run(() => {
        const allPlayers = [...world.getAllPlayers()];
        const gui = new ActionFormData();
        gui.title("§lPlayer Monitor");
        gui.body(`§ePlayers Online: §f${allPlayers.length}\n§7Click a player to see details`);
        for (const p of allPlayers) {
            const isSelf = p.id === player.id ? " (You)" : "";
            const dim = p.dimension.id
                .replace("minecraft:overworld", "OW")
                .replace("minecraft:nether", "NE")
                .replace("minecraft:the_end", "EN");
            const loc = p.location;
            const health = p.getComponent("health");
            const hp = health ? Math.round(health.currentValue) : "?";
            gui.button(`§8${p.name}${isSelf}\nHP:§8${hp} | ${dim} | ${Math.round(loc.x)}, ${Math.round(loc.y)}, ${Math.round(loc.z)}`, "textures/ui/multiplayer_glyph_color");
        }
        gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled) { system.run(() => backToMain(player)); return; }
            if (res.selection === allPlayers.length) { system.run(() => backToMain(player)); return; }
            const selectedPlayer = allPlayers[res.selection];
            system.run(() => showPlayerDetail(player, selectedPlayer, backToMain));
        });
    });
}
function showPlayerDetail(player, target, backToMain) {
    system.run(() => {
        const loc = target.location;
        const x = Math.round(loc.x);
        const y = Math.round(loc.y);
        const z = Math.round(loc.z);
        const dim = target.dimension.id
            .replace("minecraft:overworld", "Overworld")
            .replace("minecraft:nether", "Nether")
            .replace("minecraft:the_end", "The End");
        const health = target.getComponent("health");
        const hp = health ? Math.round(health.currentValue) : "?";
        const maxHp = health ? Math.round(health.effectiveMax) : "?";
        const hunger = target.getComponent("food");
        const food = hunger ? Math.round(hunger.foodLevel) : "?";
        const inventory = target.getComponent("inventory");
        const container = inventory?.container;
        const heldItem = container?.getItem(target.selectedSlotIndex);
        const heldItemName = heldItem
            ? `§a${heldItem.typeId.replace("minecraft:", "")} §7(x${heldItem.amount})`
            : "§7Empty Hand";
        const armorSlots = [
            { slot: "slot.armor.head", name: "Helmet" },
            { slot: "slot.armor.chest", name: "Chestplate" },
            { slot: "slot.armor.legs", name: "Leggings" },
            { slot: "slot.armor.feet", name: "Boots" }
        ];
        let armorText = "";
        for (const armor of armorSlots) {
            try {
                const eq = target.getComponent("equippable");
                const piece = eq?.getEquipment(
                    armor.slot.replace("slot.armor.", "")
                        .replace("head", "Head")
                        .replace("chest", "Chest")
                        .replace("legs", "Legs")
                        .replace("feet", "Feet")
                );
                armorText += `§7${armor.name}: §f${piece ? piece.typeId.replace("minecraft:", "") : "None"}\n`;
            } catch (e) {
                armorText += `§7${armor.name}: §fUnknown\n`;
            }
        }
        let inventoryText = "";
        if (container) {
            const itemMap = new Map();
            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (item) {
                    const name = item.typeId.replace("minecraft:", "");
                    const existing = itemMap.get(name) || 0;
                    itemMap.set(name, existing + item.amount);
                }
            }
            if (itemMap.size === 0) {
                inventoryText = "§7Empty\n";
            } else {
                for (const [name, amount] of itemMap) {
                    inventoryText += `§f${name} §7x${amount}\n`;
                }
            }
        } else {
            inventoryText = "§cCannot read inventory\n";
        }
        const statuses = [];
        if (target.isSneaking) statuses.push("Sneaking");
        if (target.isFlying) statuses.push("Flying");
        if (target.isFalling) statuses.push("Falling");
        if (target.isSwimming) statuses.push("Swimming");
        if (target.isOnGround) statuses.push("On Ground");
        if (target.isClimbing) statuses.push("Climbing");
        if (target.isInWater) statuses.push("In Water");
        const isSelf = target.id === player.id;
        const gui = new ActionFormData();
        gui.title(`§l${target.name}`);
        gui.body(
            `§e=== LOCATION ===\n§7Coords: §f${x}, ${y}, ${z}\n§7Dimension: §f${dim}\n\n` +
            `§e=== STATS ===\n§7Health: §c${hp}§7/§c${maxHp}\n§7Food: §e${food}§7/§e20\n§7XP Level: §a${target.level}\n§7Status: §f${statuses.join(", ") || "Idle"}\n\n` +
            `§e=== HELD ITEM ===\n${heldItemName}\n\n` +
            `§e=== ARMOR ===\n${armorText}\n` +
            `§e=== INVENTORY ===\n${inventoryText}`
        );
        gui.button("§8Refresh", "textures/ui/refresh_light");
        if (!isSelf) {
            gui.button("TP to This Player", "textures/items/ender_eye");
            gui.button("§8Bring to Me", "textures/ui/icon_steve");
        }
        gui.button("§8« BACK TO LIST", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled) { system.run(() => backToMain(player)); return; }
            const backIndex = isSelf ? 1 : 3;
            if (res.selection === 0) { system.run(() => showPlayerDetail(player, target, backToMain)); return; }
            if (!isSelf && res.selection === 1) {
                system.run(() => {
                    player.runCommand(`tp @s "${target.name}"`);
                    player.sendMessage(`§aTeleported to ${target.name}`);
                    showPlayerDetail(player, target, backToMain);
                });
                return;
            }
            if (!isSelf && res.selection === 2) {
                system.run(() => {
                    player.runCommand(`tp "${target.name}" @s`);
                    player.sendMessage(`§aBrought ${target.name} §ato you!`);
                    showPlayerDetail(player, target, backToMain);
                });
                return;
            }
            if (res.selection === backIndex) system.run(() => showPlayerMonitor(player, backToMain));
        });
    });
}