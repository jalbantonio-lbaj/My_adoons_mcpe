import { EquipmentSlot, GameMode, Player, system } from "@minecraft/server";
import { Configs, getConfig } from "../sub/config";
import { configFailedMessage, failedChat } from "../sub/messenger";

const FLIGHT_DURATION = 2 // minutes
export const MAX_FUEL = FLIGHT_DURATION * 60 * 20

const lastJumpPressed = new Map();
const fuel = new Map();
const jetpackRuns = new Map()

function safeGetBlock(dimension, location) {
    try {
        return dimension.getBlock(location);
    } catch {
        return undefined;
    }
}

function offsetLocation(location, dx = 0, dy = 0, dz = 0) {
    return {
        x: location.x + dx,
        y: location.y + dy,
        z: location.z + dz
    };
}

/**
 * @param {Player} player
 */
export function checkDoubleJump(player) {
    if (lastJumpPressed.get(player.id) === undefined) { lastJumpPressed.set(player.id, system.currentTick); return }
    const isDoubleJump = (system.currentTick - lastJumpPressed.get(player.id)) < 13
    lastJumpPressed.set(player.id, system.currentTick)
    if (!isDoubleJump) return;
    if (player.getComponent('equippable').getEquipment(EquipmentSlot.Chest)?.typeId == 'gf_wu:jetpack') activate(player);
}

/*** @param {Player} player*/
function activate(player) {

    if (!getConfig(Configs.Jetpack)) { configFailedMessage(player); return }

    if (player.getGameMode() == GameMode.Creative || jetpackRuns.get(player.id) || safeGetBlock(player.dimension, player.location)?.isLiquid) return;

    const fuel = getFuel(player)

    if (fuel == 0) { failedChat({ translate: 'gf_wu:jetpack.no_fuel' }, player); return }

    const headLocation = player.getHeadLocation();
    const headBlock = safeGetBlock(player.dimension, headLocation);
    const blockAboveHead = safeGetBlock(player.dimension, offsetLocation(headLocation, 0, 1, 0));
    if (!headBlock || !blockAboveHead || (!headBlock.isAir && !headBlock.isLiquid) || (!blockAboveHead.isAir && !blockAboveHead.isLiquid)) {
        player.removeEffect('levitation')
        player.removeEffect('slow_falling')
        jetpackRuns.set(player.id, false)
        return;
    }

    player.applyKnockback({ x: 0, z: 0 }, 0.3)
    player.addEffect('slow_falling', 20000000, { amplifier: 255, showParticles: false })
    player.playAnimation('animation.player.sneaking', { blendOutTime: 0.2, nextState: "a", controller: "a", stopExpression: "query.is_on_ground || query.is_in_water" })
    jetpackRuns.set(player.id, true)

    const equippable = player.getComponent('equippable')

    const run = system.runInterval(() => {
        if (system.currentTick % 2 == 0) updateFuel(player, -1)
        const emptyFuel = getFuel(player) == 0
        const inBlock = safeGetBlock(player.dimension, player.location)
        const headLocation = player.getHeadLocation()
        const inHeadBlock = safeGetBlock(player.dimension, headLocation)
        const headRoom = safeGetBlock(player.dimension, offsetLocation(headLocation, 0, 1, 0))
        if (!inBlock || !inHeadBlock || !headRoom || (!inHeadBlock.isAir && !inHeadBlock.isLiquid) || (!headRoom.isAir && !headRoom.isLiquid)) {
            system.clearRun(run);
            player.removeEffect('levitation')
            player.removeEffect('slow_falling')
            jetpackRuns.set(player.id, false)
            return;
        }
        if (player.isJumping && !emptyFuel) {
            player.addEffect('levitation', 20000000, { amplifier: 6 * getConfig(Configs.JetpackSpeed), showParticles: false });
            return;
        }
        else { player.removeEffect('levitation') }
        const blockBelow = inBlock.below()
        if (!player.isOnGround && blockBelow.isAir && !inBlock.isLiquid && !emptyFuel && equippable.getEquipment(EquipmentSlot.Chest)?.typeId == 'gf_wu:jetpack') return;
        system.clearRun(run);
        player.removeEffect('levitation')
        player.removeEffect('speed')
        jetpackRuns.set(player.id, false)
        const run2 = system.runInterval(() => {
            const standingOnBlock = player.dimension.getBlock(player.location).below()
            if (standingOnBlock.isAir && !player.isOnGround) return;
            player.removeEffect('slow_falling')
            system.clearRun(run2)
        })
    })

}

/*** @param {Player} player*/
export function getFuel(player) {
    if (fuel.get(player.id)) return fuel.get(player.id);
    const value = player.getDynamicProperty('fuel') ?? 0
    fuel.set(player.id, value)
    return value
}

/**
 * @param {Player} player 
 * @param {number} step 
 */
export function updateFuel(player, step) {
    const newAmount = Math.min(Math.max(getFuel(player) + step, 0), MAX_FUEL)
    player.setDynamicProperty('fuel', newAmount)
    fuel.set(player.id, newAmount)
}
