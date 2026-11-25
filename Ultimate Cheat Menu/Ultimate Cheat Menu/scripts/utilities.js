import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
export function showUtilitiesMenu(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§lUtilities");
    gui.button("§8Fill Health", "textures/ui/heart");
    gui.button("§8No Hunger", "textures/ui/hunger_full");
    gui.button("§8Clear Inventory", "textures/ui/cancel");
    gui.button("Repair All Tools", "textures/ui/anvil_icon");
    gui.button("§8Night Vision Toggle", "textures/ui/night_vision_effect");
    gui.button("§8God Mode", "textures/ui/absorption_effect");
    gui.button("§8No Fall Damage", "textures/ui/slow_falling_effect");
    gui.button("§8Flight Toggle", "textures/ui/creative_icon");
    gui.button("§8Reset All Utilities", "textures/ui/refresh_light");
    gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 9) { system.run(() => backToMain(player)); return; }
        if (res.selection === 0) {
            system.run(() => {
                try {
                    player.runCommand(`effect @s instant_health 1 255 true`);
                    player.runCommand(`effect @s regeneration 5 255 true`);
                    player.sendMessage("§aHealth filled!");
                } catch (e) { player.sendMessage("§cError!"); }
                showUtilitiesMenu(player, backToMain);
            });
            return;
        }
        if (res.selection === 1) {
            system.run(() => {
                try {
                    player.runCommand(`effect @s saturation 99999 255 true`);
                    player.sendMessage("§eNo Hunger ON!");
                } catch (e) { player.sendMessage("§cError!"); }
                showUtilitiesMenu(player, backToMain);
            });
            return;
        }
        if (res.selection === 2) { system.run(() => showClearInventoryWarning(player, backToMain)); return; }
        if (res.selection === 3) {
            system.run(() => {
                try {
                    player.runCommand(`xp 10000l @s`);
                    player.sendMessage("Repair XP given! (Works with Mending)");
                } catch (e) { player.sendMessage("§cError repairing!"); }
                showUtilitiesMenu(player, backToMain);
            });
            return;
        }
        if (res.selection === 4) {
            system.run(() => {
                try {
                    const hasNV = player.getEffect("night_vision");
                    if (hasNV) {
                        player.runCommand(`effect @s night_vision 0 0 true`);
                        player.sendMessage("§5Night Vision OFF");
                    } else {
                        player.runCommand(`effect @s night_vision 99999 1 true`);
                        player.sendMessage("§5Night Vision ON");
                    }
                } catch (e) { player.sendMessage("§cError!"); }
                showUtilitiesMenu(player, backToMain);
            });
            return;
        }
        if (res.selection === 5) {
            system.run(() => {
                try {
                    player.runCommand(`effect @s resistance 99999 255 true`);
                    player.runCommand(`effect @s fire_resistance 99999 255 true`);
                    player.runCommand(`effect @s saturation 99999 255 true`);
                    player.runCommand(`effect @s regeneration 99999 255 true`);
                    player.runCommand(`effect @s absorption 99999 255 true`);
                    player.sendMessage("§aGod Mode ON!");
                } catch (e) { player.sendMessage("§cError!"); }
                showUtilitiesMenu(player, backToMain);
            });
            return;
        }
        if (res.selection === 6) {
            system.run(() => {
                try {
                    player.runCommand(`effect @s slow_falling 99999 1 true`);
                    player.sendMessage("§6No Fall Damage ON!");
                } catch (e) { player.sendMessage("§cError!"); }
                showUtilitiesMenu(player, backToMain);
            });
            return;
        }
        if (res.selection === 7) {
            system.run(() => {
                try {
                    player.runCommand(`ability @s mayfly true`);
                    player.runCommand(`ability @s flying true`);
                    player.sendMessage("§dFlight ON!");
                } catch (e) {
                    try {
                        player.runCommand(`gamemode creative @s`);
                        player.sendMessage("§dCreative mode enabled for flight!");
                    } catch (e2) { player.sendMessage("§cFlight not supported!"); }
                }
                showUtilitiesMenu(player, backToMain);
            });
            return;
        }
        if (res.selection === 8) { system.run(() => showResetConfirm(player, backToMain)); return; }
    });
}
function showClearInventoryWarning(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§l§cWARNING!");
    gui.body("§cAre you sure?\n\n§fThis will clear your §l§cENTIRE INVENTORY!\n\n§eAll items will be §cPERMANENTLY §elost!\n\n§7(This cannot be undone!)");
    gui.button("§8YES - Clear Everything!", "textures/ui/cancel");
    gui.button("§8No - Go Back", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 1) { system.run(() => showUtilitiesMenu(player, backToMain)); return; }
        if (res.selection === 0) {
            system.run(() => {
                try {
                    player.runCommand(`clear @s`);
                    player.sendMessage("§cInventory cleared!");
                } catch (e) { player.sendMessage("§cError clearing inventory!"); }
                showUtilitiesMenu(player, backToMain);
            });
        }
    });
}
function showResetConfirm(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§l§cReset All Utilities");
    gui.body("§fThis will reset everything:\n\n§c- All effects removed\n§c- God Mode OFF\n§c- Night Vision OFF\n§c- No Hunger OFF\n§c- No Fall Damage OFF\n§c- Flight OFF\n\n§eContinue?");
    gui.button("§8YES - Reset All", "textures/ui/cancel");
    gui.button("§8No - Go Back", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 1) { system.run(() => showUtilitiesMenu(player, backToMain)); return; }
        if (res.selection === 0) {
            system.run(() => {
                try {
                    player.runCommand(`effect @s clear`);
                    try {
                        player.runCommand(`ability @s mayfly false`);
                        player.runCommand(`ability @s flying false`);
                    } catch (e) {}
                    player.runCommand(`gamemode survival @s`);
                    player.sendMessage("§aAll utilities have been reset!");
                } catch (e) { player.sendMessage("§cError during reset!"); }
                showUtilitiesMenu(player, backToMain);
            });
        }
    });
}