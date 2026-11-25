import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
function getSaved(player) {
    try {
        const raw = player.getDynamicProperty("coordsLogger");
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (_) { return []; }
}
function setSaved(player, saved) {
    try {
        player.setDynamicProperty("coordsLogger", JSON.stringify(saved));
    } catch (_) {}
}
export function showCoordsLogger(player, backToMain) {
    system.run(() => {
        const saved = getSaved(player);
        const pos = player.location;
        const gui = new ActionFormData();
        gui.title("§lCoordinates Logger");
        gui.body(
            "§7Your position:\n§eX:" + Math.floor(pos.x) + " Y:" + Math.floor(pos.y) + " Z:" + Math.floor(pos.z) +
            "\n§7Dimension: §e" + player.dimension.id.replace("minecraft:", "") +
            "\n§7Saved: §e" + saved.length + " §7locations"
        );
        gui.button("§8Save Current Location", "textures/ui/color_plus");
        gui.button("View Saved Locations\n§8" + saved.length + " saved", "textures/items/compass_item");
        gui.button("§8Back to Main", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) {
                system.run(() => backToMain(player));
                return;
            }
            system.run(() => {
                if (res.selection === 0) showSaveForm(player, backToMain);
                if (res.selection === 1) showSavedList(player, backToMain);
            });
        });
    });
}
function showSaveForm(player, backToMain) {
    system.run(() => {
        const pos = player.location;
        const x = Math.floor(pos.x);
        const y = Math.floor(pos.y);
        const z = Math.floor(pos.z);
        const dim = player.dimension.id.replace("minecraft:", "");
        const gui = new ModalFormData();
        gui.title("§lSave Location");
        gui.textField(
            "§fName this location\n§7X:" + x + " Y:" + y + " Z:" + z + " (" + dim + ")",
            "e.g. My Base, Diamond Cave..."
        );
        gui.show(player).then((res) => {
            if (res.canceled) {
                system.run(() => showCoordsLogger(player, backToMain));
                return;
            }
            system.run(() => {
                const name = res.formValues[0]?.trim();
                if (!name) {
                    player.sendMessage("§cName cannot be empty!");
                    showSaveForm(player, backToMain);
                    return;
                }
                const saved = getSaved(player);
                saved.push({ name, x, y, z, dim });
                setSaved(player, saved);
                player.sendMessage("§6[Coords] §fSaved §e" + name + " §7at X:" + x + " Y:" + y + " Z:" + z);
                showCoordsLogger(player, backToMain);
            });
        });
    });
}
function showSavedList(player, backToMain) {
    system.run(() => {
        const saved = getSaved(player);
        if (saved.length === 0) {
            const gui = new ActionFormData();
            gui.title("§lSaved Locations");
            gui.body("§7No locations saved yet.");
            gui.button("§8Back", "textures/ui/undoArrow");
            gui.show(player).then(() => system.run(() => showCoordsLogger(player, backToMain)));
            return;
        }
        const gui = new ActionFormData();
        gui.title("§lSaved Locations");
        gui.body("§7Tap a location for options:");
        for (const c of saved) {
            gui.button(
                "§8" + c.name + "\n§7X:" + c.x + " Y:" + c.y + " Z:" + c.z + " §8(" + c.dim + ")",
                "textures/items/compass_item"
            );
        }
        gui.button("§8Clear All", "textures/ui/cancel");
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === saved.length + 1) {
                system.run(() => showCoordsLogger(player, backToMain));
                return;
            }
            system.run(() => {
                if (res.selection === saved.length) {
                    setSaved(player, []);
                    player.sendMessage("§6[Coords] §fAll locations cleared.");
                    showCoordsLogger(player, backToMain);
                    return;
                }
                showLocationOptions(player, res.selection, backToMain);
            });
        });
    });
}
function showLocationOptions(player, index, backToMain) {
    system.run(() => {
        const saved = getSaved(player);
        const c = saved[index];
        if (!c) { showSavedList(player, backToMain); return; }
        const dist = Math.round(Math.sqrt(
            Math.pow(c.x - player.location.x, 2) +
            Math.pow(c.y - player.location.y, 2) +
            Math.pow(c.z - player.location.z, 2)
        ));
        const gui = new ActionFormData();
        gui.title("§l" + c.name);
        gui.body(
            "§7X: §e" + c.x + "\n§7Y: §e" + c.y + "\n§7Z: §e" + c.z +
            "\n§7Dimension: §e" + c.dim +
            "\n§7Distance: §e" + dist + "m"
        );
        gui.button("§8Teleport Here", "textures/ui/friendsbutton/navbar-friends-icon");
        gui.button("§8Delete", "textures/ui/cancel");
        gui.button("§8Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 2) {
                system.run(() => showSavedList(player, backToMain));
                return;
            }
            system.run(() => {
                if (res.selection === 0) {
                    try {
                        const targetDim = world.getDimension("minecraft:" + c.dim);
                        player.teleport(
                            { x: c.x + 0.5, y: c.y, z: c.z + 0.5 },
                            { dimension: targetDim }
                        );
                        player.sendMessage("§6[Coords] §fTeleported to §e" + c.name + " §7(" + c.dim + ")");
                    } catch (_) {
                        player.sendMessage("§cTeleport failed.");
                    }
                    showSavedList(player, backToMain);
                }
                if (res.selection === 1) {
                    const saved2 = getSaved(player);
                    saved2.splice(index, 1);
                    setSaved(player, saved2);
                    player.sendMessage("§6[Coords] §fDeleted §e" + c.name);
                    showSavedList(player, backToMain);
                }
            });
        });
    });
}