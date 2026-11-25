import { system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

export function showSmartConsole(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§lSmart Console");
    gui.body("§7Select action:");
    gui.button("§8« Back", "textures/ui/undoArrow");
    gui.button("§8Give Item", "textures/items/diamond");
    gui.button("Give Effect", "textures/ui/wind_charged_effect");
    gui.button("§8Remove All Effects", "textures/ui/cancel");
    gui.button("§8Kill Player", "textures/ui/ErrorGlyph");
    gui.button("§8Teleport", "textures/ui/friendsbutton/navbar-friends-icon");

    gui.show(player).then(res => {
        if (res.canceled || res.selection === 0) {
            system.runTimeout(() => backToMain(player), 5);
            return;
        }
        const actions = ["give", "effect_add", "effect_remove", "kill", "teleport"];
        const selected = actions[res.selection - 1];
        system.runTimeout(() => showForm(player, selected, backToMain), 5);
    });
}

function getPlayerNames() {
    return [...world.getPlayers()].map(p => p.name);
}

function resolveTarget(index, playerNames) {
    if (index === 0) return "@s";
    if (index === 1) return "@a";
    return playerNames[index - 2];
}

function showForm(player, action, backToMain) {
    const playerNames = getPlayerNames();
    const targetOptions = ["Myself (@s)", "Everyone (@a)", ...playerNames];

    if (action === "give") {
        const gui = new ModalFormData();
        gui.title("§l§aGive Item");
        gui.textField("Item ID:", "e.g. diamond_sword, apple, tnt");
        gui.slider("Amount:", 1, 64, 1, 1);
        gui.dropdown("Target:", targetOptions, 0);

        gui.show(player).then(res => {
            if (res.canceled) {
                system.runTimeout(() => showSmartConsole(player, backToMain), 5);
                return;
            }
            let itemId = res.formValues[0].toString().trim().toLowerCase();
            const amount = res.formValues[1];
            const target = resolveTarget(res.formValues[2], playerNames);
            if (!itemId) {
                player.sendMessage("§cItem naam likho!");
                system.runTimeout(() => showForm(player, action, backToMain), 5);
                return;
            }
            if (!itemId.includes(":")) itemId = `minecraft:${itemId}`;
            system.run(() => {
                try {
                    player.runCommand(`give ${target} ${itemId} ${amount}`);
                    player.sendMessage(`§aGave §e${amount}x §f${itemId} §ato ${target}`);
                } catch (e) {
                    player.sendMessage(`§cInvalid item: §e${itemId}`);
                }
                system.runTimeout(() => showSmartConsole(player, backToMain), 5);
            });
        });

    } else if (action === "effect_add") {
        const gui = new ModalFormData();
        gui.title("§lGive Effect");
        gui.textField("Effect ID:", "e.g. speed, strength, night_vision");
        gui.slider("Duration (seconds):", 1, 1000, 1, 30);
        gui.slider("Level:", 1, 10, 1, 1);
        gui.dropdown("Target:", targetOptions, 0);

        gui.show(player).then(res => {
            if (res.canceled) {
                system.runTimeout(() => showSmartConsole(player, backToMain), 5);
                return;
            }
            let effectId = res.formValues[0].toString().trim().toLowerCase();
            const duration = res.formValues[1];
            const level = res.formValues[2];
            const target = resolveTarget(res.formValues[3], playerNames);
            if (!effectId) {
                player.sendMessage("§cEffect naam likho!");
                system.runTimeout(() => showForm(player, action, backToMain), 5);
                return;
            }
            if (!effectId.includes(":")) effectId = `minecraft:${effectId}`;
            system.run(() => {
                try {
                    player.runCommand(`effect ${target} ${effectId} ${duration} ${level}`);
                    player.sendMessage(`§aApplied §e${effectId} §ato ${target} §7(${duration}s, lvl ${level})`);
                } catch (e) {
                    player.sendMessage(`§cInvalid effect: §e${effectId}`);
                }
                system.runTimeout(() => showSmartConsole(player, backToMain), 5);
            });
        });

    } else if (action === "effect_remove") {
        const gui = new ModalFormData();
        gui.title("§l§eRemove Effects");
        gui.dropdown("Target:", targetOptions, 0);

        gui.show(player).then(res => {
            if (res.canceled) {
                system.runTimeout(() => showSmartConsole(player, backToMain), 5);
                return;
            }
            const target = resolveTarget(res.formValues[0], playerNames);
            system.run(() => {
                try {
                    player.runCommand(`effect ${target} clear`);
                    player.sendMessage(`§aEffects cleared from ${target}`);
                } catch (e) {
                    player.sendMessage(`§cError: ${e}`);
                }
                system.runTimeout(() => showSmartConsole(player, backToMain), 5);
            });
        });

    } else if (action === "kill") {
        const gui = new ModalFormData();
        gui.title("§l§cKill Player");
        gui.dropdown("Target:", targetOptions, 0);

        gui.show(player).then(res => {
            if (res.canceled) {
                system.runTimeout(() => showSmartConsole(player, backToMain), 5);
                return;
            }
            const target = resolveTarget(res.formValues[0], playerNames);
            system.run(() => {
                try {
                    player.runCommand(`kill ${target}`);
                    player.sendMessage(`§cKilled §e${target}`);
                } catch (e) {
                    player.sendMessage(`§cError: ${e}`);
                }
                system.runTimeout(() => showSmartConsole(player, backToMain), 5);
            });
        });

    } else if (action === "teleport") {
        const gui = new ModalFormData();
        gui.title("§l§dTeleport");
        gui.dropdown("Who to teleport:", targetOptions, 0);
        gui.dropdown("Teleport to:", targetOptions, 0);

        gui.show(player).then(res => {
            if (res.canceled) {
                system.runTimeout(() => showSmartConsole(player, backToMain), 5);
                return;
            }
            const from = resolveTarget(res.formValues[0], playerNames);
            const to = resolveTarget(res.formValues[1], playerNames);
            system.run(() => {
                try {
                    player.runCommand(`tp ${from} ${to}`);
                    player.sendMessage(`§aTeleported §e${from} §ato ${to}`);
                } catch (e) {
                    player.sendMessage(`§cError: ${e}`);
                }
                system.runTimeout(() => showSmartConsole(player, backToMain), 5);
            });
        });
    }
}