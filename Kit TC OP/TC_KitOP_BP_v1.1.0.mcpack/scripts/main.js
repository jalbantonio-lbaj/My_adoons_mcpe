import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { isValidPlayer } from "./core/helpers.js";
import { handleKitOp } from "./commands/kitop.js";
import { handleKitN } from "./commands/kitn.js";
import { startKitPreview,hasActiveKitPreview,getKitPreviewState,togglePreviewLock,confirmPreview,cancelPreview,rotatePreview } from "./commands/kit_preview.js";
function showKitSystem(player){
 if(!isValidPlayer(player))return;
 new ActionFormData().title("Kit System").body("Selecciona el kit que quieres previsualizar.").button("KitOP").button("KitN").show(player).then(r=>{
  if(r.canceled||!player.isValid)return;
  if(r.selection===0){
   if(player.commandPermissionLevel<CommandPermissionLevel.GameDirectors){player.sendMessage("§cKitOP está disponible solo para operadores.");return;}
   startKitPreview(player,"KitOP");
  }else if(r.selection===1)startKitPreview(player,"KitN");
 }).catch(()=>{if(player.isValid)player.sendMessage("§cNo se pudo abrir Kit System.");});
}
function showPreviewControls(player){
 const s=getKitPreviewState(player);if(!s)return showKitSystem(player);
 const state=s.hasPosition?(s.locked?"Posición fijada":"Siguiendo la mira"):"Apunta a un bloque";
 new ActionFormData().title(`Previsualización ${s.kind}`).body(`${state}\nRotación: ${s.rotation*90}°`)
 .button("Girar 90° a la izquierda").button("Girar 90° a la derecha")
 .button(s.locked?"Reanudar seguimiento":"Fijar posición").button("Confirmar y colocar").button("Cancelar")
 .show(player).then(r=>{
  if(r.canceled||!player.isValid)return;
  switch(r.selection){case 0:rotatePreview(player,-1);break;case 1:rotatePreview(player,1);break;case 2:togglePreviewLock(player);break;case 3:confirmPreview(player);break;case 4:cancelPreview(player);break;}
 }).catch(()=>{if(player.isValid)player.sendMessage("§cNo se pudieron abrir los controles.");});
}
system.beforeEvents.startup.subscribe(({itemComponentRegistry,customCommandRegistry})=>{
 itemComponentRegistry.registerCustomComponent("tc:kit_selector_use",{onUse(event){
  const player=event.source;if(!isValidPlayer(player))return;
  system.run(()=>{if(hasActiveKitPreview(player))showPreviewControls(player);else showKitSystem(player);});
 }});
 customCommandRegistry.registerCommand({name:"tc:kitop",description:"Coloca directamente KitOP (alternativa al libro)",cheatsRequired:false,permissionLevel:CommandPermissionLevel.GameDirectors},origin=>{
  const player=origin.sourceEntity;if(!isValidPlayer(player))return {status:CustomCommandStatus.Failure};
  system.run(()=>{if(player.isValid)handleKitOp(origin);});return {status:CustomCommandStatus.Success};
 });
 customCommandRegistry.registerCommand({name:"tc:kitn",description:"Coloca directamente KitN (alternativa al libro)",cheatsRequired:false,permissionLevel:CommandPermissionLevel.Any},origin=>{
  const player=origin.sourceEntity;if(!isValidPlayer(player))return {status:CustomCommandStatus.Failure};
  system.run(()=>{if(player.isValid)handleKitN(origin);});return {status:CustomCommandStatus.Success};
 });
});
