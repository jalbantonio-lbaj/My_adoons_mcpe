import { world, system } from "@minecraft/server";
import { setActionBarSlot, clearActionBarSlot } from "./actionbar.js";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const TIMEZONES = [
    { name: "Argentina (ART)",        offset: -3   },
    { name: "Australia (AEST)",       offset: 10   },
    { name: "Brazil (BRT)",           offset: -3   },
    { name: "Dubai (GST)",            offset: 4    },
    { name: "Germany (CET)",          offset: 1    },
    { name: "Hong Kong (HKT)",        offset: 8    },
    { name: "India (IST)",            offset: 5.5  },
    { name: "Japan (JST)",            offset: 9    },
    { name: "Pakistan (PKT)",         offset: 5    },
    { name: "Russia (MSK)",           offset: 3    },
    { name: "UK (GMT)",               offset: 0    },
    { name: "USA Chicago (CST)",      offset: -6   },
    { name: "USA Denver (MST)",       offset: -7   },
    { name: "USA Los Angeles (PST)",  offset: -8   },
    { name: "USA New York (EST)",     offset: -5   },
    { name: "Vietnam (ICT)",          offset: 7    },
];

const alarmState = new Map();

function getTimeParts(offset) {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const local = new Date(utc + offset * 3600000);
    const h = local.getHours();
    const m = String(local.getMinutes()).padStart(2, "0");
    const s = String(local.getSeconds()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = String(h % 12 || 12).padStart(2, "0");
    const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const day = days[local.getDay()];
    const date = local.getDate() + "/" + (local.getMonth()+1) + "/" + local.getFullYear();
    return { time: h12 + ":" + m + ":" + s + " " + ampm, rawH: h, rawM: local.getMinutes(), day, date, h };
}

function getColor(h) {
    if (h >= 6  && h < 12) return "§e";
    if (h >= 12 && h < 17) return "§a";
    if (h >= 17 && h < 21) return "§6";
    return "§9";
}

function getPeriod(h) {
    if (h >= 5  && h < 12) return "Morning";
    if (h >= 12 && h < 17) return "Afternoon";
    if (h >= 17 && h < 21) return "Evening";
    return "Night";
}

function getSavedIndex(player) {
    try {
        const val = player.getDynamicProperty("clockTimezone");
        if (val !== undefined && val !== null) return Number(val);
    } catch (_) {}
    return 6;
}

function setSavedIndex(player, index) {
    try { player.setDynamicProperty("clockTimezone", index); } catch (_) {}
}

function getHudEnabled(player) {
    try {
        const val = player.getDynamicProperty("clockHud");
        return val === true;
    } catch (_) { return false; }
}

function setHudEnabled(player, val) {
    try { player.setDynamicProperty("clockHud", val); } catch (_) {}
}

function loadAlarms(player) {
    try {
        const raw = player.getDynamicProperty("clockAlarms");
        return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
}

function saveAlarms(player, alarms) {
    try { player.setDynamicProperty("clockAlarms", JSON.stringify(alarms)); } catch (_) {}
}

function getAlarmFiredMap(player) {
    if (!alarmState.has(player.id)) alarmState.set(player.id, new Set());
    return alarmState.get(player.id);
}

export function showClock(player, backToMain) {
    system.run(() => {
        const savedIndex = getSavedIndex(player);
        const hudOn = getHudEnabled(player);
        const gui = new ModalFormData();
        gui.title("§lWorld Clock");
        gui.dropdown(
            "§fSelect Timezone §7(saved automatically)",
            TIMEZONES.map(t => t.name),
            { defaultValueIndex: savedIndex }
        );
        gui.toggle(
            "§fShow time on screen §7(bottom of screen)",
            { defaultValue: hudOn }
        );
        gui.show(player).then((res) => {
            if (res.canceled) { system.run(() => backToMain(player)); return; }
            system.run(() => {
                const index = res.formValues[0] ?? savedIndex;
                const hud   = res.formValues[1] === true;
                setSavedIndex(player, index);
                setHudEnabled(player, hud);
                showClockDisplay(player, index, backToMain);
            });
        });
    });
}

function showClockDisplay(player, tzIndex, backToMain) {
    system.run(() => {
        const tz = TIMEZONES[tzIndex];
        const { time, day, date, h } = getTimeParts(tz.offset);
        const color = getColor(h);
        const period = getPeriod(h);
        const alarms = loadAlarms(player);
        const alarmText = alarms.length > 0
            ? "\n\n§6Alarms: §f" + alarms.map(a => a.label + " @ " + a.timeStr).join(", ")
            : "\n\n§7No alarms set";
        const gui = new ActionFormData();
        gui.title("§lWorld Clock");
        gui.body(
            "§7Timezone: §f" + tz.name +
            "\n\n" +
            color + time + "\n" +
            "§7" + day + ", " + date +
            "\n§7" + period +
            alarmText +
            "\n\n§8Tap Refresh to update"
        );
        gui.button("§8Refresh", "textures/ui/refresh_light");
        gui.button("§8Change Timezone", "textures/items/clock_item");
        gui.button("§8Manage Alarms", "textures/ui/timer");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 3) { system.run(() => backToMain(player)); return; }
            system.run(() => {
                if (res.selection === 0) showClockDisplay(player, tzIndex, backToMain);
                if (res.selection === 1) showClock(player, backToMain);
                if (res.selection === 2) showAlarmsMenu(player, tzIndex, backToMain);
            });
        });
    });
}

