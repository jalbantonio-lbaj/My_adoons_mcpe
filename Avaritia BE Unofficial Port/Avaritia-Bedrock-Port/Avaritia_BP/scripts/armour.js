import { world, system, EquipmentSlot, InputButton, ButtonState, ItemStack } from "@minecraft/server";
import { handleCustomFlight } from "./armourFlight";

const flyingPlayers = new Set(); 
const jumpState = new Map();    
let tick = 0;

const HORIZONTAL_SPEED = 0.05;
const HORIZONTAL_SPEED_SPRINT = 0.08;
const ASCEND_SPEED = 0.3;
const DESCEND_SPEED = 0.25;
const HORIZONTAL_DRAG = 0.18;
const VERTICAL_DRAG = 1.0;
const DEADZONE = 0.02;
const DOUBLE_TAP_WINDOW = 7; 

const wasOnGroundMap = new Map();


const BAD_EFFECTS = [
    "minecraft:slowness", "minecraft:mining_fatigue", "minecraft:nausea", "minecraft:blindness",
    "minecraft:darkness", "minecraft:levitation", "minecraft:instant_damage", "minecraft:hunger",
    "minecraft:weakness", "minecraft:poison", "minecraft:wither", "minecraft:fatal_poison",
    "minecraft:bad_omen", "minecraft:raid_omen", "minecraft:trial_omen", "minecraft:infested",
    "minecraft:oozing", "minecraft:weaving", "minecraft:wind_charged"
];

function hasFullSet(playerEquippable) {
    if (!playerEquippable) return false;
    
    const boots = playerEquippable.getEquipment(EquipmentSlot.Feet);
    const leggings = playerEquippable.getEquipment(EquipmentSlot.Legs);
    const breastplate = playerEquippable.getEquipment(EquipmentSlot.Chest);
    const helmet = playerEquippable.getEquipment(EquipmentSlot.Head);

    return (
        boots?.typeId === "avaritia:infinity_boots" &&
        leggings?.typeId === "avaritia:infinity_pants" &&
        (breastplate?.typeId === "avaritia:infinity_breastplate" || breastplate?.typeId === "avaritia:infinity_breastplate_winged") &&
        helmet?.typeId === "avaritia:infinity_helmet"
    );
}

world.beforeEvents.entityHurt.subscribe((event) => {
    const player = event.hurtEntity;
    if (player.typeId !== "minecraft:player") return;
    const playerEquippable = player.getComponent("minecraft:equippable");
    const breastplate = playerEquippable.getEquipment(EquipmentSlot.Chest);
    if (!hasFullSet(playerEquippable)) {
        if (event.damageSource.cause === "fall" && (breastplate?.typeId === "avaritia:infinity_breastplate" || breastplate?.typeId === "avaritia:infinity_breastplate_winged")) {event.cancel = true; event.damage *= 0; return;}
        return;
    }
    
    event.damage *= 0

    const attacker = event.damageSource.damagingEntity;
    if (attacker) {
        const attackerEquippable = attacker.getComponent("minecraft:equippable");
        const mainHand = attackerEquippable?.getEquipment(EquipmentSlot.Mainhand);
        
        if (mainHand?.typeId === "avaritia:sword_of_the_cosmos") {
            event.damage = 3;
            return;
        }

        if (attacker.typeId === "avaritia:heaven_arrow" || attacker.typeId === "avaritia:heaven_sub_arrow") {
            event.damage = 1;
            return;
        }
    }

    event.cancel = true;
});

