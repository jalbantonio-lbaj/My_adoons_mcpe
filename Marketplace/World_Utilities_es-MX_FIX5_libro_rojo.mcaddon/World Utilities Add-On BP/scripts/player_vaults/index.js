import { GameMode, ItemStack, system, world } from '@minecraft/server';
import { ModalFormData } from '@minecraft/server-ui';
import { Configs, getConfig } from '../sub/config';
import { configFailedMessage } from '../sub/messenger';

const VAULT_VIEW_DISTANCE = 8;
const activeVaultViews = new Map();
const pendingVaultTransitions = new Set();
const VAULT_VISUAL_ID = 'gf_wu:vault_visual';
const VAULT_DUMMY_ID = 'gf_wu:vault_dummy';
const VAULT_INV_ID_DP = 'gf_wu:vault_inv_id';
const VAULT_INV_OWNER_ID_DP = 'gf_wu:vault_inv_owner_id';
const VAULT_STRUCTURE_MARKER_PREFIX = 'gf_wu:vault_structure:';
const pendingPlacedVaultNumbers = new Map();

let initialized = false;

function vaultBlockKey(dimensionId, location) {
    return `${dimensionId}:${location.x},${location.y},${location.z}`;
}

function getPlacedVaultKey(dimensionId, location) {
    return vaultBlockKey(dimensionId, location);
}

function getBlockFaceLocation(block, blockFace) {
    const location = { x: block.location.x, y: block.location.y, z: block.location.z };
    if (blockFace == 'Down') location.y -= 1;
    else if (blockFace == 'Up') location.y += 1;
    else if (blockFace == 'East') location.x += 1;
    else if (blockFace == 'West') location.x -= 1;
    else if (blockFace == 'South') location.z += 1;
    else if (blockFace == 'North') location.z -= 1;
    return location;
}

function getVaultItemNumber(itemStack) {
    const loreLine = itemStack?.getLore()?.find(line => line.includes('Frequency:'));
    const number = Number(loreLine?.replace(/§./g, '').match(/Frequency:\s*(\d+)/)?.[1]);
    if (!Number.isFinite(number)) return;
    return Math.max(0, Math.min(50, Math.floor(number)));
}

function createVaultItem(number) {
    const clampedNumber = Math.max(0, Math.min(50, Math.floor(number)));
    const itemStack = new ItemStack('gf_wu:vault');
    itemStack.setLore([`§r§7Frequency: ${clampedNumber}`]);
    return itemStack;
}

function getVaultViewerCount(blockKey) {
    return Array.from(activeVaultViews.values())
        .filter(viewState => viewState.blockKey === blockKey)
        .length;
}

function shouldCloseVaultVisual(viewState, closingPlayerId) {
    if (!viewState?.blockKey) return true;

    return !Array.from(activeVaultViews.entries())
        .some(([playerId, otherViewState]) => playerId !== closingPlayerId && otherViewState.blockKey === viewState.blockKey);
}

function quoteStructureName(structureName) {
    return `"${structureName}"`;
}