function showAlarmsMenu(player, tzIndex, backToMain) {
    system.run(() => {
        const alarms = loadAlarms(player);
        const tz = TIMEZONES[tzIndex];
        const { time } = getTimeParts(tz.offset);
        const gui = new ActionFormData();
        gui.title("§lAlarms");
        gui.body(
            "§7Current time: §e" + time + " §7(" + tz.name + ")" +
            "\n§7Saved alarms: §f" + alarms.length + " §7/ 10" +
            "\n\n§7Set a time and you'll get a\n§7notification + sound when it hits."
        );
        gui.button("§8+ New Alarm", "textures/ui/color_plus");
        gui.button("§8- Delete Alarm", "textures/ui/cancel");
        for (const alarm of alarms) {
            const icon = alarm.fired ? "§8" : "§e";
            gui.button(icon + alarm.label + " §7@ §f" + alarm.timeStr, "textures/ui/timer");
        }
        gui.button("§8Back to Clock", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === alarms.length + 2) { system.run(() => showClockDisplay(player, tzIndex, backToMain)); return; }
            if (res.selection === 0) { system.run(() => showNewAlarm(player, tzIndex, backToMain)); return; }
            if (res.selection === 1) {
                if (alarms.length === 0) {
                    player.sendMessage("§cNo alarms to delete!");
                    system.run(() => showAlarmsMenu(player, tzIndex, backToMain));
                    return;
                }
                system.run(() => showDeleteAlarm(player, tzIndex, backToMain));
                return;
            }
        });
    });
}

