import { system, Direction } from "@minecraft/server";
import { isValidPlayer, reportIssue, doubleBase } from "../core/helpers.js";
import { createKitOpPlan, createKitNPlan } from "../core/placement_plan.js";
import { handleKitOp } from "./kitop.js";
import { handleKitN } from "./kitn.js";
const MAX_DISTANCE=8, TICK_RATE=5, HOLOGRAM_ID="tc:kit_preview";
const sessions=new Map();
function targetFromView(player){
 const hit=player.getBlockFromViewDirection({maxDistance:MAX_DISTANCE,includeLiquidBlocks:false,includePassableBlocks:false});
 if(!hit?.block?.isValid)return undefined;
 const normals={
  [Direction.Up]:{x:0,y:1,z:0},[Direction.Down]:{x:0,y:-1,z:0},
  [Direction.North]:{x:0,y:0,z:-1},[Direction.South]:{x:0,y:0,z:1},
  [Direction.East]:{x:1,y:0,z:0},[Direction.West]:{x:-1,y:0,z:0}
 };
 const n=normals[hit.face]; if(!n)return undefined;
 return {x:Math.floor(hit.block.location.x+n.x),y:Math.floor(hit.block.location.y+n.y),z:Math.floor(hit.block.location.z+n.z)};
}
function safeKitNBase(dimension,target,rotation){
 const footprint=createKitNPlan({x:0,y:0,z:0},rotation).cells.map(({x,z})=>({x,z}));
 return doubleBase(dimension,target,footprint);
}
function pointKey(p){return p?`${p.x},${p.y},${p.z}`:"";}
function hologramLocation(a){return {x:a.x+0.5,y:a.y,z:a.z+0.5};}
function removeHologram(s){try{if(s.hologram?.isValid)s.hologram.remove();}catch{}s.hologram=undefined;}
function placeOrMoveHologram(s){
 if(!s.anchor){removeHologram(s);return;}
 const location=hologramLocation(s.anchor), rotation={x:0,y:s.rotation*90};
 try{
  if(!s.hologram?.isValid){
   s.hologram=s.dimension.spawnEntity(HOLOGRAM_ID,location,{initialRotation:rotation});
   s.hologram.setProperty("tc:kit_kind",s.kind==="KitOP"?0:1);
   s.hologram.setProperty("tc:valid",true);
  }else s.hologram.teleport(location,{rotation,keepVelocity:false});
  s.hologram.setRotation(rotation);
 }catch{removeHologram(s);reportIssue(s.player,"No se pudo mostrar la previsualización holográfica.");}
}
function getAnchor(player,s){
 if(s.locked&&s.anchor)return s.anchor;
 const target=targetFromView(player);if(!target)return undefined;
 return s.kind==="KitN"?safeKitNBase(s.dimension,target,s.rotation):target;
}
function stop(player,s,confirm){
 if(s.interval!==undefined)system.clearRun(s.interval);
 removeHologram(s);sessions.delete(player.id);
 if(confirm){
  if(s.kind==="KitN")handleKitN({sourceEntity:player},{base:s.anchor,rotation:s.rotation});
  else handleKitOp({sourceEntity:player},{anchor:s.anchor,rotation:s.rotation});
  reportIssue(player,`${s.kind}: colocación confirmada.`);
 }else reportIssue(player,`${s.kind}: previsualización cancelada.`);
}
function tick(player,s){
 if(!isValidPlayer(player)||!player.isValid||player.dimension.id!==s.dimensionId){
  if(s.interval!==undefined)system.clearRun(s.interval);removeHologram(s);sessions.delete(s.playerId);return;
 }
 const held=player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
 if(held?.typeId!=="tc:kit_selector"){stop(player,s,false);return;}
 if(!s.locked){
  const next=getAnchor(player,s);
  if(!next){s.anchor=undefined;s.key="";removeHologram(s);player.onScreenDisplay.setActionBar("Apunta a un bloque. Usa el libro para abrir los controles.");return;}
  const key=pointKey(next);
  if(key!==s.key){s.anchor=next;s.key=key;placeOrMoveHologram(s);}
 }else if(!s.hologram?.isValid&&s.anchor)placeOrMoveHologram(s);
 player.onScreenDisplay.setActionBar(`${s.kind} | ${s.locked?"POSICIÓN FIJADA":"SIGUIENDO LA MIRA"} | Usa el libro para controlar`);
}
export function hasActiveKitPreview(player){return sessions.has(player.id);}
export function getKitPreviewState(player){
 const s=sessions.get(player.id);if(!s)return undefined;
 return {kind:s.kind,locked:s.locked,rotation:s.rotation,hasPosition:!!s.anchor};
}
export function startKitPreview(player,kind){
 if(!isValidPlayer(player)||!["KitN","KitOP"].includes(kind))return false;
 const old=sessions.get(player.id);if(old)stop(player,old,false);
 const s={player,playerId:player.id,kind,dimension:player.dimension,dimensionId:player.dimension.id,rotation:0,anchor:undefined,key:"",locked:false,hologram:undefined,interval:undefined};
 sessions.set(player.id,s);reportIssue(player,`${kind}: apunta para mover el holograma. Usa el libro para abrir los controles.`);
 s.interval=system.runInterval(()=>tick(player,s),TICK_RATE);return true;
}
export function togglePreviewLock(player){
 const s=sessions.get(player.id);if(!s)return false;
 if(!s.anchor){reportIssue(player,"Primero apunta a un bloque para colocar el holograma.");return false;}
 s.locked=!s.locked;reportIssue(player,s.locked?"Posición fijada.":"El holograma vuelve a seguir la mira.");return true;
}
export function rotatePreview(player,amount){
 const s=sessions.get(player.id);if(!s||!Number.isInteger(amount))return false;
 s.rotation=(s.rotation+amount+4)%4;s.key="";
 if(!s.locked)s.anchor=undefined;
 placeOrMoveHologram(s);reportIssue(player,`Rotación: ${s.rotation*90}°.`);return true;
}
export function confirmPreview(player){
 const s=sessions.get(player.id);if(!s?.anchor){reportIssue(player,"No hay una posición válida para confirmar.");return false;}
 stop(player,s,true);return true;
}
export function cancelPreview(player){const s=sessions.get(player.id);if(!s)return false;stop(player,s,false);return true;}
