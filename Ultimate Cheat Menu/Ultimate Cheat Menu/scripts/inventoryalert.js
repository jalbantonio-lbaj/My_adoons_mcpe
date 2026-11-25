import { world, system } from "@minecraft/server";
const wasFullMap = new Map();
world.afterEvents.playerLeave.subscribe((ev) => wasFullMap.delete(ev.playerId));
system.runInterval(() => {
    for (const player of world.getPlayers()) {
        try {
            const inv = player.getComponent("inventory");
            if (!inv || !inv.container) continue;
            const full = inv.container.emptySlotsCount === 0;
            const wasFull = wasFullMap.get(player.id) || false;
            if (full && !wasFull) {
                player.sendMessage("§c[!] §fYour inventory is full!");
                player.playSound("note.pling", { pitch: 1.5, volume: 1 });
            }
            wasFullMap.set(player.id, full);
        } catch (_) {}
    }
}, 10);
