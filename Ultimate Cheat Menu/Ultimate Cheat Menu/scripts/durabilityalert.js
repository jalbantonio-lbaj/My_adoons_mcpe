import { world, system, EquipmentSlot } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { setActionBarSlot, clearActionBarSlot } from "./actionbar.js";

const STATE_KEY = "durabilityAlertState";
const SLOT_NAME = "durability";
const CHECK_SLOTS = [
    { slot: EquipmentSlot.Mainhand, label: "Tool" },
    { slot: EquipmentSlot.Head, label: "Helmet" },
    { slot: EquipmentSlot.Chest, label: "Chestplate" },
    { slot: EquipmentSlot.Legs, label: "Leggings" },
    { slot: EquipmentSlot.Feet, label: "Boots" },
];

const states = new Map();
const warned = new Map();

function loadState(player) {
    try {
        const raw = player.getDynamicProperty(STATE_KEY);
        if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { active: false, threshold: 15 };
}

function saveState(player) {
    try {
        const data = states.get(player.id);
        if (data) player.setDynamicProperty(STATE_KEY, JSON.stringify(data));
    } catch (_) {}
}

export function getDurabilityAlertState(player) {
    if (!states.has(player.id)) states.set(player.id, loadState(player));
    return states.get(player.id);
}

system.runInterval(() => {
    for (const player of world.getPlayers()) {
        const data = getDurabilityAlertState(player);
        if (!data.active) {
            clearActionBarSlot(player, SLOT_NAME);
            continue;
        }

        try {
            const equip = player.getComponent("equippable");
            if (!equip) continue;

            const lines = [];
            const seen = new Set();

            for (const entry of CHECK_SLOTS) {
                const item = equip.getEquipment(entry.slot);
                if (!item) continue;

                const dur = item.getComponent("durability");
                if (!dur || dur.maxDurability <= 0) continue;

                const left = dur.maxDurability - dur.damage;
                const percent = Math.round((left / dur.maxDurability) * 100);
                if (percent > data.threshold) continue;

                const name = item.typeId.replace("minecraft:", "").replace(/_/g, " ");
                const color = percent <= 5 ? "§4" : percent <= 10 ? "§c" : "§6";
                lines.push(color + "! " + entry.label + ": " + name + " §7(" + percent + "% - " + left + " left)");
                seen.add(entry.slot);

                const key = player.id + ":" + entry.slot;
                if (!warned.has(key) || warned.get(key) !== percent) {
                    if (percent <= 5 && warned.get(key) !== percent) {
                        try { player.playSound("note.bass", { pitch: 0.6 }); } catch (_) {}
                    }
                    warned.set(key, percent);
                }
            }

            for (const entry of CHECK_SLOTS) {
                if (!seen.has(entry.slot)) warned.delete(player.id + ":" + entry.slot);
            }

            if (lines.length > 0) setActionBarSlot(player, SLOT_NAME, lines.join("\n"));
            else clearActionBarSlot(player, SLOT_NAME);
        } catch (_) {}
    }
}, 10);

function showThresholdInput(player, backToMain) {
    const data = getDurabilityAlertState(player);
    const form = new ModalFormData();
    form.title("§lAlert Threshold");
    form.textField("§fWarn when durability drops below (%)\n§7Enter 1-50", String(data.threshold));
    form.show(player).then((res) => {
        if (res.canceled) {
            system.run(() => showDurabilityAlert(player, backToMain));
            return;
        }
        system.run(() => {
            const value = parseInt(res.formValues[0]);
            if (isNaN(value) || value < 1 || value > 50) {
                player.sendMessage("§cInvalid! Enter a number between 1 and 50.");
                showDurabilityAlert(player, backToMain);
                return;
            }
            data.threshold = value;
            saveState(player);
            player.sendMessage("§a[Durability] §fAlert threshold set to §e" + value + "%");
            showDurabilityAlert(player, backToMain);
        });
    });
}

export function showDurabilityAlert(player, backToMain) {
    system.run(() => {
        const data = getDurabilityAlertState(player);

        const gui = new ActionFormData();
        gui.title("§lDurability Alert");
        gui.body(
            "§7Status: " + (data.active ? "§aACTIVE" : "§cINACTIVE") + "\n" +
            "§7Threshold: §e" + data.threshold + "%\n\n" +
            "§7Warns you on the action bar when your held tool or armour is about to break.\n" +
            "§8Alert only - nothing is swapped or repaired."
        );
        gui.button(data.active ? "§8Turn OFF" : "§8Turn ON", data.active ? "textures/ui/cancel" : "textures/ui/check");
        gui.button("§8Set Threshold\n§7Currently " + data.threshold + "%", "textures/ui/refresh_light");
        gui.button("§8Back", "textures/ui/undoArrow");

        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) {
                system.run(() => backToMain(player));
                return;
            }
            if (res.selection === 1) {
                system.run(() => showThresholdInput(player, backToMain));
                return;
            }
            system.run(() => {
                data.active = !data.active;
                saveState(player);
                if (!data.active) clearActionBarSlot(player, SLOT_NAME);
                player.sendMessage(data.active ? "§a[Durability] Alerts ON" : "§c[Durability] Alerts OFF");
                showDurabilityAlert(player, backToMain);
            });
        });
    });
}
