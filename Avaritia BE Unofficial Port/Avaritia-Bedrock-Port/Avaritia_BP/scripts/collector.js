import { system, world, ItemStack } from '@minecraft/server'
import { TICKS_PER_PILE, COLLECTOR_TAG, MAX_PILES } from './constants.js';
import { 
    getHolderContainer, getDP, setDP, cleanupHolderEntity, 
    assignTickGroup, releaseTickGroup 
} from './helperFunctions.js';

function updateBar(container, prog) {
    const pct = prog / TICKS_PER_PILE;
    const barCount = Math.max(1, Math.min(63, Math.round(1 + pct * 62)));
    container.setItem(1, new ItemStack("avaritia:collector_bar", barCount));
}

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
    blockComponentRegistry.registerCustomComponent("avaritia:neutron_collector_logic", {
        onPlace({ block }) {
            try {
                const loc = block.location;
                const dim = block.dimension;
                cleanupHolderEntity(dim, loc, COLLECTOR_TAG);
                const e = dim.spawnEntity("avaritia:collector_inventory_entity", { x: loc.x + 0.5, y: loc.y + 0.25, z: loc.z + 0.5 });
                e.addTag(COLLECTOR_TAG);
                e.nameTag = "entity.avaritia:neutron_collector.name";
                setDP(e, "blockLoc", { x: loc.x, y: loc.y, z: loc.z });
                setDP(e, "dimId", dim.id);
                setDP(e, "prog", 0);
                assignTickGroup(e);
                const c = getHolderContainer(e);
                if (c) {
                    c.setItem(0, undefined);
                    const start = new ItemStack("avaritia:collector_bar", 1);
                    start.nameTag = "0.0%";
                    c.setItem(1, start);
                }
            } catch (err) {}
        },
        onPlayerBreak({ block }) {
            try {
                const dim = block.dimension;
                const loc = block.location;
                const fx = Math.floor(loc.x), fy = Math.floor(loc.y), fz = Math.floor(loc.z);
                for (const e of dim.getEntities({ tags: [COLLECTOR_TAG] })) {
                    const bl = getDP(e, "blockLoc");
                    if (bl && bl.x === fx && bl.y === fy && bl.z === fz) {
                        const c = getHolderContainer(e);
                        if (c) {
                            const pile = c.getItem(0);
                            if (pile) {
                                dim.spawnItem(new ItemStack(pile.typeId, pile.amount), block.center());
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
                for (const e of dim.getEntities({ tags: [COLLECTOR_TAG] })) {
                    const bl = getDP(e, "blockLoc");
                    if (!bl) continue;
                    if (bl && bl.x === fx && bl.y === fy && bl.z === fz) {
                        const c = getHolderContainer(e);
                        if (!c) return;
                        let prog = (getDP(e, "prog", 0) || 0) + 1;
                        const pileItem = c.getItem(0);
                        const piles = (pileItem && pileItem.typeId === "avaritia:neutron_pile") ? pileItem.amount : 0;
                        const isOther = (pileItem && pileItem.typeId !== "avaritia:neutron_pile");
                        if (piles < MAX_PILES && !isOther) {
                            if (prog >= TICKS_PER_PILE) {
                                prog = 0;
                                c.setItem(0, new ItemStack("avaritia:neutron_pile", Math.min(MAX_PILES, piles + 1)));
                            }
                            setDP(e, "prog", prog);
                            updateBar(c, prog);
                        } else {
                            if (prog >= TICKS_PER_PILE) {
                                prog = prog;
                            }
                            setDP(e, "prog", prog);
                            updateBar(c, prog);
                        }
                    }
                }
            } catch (err) {}
        }
    });
});