import { system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
const allEffects = [
    { label: "Speed",          cmd: "speed",          icon: "textures/ui/speed_effect" },
    { label: "Slowness",       cmd: "slowness",       icon: "textures/ui/slowness_effect" },
    { label: "Haste",          cmd: "haste",          icon: "textures/ui/haste_effect" },
    { label: "Mining Fatigue", cmd: "mining_fatigue", icon: "textures/ui/mining_fatigue_effect" },
    { label: "Strength",       cmd: "strength",       icon: "textures/ui/strength_effect" },
    { label: "Jump Boost",     cmd: "jump_boost",     icon: "textures/ui/jump_boost_effect" },
    { label: "Nausea",         cmd: "nausea",         icon: "textures/ui/nausea_effect" },
    { label: "Regeneration",   cmd: "regeneration",   icon: "textures/ui/regeneration_effect" },
    { label: "Resistance",     cmd: "resistance",     icon: "textures/ui/resistance_effect" },
    { label: "Fire Resistance",cmd: "fire_resistance",icon: "textures/ui/fire_resistance_effect" },
    { label: "Water Breathing",cmd: "water_breathing",icon: "textures/ui/water_breathing_effect" },
    { label: "Invisibility",   cmd: "invisibility",   icon: "textures/ui/invisibility_effect" },
    { label: "Blindness",      cmd: "blindness",      icon: "textures/ui/blindness_effect" },
    { label: "Night Vision",   cmd: "night_vision",   icon: "textures/ui/night_vision_effect" },
    { label: "Hunger",         cmd: "hunger",         icon: "textures/ui/hunger_effect" },
    { label: "Weakness",       cmd: "weakness",       icon: "textures/ui/weakness_effect" },
    { label: "Poison",         cmd: "poison",         icon: "textures/ui/poison_effect" },
    { label: "Wither",         cmd: "wither",         icon: "textures/ui/wither_effect" },
    { label: "Health Boost",   cmd: "health_boost",   icon: "textures/ui/health_boost_effect" },
    { label: "Absorption",     cmd: "absorption",     icon: "textures/ui/absorption_effect" },
    { label: "Levitation",     cmd: "levitation",     icon: "textures/ui/levitation_effect" },
    { label: "Slow Falling",   cmd: "slow_falling",   icon: "textures/ui/slow_falling_effect" },
    { label: "Conduit Power",  cmd: "conduit_power",  icon: "textures/ui/conduit_power_effect" },
    { label: "Village Hero",   cmd: "village_hero",   icon: "textures/ui/village_hero_effect" },
    { label: "Darkness",       cmd: "darkness",       icon: "textures/ui/darkness_effect" },
];
export function showEffectsMenu(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§lEffects");
    gui.body("§7Select an effect to apply:");
    gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
    gui.button("§8Clear All Effects", "textures/ui/cancel");
    allEffects.forEach(e => gui.button(e.label, e.icon));
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 0) {
            system.run(() => backToMain(player));
            return;
        }
        if (res.selection === 1) {
            system.run(() => {
                player.runCommand("effect @s clear");
                player.sendMessage("§cAll effects cleared!");
                showEffectsMenu(player, backToMain);
            });
            return;
        }
        const selected = allEffects[res.selection - 2];
        system.runTimeout(() => showLevelInput(player, selected, backToMain), 2);
    });
}
function showLevelInput(player, effect, backToMain) {
    const gui = new ModalFormData();
    gui.title(`§l${effect.label}`);
    gui.textField("§eLevel (0-255):", "1");
    gui.show(player).then((res) => {
        if (res.canceled) {
            system.run(() => showEffectsMenu(player, backToMain));
            return;
        }
        const level = parseInt(res.formValues[0]);
        if (isNaN(level) || level < 0 || level > 255) {
            system.run(() => {
                player.sendMessage("§cInvalid level! Enter a number between 0 and 255.");
                showEffectsMenu(player, backToMain);
            });
            return;
        }
        system.run(() => {
            player.runCommand(`effect @s ${effect.cmd} 99999 ${level} true`);
            player.sendMessage(`§aApplied §e${effect.label} §aat Level §e${level}§a!`);
            showEffectsMenu(player, backToMain);
        });
    });
}

