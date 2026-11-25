import { system, world, ItemStack } from '@minecraft/server'
import { getEffectiveCompressMap } from "./compressor_recipes.js";
import { COMPRESSOR_TAG } from './constants.js';
import { 
    getHolderContainer, getDP, setDP, cleanupHolderEntity, 
    assignTickGroup, releaseTickGroup 
} from './helperFunctions.js';

function updateCompressorRecipeLabels(container, recipes) {
    let slot = 4;
    for (const recipe of Object.values(recipes)) {
        if (slot >= 25) break;
        const labelText = `${recipe.amt}\n${recipe.name}`;
        const current = container.getItem(slot);
        if (!current || current.typeId !== "avaritia:collector_bar" || current.nameTag !== labelText) {
            const label = new ItemStack("avaritia:collector_bar", 1);
            label.nameTag = labelText;
            container.setItem(slot, label);
        }
        slot++;
    }
}

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent("avaritia:compressor_trigger", {
        onPlace({ block }) {
            try {
                const loc = block.location;
                const dim = block.dimension;
                cleanupHolderEntity(dim, loc, COMPRESSOR_TAG);
                const e = dim.spawnEntity("avaritia:compressor_inventory_entity", { x: loc.x + 0.5, y: loc.y + 0.25, z: loc.z + 0.5 });
                e.addTag(COMPRESSOR_TAG);
                e.nameTag = "entity.avaritia:neutronium_compressor.name";
                setDP(e, "blockLoc", { x: loc.x, y: loc.y, z: loc.z });
                setDP(e, "dimId", dim.id);
                assignTickGroup(e);
            } catch (err) {}
        },
        onPlayerBreak({ block }) {
            try {
                const dim = block.dimension;
                const loc = block.location;
                const fx = Math.floor(loc.x), fy = Math.floor(loc.y), fz = Math.floor(loc.z);
                for (const e of dim.getEntities({ tags: [COMPRESSOR_TAG] })) {
                    const bl = getDP(e, "blockLoc");
                    if (bl && bl.x === fx && bl.y === fy && bl.z === fz) {
                        const c = getHolderContainer(e);
                        if (c) {
                            const a = c.getItem(0);
                            const b = c.getItem(1);
                            if (a) {
                                dim.spawnItem(new ItemStack(a.typeId, a.amount), block.center());
                            }
                            if (b) {
                                dim.spawnItem(new ItemStack(b.typeId, b.amount), block.center());
                            }
                        }
                        releaseTickGroup(e);
                        e.remove();
                    }
                }
            } catch (err) {}
        },
        onTick({ block }) {
                    try {
                        const dim = block.dimension;
                        const loc = block.location;
                        const fx = Math.floor(loc.x), fy = Math.floor(loc.y), fz = Math.floor(loc.z);
                        for (const e of dim.getEntities({ tags: [COMPRESSOR_TAG] })) {
                            const bl = getDP(e, "blockLoc");
                            if (!bl) {
                                continue;
                            }
                            if (bl && bl.x === fx && bl.y === fy && bl.z === fz) {
                        const c = getHolderContainer(e);
                        if (!c) return;

                        const compMat = getDP(e, "compMat");
                        const compAmt = getDP(e, "compAmt", 0) || 0;
                        const effectiveMap = getEffectiveCompressMap();
                        const map = compMat ? effectiveMap[compMat] : null;
                        updateCompressorRecipeLabels(c, effectiveMap);

                        const existingOutput = c.getItem(1);
                        const outputMatches = existingOutput && existingOutput.amount > 0 && map && existingOutput.typeId === map.out;
                        const outputBlocks = existingOutput && existingOutput.amount > 0 && (!map || existingOutput.typeId !== map.out);

                        if (map && compAmt > 0 && compAmt < map.amt) {
                            const pct = Math.max(1, Math.min(63, Math.round((compAmt / map.amt) * 63)));
                            const bar = new ItemStack("avaritia:collector_bar", pct);
                            bar.nameTag = compAmt + "/" + map.amt;
                            c.setItem(2, bar);
                            const lbl = new ItemStack("avaritia:collector_bar", 1);
                            lbl.nameTag = map.name;
                            c.setItem(3, lbl);
                        } else if (map && compAmt >= map.amt && outputMatches) {
                            const bar = new ItemStack("avaritia:collector_bar", 63);
                            bar.nameTag = map.amt + "/" + map.amt;
                            c.setItem(2, bar);
                            const lbl = new ItemStack("avaritia:collector_bar", 1);
                            lbl.nameTag = map.name;
                            c.setItem(3, lbl);
                        } else {
                            c.setItem(2, undefined);
                            c.setItem(3, undefined);
                        }

                        if (outputBlocks) {
                            return;
                        }

                        const input = c.getItem(0);
                        if (input && input.amount > 0) {
                            const mapForInput = effectiveMap[input.typeId];
                            if (mapForInput) {
                                let currentMat = getDP(e, "compMat");
                                let currentAmt = getDP(e, "compAmt", 0) || 0;

                                if (!currentMat || currentMat === input.typeId) {
                                    setDP(e, "compMat", input.typeId);
                                    const totalAvailable = currentAmt + input.amount;
                                    const recipesComplete = Math.floor(totalAvailable / mapForInput.amt);
                                    const remainder = totalAvailable % mapForInput.amt;
                                    setDP(e, "compAmt", remainder);
                                    c.setItem(0, undefined);

                                    if (recipesComplete > 0) {
                                        const output = c.getItem(1);
                                        if (output && output.amount > 0 && output.typeId === mapForInput.out) {
                                            output.amount += recipesComplete;
                                            c.setItem(1, output);
                                        } else {
                                            c.setItem(1, new ItemStack(mapForInput.out, recipesComplete));
                                        }
                                    }
                                }
                            }
                        }

                        const isWorking = (compAmt > 0);
                        try {
                            const blockLoc = { x: fx, y: fy, z: fz };
                            const block = dim.getBlock(blockLoc);
                            if (block && block.typeId === "avaritia:neutronium_compressor") {
                                const newPermutation = block.permutation.withState("avaritia:on", isWorking);
                                block.setPermutation(newPermutation);
                            }
                        } catch (_) {
                        }
                    }
                }
            } catch (err) {}
        }
    });
});