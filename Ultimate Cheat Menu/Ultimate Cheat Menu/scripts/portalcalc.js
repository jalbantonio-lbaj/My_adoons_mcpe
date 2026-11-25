import { system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { parseCoords } from "./helpers.js";

function showResult(player, title, from, to, fromLabel, toLabel, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§l" + title);
        gui.body(
            "§7" + fromLabel + ":\n§fX: " + from.x + "  Y: " + from.y + "  Z: " + from.z + "\n\n" +
            "§7" + toLabel + ":\n§a§lX: " + to.x + "  Y: " + to.y + "  Z: " + to.z + "\n\n" +
            "§8Build your portal at these coordinates to link them.\n" +
            "§8Portals link if they are within 128 blocks in the Overworld."
        );
        gui.button("§8Calculate Again", "textures/ui/refresh_light");
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 1) {
                system.run(() => showPortalCalc(player, backToMain));
                return;
            }
            system.run(() => showPortalCalc(player, backToMain));
        });
    });
}

function showConverter(player, toNether, backToMain) {
    const loc = player.location;
    const form = new ModalFormData();
    form.title(toNether ? "§lOverworld to Nether" : "§lNether to Overworld");
    form.textField(
        "§fEnter X Y Z coordinates\n§7Example: 1200 64 -800 or 1200 ~ -800\n§7Use ~ to keep your current value\n§8Leave empty to use your current position",
        Math.round(loc.x) + " " + Math.round(loc.y) + " " + Math.round(loc.z)
    );
    form.show(player).then((res) => {
        if (res.canceled) {
            system.run(() => showPortalCalc(player, backToMain));
            return;
        }
        system.run(() => {
            const value = res.formValues[0]?.trim() || "~ ~ ~";

            const entered = parseCoords(value, player.location);
            if (!entered) {
                player.sendMessage("§cInvalid! Enter 3 values: X Y Z. You can use ~ for your current value.");
                showPortalCalc(player, backToMain);
                return;
            }

            const x = entered.x, y = entered.y, z = entered.z;
            const from = { x: Math.round(x), y: Math.round(y), z: Math.round(z) };
            const to = toNether
                ? { x: Math.round(x / 8), y: from.y, z: Math.round(z / 8) }
                : { x: Math.round(x * 8), y: from.y, z: Math.round(z * 8) };

            showResult(
                player,
                toNether ? "Nether Coordinates" : "Overworld Coordinates",
                from,
                to,
                toNether ? "Overworld" : "Nether",
                toNether ? "Nether (divide by 8)" : "Overworld (multiply by 8)",
                backToMain
            );
        });
    });
}

export function showPortalCalc(player, backToMain) {
    system.run(() => {
        const loc = player.location;
        const dim = player.dimension.id.replace("minecraft:", "");

        const gui = new ActionFormData();
        gui.title("§lPortal Calculator");
        gui.body(
            "§7You are in: §e" + dim + "\n" +
            "§7Your position: §fX:" + Math.round(loc.x) + " Y:" + Math.round(loc.y) + " Z:" + Math.round(loc.z) + "\n\n" +
            "§7Work out where to build the matching portal so your Nether and Overworld portals link up correctly."
        );
        gui.button("§8Overworld to Nether\n§7Divide X and Z by 8", "textures/blocks/netherrack");
        gui.button("§8Nether to Overworld\n§7Multiply X and Z by 8", "textures/map/village_plains");
        gui.button("§8Back", "textures/ui/undoArrow");

        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) {
                system.run(() => backToMain(player));
                return;
            }
            system.run(() => showConverter(player, res.selection === 0, backToMain));
        });
    });
}
