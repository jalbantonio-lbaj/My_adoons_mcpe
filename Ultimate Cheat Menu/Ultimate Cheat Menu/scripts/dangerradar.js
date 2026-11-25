import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const STATE_KEY = "dangerRadarState";

const DANGER_NAMES = {
    "minecraft:creeper": "Creeper",
    "minecraft:warden": "Warden",
    "minecraft:wither": "Wither",
    "minecraft:ender_dragon": "Ender Dragon",
    "minecraft:elder_guardian": "Elder Guardian",
    "minecraft:ravager": "Ravager",
};

const states = new Map();
const lastLine = new Map();
const lastSent = new Map();
const lastCreeper = new Map();

function loadState(player) {
    try {
        const raw = player.getDynamicProperty(STATE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { active: false, radius: 24 };
}

function saveState(player) {
    try {
        const data = states.get(player.id);
        if (data) player.setDynamicProperty(STATE_KEY, JSON.stringify(data));
    } catch (_) {}
}

export function getDangerRadarState(player) {
    if (!states.has(player.id)) states.set(player.id, loadState(player));
    return states.get(player.id);
}

function distanceTo(from, to) {
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const dz = from.z - to.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

system.runInterval(() => {
    const now = system.currentTick;

    for (const player of world.getPlayers()) {
        const data = getDangerRadarState(player);
        if (!data.active) {
            lastLine.delete(player.id);
            continue;
        }

        try {
            const mobs = player.dimension.getEntities({
                location: player.location,
                maxDistance: data.radius,
                families: ["monster"],
            });

            if (mobs.length === 0) {
                if (lastLine.get(player.id) !== "clear") {
                    player.sendMessage("§a[Radar] §fArea clear §7(" + data.radius + "m)");
                    lastLine.set(player.id, "clear");
                    lastSent.set(player.id, now);
                }
                continue;
            }

            let nearest = null;
            let nearestDist = Infinity;
            let creeperDist = Infinity;

            for (const mob of mobs) {
                const dist = distanceTo(player.location, mob.location);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearest = mob;
                }
                if (mob.typeId === "minecraft:creeper" && dist < creeperDist) creeperDist = dist;
            }

            if (creeperDist <= 8) {
                const lastWarn = lastCreeper.get(player.id) ?? -999;
                if (now - lastWarn >= 60) {
                    player.sendMessage("§4§lCREEPER §c" + Math.round(creeperDist) + "m away - BACK OFF!");
                    try { player.playSound("note.pling", { pitch: 1.8 }); } catch (_) {}
                    lastCreeper.set(player.id, now);
                }
            }

            const nearestName = DANGER_NAMES[nearest.typeId] ?? nearest.typeId.replace("minecraft:", "").replace(/_/g, " ");
            const color = nearestDist <= 8 ? "§c" : nearestDist <= 16 ? "§6" : "§e";
            const line = color + "[Radar] §f" + mobs.length + " hostile" + (mobs.length === 1 ? "" : "s") +
                " nearby §7| nearest: §f" + nearestName + " §7" + Math.round(nearestDist) + "m";

            const changed = lastLine.get(player.id) !== line;
            const elapsed = now - (lastSent.get(player.id) ?? -999);

            if (changed && elapsed >= 60) {
                player.sendMessage(line);
                lastLine.set(player.id, line);
                lastSent.set(player.id, now);
            }
        } catch (_) {}
    }
}, 20);

function showRadiusInput(player, backToMain) {
    const data = getDangerRadarState(player);
    const form = new ModalFormData();
    form.title("§lRadar Range");
    form.textField("§fScan range in blocks\n§7Enter 8-64", String(data.radius));
    form.show(player).then((res) => {
        if (res.canceled) {
            system.run(() => showDangerRadar(player, backToMain));
            return;
        }
        system.run(() => {
            const value = parseInt(res.formValues[0]);
            if (isNaN(value) || value < 8 || value > 64) {
                player.sendMessage("§cInvalid! Enter a number between 8 and 64.");
                showDangerRadar(player, backToMain);
                return;
            }
            data.radius = value;
            saveState(player);
            player.sendMessage("§a[Radar] §fRange set to §e" + value + " §fblocks");
            showDangerRadar(player, backToMain);
        });
    });
}

export function showDangerRadar(player, backToMain) {
    system.run(() => {
        const data = getDangerRadarState(player);

        const gui = new ActionFormData();
        gui.title("§lDanger Radar");
        gui.body(
            "§7Status: " + (data.active ? "§aACTIVE" : "§cINACTIVE") + "\n" +
            "§7Range: §e" + data.radius + " §7blocks\n\n" +
            "§7Sends a chat message when hostile mobs are nearby.\n" +
            "§8Warns you loudly if a creeper gets within 8 blocks."
        );
        gui.button(data.active ? "§8Turn OFF" : "§8Turn ON", data.active ? "textures/ui/cancel" : "textures/ui/check");
        gui.button("§8Set Range\n§7Currently " + data.radius + " blocks", "textures/ui/refresh_light");
        gui.button("§8Back", "textures/ui/undoArrow");

        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) {
                system.run(() => backToMain(player));
                return;
            }
            if (res.selection === 1) {
                system.run(() => showRadiusInput(player, backToMain));
                return;
            }
            system.run(() => {
                data.active = !data.active;
                saveState(player);
                lastLine.delete(player.id);
                player.sendMessage(data.active ? "§a[Radar] ON" : "§c[Radar] OFF");
                showDangerRadar(player, backToMain);
            });
        });
    });
}
