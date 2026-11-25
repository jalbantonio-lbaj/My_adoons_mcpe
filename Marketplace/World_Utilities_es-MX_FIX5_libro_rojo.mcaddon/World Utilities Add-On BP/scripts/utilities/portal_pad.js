import { Block, Player } from '@minecraft/server'
import { configFailedMessage, failed } from '../sub/messenger';
import { Configs, getConfig } from '../sub/config';

function isPortalPadPassThrough(block) {
    if (!block) return false;
    return (
        block.isAir ||
        block.typeId.includes("minecraft:light_block_") ||
        block.typeId.endsWith("_carpet") ||
        block.typeId.endsWith("_slab")
    );
}

function getPortalPadSurfaceOffset(block) {
    if (!block) return 0;
    if (block.typeId.endsWith("_slab")) return 0.5;
    if (block.typeId.endsWith("_carpet")) return 0.1;
    return 0;
}

export function findPortalPadUnder(block) {
    if (!block) return undefined;
    if (block.typeId == 'gf_wu:portal_pad') return block;
    if (isPortalPadPassThrough(block)) {
        const below = block.below();
        if (below?.typeId == 'gf_wu:portal_pad') return below;
    }
    return undefined;
}

/**
 * @param {Player} player 
 * @param {Block} block 
 * @param {1|-1} step
 */
function portalTriggered(player, block, step) {

    if (!getConfig(Configs.PortalPad)) { configFailedMessage(player); return }

    const otherBlock = block.dimension.getBlockFromRay(step == 1 ? block.above(1) : block.below(1), { x: 0, z: 0, y: step }, { maxDistance: 100, includeTypes: ['gf_wu:portal_pad'] })?.block

    if (!otherBlock) { failed({ translate: 'gf_wu:portal_pad.none_found' }, player); return }

    const standingBlock = otherBlock.above(1);
    const headroomBlock = standingBlock?.above();

    if (!isPortalPadPassThrough(standingBlock) || !isPortalPadPassThrough(headroomBlock)) {
        failed({ translate: 'gf_wu:portal_pad.not_safe' }, player);
        return;
    }

    const teleportLocation = {
        x: otherBlock.location.x + 0.5,
        y: otherBlock.location.y + 1 + getPortalPadSurfaceOffset(standingBlock),
        z: otherBlock.location.z + 0.5
    };

    player.teleport(teleportLocation)
    player.dimension.spawnParticle('minecraft:camera_shoot_explosion', otherBlock.above(2))

}

export { getPortalPadSurfaceOffset, isPortalPadPassThrough, portalTriggered }
