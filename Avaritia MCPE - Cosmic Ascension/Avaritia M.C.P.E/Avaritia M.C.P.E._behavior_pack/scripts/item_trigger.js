import { system, world } from '@minecraft/server';
import { decrementStack, getOppositeDirection, DirectionType, cardinalSides, randomFunction } from './utils/helper';
import { directionToVector3 } from './utils/math';

system.beforeEvents.startup.subscribe(initEvent => { initEvent.itemComponentRegistry.registerCustomComponent('pa_cosmicmeatballs:trigger', {
  onConsume: e => {
  e.source.addEffect("minecraft:saturation", 2000, {amplifier: 20});
e.source.addEffect("minecraft:strength", 2000, {amplifier: 5});
  
},

  
});

initEvent.itemComponentRegistry.registerCustomComponent('pa_infinityaxe:trigger', {
  
  onUseOn: e => { e.source.runCommand("function areadirtgrass");
e.source.runCommand("function leaves1");
e.source.runCommand("function leaves2");
e.source.runCommand("function leaves3");
e.source.runCommand("function leaves4");
e.source.runCommand("function leaves5");
e.source.runCommand("function leaves6");
e.source.runCommand("function leaves7");
e.source.runCommand("function leaves8");
e.source.runCommand("function leaves9");
e.source.runCommand("function log1");
e.source.runCommand("function log2");
e.source.runCommand("function log3");
e.source.runCommand("function log4");
e.source.runCommand("function log5");
e.source.runCommand("function log6");
e.source.runCommand("function log7");
e.source.runCommand("function log8");
e.source.runCommand("function log9");
e.source.runCommand("function log10");
e.source.runCommand("function leaves11");
e.source.runCommand("function leaves12");
e.source.runCommand("function log11"); },
  
  
});

initEvent.itemComponentRegistry.registerCustomComponent('pa_infinitybow:trigger', {
  onUse: e => {
        e.source.runCommand("function givebow");
    },
});

initEvent.itemComponentRegistry.registerCustomComponent('pa_infinityhoe:trigger', {
  
  onUseOn: e => { e.source.runCommand("function tiltgrass1");
e.source.runCommand("function tiltdirt1"); },
  
  
});

initEvent.itemComponentRegistry.registerCustomComponent('pa_infinitypic2:trigger', {
  
  onUseOn: e => { e.source.runCommand("function giveinfinitypickaxe"); },
  
  onMineBlock: e => { e.source.runCommand("function dig10x10"); },
});

initEvent.itemComponentRegistry.registerCustomComponent('pa_infinityshovel2:trigger', {
  
  onUseOn: e => { e.source.runCommand("function giveinfinityshovel"); },
  
  onMineBlock: e => { e.source.runCommand("function dig10x10x1");
e.source.runCommand("function dig10x10x2");
e.source.runCommand("function dig10x10x3");
e.source.runCommand("function dig10x10x4");
e.source.runCommand("function dif10x10x5");
e.source.runCommand("function 1");
e.source.runCommand("function 2");
e.source.runCommand("function 3"); },
});

initEvent.itemComponentRegistry.registerCustomComponent('pa_infinitypickaxe:trigger', {
  onUse: e => { e.source.runCommand("function fortune"); },
  onUseOn: e => { e.source.runCommand("function giveinfinitypic2"); },
  
  onMineBlock: e => { e.source.runCommand("function fortune"); },
});

initEvent.itemComponentRegistry.registerCustomComponent('pa_infinityshovel:trigger', {
  
  onUseOn: e => { e.source.runCommand("function giveinfinityshovel2"); },
  
  
});

initEvent.itemComponentRegistry.registerCustomComponent('pa_infinitysword:trigger', {
  
  
  onHitEntity: e => { e.hitEntity.runCommand("function kill");
e.hitEntity.runCommand("function effectclear");
e.hitEntity.runCommand("function scoreborddummy");
e.hitEntity.runCommand("function addtag");
e.hitEntity.runCommand("function timerset20");
e.hitEntity.runCommand("function removetag");
e.hitEntity.runCommand("function resettimer"); },
  
});

initEvent.itemComponentRegistry.registerCustomComponent('pa_skullfiresword:trigger', {
  
  
  onHitEntity: e => { e.hitEntity.runCommand("function skulldrop"); },
  
});

initEvent.itemComponentRegistry.registerCustomComponent('pa_ultimatestew:trigger', {
  onConsume: e => {
  e.source.addEffect("minecraft:regeneration", 2000, {amplifier: 5});
e.source.addEffect("minecraft:saturation", 2000, {amplifier: 20});
  
},

  
});
 });

