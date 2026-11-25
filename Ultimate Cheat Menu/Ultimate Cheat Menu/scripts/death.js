import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { getProp, setProp } from "./helpers.js";
const DIM_MAP = {
    "Overworld": "minecraft:overworld",
    "Nether":    "minecraft:nether",
    "The End":   "minecraft:the_end",
};
world.afterEvents.entityDie.subscribe((ev) => {
    const entity = ev.deadEntity;
    if (entity.typeId !== "minecraft:player") return;
    const loc = entity.location;
    const dim = entity.dimension.id
        .replace("minecraft:overworld", "Overworld")
        .replace("minecraft:nether", "Nether")
        .replace("minecraft:the_end", "The End");
    const entry = {
        x: Math.round(loc.x * 10) / 10,
        y: Math.round(loc.y * 10) / 10,
        z: Math.round(loc.z * 10) / 10,
        dim,
        time: new Date().toISOString().slice(11, 16)
    };
    system.run(() => {
        const history = getProp(entity, "deathHistory") || [];
        history.push(entry);
        if (history.length > 20) history.shift();
        setProp(entity, "deathHistory", history);
        try {
            entity.sendMessage(`§c[Death] §fYou died at §e${Math.floor(loc.x)}, ${Math.floor(loc.y)}, ${Math.floor(loc.z)} §7(${dim})`);
        } catch (_) {}
    });
});
export function showDeathLocations(player, backToMain) {
    system.run(() => {
        const history = getProp(player, "deathHistory") || [];
        const gui = new ActionFormData();
        gui.title("Death Locations");
        if (history.length === 0) {
            gui.body("§cNo death locations saved yet!\n§7Die somewhere first.");
            gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
            gui.show(player).then((res) => {
                if (res.canceled || res.selection === 0) system.run(() => backToMain(player));
            });
            return;
        }
        gui.body(`§cTotal Deaths: §f${history.length}\n§7Click a location to teleport there.`);
        for (let i = history.length - 1; i >= 0; i--) {
            const d = history[i];
            gui.button(`§8 Death ${i + 1} | §8${d.x}, ${d.y}, ${d.z} | §8${d.dim} | §8${d.time}`, "textures/ui/inventory_icon");
        }
        gui.button("§8Clear Death History", "textures/ui/cancel");
        gui.button("§8« BACK TO MAIN", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled) { system.run(() => backToMain(player)); return; }
            if (res.selection === history.length + 1) { system.run(() => backToMain(player)); return; }
            if (res.selection === history.length) { system.run(() => showClearDeathConfirm(player, backToMain)); return; }
            const selectedIndex = (history.length - 1) - res.selection;
            const target = history[selectedIndex];
            system.run(() => showTPConfirm(player, target, backToMain));
        });
    });
}
function showTPConfirm(player, target, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§lTeleport to Death?");
        gui.body(
            "§7Are you sure you want to teleport to this death location?\n\n" +
            "§7X: §e" + target.x + "\n" +
            "§7Y: §e" + target.y + "\n" +
            "§7Z: §e" + target.z + "\n" +
            "§7Dimension: §e" + target.dim + "\n" +
            "§7Time: §e" + target.time + "\n\n" +
            "§cWarning: §7You may be teleporting into a dangerous area!"
        );
        gui.button("§8Yes - Teleport", "textures/items/ender_eye");
        gui.button("§8No - Go Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 1) {
                system.run(() => showDeathLocations(player, backToMain));
                return;
            }
            system.run(() => {
                try {
                    const dimId = DIM_MAP[target.dim] || "minecraft:overworld";
                    const targetDim = world.getDimension(dimId);
                    player.teleport({ x: target.x, y: target.y, z: target.z }, { dimension: targetDim });
                    player.sendMessage("§a[Death TP] §fTeleported to §eX:" + target.x + " Y:" + target.y + " Z:" + target.z + " §7(" + target.dim + ")");
                } catch (e) {
                    player.sendMessage("§cTP Failed!");
                }
                showDeathLocations(player, backToMain);
            });
        });
    });
}
function showClearDeathConfirm(player, backToMain) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§l§cDANGER!");
        gui.body("§cWARNING\n\n§fDelete ALL saved death locations?\n\n§eThis cannot be undone!");
        gui.button("§8YES - Delete Forever", "textures/ui/cancel");
        gui.button("§8No - Keep History", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === 1) {
                system.run(() => showDeathLocations(player, backToMain));
                return;
            }
            system.run(() => {
                player.setDynamicProperty("deathHistory", undefined);
                player.sendMessage("§cDeath history cleared!");
                showDeathLocations(player, backToMain);
            });
        });
    });
}