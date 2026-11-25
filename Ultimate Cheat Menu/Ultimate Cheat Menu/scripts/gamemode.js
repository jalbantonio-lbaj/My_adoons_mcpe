import { world, system } from "@minecraft/server";
import { ActionFormData, MessageFormData } from "@minecraft/server-ui";

const spectatorTimers = new Map();
const spectatorLocations = new Map();

export function showGamemodeMenu(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§lGamemode Selector");
    gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
    gui.button("Survival", "textures/ui/heart");
    gui.button("Creative", "textures/items/nether_star");
    gui.button("Adventure", "textures/items/map_empty");
    gui.button("Spectator", "textures/items/ender_eye");

    gui.show(player).then((response) => {
        if (response.canceled) return;
        if (response.selection === 0) {
            if (backToMain) backToMain(player);
            return;
        }

        const modes = ["survival", "creative", "adventure", "spectator"];
        const selectedMode = modes[response.selection - 1];

        if (selectedMode === "spectator") {
            askLocationRecall(player, backToMain);
        } else {
            cancelSpectatorTimer(player);
            applyGamemode(player, selectedMode);
        }
    });
}

function askLocationRecall(player, backToMain) {
    const gui = new MessageFormData()
        .title("Location Recall")
        .body("Do you want to be teleported back to this exact spot when the Spectator timer ends?")
        .button1("YES")
        .button2("NO");

    gui.show(player).then((res) => {
        if (res.canceled) return;

        if (res.selection === 0) {
            const pos = player.location;
            spectatorLocations.set(player.id, {
                x: pos.x,
                y: pos.y,
                z: pos.z,
                dimension: player.dimension.id
            });
            player.sendMessage("§aLocation saved! You will return here when timer ends.");
        } else {
            spectatorLocations.delete(player.id);
            player.sendMessage("§7No location saved.");
        }

        showSpectatorDuration(player, backToMain);
    });
}

function showSpectatorDuration(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§lSpectator Duration");
    gui.body("§7Select the duration for Spectator mode:");
    gui.button("§e1 Minute", "textures/ui/timer");
    gui.button("§e5 Minutes", "textures/ui/timer");
    gui.button("§610 Minutes", "textures/ui/timer");
    gui.button("§615 Minutes", "textures/ui/timer");
    gui.button("§c20 Minutes", "textures/ui/timer");
    gui.button("§8« Back", "textures/ui/undoArrow");

    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 5) {
            showGamemodeMenu(player, backToMain);
            return;
        }

        const durations = [1, 5, 10, 15, 20];
        const minutes = durations[res.selection];

        applyGamemode(player, "spectator");
        startSpectatorTimer(player, minutes);
    });
}

function forceGamemode(player, mode) {
    try {
        player.runCommand(`gamemode ${mode} @s`);
    } catch (_) {
        try {
            world.getDimension("overworld").runCommand(`gamemode ${mode} "${player.name}"`);
        } catch (_2) { }
    }
}

function applyGamemode(player, mode) {
    system.run(() => {
        try {
            forceGamemode(player, mode);
            player.sendMessage(`§aGamemode updated to ${mode.toUpperCase()}`);
        } catch (error) {
            player.sendMessage("§cError applying gamemode.");
        }
    });
}

function startSpectatorTimer(player, minutes) {
    cancelSpectatorTimer(player);

    let ticksLeft = minutes * 60 * 20;
    const playerId = player.id;

    const intervalId = system.runInterval(() => {
        const target = world.getAllPlayers().find(p => p.id === playerId);

        if (!target) {
            system.clearRun(intervalId);
            spectatorTimers.delete(playerId);
            return;
        }

        ticksLeft--;

        const secondsLeft = Math.ceil(ticksLeft / 20);

        if (secondsLeft <= 20 && ticksLeft > 0) {
            target.onScreenDisplay.setActionBar(`§eReturning to §6SURVIVAL §ein §c${secondsLeft}s`);
        }

        if (ticksLeft === 10) {
            const savedPos = spectatorLocations.get(playerId);
            if (savedPos) {
                system.run(() => {
                    try {
                        const dim = world.getDimension(savedPos.dimension);
                        dim.runCommand(`tp "${target.name}" ${savedPos.x} ${savedPos.y} ${savedPos.z}`);
                        target.sendMessage("§6[Auto] §aTeleporting to your saved location...");
                    } catch (e) {
                        target.sendMessage("§cTP failed: " + e);
                    }
                });
            }
        }

        if (ticksLeft <= 0) {
            system.clearRun(intervalId);
            spectatorTimers.delete(playerId);
            spectatorLocations.delete(playerId);

            system.run(() => {
                forceGamemode(target, "survival");
                target.sendMessage(`§6[Auto] §aTimer expired. Switched to §2SURVIVAL§a.`);
            });
        }
    }, 1);

    spectatorTimers.set(player.id, intervalId);
}

function cancelSpectatorTimer(player) {
    const intervalId = spectatorTimers.get(player.id);
    if (intervalId !== undefined) {
        system.clearRun(intervalId);
        spectatorTimers.delete(player.id);
        spectatorLocations.delete(player.id);
    }
}

world.afterEvents.playerSpawn.subscribe((ev) => {
    if (!ev.initialSpawn) return;
    const player = ev.player;
    system.run(() => {
        try {
            if (player.getGameMode() === "spectator") {
                forceGamemode(player, "survival");
                player.sendMessage("§6[Auto] §aReset to Survival mode.");
            }
        } catch (_) { }
    });
});