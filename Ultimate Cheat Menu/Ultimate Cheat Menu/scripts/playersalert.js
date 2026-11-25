import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const alertState = new Map();

function loadState(player) {
    try {
        const raw = player.getDynamicProperty("playerAlertState");
        if (raw) {
            const s = JSON.parse(raw);
            return { ...s, _alerted: new Set() };
        }
    } catch (_) {}
    return { enabled: false, range: 50, _alerted: new Set() };
}

function saveState(player) {
    try {
        const s = alertState.get(player.id);
        if (s) player.setDynamicProperty("playerAlertState", JSON.stringify({ enabled: s.enabled, range: s.range }));
    } catch (_) {}
}

export function getPlayerAlertState(player) {
    if (!alertState.has(player.id)) {
        alertState.set(player.id, loadState(player));
    }
    return alertState.get(player.id);
}

export function showPlayerAlert(player, backToMain) {
    system.run(() => {
        const state = getPlayerAlertState(player);
        const gui = new ActionFormData();
        gui.title("§lPlayer Alert");
        gui.body(
            "§7Status: " + (state.enabled ? "§aENABLED" : "§cDISABLED") +
            "\n§7Alert range: §e" + state.range + " blocks" +
            "\n\n§7Get a sound + message when another\n§7player enters your range."
        );
        gui.button(state.enabled ? "§cDisable Alert" : "§aEnable Alert", "textures/ui/ErrorGlyph");
        gui.button("§8Change Range\n§8Current: §8" + state.range + " blocks", "textures/items/compass_item");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) { system.run(() => backToMain(player)); return; }
            system.run(() => {
                if (res.selection === 0) {
                    state.enabled = !state.enabled;
                    saveState(player);
                    player.sendMessage("§6[Player Alert] §f" + (state.enabled ? "§aEnabled" : "§cDisabled"));
                    showPlayerAlert(player, backToMain);
                }
                if (res.selection === 1) showRangeMenu(player, backToMain);
            });
        });
    });
}

function showRangeMenu(player, backToMain) {
    system.run(() => {
        const state = getPlayerAlertState(player);
        const ranges = [20, 30, 50, 75, 100, 150, 200];
        const gui = new ActionFormData();
        gui.title("§lAlert Range");
        gui.body("§7Choose detection range:");
        for (const r of ranges) {
            gui.button((state.range === r ? "§a" : "§f") + r + " blocks", "textures/items/compass_item");
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === ranges.length) { system.run(() => showPlayerAlert(player, backToMain)); return; }
            system.run(() => {
                state.range = ranges[res.selection];
                saveState(player);
                player.sendMessage("§6[Player Alert] §fRange set to §e" + state.range + " blocks");
                showPlayerAlert(player, backToMain);
            });
        });
    });
}

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const state = alertState.get(player.id);
        if (!state || !state.enabled) continue;
        try {
            const pos = player.location;
            const others = world.getPlayers().filter(p => p.id !== player.id);
            for (const other of others) {
                const dx = other.location.x - pos.x;
                const dy = other.location.y - pos.y;
                const dz = other.location.z - pos.z;
                const dist = Math.round(Math.sqrt(dx*dx + dy*dy + dz*dz));
                if (dist <= state.range) {
                    if (!state._alerted.has(other.id)) {
                        state._alerted.add(other.id);
                        player.sendMessage(
                            "§c[ALERT] §f" + other.name + " §7is §e" + dist + "m §7away!" +
                            " X:" + Math.floor(other.location.x) +
                            " Y:" + Math.floor(other.location.y) +
                            " Z:" + Math.floor(other.location.z)
                        );
                        player.playSound("note.pling", { pitch: 1.5, volume: 1 });
                    }
                } else {
                    state._alerted.delete(other.id);
                }
            }
        } catch (_) {}
    }
}, 20);