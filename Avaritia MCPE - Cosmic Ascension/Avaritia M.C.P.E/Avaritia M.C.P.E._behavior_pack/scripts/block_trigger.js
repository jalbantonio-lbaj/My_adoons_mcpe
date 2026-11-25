import { system, world } from '@minecraft/server';
import { setupCustomBlockDrop, decrementStack, getOppositeDirection, DirectionType, cardinalSides, randomFunction, shouldConnect, safeUpdateStairShape } from './utils/helper';
import { directionToVector3 } from './utils/math';

system.beforeEvents.startup.subscribe(initEvent => {
  initEvent.blockComponentRegistry.registerCustomComponent('pa_compressedcrafter:trigger', {
  onBreak: e => { const { x, y, z } = e.block.location;
const toolTags = [];
    const xpRange = [];

    setupCustomBlockDrop(e, false, toolTags, "blocks/pa_compressedcrafter", xpRange, true); },
});

initEvent.blockComponentRegistry.registerCustomComponent('pa_crystalmatrixblock:trigger', {
  onBreak: e => { const { x, y, z } = e.block.location;
const toolTags = [];
    const xpRange = [];

    setupCustomBlockDrop(e, false, toolTags, "blocks/pa_crystalmatrixblock", xpRange, true); },
});

initEvent.blockComponentRegistry.registerCustomComponent('pa_direcrafting:trigger', {
  onBreak: e => { const { x, y, z } = e.block.location;
const toolTags = [];
    const xpRange = [];

    setupCustomBlockDrop(e, false, toolTags, "blocks/pa_direcrafting", xpRange, true); },
});

initEvent.blockComponentRegistry.registerCustomComponent('pa_doublecompressedcrafter:trigger', {
  onBreak: e => { const { x, y, z } = e.block.location;
const toolTags = [];
    const xpRange = [];

    setupCustomBlockDrop(e, false, toolTags, "blocks/pa_doublecompressedcrafter", xpRange, true); },
});

initEvent.blockComponentRegistry.registerCustomComponent('pa_infinityblock:trigger', {
  onBreak: e => { const { x, y, z } = e.block.location;
const toolTags = [];
    const xpRange = [];

    setupCustomBlockDrop(e, false, toolTags, "blocks/pa_infinityblock", xpRange, true); },
});

initEvent.blockComponentRegistry.registerCustomComponent('pa_neutroncompressor:trigger', {
  onBreak: e => { const { x, y, z } = e.block.location;
const toolTags = [];
    const xpRange = [];

    setupCustomBlockDrop(e, false, toolTags, "blocks/pa_neutroncompressor", xpRange, true); },
});

initEvent.blockComponentRegistry.registerCustomComponent('pa_neutronblock:trigger', {
  onBreak: e => { const { x, y, z } = e.block.location;
const toolTags = [];
    const xpRange = [];

    setupCustomBlockDrop(e, false, toolTags, "blocks/pa_neutronblock", xpRange, true); },
});

initEvent.blockComponentRegistry.registerCustomComponent('pa_neutroniumcollector:trigger', {
  onBreak: e => { const { x, y, z } = e.block.location;
const toolTags = [];
    const xpRange = [];

    setupCustomBlockDrop(e, false, toolTags, "blocks/pa_neutroniumcollector", xpRange, true); },
onTick: e => { const { x, y, z } = e.block.location;
e.dimension.runCommand(`execute positioned ${x} ${y} ${z} run function neutrongiver`); },
});

});