function showNewAlarm(player, tzIndex, backToMain) {
    const form = new ModalFormData();
    form.title("§lNew Alarm");
    form.textField("§eAlarm Label:\n§7(e.g. Dinner, Meeting)", "My Alarm");
    form.textField("§fTime to notify §7(24hr format)\n§7Example: 14:30 = 2:30 PM", "14:00");
    form.show(player).then((res) => {
        if (res.canceled) { system.run(() => showAlarmsMenu(player, tzIndex, backToMain)); return; }
        const label = res.formValues[0]?.trim();
        const timeStr = res.formValues[1]?.trim();
        if (!label || !timeStr) {
            player.sendMessage("§cLabel and time cannot be empty!");
            system.run(() => showAlarmsMenu(player, tzIndex, backToMain));
            return;
        }
        const parts = timeStr.split(":");
        const h = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
            player.sendMessage("§cInvalid time! Use format HH:MM (e.g. 14:30)");
            system.run(() => showAlarmsMenu(player, tzIndex, backToMain));
            return;
        }
        system.run(() => {
            const alarms = loadAlarms(player);
            if (alarms.length >= 10) {
                player.sendMessage("§cMax 10 alarms! Delete one first.");
                showAlarmsMenu(player, tzIndex, backToMain);
                return;
            }
            const h12 = h % 12 || 12;
            const ampm = h >= 12 ? "PM" : "AM";
            const displayTime = String(h12).padStart(2, "0") + ":" + String(m).padStart(2, "0") + " " + ampm;
            alarms.push({ label, timeStr: displayTime, h24: h, m24: m, fired: false });
            saveAlarms(player, alarms);
            player.sendMessage("§a[Clock] §fAlarm \"§e" + label + "§f\" set for §e" + displayTime);
            showAlarmsMenu(player, tzIndex, backToMain);
        });
    });
}

function showDeleteAlarm(player, tzIndex, backToMain) {
    system.run(() => {
        const alarms = loadAlarms(player);
        const gui = new ActionFormData();
        gui.title("§lDelete Alarm");
        gui.body("§cSelect alarm to delete:");
        for (const alarm of alarms) {
            gui.button("§8" + alarm.label + " §7@ §f" + alarm.timeStr, "textures/ui/cancel");
        }
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === alarms.length) { system.run(() => showAlarmsMenu(player, tzIndex, backToMain)); return; }
            system.run(() => {
                const updated = alarms.filter((_, i) => i !== res.selection);
                saveAlarms(player, updated);
                player.sendMessage("§c[Clock] §fAlarm deleted!");
                showAlarmsMenu(player, tzIndex, backToMain);
            });
        });
    });
}

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        if (!getHudEnabled(player)) {
            clearActionBarSlot(player, "clock");
            continue;
        }
        try {
            const tzIndex = getSavedIndex(player);
            const tz = TIMEZONES[tzIndex];
            const { time, h } = getTimeParts(tz.offset);
            const color = getColor(h);
            setActionBarSlot(player, "clock", color + tz.name + ": " + time);
        } catch (_) {}
    }
}, 20);

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        try {
            const alarms = loadAlarms(player);
            if (alarms.length === 0) continue;

            const tzIndex = getSavedIndex(player);
            const tz = TIMEZONES[tzIndex];
            const { rawH, rawM } = getTimeParts(tz.offset);

            let changed = false;
            const firedMap = getAlarmFiredMap(player);

            for (const alarm of alarms) {
                const key = alarm.label + "_" + alarm.h24 + "_" + alarm.m24;

                if (rawH === alarm.h24 && rawM === alarm.m24) {
                    if (!firedMap.has(key)) {
                        firedMap.add(key);
                        alarm.fired = true;
                        changed = true;

                        player.sendMessage(
                            "§6§lALARM! §r§e" + alarm.label +
                            " §f- It's §e" + alarm.timeStr + "§f!"
                        );
                        player.playSound("random.levelup", { volume: 1.0, pitch: 1.0 });
                        system.runTimeout(() => {
                            try { player.playSound("note.bell", { volume: 1.0, pitch: 1.2 }); } catch (_) {}
                        }, 10);
                        system.runTimeout(() => {
                            try { player.playSound("note.bell", { volume: 1.0, pitch: 1.4 }); } catch (_) {}
                        }, 20);
                    }
                } else {
                    if (firedMap.has(key)) {
                        firedMap.delete(key);
                        alarm.fired = false;
                        changed = true;
                    }
                }
            }

            if (changed) saveAlarms(player, alarms);
        } catch (_) {}
    }
}, 20);

export function getISTTime() { return getTimeParts(5.5).time; }
export function getCurrentTime(offset) { return getTimeParts(offset).time; }
