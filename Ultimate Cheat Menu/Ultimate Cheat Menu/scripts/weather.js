import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
let isWeatherLocked = false;
let lockedWeatherType = "clear";
function loadWeatherState() {
    try {
        const raw = world.getDynamicProperty("weatherState");
        if (raw) {
            const s = JSON.parse(raw);
            isWeatherLocked = s.isWeatherLocked ?? false;
            lockedWeatherType = s.lockedWeatherType ?? "clear";
        }
    } catch (_) {}
}
function saveWeatherState() {
    try {
        world.setDynamicProperty("weatherState", JSON.stringify({ isWeatherLocked, lockedWeatherType }));
    } catch (_) {}
}
loadWeatherState();
world.afterEvents.weatherChange.subscribe((ev) => {
    if (isWeatherLocked) {
        system.run(() => {
            world.getDimension("overworld").runCommand(`weather ${lockedWeatherType}`);
        });
    }
});
export function showWeatherMenu(player, backToMain) {
    const gui = new ActionFormData();
    gui.title("§lWeather Controller");
    const lockStatus = isWeatherLocked ? "§aLOCKED" : "§cUNLOCKED";
    gui.body(`Select Atmosphere:\nCurrent Status: ${lockStatus} (${lockedWeatherType.toUpperCase()})`);
    gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
    gui.button("Clear Sky", "textures/ui/weather_clear");
    gui.button("Rain", "textures/ui/weather_rain");
    gui.button("Thunderstorm", "textures/ui/weather_thunderstorm");
    gui.button(isWeatherLocked ? "§6Unlock Weather" : "§eLock Current Weather", "textures/ui/icon_lock");
    gui.show(player).then((res) => {
        if (res.canceled) return;
        if (res.selection === 0) { system.run(() => backToMain(player)); return; }
        system.run(() => {
            if (res.selection === 4) {
                isWeatherLocked = !isWeatherLocked;
                saveWeatherState();
                player.sendMessage(isWeatherLocked ? `§aWeather locked to ${lockedWeatherType.toUpperCase()}!` : "§cWeather lock disabled!");
            } else {
                const types = ["clear", "rain", "thunder"];
                const selected = types[res.selection - 1];
                lockedWeatherType = selected;
                saveWeatherState();
                player.runCommand(`weather ${selected}`);
                player.sendMessage(`§eWeather set to ${selected.toUpperCase()}`);
            }
            showWeatherMenu(player, backToMain);
        });
    });
}