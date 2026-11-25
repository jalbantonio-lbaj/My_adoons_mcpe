import { world, system } from "@minecraft/server";
const slots = new Map();
export function setActionBarSlot(player, slotName, text) {
    if (!slots.has(player.id)) slots.set(player.id, new Map());
    if (text === null || text === undefined || text === "") {
        slots.get(player.id).delete(slotName);
    } else {
        slots.get(player.id).set(slotName, text);
    }
}
export function clearActionBarSlot(player, slotName) {
    if (slots.has(player.id)) slots.get(player.id).delete(slotName);
}
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const playerSlots = slots.get(player.id);
        if (!playerSlots || playerSlots.size === 0) continue;
        try {
            const lines = [...playerSlots.values()];
            player.onScreenDisplay.setActionBar(lines.join("\n"));
        } catch (_) {}
    }
}, 1);