system.runInterval(() => {
    tick++;
    const players = world.getAllPlayers();

    for (const player of players) {
        const playerEquippable = player.getComponent("minecraft:equippable");
        if (!playerEquippable) continue;

        const helmet = playerEquippable.getEquipment(EquipmentSlot.Head);
        const breastplate = playerEquippable.getEquipment(EquipmentSlot.Chest);
        const leggings = playerEquippable.getEquipment(EquipmentSlot.Legs);
        const boots = playerEquippable.getEquipment(EquipmentSlot.Feet);
        

        if (helmet?.typeId === "avaritia:infinity_helmet") {
            const hunger = player.getComponent("minecraft:player.hunger");
                hunger?.resetToMaxValue();
            
        }

        const breastplateTypeId = breastplate?.typeId;
        const hasChestplate = breastplateTypeId === "avaritia:infinity_breastplate" || breastplateTypeId === "avaritia:infinity_breastplate_winged";
        const isCurrentlyFlying = flyingPlayers.has(player.id) || player.isGliding || player.isFlying;

        if (hasChestplate) {
            const velocity = player.getVelocity();
            const activeEffects = player.getEffects();
            
            for (const effect of activeEffects) {
                if (BAD_EFFECTS.includes(effect.typeId)) {
                    player.removeEffect(effect.typeId);
                }
            }

            handleCustomFlight(player, velocity, flyingPlayers, jumpState, tick, HORIZONTAL_SPEED, HORIZONTAL_SPEED_SPRINT, ASCEND_SPEED, DESCEND_SPEED, HORIZONTAL_DRAG, VERTICAL_DRAG, DEADZONE, DOUBLE_TAP_WINDOW);

            if (isCurrentlyFlying && breastplateTypeId === "avaritia:infinity_breastplate") {
                playerEquippable.setEquipment(EquipmentSlot.Chest, new ItemStack("avaritia:infinity_breastplate_winged", 1));
            } 
            else if (!isCurrentlyFlying && breastplateTypeId === "avaritia:infinity_breastplate_winged") {
                playerEquippable.setEquipment(EquipmentSlot.Chest, new ItemStack("avaritia:infinity_breastplate", 1));
            }

        } else {
            if (isCurrentlyFlying) {
                flyingPlayers.delete(player.id);
            }
            jumpState.delete(player.id);
        }

        if (!isCurrentlyFlying) {
            const inventoryComp = player.getComponent("minecraft:inventory");
            if (inventoryComp && inventoryComp.container) {
                const container = inventoryComp.container;
                const containerSize = container.size;
                for (let i = 0; i < containerSize; i++) {
                    const item = container.getItem(i);
                    if (item && item.typeId === "avaritia:infinity_breastplate_winged") {
                        container.setItem(i, new ItemStack("avaritia:infinity_breastplate", item.amount));
                    }
                }
            }
        }

        if (leggings?.typeId === "avaritia:infinity_pants"){
            if (player.getComponent("minecraft:onfire")){
                player.extinguishFire(true);
            }
        }

        if (boots?.typeId === "avaritia:infinity_boots") { 
            const inputInfo = player.inputInfo; 
            if (!inputInfo) continue; 

            const onGround = player.isOnGround; 
            const wasOnGround = wasOnGroundMap.has(player.id) ? wasOnGroundMap.get(player.id) : true;
            wasOnGroundMap.set(player.id, onGround);
            
            const isJumpPressed = inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
            const isContinuousJumping = player.isJumping && onGround;

            let jumpY = 0;

            if ((isJumpPressed && (onGround || wasOnGround)) || isContinuousJumping) {
                jumpY = 0.45;
                wasOnGroundMap.set(player.id, false);
            }
            
            if (onGround && !wasOnGround) {
                wasOnGroundMap.set(player.id, true);
            }
            
            const flying = player.isGliding || player.isFlying || isCurrentlyFlying;
            const swimming = player.isSwimming || player.isInWater; 
            const sneaking = player.isSneaking; 
            const moveVector = inputInfo.getMovementVector(); 
            if (!moveVector) continue; 

            const moveStrafe = moveVector.x;  
            const moveForward = moveVector.y; 

            if (moveForward === 0 && moveStrafe === 0) {
                if (jumpY > 0) {
                    player.applyImpulse({ x: 0, y: jumpY, z: 0 });
                }
                continue; 
            }

            if (onGround || flying || swimming || jumpY > 0) { 
                let speed = 0.15; 
                if (flying) speed *= 1.1; 

                const view = player.getViewDirection(); 
                let horizontalLength = Math.sqrt(view.x * view.x + view.z * view.z); 
                
                if (horizontalLength < 0.001) { 
                    horizontalLength = 0.001; 
                } 

                const forwardX = view.x / horizontalLength; 
                const forwardZ = view.z / horizontalLength; 
                
                const strafeX = forwardZ; 
                const strafeZ = -forwardX; 

                let impulseX = 0; 
                let impulseZ = 0; 

                if (moveForward > 0 && !sneaking) { 
                    impulseX += forwardX * speed; 
                    impulseZ += forwardZ * speed; 
                } else if (moveForward < 0 && !sneaking) { 
                    impulseX += forwardX * (-speed * 0.3); 
                    impulseZ += forwardZ * (-speed * 0.3); 
                } 
                if (moveStrafe !== 0 && !sneaking) { 
                    impulseX += strafeX * (speed * 0.5 * Math.sign(moveStrafe)); 
                    impulseZ += strafeZ * (speed * 0.5 * Math.sign(moveStrafe)); 
                } 
                player.applyImpulse({ 
                    x: impulseX * 1.4, 
                    y: jumpY, 
                    z: impulseZ * 1.4 
                }); 
            } 
        } else {
            wasOnGroundMap.delete(player.id);
        }
    }
}, 1);