function sanitizePlayerName(playerName) {
    return playerName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function getVaultNumber(block) {
    const high = Number(block.permutation.getState('gf_wu:number_high') ?? 0);
    const low = Number(block.permutation.getState('gf_wu:number_low') ?? 0);
    return Math.min(50, (high * 8) + low);
}

function setVaultNumber(block, number) {
    const clampedNumber = Math.max(0, Math.min(50, Math.floor(number)));
    const high = Math.floor(clampedNumber / 8);
    const low = clampedNumber % 8;
    block.setPermutation(
        block.permutation
            .withState('gf_wu:number_high', high)
            .withState('gf_wu:number_low', low)
    );
}

function getVaultVisualLocation(blockLocation) {
    return {
        x: blockLocation.x + 0.5,
        y: blockLocation.y,
        z: blockLocation.z + 0.5
    };
}

function getVaultStructureLocation(blockLocation) {
    return {
        x: blockLocation.x + 0.5,
        y: blockLocation.y + 0.5,
        z: blockLocation.z + 0.5
    };
}

function getPlayerHeadLocation(player) {
    const headLocation = player.getHeadLocation();
    return {
        x: headLocation.x,
        y: headLocation.y,
        z: headLocation.z
    };
}

function getBlockCenterFromLocation(location) {
    return {
        x: Math.floor(location.x) + 0.5,
        y: 0,
        z: Math.floor(location.z) + 0.5
    };
}

function getVaultSaveLocation(player) {
    return getBlockCenterFromLocation(getPlayerHeadLocation(player));
}

function getCardinalDirectionFromViewDirection(viewDirection) {
    if (Math.abs(viewDirection.x) > Math.abs(viewDirection.z)) {
        return viewDirection.x >= 0 ? 'east' : 'west';
    }

    return viewDirection.z >= 0 ? 'south' : 'north';
}

function getFacingRotation(player) {
    const cardinalDirection = getCardinalDirectionFromViewDirection(player.getViewDirection());
    switch (cardinalDirection) {
        case 'north':
            return 0;
        case 'south':
            return 180;
        case 'east':
            return 90;
        case 'west':
            return 270;
        default:
            return 0;
    }
}

function getVaultVisualsAtBlock(block) {
    return block.dimension.getEntities({
        type: VAULT_VISUAL_ID,
        location: getVaultVisualLocation(block.location),
        maxDistance: 0.8
    });
}

function setVaultVisualOpenState(block, isOpen) {
    let changed = false;
    getVaultVisualsAtBlock(block).forEach(visualEntity => {
        try {
            if (visualEntity.getProperty('gf_wu:open') === isOpen) return;
            visualEntity.setProperty('gf_wu:open', isOpen);
            changed = true;
        } catch { }
    });

    return changed;
}

function syncVaultVisualNumber(block, visualEntity) {
    const number = getVaultNumber(block);
    visualEntity.triggerEvent(`gf_wu:number_${number}`);
}

function getVaultStructureName(playerName, block) {
    return `vault_${sanitizePlayerName(playerName)}_${getVaultNumber(block)}`;
}

function getVaultStructureNameForNumber(playerName, vaultNumber) {
    return `vault_${sanitizePlayerName(playerName)}_${vaultNumber}`;
}

function getVaultDummyName(playerName, vaultNumber) {
    return `Player Vault ${vaultNumber} (${playerName})`;
}

function getVaultStructureMarkerKey(structureName) {
    return `${VAULT_STRUCTURE_MARKER_PREFIX}${structureName}`;
}

function hasVaultStructure(structureName) {
    return world.getDynamicProperty(getVaultStructureMarkerKey(structureName)) === true;
}

function markVaultStructureExists(structureName) {
    world.setDynamicProperty(getVaultStructureMarkerKey(structureName), true);
}

function getBlockFromViewState(viewState) {
    if (!viewState) return;
    try {
        return world.getDimension(viewState.dimensionId).getBlock(viewState.location);
    } catch { }
}

function getVaultDummyById(entityId) {
    if (!entityId) return;
    try {
        const entity = world.getEntity(entityId);
        if (entity?.isValid) return entity;
    } catch { }
}

function getPlayerById(playerId) {
    if (!playerId) return;

    try {
        const entity = world.getEntity(playerId);
        if (entity?.isValid && entity.typeId === 'minecraft:player') return entity;
    } catch { }

    return world.getAllPlayers().find(player => player.id === playerId);
}

function clearPlayerVaultDummyLink(player) {
    try {
        player.setDynamicProperty(VAULT_INV_ID_DP, undefined);
    } catch { }
}

function removeVaultDummy(entityId) {
    const dummy = getVaultDummyById(entityId);
    if (!dummy) return;

    try {
        dummy.remove();
    } catch { }
}

function removeTrackedVaultDummy(viewState) {
    if (!viewState?.dummyId) return;
    removeVaultDummy(viewState.dummyId);
}

function getVaultDummyAtBlock(block) {
    const entities = block.dimension.getEntities({
        type: VAULT_DUMMY_ID,
        location: getVaultStructureLocation(block.location),
        maxDistance: 1
    });
    return entities.find(entity => entity.isValid);
}

function getVaultDummyAtLocation(dimension, location) {
    const entities = dimension.getEntities({
        type: VAULT_DUMMY_ID,
        location,
        maxDistance: 1.5
    });
    return entities.find(entity => entity.isValid);
}

function removeVaultDummiesAtLocation(dimension, location) {
    dimension.getEntities({
        type: VAULT_DUMMY_ID,
        location,
        maxDistance: 1.5
    }).forEach(entity => {
        try {
            entity.remove();
        } catch { }
    });
}

function summonVaultDummy(player) {
    const dummy = player.dimension.spawnEntity(VAULT_DUMMY_ID, getPlayerHeadLocation(player));
    dummy.setDynamicProperty(VAULT_INV_OWNER_ID_DP, player.id);
    player.setDynamicProperty(VAULT_INV_ID_DP, dummy.id);
    return dummy;
}

function syncVaultDummyName(player, block, dummy) {
    try {
        dummy.nameTag = getVaultDummyName(player.name, getVaultNumber(block));
    } catch { }
}

function teleportVaultDummyToPlayerHead(player, dummy) {
    try {
        dummy.teleport(getPlayerHeadLocation(player));
    } catch { }
}

function teleportVaultDummyToBlock(block, dummy) {
    try {
        dummy.teleport(getVaultStructureLocation(block.location));
    } catch { }
}

function saveVaultDummyStructure(player, viewState, onSaved, vaultNumberOverride) {
    if (!player?.isValid) {
        onSaved?.();
        return;
    }

    const dummy = getVaultDummyById(viewState?.dummyId);
    if (!dummy) {
        onSaved?.();
        return;
    }

    const resolvedVaultNumber = vaultNumberOverride ?? viewState?.vaultNumber;
    if (resolvedVaultNumber === undefined) {
        onSaved?.();
        return;
    }

    const structureName = getVaultStructureNameForNumber(player.name, resolvedVaultNumber);
    const location = getVaultSaveLocation(player);

    try {
        dummy.teleport(location);
    } catch { }

    system.runTimeout(() => {
        try {
            dummy.dimension.runCommand(`execute positioned ${location.x} ${location.y} ${location.z} run structure save ${quoteStructureName(structureName)} ~ ~ ~ ~ ~ ~ true disk false`);
            markVaultStructureExists(structureName);
        } catch { }

        removeVaultDummy(dummy.id);
        onSaved?.();
    }, 1);
}

function loadVaultDummyStructure(player, block, onLoaded, vaultNumberOverride) {
    const structureName = vaultNumberOverride === undefined
        ? getVaultStructureName(player.name, block)
        : getVaultStructureNameForNumber(player.name, vaultNumberOverride);
    if (!hasVaultStructure(structureName)) return false;

    const location = getPlayerHeadLocation(player);

    removeVaultDummiesAtLocation(block.dimension, location);

    try {
        block.dimension.runCommand(`structure load ${quoteStructureName(structureName)} ${location.x} ${location.y} ${location.z} 0_degrees none true false`);
    } catch {
        return false;
    }

    system.runTimeout(() => {
        const dummy = getVaultDummyAtLocation(block.dimension, location);
        if (!dummy) {
            onLoaded?.();
            return;
        }

        dummy.setDynamicProperty(VAULT_INV_OWNER_ID_DP, player.id);
        syncVaultDummyName(player, block, dummy);
        player.setDynamicProperty(VAULT_INV_ID_DP, dummy.id);
        onLoaded?.(dummy);
    }, 1);

    return true;
}

function openVaultForNumber(player, block, vaultNumber) {
    const blockKey = vaultBlockKey(block.dimension.id, block.location);
    const nextViewState = {
        blockKey,
        dimensionId: block.dimension.id,
        location: { x: block.location.x, y: block.location.y, z: block.location.z },
        vaultNumber,
        dummyId: undefined,
        loading: false
    };
    activeVaultViews.set(player.id, nextViewState);

    const didStartLoad = loadVaultDummyStructure(player, block, dummy => {
        const latestViewState = activeVaultViews.get(player.id);
        if (!latestViewState || latestViewState.blockKey !== blockKey) {
            if (dummy) removeVaultDummy(dummy.id);
            return;
        }

        if (!dummy) {
            const freshDummy = summonVaultDummy(player);
            syncVaultDummyName(player, block, freshDummy);
            latestViewState.dummyId = freshDummy.id;
            latestViewState.vaultNumber = vaultNumber;
            latestViewState.loading = false;
            activeVaultViews.set(player.id, latestViewState);
            return;
        }

        latestViewState.dummyId = dummy.id;
        latestViewState.vaultNumber = vaultNumber;
        latestViewState.loading = false;
        activeVaultViews.set(player.id, latestViewState);
        teleportVaultDummyToPlayerHead(player, dummy);
    }, vaultNumber);

    if (didStartLoad) {
        nextViewState.loading = true;
        activeVaultViews.set(player.id, nextViewState);
        return;
    }

    const dummy = summonVaultDummy(player);
    syncVaultDummyName(player, block, dummy);
    nextViewState.dummyId = dummy.id;
    nextViewState.vaultNumber = vaultNumber;
    activeVaultViews.set(player.id, nextViewState);
}

function switchVaultNumber(player, block, oldNumber, newNumber) {
    const existingView = activeVaultViews.get(player.id);
    if (!existingView) {
        setVaultNumber(block, newNumber);
        getVaultVisualsAtBlock(block).forEach(visualEntity => {
            syncVaultVisualNumber(block, visualEntity);
        });
        openVaultForNumber(player, block, newNumber);
        return;
    }

    pendingVaultTransitions.add(player.id);
    activeVaultViews.delete(player.id);
    clearPlayerVaultDummyLink(player);

    saveVaultDummyStructure(player, existingView, () => {
        pendingVaultTransitions.delete(player.id);
        if (!player.isValid) return;

        try {
            setVaultNumber(block, newNumber);
            getVaultVisualsAtBlock(block).forEach(visualEntity => {
                syncVaultVisualNumber(block, visualEntity);
            });
        } catch { }

        if (!getConfig(Configs.PlayerVaults) || block.typeId !== 'gf_wu:vault') return;
        openVaultForNumber(player, block, newNumber);
    }, oldNumber);
}

function removeVaultVisualsAtBlock(block) {
    getVaultVisualsAtBlock(block).forEach(entity => entity.remove());
}

function handleVaultBlockRemoved(block) {
    const blockKey = vaultBlockKey(block.dimension.id, block.location);
    removeVaultVisualsAtBlock(block);

    Array.from(activeVaultViews.entries())
        .filter(([, viewState]) => viewState.blockKey === blockKey)
        .forEach(([playerId, viewState]) => {
            const player = world.getAllPlayers().find(currentPlayer => currentPlayer.id === playerId);
            if (player) closeVaultView(player);
            else {
                removeTrackedVaultDummy(viewState);
                activeVaultViews.delete(playerId);
            }
        });
}

function applyVaultVisualInvisibility(visualEntity) {
    try {
        visualEntity.addEffect('invisibility', 1000000, { amplifier: 0, showParticles: false });
    } catch { }
}

function spawnVaultVisual(block, player) {
    removeVaultVisualsAtBlock(block);
    const visualEntity = block.dimension.spawnEntity(VAULT_VISUAL_ID, getVaultVisualLocation(block.location), {
        initialRotation: getFacingRotation(player)
    });
    applyVaultVisualInvisibility(visualEntity);
    syncVaultVisualNumber(block, visualEntity);
}

async function showVaultFrequencyForm(player, block) {
    const blockKey = vaultBlockKey(block.dimension.id, block.location);
    if (getVaultViewerCount(blockKey) > 0) {
        player.sendMessage({ translate: 'gf_wu:player_vaults.already_viewed' });
        return;
    }

    const form = new ModalFormData()
        .title('Vault Frequency')
        .slider('Select a vault number', 0, 50, { defaultValue: getVaultNumber(block), step: 1 });

    const response = await form.show(player);
    if (response.canceled) return;

    const selectedNumber = Number(response.formValues?.[0] ?? 0);
    try {
        const hadActiveView = activeVaultViews.get(player.id)?.blockKey === blockKey;
        const previousNumber = getVaultNumber(block);

        if (hadActiveView && selectedNumber !== previousNumber) {
            switchVaultNumber(player, block, previousNumber, selectedNumber);
            return;
        }

        setVaultNumber(block, selectedNumber);
        getVaultVisualsAtBlock(block).forEach(visualEntity => {
            syncVaultVisualNumber(block, visualEntity);
        });
        const currentDummy = getVaultDummyById(activeVaultViews.get(player.id)?.dummyId);
        if (currentDummy) syncVaultDummyName(player, block, currentDummy);

        if (hadActiveView) {
            closeVaultView(player);
            system.runTimeout(() => {
                if (!player.isValid || !getConfig(Configs.PlayerVaults)) return;
                if (block.typeId !== 'gf_wu:vault') return;
                ensureVaultView(player, block);
            }, 1);
        }
    } catch { }
}

function closeVaultView(player, onClosed) {
    const viewState = activeVaultViews.get(player.id);
    if (!viewState) {
        onClosed?.();
        return;
    }

    const block = getBlockFromViewState(viewState);
    if (block?.typeId === 'gf_wu:vault' && shouldCloseVaultVisual(viewState, player.id)) {
        if (setVaultVisualOpenState(block, false)) {
            player.playSound('random.enderchestclosed', { location: getVaultVisualLocation(block.location) });
        }
    }

    activeVaultViews.delete(player.id);
    clearPlayerVaultDummyLink(player);
    pendingVaultTransitions.add(player.id);

    const finishClosing = () => {
        pendingVaultTransitions.delete(player.id);
        onClosed?.();
    };

    if (!viewState.loading) {
        saveVaultDummyStructure(player, viewState, finishClosing);
        return;
    }

    removeTrackedVaultDummy(viewState);
    system.run(finishClosing);
}

function ensureVaultView(player, block) {
    if (!block || block.typeId !== 'gf_wu:vault') return;

    const blockKey = vaultBlockKey(block.dimension.id, block.location);
    let existingView = activeVaultViews.get(player.id);
    const trackedDummyId = player.getDynamicProperty(VAULT_INV_ID_DP);

    if (existingView && existingView.blockKey !== blockKey) {
        closeVaultView(player, () => {
            if (!player.isValid || !getConfig(Configs.PlayerVaults)) return;
            if (block.typeId !== 'gf_wu:vault') return;
            ensureVaultView(player, block);
        });
        return;
    }

    if (!existingView) {
        openVaultForNumber(player, block, getVaultNumber(block));
        return;
    }

    if (existingView.loading) return;

    let dummy = getVaultDummyById(existingView.dummyId);
    if (!dummy && trackedDummyId !== existingView.dummyId) dummy = getVaultDummyById(trackedDummyId);
    if (!dummy) {
        activeVaultViews.delete(player.id);
        openVaultForNumber(player, block, getVaultNumber(block));
        return;
    }

    if (dummy) {
        if (trackedDummyId !== dummy.id) player.setDynamicProperty(VAULT_INV_ID_DP, dummy.id);
        if (dummy.getDynamicProperty(VAULT_INV_OWNER_ID_DP) !== player.id) dummy.setDynamicProperty(VAULT_INV_OWNER_ID_DP, player.id);
        teleportVaultDummyToPlayerHead(player, dummy);
    }
}

function registerPlayerVaultEvents() {
    world.afterEvents.entitySpawn.subscribe(event => {
        const { entity } = event;
        if (entity.typeId !== VAULT_DUMMY_ID) return;

        const ownerId = entity.getDynamicProperty(VAULT_INV_OWNER_ID_DP);
        const owner = getPlayerById(ownerId);
        if (!owner?.isValid) return;

        teleportVaultDummyToPlayerHead(owner, entity);
    });

    world.beforeEvents.playerInteractWithBlock.subscribe(event => {
        const { block, blockFace, itemStack, isFirstEvent, player } = event;
        if (!isFirstEvent || itemStack?.typeId !== 'gf_wu:vault') return;
        if (!getConfig(Configs.PlayerVaults)) {
            event.cancel = true;
            system.run(() => configFailedMessage(player));
            return;
        }

        const vaultNumber = getVaultItemNumber(itemStack);
        if (vaultNumber === undefined) return;

        const placementKey = getPlacedVaultKey(block.dimension.id, getBlockFaceLocation(block, blockFace));
        pendingPlacedVaultNumbers.set(placementKey, vaultNumber);
        system.runTimeout(() => {
            pendingPlacedVaultNumbers.delete(placementKey);
        }, 40);
    });

    world.beforeEvents.playerInteractWithBlock.subscribe(event => {
        const { block, player, isFirstEvent } = event;
        if (!isFirstEvent || block.typeId !== 'gf_wu:vault') return;
        if (!getConfig(Configs.PlayerVaults)) {
            event.cancel = true;
            system.run(() => configFailedMessage(player));
            return;
        }
        if (!player.isSneaking) return;

        event.cancel = true;
        system.run(() => {
            showVaultFrequencyForm(player, block);
        });
    });

    world.beforeEvents.playerBreakBlock.subscribe(event => {
        const { block, player } = event;
        if (block.typeId !== 'gf_wu:vault') return;

        const vaultNumber = getVaultNumber(block);
        event.cancel = true;

        system.run(() => {
            handleVaultBlockRemoved(block);
            block.setType('minecraft:air');

            if (player.getGameMode() === GameMode.Creative) return;
            block.dimension.spawnItem(createVaultItem(vaultNumber), {
                x: block.location.x + 0.5,
                y: block.location.y + 0.5,
                z: block.location.z + 0.5
            });
        });
    });

    world.beforeEvents.playerInteractWithEntity.subscribe(event => {
        const { target, player } = event;
        if (target.typeId !== VAULT_DUMMY_ID) return;
        if (!getConfig(Configs.PlayerVaults)) {
            event.cancel = true;
            system.run(() => configFailedMessage(player));
            return;
        }

        const ownerId = target.getDynamicProperty(VAULT_INV_OWNER_ID_DP);
        if (ownerId !== player.id) return;

        const viewState = activeVaultViews.get(player.id);
        const block = getBlockFromViewState(viewState);
        if (!block || block.typeId !== 'gf_wu:vault') return;

        system.run(() => {
            if (setVaultVisualOpenState(block, true)) {
                player.playSound('random.enderchestopen', { location: getVaultVisualLocation(block.location) });
            }
        });
    });

    world.afterEvents.entityHitEntity.subscribe(event => {
        const { hitEntity, damagingEntity } = event;
        if (hitEntity.typeId !== VAULT_DUMMY_ID || damagingEntity?.typeId !== 'minecraft:player') return;
        if (!getConfig(Configs.PlayerVaults)) {
            configFailedMessage(damagingEntity);
            return;
        }

        damagingEntity.sendMessage({ translate: 'gf_wu:player_vaults.break_hint' });
        damagingEntity.playSound('note.bass', {
            pitch: 1,
            volume: 0.8,
            location: damagingEntity.location
        });
    });

    world.afterEvents.playerPlaceBlock.subscribe(event => {
        if (event.block.typeId !== 'gf_wu:vault') return;
        const placementKey = getPlacedVaultKey(event.block.dimension.id, event.block.location);
        const vaultNumber = pendingPlacedVaultNumbers.get(placementKey);
        pendingPlacedVaultNumbers.delete(placementKey);
        if (vaultNumber !== undefined) setVaultNumber(event.block, vaultNumber);
        spawnVaultVisual(event.block, event.player);
    });

    world.afterEvents.playerBreakBlock.subscribe(event => {
        if (event.brokenBlockPermutation.type.id !== 'gf_wu:vault') return;
        handleVaultBlockRemoved(event.block);
    });
}

export function initializePlayerVaults(loreMap) {
    loreMap['gf_wu:vault'] = loreMap['gf_wu:vault'] ?? ['§r§7Look at the vault to test the player vault flow.'];
    if (initialized) return;
    initialized = true;
    registerPlayerVaultEvents();
}

export function updatePlayerVaultView(player) {
    if (pendingVaultTransitions.has(player.id)) return;

    let viewBlock;
    try {
        viewBlock = player.getBlockFromViewDirection({ maxDistance: VAULT_VIEW_DISTANCE })?.block;
    } catch { }

    if (player.isSneaking) {
        if (activeVaultViews.has(player.id)) closeVaultView(player);
        return;
    }

    if (getConfig(Configs.PlayerVaults) && viewBlock?.typeId === 'gf_wu:vault') ensureVaultView(player, viewBlock);
    else if (activeVaultViews.has(player.id)) closeVaultView(player);
}

export function cleanupPlayerVaultViews(activePlayerIds) {
    Array.from(activeVaultViews.keys())
        .filter(playerId => !activePlayerIds.has(playerId))
        .forEach(playerId => {
            const viewState = activeVaultViews.get(playerId);
            removeTrackedVaultDummy(viewState);
            activeVaultViews.delete(playerId);
        });

    Array.from(pendingVaultTransitions)
        .filter(playerId => !activePlayerIds.has(playerId))
        .forEach(playerId => pendingVaultTransitions.delete(playerId));
}

export function cleanupOrphanedVaultVisuals(dimensions) {
    dimensions.forEach(dimension => {
        dimension.getEntities({ type: VAULT_VISUAL_ID }).forEach(visualEntity => {
            try {
                const block = dimension.getBlock(visualEntity.location);
                if (!block) {
                    return;
                }
                if (block?.typeId === 'gf_wu:vault') { applyVaultVisualInvisibility(visualEntity); return; }
                visualEntity.remove();
            } catch { }
        });
    });
}

export function isPlayerVaultEntityType(typeId) {
    return typeId === 'gf_wu:vault_dummy' || typeId === 'gf_wu:vault_visual';
}
