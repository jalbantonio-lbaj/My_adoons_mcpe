import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { getProp, setProp } from "./helpers.js";

const STATS_KEY = "playerStats";
const ORES = ["coal", "iron", "copper", "gold", "redstone", "lapis", "diamond", "emerald", "quartz", "debris"];

const lastPos = new Map();

function getStats(player) {
    const data = getProp(player, STATS_KEY);
    return {
        blocks: data?.blocks ?? 0,
        ores: data?.ores ?? 0,
        diamonds: data?.diamonds ?? 0,
        kills: data?.kills ?? 0,
        deaths: data?.deaths ?? 0,
        distance: data?.distance ?? 0,
        ticks: data?.ticks ?? 0,
    };
}

function saveStats(player, stats) {
    setProp(player, STATS_KEY, stats);
}

function bump(player, key, amount) {
    const stats = getStats(player);
    stats[key] += amount;
    saveStats(player, stats);
}

world.afterEvents.playerBreakBlock.subscribe((ev) => {
    const player = ev.player;
    const typeId = ev.brokenBlockPermutation.type.id;
    const stats = getStats(player);

    stats.blocks += 1;
    if (ORES.some(ore => typeId.includes(ore + "_ore") || typeId.includes("ancient_debris"))) stats.ores += 1;
    if (typeId.includes("diamond_ore")) stats.diamonds += 1;

    saveStats(player, stats);
});

world.afterEvents.entityDie.subscribe((ev) => {
    const dead = ev.deadEntity;
    const killer = ev.damageSource?.damagingEntity;

    if (dead?.typeId === "minecraft:player") {
        try { bump(dead, "deaths", 1); } catch (_) {}
    }

    if (killer?.typeId === "minecraft:player" && dead?.typeId !== "minecraft:player") {
        try { bump(killer, "kills", 1); } catch (_) {}
    }
});

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        try {
            const stats = getStats(player);
            stats.ticks += 20;

            const prev = lastPos.get(player.id);
            const loc = player.location;

            if (prev && prev.dim === player.dimension.id) {
                const dx = loc.x - prev.x;
                const dz = loc.z - prev.z;
                const moved = Math.sqrt(dx * dx + dz * dz);
                if (moved > 0.1 && moved < 100) stats.distance += moved;
            }

            lastPos.set(player.id, { x: loc.x, z: loc.z, dim: player.dimension.id });
            saveStats(player, stats);
        } catch (_) {}
    }
}, 20);

function formatPlaytime(ticks) {
    const totalMinutes = Math.floor(ticks / 1200);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return minutes + "m";
    return hours + "h " + minutes + "m";
}

function showResetConfirm(player, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§l§cReset Stats");
        gui.body("§cThis will permanently delete all your tracked stats.\n\n§fAre you sure?");
        gui.button("§8Yes - Reset Everything", "textures/ui/cancel");
        gui.button("§8No - Keep My Stats", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 1) {
                system.run(() => showStats(player, backToMain));
                return;
            }
            system.run(() => {
                saveStats(player, { blocks: 0, ores: 0, diamonds: 0, kills: 0, deaths: 0, distance: 0, ticks: 0 });
                player.sendMessage("§c[Stats] All stats reset.");
                showStats(player, backToMain);
            });
        });
    });
}

export function showStats(player, backToMain) {
    system.run(() => {
        const stats = getStats(player);
        const kd = stats.deaths === 0 ? stats.kills.toFixed(2) : (stats.kills / stats.deaths).toFixed(2);

        const gui = new ActionFormData();
        gui.title("§lYour Stats");
        gui.body(
            "§7Playtime: §e" + formatPlaytime(stats.ticks) + "\n" +
            "§7Distance walked: §e" + Math.round(stats.distance) + " §7blocks\n\n" +
            "§7Blocks mined: §e" + stats.blocks + "\n" +
            "§7Ores mined: §e" + stats.ores + "\n" +
            "§7Diamonds found: §b" + stats.diamonds + "\n\n" +
            "§7Mobs killed: §e" + stats.kills + "\n" +
            "§7Deaths: §c" + stats.deaths + "\n" +
            "§7K/D ratio: §f" + kd
        );
        gui.button("§8Refresh", "textures/ui/refresh_light");
        gui.button("§8Reset Stats", "textures/ui/trash");
        gui.button("§8Back", "textures/ui/undoArrow");

        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) {
                system.run(() => backToMain(player));
                return;
            }
            if (res.selection === 1) {
                system.run(() => showResetConfirm(player, backToMain));
                return;
            }
            system.run(() => showStats(player, backToMain));
        });
    });
}
