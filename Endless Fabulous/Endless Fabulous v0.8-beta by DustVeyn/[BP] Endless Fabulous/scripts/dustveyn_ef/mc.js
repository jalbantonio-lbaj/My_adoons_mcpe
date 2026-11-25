import { EntityComponentTypes, EquipmentSlot, ItemStack, world } from '@minecraft/server';

world.afterEvents.itemUse.subscribe(({ itemStack: item, source: player }) => {
    const equipment = player.getComponent(EntityComponentTypes.Equippable);
    if (item && item.typeId == "dustveyn_ef:matter_cluster") {
        const inventory = player.getComponent(EntityComponentTypes.Inventory)
        if (!inventory) return
        const container = inventory.container
        const lore = item.getLore();
        const itemEntries = lore.map(e => e.split(" = ")).filter(e => e.length === 2);
        const inventorySlots = 36;
        const inventoryMap = {};
        for (let i = 0; i < inventorySlots; i++) {
            const slotItem = container.getItem(i);
            if (!slotItem) continue;
            const id = slotItem.typeId;
            const amount = slotItem.amount;
            if (!inventoryMap[id]) inventoryMap[id] = [];
            inventoryMap[id].push({ slot: i, amount });
        }
        let fitsAll = true;
        for (const [id, amountStr] of itemEntries) {
            const totalAmount = parseInt(amountStr);
            if (!id || isNaN(totalAmount)) continue;
            let remaining = totalAmount;
            let availableSpace = 0;
            if (inventoryMap[id]) {
                for (const slotInfo of inventoryMap[id]) {
                    availableSpace += (64 - slotInfo.amount);
                }
            }
            for (let i = 0; i < inventorySlots; i++) {
                const slotItem = container.getItem(i);
                if (!slotItem) availableSpace += 64;
            }
            if (availableSpace < remaining) {
                fitsAll = false;
                break;
            }
        }
        if (!fitsAll) {
            player.sendMessage("§c%dustveyn_ef.full_inv_matter.info");
            return;
        }
        for (const [id, amountStr] of itemEntries) {
            let remaining = parseInt(amountStr);
            while (remaining > 0) {
                const size = Math.min(64, remaining);
                container.addItem(new ItemStack(id, size));
                remaining -= size;
            }
        }
        if (item.amount > 1) {
            item.amount--;
            equipment.setEquipment(EquipmentSlot.Mainhand, item);
        } else {
            equipment.setEquipment(EquipmentSlot.Mainhand, undefined);
        }
    }
});