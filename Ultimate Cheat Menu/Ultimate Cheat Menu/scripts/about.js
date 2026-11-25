import { system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
export function showAboutMenu(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§lAbout Ultimate Cheat Menu");
    gui.body(
        `§e=============================\n` +
        `Ultimate Cheat Menu\n` +
        `§7Created by VoxenMC2\n` +
        `§e=============================\n\n` +
        `§fWhat is Ultimate Cheat Menu?\n` +
        `§7Ultimate Cheat Menu is a powerful Minecraft Bedrock pack created by VoxenMC2. It gives you complete control over your survival world, letting you cheat freely while keeping your achievements fully intact.\n\n` +
        `§fFeatures:\n` +
        `§a+ §fGamemode Switcher\n` +
        `§a+ §fMax Enchantments\n` +
        `§a+ §fEffects\n` +
        `§a+ §fTime & Weather Control\n` +
        `§a+ §fTeleport System with History\n` +
        `§a+ §fCommand Console\n` +
        `§a+ §fXP Manager\n` +
        `§a+ §fPlayer Monitor\n` +
        `§a+ §fUtilities (God Mode, Flight & more)\n\n` +
        `§fWorks on Servers Too!\n` +
        `§7Ultimate Cheat Menu fully supports multiplayer servers. The server owner just needs to upload and enable this pack. Once active, all players can access the menu instantly.\n\n` +
        `§fHow to Open Menu?\n` +
        `§7Right click with a §eStick §7to open the menu anytime, anywhere.\n\n` +
        `§e=============================\n` +
        `§fPack: Ultimate Cheat Menu\n` +
        `§fAuthor: VoxenMC2\n` +
        `§7Thank you for using Ultimate Cheat Menu!\n` +
        `§e=============================`
    );
    gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 0) system.run(() => backToMain(player));
    });
}