import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";
import { STRUCTURES, BIOMES, RARE_BIOMES } from "./locatordata.js";
import { getProp, setProp } from "./helpers.js";

const DIM_KEY = {
    "minecraft:overworld": "overworld",
    "minecraft:nether": "nether",
    "minecraft:the_end": "the_end"
};

const DIM_NAME = {
    overworld: "Overworld",
    nether: "Nether",
    the_end: "The End"
};

const DIM_PHRASE = {
    overworld: "the Overworld",
    nether: "the Nether",
    the_end: "the End"
};

const TOP_FALLBACK = {
    overworld: 317,
    nether: 125,
    the_end: 253
};

const NEW_CHUNKS_PROP = "ucmLocateNewChunks";
const PULSE_TICKS = 8;

let busy = false;

function dimKey(player) {
    return DIM_KEY[player.dimension.id] || "overworld";
}

function isOperator(player) {
    return player.commandPermissionLevel !== undefined && player.commandPermissionLevel > 0;
}

function newChunksOn(player) {
    return getProp(player, NEW_CHUNKS_PROP) === true;
}

function setNewChunks(player, value) {
    setProp(player, NEW_CHUNKS_PROP, value === true);
}

function statusTag(on) {
    return on ? " §a(ON)" : " §c(OFF)";
}

function topY(dimension, key) {
    try {
        const range = dimension.heightRange;
        if (range && typeof range.max === "number") return range.max - 3;
    } catch (e) {}
    return TOP_FALLBACK[key] !== undefined ? TOP_FALLBACK[key] : 100;
}

function gameRulesUsable() {
    try {
        return typeof world.gameRules?.commandBlockOutput === "boolean";
    } catch (e) {
        return false;
    }
}

function readCommandBlockOutput() {
    if (!gameRulesUsable()) return undefined;
    try {
        return world.gameRules.commandBlockOutput;
    } catch (e) {
        return undefined;
    }
}

function writeCommandBlockOutput(value) {
    if (gameRulesUsable()) {
        try {
            world.gameRules.commandBlockOutput = value;
            return;
        } catch (e) {}
    }
    try {
        world.getDimension("overworld").runCommand("gamerule commandblockoutput " + (value ? "true" : "false"));
    } catch (e) {}
}

function putBack(dimension, pos, permutation) {
    try {
        const block = dimension.getBlock(pos);
        if (!block) return;
        if (permutation) block.setPermutation(permutation);
        else dimension.runCommand("setblock " + pos.x + " " + pos.y + " " + pos.z + " air");
    } catch (e) {}
}

function runLocate(player, entry, useNew, onDone) {
    if (busy) {
        player.sendMessage("§cA locate is already running, try again in a moment.");
        onDone(false);
        return;
    }

    const structureName = useNew ? entry.newKey : entry.key;
    const dimension = player.dimension;
    const key = dimKey(player);
    const x = Math.floor(player.location.x);
    const z = Math.floor(player.location.z);
    const y = topY(dimension, key);
    const commandPos = { x: x, y: y, z: z };
    const powerPos = { x: x, y: y + 1, z: z };

    let oldCommand;
    let oldPower;
    try { oldCommand = dimension.getBlock(commandPos)?.permutation; } catch (e) {}
    try { oldPower = dimension.getBlock(powerPos)?.permutation; } catch (e) {}

    const previous = readCommandBlockOutput();
    const restoreTo = previous === undefined ? true : previous;
    if (previous !== true) writeCommandBlockOutput(true);

    busy = true;

    try {
        dimension.runCommand("structure load " + structureName + " " + x + " " + y + " " + z);
        dimension.runCommand("setblock " + x + " " + (y + 1) + " " + z + " redstone_block");
    } catch (e) {
        busy = false;
        putBack(dimension, powerPos, oldPower);
        putBack(dimension, commandPos, oldCommand);
        if (previous !== true) writeCommandBlockOutput(restoreTo);
        onDone(false);
        return;
    }

    system.runTimeout(() => {
        putBack(dimension, powerPos, oldPower);
        putBack(dimension, commandPos, oldCommand);
        if (previous !== true) writeCommandBlockOutput(restoreTo);
        busy = false;
        onDone(true);
    }, PULSE_TICKS);
}

function nativeBiomeSearch(player, entry) {
    const dimension = player.dimension;
    if (typeof dimension.findClosestBiome !== "function") return { supported: false };

    let height = 256;
    try {
        const range = dimension.heightRange;
        if (range && typeof range.max === "number" && typeof range.min === "number") {
            height = Math.max(16, Math.min(256, range.max - range.min));
        }
    } catch (e) {}

    try {
        const found = dimension.findClosestBiome(player.location, "minecraft:" + entry.id, {
            boundingSize: { x: 6400, y: height, z: 6400 }
        });
        return { supported: true, pos: found };
    } catch (e) {
        return { supported: false };
    }
}

function locate(player, entry) {
    const useNew = entry.kind === "structure" && newChunksOn(player);

    if (entry.kind === "biome" && entry.dim === dimKey(player)) {
        const native = nativeBiomeSearch(player, entry);
        if (native.supported) {
            if (native.pos) {
                player.sendMessage(
                    "§aThe nearest " + entry.label + " is at X " + Math.round(native.pos.x) +
                    ", Y " + Math.round(native.pos.y) + ", Z " + Math.round(native.pos.z)
                );
            } else {
                player.sendMessage("§cNo " + entry.label + " found within the search range.");
            }
            return;
        }
    }

    runLocate(player, entry, useNew, (ok) => {
        if (!ok) {
            player.sendMessage("§cThe search could not be started.");
            return;
        }
        if (!isOperator(player)) {
            player.sendMessage("§cCommand block results only show to operators, so you will not see the coordinates.");
        }
    });
}

