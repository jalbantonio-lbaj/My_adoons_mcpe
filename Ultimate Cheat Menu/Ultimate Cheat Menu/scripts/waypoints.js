import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
const DIM_MAP = {
    "Overworld": "minecraft:overworld",
    "Nether":    "minecraft:nether",
    "The End":   "minecraft:the_end",
};
export function showWaypointsMenu(player, backToMain) {
    system.run(() => {
        let waypoints = [];
        try {
            const raw = player.getDynamicProperty("waypoints");
            waypoints = raw ? JSON.parse(raw) : [];
        } catch (e) { waypoints = []; }
        const gui = new ActionFormData();
        gui.title("Waypoints");
        if (waypoints.length === 0) {
            gui.body("§7No waypoints saved yet.\n§eSave your current location to get started!");
        } else {
            gui.body(`§aSaved Waypoints: §f${waypoints.length}\n§7Click a waypoint to teleport.`);
        }
        gui.button("§8+ Save Current Location", "textures/ui/color_plus");
        gui.button("§8- Delete a Waypoint", "textures/ui/cancel");
        for (const wp of waypoints) {
            const dim = wp.dim
                .replace("Overworld", "§aOW")
                .replace("Nether", "§cNE")
                .replace("The End", "§5EN");
            gui.button(`§8${wp.name} §8| ${dim} §8| §8${wp.x}, ${wp.y}, ${wp.z}`, "textures/ui/icon_recipe_construction");
        }
        gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === waypoints.length + 2) {
                system.run(() => backToMain(player));
                return;
            }
            if (res.selection === 0) {
                system.run(() => showSaveWaypoint(player, backToMain));
                return;
            }
            if (res.selection === 1) {
                if (waypoints.length === 0) {
                    player.sendMessage("§cNo waypoints to delete!");
                    system.run(() => showWaypointsMenu(player, backToMain));
                    return;
                }
                system.run(() => showDeleteWaypoint(player, backToMain));
                return;
            }
            const selectedWP = waypoints[res.selection - 2];
            system.run(() => showWaypointDetail(player, selectedWP, backToMain));
        });
    });
}
function showSaveWaypoint(player, backToMain) {
    const loc = player.location;
    const dim = player.dimension.id
        .replace("minecraft:overworld", "Overworld")
        .replace("minecraft:nether", "Nether")
        .replace("minecraft:the_end", "The End");
    const form = new ModalFormData();
    form.title("Save Waypoint");
    form.textField(
        `§eWaypoint Name:\n§7Current Location: §f${Math.round(loc.x)}, ${Math.round(loc.y)}, ${Math.round(loc.z)} §7(${dim})`,
        "Home"
    );
    form.show(player).then((res) => {
        if (res.canceled) {
            system.run(() => showWaypointsMenu(player, backToMain));
            return;
        }
        const name = res.formValues[0]?.trim();
        if (!name || name === "") {
            player.sendMessage("§cWaypoint name cannot be empty!");
            system.run(() => showWaypointsMenu(player, backToMain));
            return;
        }
        system.run(() => {
            try {
                let waypoints = [];
                try {
                    const raw = player.getDynamicProperty("waypoints");
                    waypoints = raw ? JSON.parse(raw) : [];
                } catch (e) { waypoints = []; }
                const exists = waypoints.find(wp => wp.name.toLowerCase() === name.toLowerCase());
                if (exists) {
                    player.sendMessage(`§cWaypoint "${name}" already exists!`);
                    showWaypointsMenu(player, backToMain);
                    return;
                }
                if (waypoints.length >= 20) {
                    player.sendMessage("§cMax 20 waypoints! Delete one first.");
                    showWaypointsMenu(player, backToMain);
                    return;
                }
                waypoints.push({
                    name,
                    x: Math.round(loc.x * 10) / 10,
                    y: Math.round(loc.y * 10) / 10,
                    z: Math.round(loc.z * 10) / 10,
                    dim
                });
                player.setDynamicProperty("waypoints", JSON.stringify(waypoints));
                player.sendMessage(`§aWaypoint "§e${name}§a" saved!`);
            } catch (e) {
                player.sendMessage("§cError saving waypoint!");
            }
            showWaypointsMenu(player, backToMain);
        });
    });
}
function showWaypointDetail(player, wp, backToMain) {
    const gui = new ActionFormData();
    gui.title(`${wp.name}`);
    gui.body(
        `§eWaypoint Details:\n\n` +
        `§7Name: §f${wp.name}\n` +
        `§7X: §f${wp.x}\n` +
        `§7Y: §f${wp.y}\n` +
        `§7Z: §f${wp.z}\n` +
        `§7Dimension: §f${wp.dim}\n\n` +
        `§7Click TP to teleport here.`
    );
    gui.button(`§8TP to ${wp.name}`, "textures/items/ender_eye");
    gui.button("§8« BACK TO WAYPOINTS", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 1) {
            system.run(() => showWaypointsMenu(player, backToMain));
            return;
        }
        if (res.selection === 0) {
            system.run(() => {
                try {
                    const dimId = DIM_MAP[wp.dim] || "minecraft:overworld";
                    const targetDim = world.getDimension(dimId);
                    player.teleport({ x: wp.x, y: wp.y, z: wp.z }, { dimension: targetDim });
                    player.sendMessage(`§aTeleported to "§e${wp.name}§a" in §f${wp.dim}`);
                } catch (e) {
                    player.sendMessage("§cTP Failed!");
                }
                showWaypointsMenu(player, backToMain);
            });
        }
    });
}
function showDeleteWaypoint(player, backToMain) {
    system.run(() => {
        let waypoints = [];
        try {
            const raw = player.getDynamicProperty("waypoints");
            waypoints = raw ? JSON.parse(raw) : [];
        } catch (e) { waypoints = []; }
        const gui = new ActionFormData();
        gui.title("Delete Waypoint");
        gui.body("§cSelect a waypoint to delete:");
        for (const wp of waypoints) {
            gui.button(`§8${wp.name} §8| §8${wp.x}, ${wp.y}, ${wp.z}`, "textures/ui/cancel");
        }
        gui.button("§8« BACK", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === waypoints.length) {
                system.run(() => showWaypointsMenu(player, backToMain));
                return;
            }
            const wpToDelete = waypoints[res.selection];
            system.run(() => showDeleteConfirm(player, wpToDelete, backToMain));
        });
    });
}
function showDeleteConfirm(player, wp, backToMain) {
    const gui = new ActionFormData();
    gui.title("§cConfirm Delete");
    gui.body(
        `§cAre you sure you want to delete:\n\n` +
        `§e"${wp.name}"\n` +
        `§7${wp.x}, ${wp.y}, ${wp.z} (${wp.dim})\n\n` +
        `§7This cannot be undone!`
    );
    gui.button("§8YES - Delete", "textures/ui/cancel");
    gui.button("§8No - Go Back", "textures/ui/undoArrow");
    gui.show(player).then((res) => {
        if (res.canceled || res.selection === 1) {
            system.run(() => showWaypointsMenu(player, backToMain));
            return;
        }
        if (res.selection === 0) {
            system.run(() => {
                try {
                    let waypoints = [];
                    try {
                        const raw = player.getDynamicProperty("waypoints");
                        waypoints = raw ? JSON.parse(raw) : [];
                    } catch (e) { waypoints = []; }
                    waypoints = waypoints.filter(w => w.name !== wp.name);
                    player.setDynamicProperty("waypoints", JSON.stringify(waypoints));
                    player.sendMessage(`§cWaypoint "§e${wp.name}§c" deleted!`);
                } catch (e) {
                    player.sendMessage("§cError deleting waypoint!");
                }
                showWaypointsMenu(player, backToMain);
            });
        }
    });
}