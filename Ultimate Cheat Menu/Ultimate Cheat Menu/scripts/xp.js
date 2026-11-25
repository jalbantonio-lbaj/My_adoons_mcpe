import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

export function showXpManager(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§lXP Manager");
    gui.button("§8Give XP to Myself", "textures/ui/icon_steve");
    gui.button("§8Give XP to All", "textures/ui/icon_multiplayer");
    gui.button("Give XP to Player", "textures/ui/plus");
    gui.button("§8Clear All My XP", "textures/ui/cancel");
    gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");

    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 4) {
            system.run(() => backToMain(player));
            return;
        }

        if (res.selection === 3) {
            system.run(() => {
                try {
                    player.runCommand(`xp -10000000 @s`);
                    player.runCommand(`xp -1000l @s`);
                    player.sendMessage("§cAll your XP has been cleared!");
                } catch (e) {
                    player.sendMessage("§cError clearing XP!");
                }
                showXpManager(player, backToMain);
            });
            return;
        }

        if (res.selection === 2) {
            system.runTimeout(() => {
                const onlinePlayers = world.getPlayers();
                const playerNames = onlinePlayers.map(p => p.name);

                const selectGui = new ModalFormData();
                selectGui.title("§lGive XP to Player");
                selectGui.dropdown("§fSelect Player:", playerNames);
                selectGui.textField(
                    "§eXP Amount:\n§7(+100 = add | -100 = remove)",
                    "100"
                );

                selectGui.show(player).then((selectRes) => {
                    if (selectRes.canceled) {
                        system.run(() => showXpManager(player, backToMain));
                        return;
                    }

                    system.run(() => {
                        try {
                            const selectedIndex = selectRes.formValues[0];
                            const amount = parseInt(selectRes.formValues[1]);
                            const targetPlayer = onlinePlayers[selectedIndex];

                            if (!targetPlayer || isNaN(amount)) throw new Error();

                            targetPlayer.runCommand(`xp ${amount}l @s`);

                            player.sendMessage(
                                amount >= 0
                                    ? `§aSuccessfully added §e${amount} XP §ato §f${targetPlayer.name}!`
                                    : `§cSuccessfully removed §e${Math.abs(amount)} XP §cfrom §f${targetPlayer.name}!`
                            );

                            if (targetPlayer.id !== player.id) {
                                targetPlayer.sendMessage(
                                    amount >= 0
                                        ? `§a${player.name} §ahas given you §e${amount} XP!`
                                        : `§c${player.name} §chas removed §e${Math.abs(amount)} XP §cfrom you!`
                                );
                            }
                        } catch (e) {
                            player.sendMessage("§cError: Invalid input!");
                        }
                        showXpManager(player, backToMain);
                    });
                });
            }, 2);
            return;
        }

        system.runTimeout(() => {
            const inputGui = new ModalFormData();
            inputGui.title("§lGive XP");
            inputGui.textField(
                "§eXP Amount:\n§7(+100 = add 100 XP | -100 = remove 100 XP)",
                "100"
            );

            inputGui.show(player).then((xpRes) => {
                if (xpRes.canceled) {
                    system.run(() => showXpManager(player, backToMain));
                    return;
                }

                system.run(() => {
                    try {
                        const amount = parseInt(xpRes.formValues[0]);
                        if (isNaN(amount)) throw new Error();

                        if (res.selection === 0) {
                            player.runCommand(`xp ${amount}l @s`);
                            player.sendMessage(
                                amount >= 0
                                    ? `§aSuccessfully added §e${amount} XP §ato yourself!`
                                    : `§cSuccessfully removed §e${Math.abs(amount)} XP §cfrom yourself!`
                            );
                        } else if (res.selection === 1) {
                            player.runCommand(`xp ${amount}l @a`);
                            player.sendMessage(
                                amount >= 0
                                    ? `§aSuccessfully added §e${amount} XP §ato all players!`
                                    : `§cSuccessfully removed §e${Math.abs(amount)} XP §cfrom all players!`
                            );
                        }
                    } catch (e) {
                        player.sendMessage("§cError: Invalid input!");
                    }
                    showXpManager(player, backToMain);
                });
            });
        }, 2);
    });
}