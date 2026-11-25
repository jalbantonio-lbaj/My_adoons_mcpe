import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

let isDayCycleStopped = false;
let isAlwaysDayOn = false;

function loadTimeState() {
    try {
        const raw = world.getDynamicProperty("timeState");
        if (raw) {
            const s = JSON.parse(raw);
            isDayCycleStopped = s.isDayCycleStopped ?? false;
            isAlwaysDayOn = s.isAlwaysDayOn ?? false;
        }
    } catch (_) {}
}

function saveTimeState() {
    try {
        world.setDynamicProperty("timeState", JSON.stringify({ isDayCycleStopped, isAlwaysDayOn }));
    } catch (_) {}
}

loadTimeState();

function setTimeWithoutReset(player, targetTick) {
    const currentTime = world.getTimeOfDay();
    let diff = targetTick - currentTime;
    if (diff <= 0) diff += 24000;
    player.runCommand(`time add ${diff}`);
}

export function showTimeMenu(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§lTime & World Settings");
    const cycleText = isDayCycleStopped ? "§cSTOPPED" : "§aRUNNING";
    const alwaysDayText = isAlwaysDayOn ? "§aON" : "§cOFF";
    gui.body(`Daylight Cycle: ${cycleText}\nAlways Day: ${alwaysDayText}`);
    gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
    gui.button(isAlwaysDayOn ? "§6Disable Always Day" : "§eEnable Always Day", "textures/ui/check");
    gui.button(isDayCycleStopped ? "Start Day Cycle" : "§3Stop Day Cycle", "textures/ui/refresh_light");
    gui.button("Sunrise", "textures/ui/time_1sunrise");
    gui.button("Day", "textures/ui/time_2day");
    gui.button("Noon", "textures/ui/time_3noon");
    gui.button("Sunset", "textures/ui/time_4sunset");
    gui.button("Night", "textures/ui/time_5night");
    gui.button("Midnight", "textures/ui/time_6midnight");

    gui.show(player).then((res) => {
        if (res.canceled) return;

        if (res.selection === 0) {
            system.run(() => backToMain(player));
            return;
        }

        if (res.selection === 1) {
            isAlwaysDayOn = !isAlwaysDayOn;
            system.run(() => {
                if (isAlwaysDayOn) {
                    setTimeWithoutReset(player, 6000);
                    player.runCommand(`gamerule dodaylightcycle false`);
                    isDayCycleStopped = true;
                } else {
                    player.runCommand(`gamerule dodaylightcycle true`);
                    isDayCycleStopped = false;
                }
                saveTimeState();
                showTimeMenu(player, backToMain);
            });
            return;
        }

        if (res.selection === 2) {
            isDayCycleStopped = !isDayCycleStopped;
            system.run(() => {
                player.runCommand(`gamerule dodaylightcycle ${isDayCycleStopped ? "false" : "true"}`);
                saveTimeState();
                showTimeMenu(player, backToMain);
            });
            return;
        }

        const ticks = [23000, 1000, 6000, 12000, 13000, 18000];
        const targetTick = ticks[res.selection - 3];
        system.run(() => {
            setTimeWithoutReset(player, targetTick);
            showTimeMenu(player, backToMain);
        });
    });
}