function tagged(list, kind) {
    return list.map((e) => ({
        key: e.key,
        newKey: e.newKey,
        id: e.id,
        label: e.label,
        dim: e.dim,
        icon: e.icon,
        kind: kind
    }));
}

const ALL_STRUCTURES = tagged(STRUCTURES, "structure");
const ALL_BIOMES = tagged(BIOMES, "biome");
const ALL_RARE = tagged(RARE_BIOMES, "biome");

function hereFirst(player, entries) {
    const here = dimKey(player);
    const mine = entries.filter((e) => e.dim === here);
    return mine.concat(entries.filter((e) => e.dim !== here));
}

function newChunksLine(player, kind) {
    if (kind === "biome") {
        return "Biome search has no new chunk option. The game always searches the full range, generated or not.";
    }
    if (!newChunksOn(player)) {
        return "New chunk search is off, so only chunks you have already generated are searched.";
    }
    return "New chunk search is on, so chunks that have never been generated are searched too. This is slower and may find something very far away.";
}

function showList(player, title, kind, entries, back, extras) {
    system.run(() => {
        const home = () => showList(player, title, kind, entries, back, extras);
        const here = dimKey(player);
        const on = newChunksOn(player);

        const gui = new ActionFormData();
        gui.title("§l" + title);
        gui.body(
            "You are in " + DIM_PHRASE[here] + ".\n" +
            "Entries from another dimension are labelled and are searched there.\n" +
            "Coordinates are printed in your chat.\n\n" +
            newChunksLine(player, kind)
        );

        const rows = [];
        if (kind === "structure") {
            gui.button("New Chunk Search" + statusTag(on), on ? "textures/ui/toggle_on" : "textures/ui/toggle_off");
            rows.push({ toggle: true });
        }

        for (const item of extras || []) {
            gui.button(item.label, item.icon);
            rows.push(item);
        }
        for (const entry of entries) {
            const label = entry.dim === here ? entry.label : entry.label + "\n" + DIM_NAME[entry.dim];
            if (entry.icon) gui.button(label, entry.icon);
            else gui.button(label);
            rows.push(entry);
        }
        gui.button("Back", "textures/ui/undoArrow");

        gui.show(player).then((res) => {
            if (res.canceled || res.selection === rows.length) {
                system.run(() => back(player));
                return;
            }
            const picked = rows[res.selection];
            if (picked.toggle) {
                system.run(() => {
                    setNewChunks(player, !on);
                    home();
                });
                return;
            }
            if (picked.run) {
                system.run(() => picked.run(player));
                return;
            }
            system.run(() => locate(player, picked));
        });
    });
}

function showRareBiomes(player, back) {
    showList(player, "Rare and Legacy Biomes", "biome", hereFirst(player, ALL_RARE), back);
}

function showResults(player, query, matches, back) {
    system.run(() => {
        const gui = new ActionFormData();
        gui.title("§lSearch Results");
        gui.body(matches.length + " match" + (matches.length === 1 ? "" : "es") + " for \"" + query + "\".");
        for (const entry of matches) {
            const suffix = entry.kind === "biome" ? " (Biome)" : " (Structure)";
            if (entry.icon) gui.button(entry.label + suffix, entry.icon);
            else gui.button(entry.label + suffix);
        }
        gui.button("Back", "textures/ui/undoArrow");
        gui.show(player).then((res) => {
            if (res.canceled || res.selection === matches.length) {
                system.run(() => back(player));
                return;
            }
            system.run(() => locate(player, matches[res.selection]));
        });
    });
}

function showSearch(player, pool, back) {
    system.run(() => {
        const form = new ModalFormData();
        form.title("§lSearch");
        form.textField("Name to search for", "Example: bastion");
        form.show(player).then((res) => {
            if (res.canceled) {
                system.run(() => back(player));
                return;
            }
            system.run(() => {
                const query = String(res.formValues[0] || "").trim().toLowerCase();
                if (!query) {
                    showSearch(player, pool, back);
                    return;
                }
                const matches = pool.filter((e) =>
                    e.label.toLowerCase().includes(query) || e.id.includes(query.replace(/\s+/g, "_"))
                );
                if (matches.length === 0) {
                    player.sendMessage("§cNothing matched \"" + query + "\".");
                    showSearch(player, pool, back);
                    return;
                }
                showResults(player, query, matches, (p) => showSearch(p, pool, back));
            });
        });
    });
}

export function showStructureLocator(player, backToMain) {
    const entries = hereFirst(player, ALL_STRUCTURES);
    const extras = [{
        label: "Search",
        icon: "textures/ui/magnifyingGlass",
        run: (p) => showSearch(p, ALL_STRUCTURES, (q) => showStructureLocator(q, backToMain))
    }];
    showList(player, "Structure Locator", "structure", entries, backToMain, extras);
}

export function showBiomeLocator(player, backToMain) {
    const entries = hereFirst(player, ALL_BIOMES);
    const pool = ALL_BIOMES.concat(ALL_RARE);
    const home = (p) => showBiomeLocator(p, backToMain);

    const extras = [
        {
            label: "Search",
            icon: "textures/ui/magnifyingGlass",
            run: (p) => showSearch(p, pool, (q) => showBiomeLocator(q, backToMain))
        },
        {
            label: "Rare and Legacy Biomes",
            icon: "textures/ui/storageIconColor",
            run: (p) => showRareBiomes(p, home)
        }
    ];

    showList(player, "Biome Locator", "biome", entries, backToMain, extras);
}
