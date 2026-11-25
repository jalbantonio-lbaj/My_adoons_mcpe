import { world, system } from "@minecraft/server";
import { setActionBarSlot, clearActionBarSlot } from "./actionbar.js";
import { ActionFormData } from "@minecraft/server-ui";

const trackerState = new Map();

function loadState(player) {
    try {
        const raw = player.getDynamicProperty("playerTrackerState");
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { enabled: false };
}

function saveState(player) {
    try {
        const s = trackerState.get(player.id);
        if (s) player.setDynamicProperty("playerTrackerState", JSON.stringify({ enabled: s.enabled }));
    } catch (_) {}
}

export function getPlayerTrackerState(player) {
    if (!trackerState.has(player.id)) {
        trackerState.set(player.id, loadState(player));
    }
    return trackerState.get(player.id);
}

export function showPlayerTracker(player, backToMain) {
    system.run(() => {
        const state = getPlayerTrackerState(player);
        const gui = new ActionFormData();
        gui.title("§lPlayer Tracker");
        gui.body(
            "§7Status: " + (state.enabled ? "§aENABLED" : "§cDISABLED") +
            "\n\n§7Shows nearby players name, coordinates\n§7and distance on your HUD (actionbar).\n§7Updates every second."
        );
        gui.button(state.enabled ? "§cDisable Tracker" : "§aEnable Tracker", "textures/ui/multiplayer_glyph_color");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 1) { system.run(() => backToMain(player)); return; }
            system.run(() => {
                state.enabled = !state.enabled;
                saveState(player);
                player.sendMessage("§6[Player Tracker] §f" + (state.enabled ? "§aEnabled" : "§cDisabled"));
                showPlayerTracker(player, backToMain);
            });
        });
    });
}

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const state = trackerState.get(player.id);
        if (!state || !state.enabled) { clearActionBarSlot(player, "tracker"); continue; }
        try {
            const others = world.getPlayers().filter(p => p.id !== player.id);
            if (others.length === 0) {
                setActionBarSlot(player, "tracker", "§6[Tracker] §7No other players online");
                continue;
            }
            const pos = player.location;
            const nearby = others.map(p => {
                const dx = p.location.x - pos.x;
                const dy = p.location.y - pos.y;
                const dz = p.location.z - pos.z;
                const dist = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
                return { name: p.name, dist, x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
            }).sort((a, b) => a.dist - b.dist).slice(0, 3);
            const lines = nearby.map(p =>
                "§e" + p.name + " §7X:" + p.x + " Y:" + p.y + " Z:" + p.z + " §8(" + p.dist + "m)"
            );
            setActionBarSlot(player, "tracker", "§6Players:\n" + lines.join("\n"));
        } catch (_) {}
    }
}, 1);

