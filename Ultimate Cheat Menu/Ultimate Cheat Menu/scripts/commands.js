import { system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { getProp, setProp } from "./helpers.js";

function showClearCmdConfirm(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§l§cDANGER!");
    gui.body("§c WARNING \n\n§fYou are about to permanently delete ALL saved commands!\n\n§eOnce deleted, they §lcannot be recovered§e.\n\n§7Are you absolutely sure?");
    gui.button("§8YES - Delete Forever", "textures/ui/cancel");
    gui.button("§8No - Keep My History", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 1) {
            system.run(() => showCommandConsole(player, backToMain));
            return;
        }
        if (res.selection === 0) {
            system.run(() => {
                player.setDynamicProperty("cmdHistory", undefined);
                player.sendMessage("§cCommand history cleared!");
                showCommandConsole(player, backToMain);
            });
        }
    });
}

export function showCommandConsole(player, backToMain) {
    const history = getProp(player, "cmdHistory") || [];
    const gui = new ActionFormData();
    gui.title("§lCommands");
    gui.body("Select a previous command to re-run or create a New Command:");
    gui.button("§8[+] NEW COMMAND", "textures/ui/color_plus");
    for (let i = history.length - 1; i >= 0; i--) {
        gui.button(`${history[i]}`, "textures/ui/refresh_light");
    }
    gui.button("§8Clear History", "textures/ui/cancel");
    gui.button("§8« BACK", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled) return;
        const backIndex = history.length + 2;
        const clearIndex = history.length + 1;
        if (res.selection === backIndex) {
            system.run(() => backToMain(player));
            return;
        }
        if (res.selection === clearIndex) {
            system.run(() => showClearCmdConfirm(player, backToMain));
            return;
        }
        if (res.selection === 0) {
            system.run(() => openNewCommandInput(player, backToMain));
            return;
        }
        const selectedCommand = history[(history.length - 1) - (res.selection - 1)];
        executeCommand(player, selectedCommand, backToMain);
    });
}

function openNewCommandInput(player, backToMain) {
    const form = new ModalFormData();
    form.title("§lNew Command");
    form.textField("Enter command (e.g. summon zombie):", "Type here...");
    form.show(player).then((response) => {
        if (response.canceled) {
            system.run(() => showCommandConsole(player, backToMain));
            return;
        }
        const commandInput = response.formValues[0];
        if (commandInput) executeCommand(player, commandInput, backToMain);
    });
}

function executeCommand(player, cmd, backToMain) {
    let finalCmd = cmd.trim();
    if (finalCmd.startsWith("/")) finalCmd = finalCmd.substring(1);
    system.run(() => {
        try {
            player.runCommand(finalCmd);
            const history = getProp(player, "cmdHistory") || [];
            if (!history.includes(finalCmd)) {
                history.push(finalCmd);
                if (history.length > 15) history.shift();
                setProp(player, "cmdHistory", history);
            }
        } catch (e) {
            player.sendMessage(`§cError: ${e}`);
        }
        showCommandConsole(player, backToMain);
    });
}
