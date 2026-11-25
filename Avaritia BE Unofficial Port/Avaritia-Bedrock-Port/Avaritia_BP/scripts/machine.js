import { world, system } from '@minecraft/server';
import { 
    SCHEDULER_PROFILES, 
    DEFAULT_SCHEDULER_PROFILE, 
    GROUP_COUNT, 
    TICK_GROUP_PROPERTY_ID, 
    OPEN_UI_PLAYERS_PROPERTY_ID 
} from "./constants.js";

const OPEN_INTERVAL = 4;
const GROUP_COUNT_VAL = GROUP_COUNT;
const DEFAULT_SCHEDULER_PROFILE_VAL = DEFAULT_SCHEDULER_PROFILE;
const SCHEDULER_PROFILES_VAL = SCHEDULER_PROFILES;

let schedulerProfileCache;
let globalTickCounter = 0;
let worldLoaded = false;

system.runInterval(() => {
    globalTickCounter++;
}, 1);

system.beforeEvents.startup.subscribe(() => {
    worldLoaded = true;
    globalThis.avaritiaWorldLoaded = true;
    globalThis.avaritiaGlobalTick = globalTickCounter;
});

export function getHolderContainer(entity) {
    try {
        const inv = entity.getComponent("inventory") || entity.getComponent("minecraft:inventory");
        if (inv && inv.container) return inv.container;
    } catch (e) {}
    return null;
}

export function getDP(entity, key, fallback = null) {
    try { return entity.getDynamicProperty(key); } catch (_) { return fallback; }
}

export function setDP(entity, key, value) {
    try { entity.setDynamicProperty(key, value); } catch (_) {}
}

export function cleanupHolderEntity(dim, blockLoc, tag) {
    const fx = Math.floor(blockLoc.x), fy = Math.floor(blockLoc.y), fz = Math.floor(blockLoc.z);
    for (const e of dim.getEntities({ tags: [tag] })) {
        const bl = getDP(e, "blockLoc");
        if (bl && bl.x === fx && bl.y === fy && bl.z === fz) e.remove();
    }
}

function normalizeProfile(profile) {
    const value = String(profile ?? "").trim().toLowerCase();
    return SCHEDULER_PROFILES_VAL[value] ? value : DEFAULT_SCHEDULER_PROFILE_VAL;
}

function getSchedulerProfile() {
    if (!schedulerProfileCache) {
        schedulerProfileCache = normalizeProfile(world.getDynamicProperty("avaritia:scheduler_profile")) ?? DEFAULT_SCHEDULER_PROFILE_VAL;
    }
    return schedulerProfileCache;
}

function getSchedulerProfileConfig() {
    return SCHEDULER_PROFILES_VAL[getSchedulerProfile()];
}

function normalizeGroup(group) {
    const value = Math.floor(Number(group) || 0);
    return value >= 1 && value <= GROUP_COUNT_VAL ? value : 0;
}

function normalizeCounts(counts) {
    const normalized = Array.isArray(counts) ? counts : [];
    return Array.from({ length: 5 }, (_, index) => {
        const count = Math.floor(Number(normalized[index]) || 0);
        return Math.max(0, count);
    });
}

function getGroupCounts() {
    try {
        return normalizeCounts(JSON.parse(world.getDynamicProperty("avaritia:tick_group_counts") ?? "[]"));
    } catch {
        return [0, 0, 0, 0, 0];
    }
}

function setGroupCounts(counts) {
    const normalizedCounts = normalizeCounts(counts);
    world.setDynamicProperty("avaritia:tick_group_counts", JSON.stringify(normalizedCounts));
    return normalizedCounts;
}

function updateGroupCount(group, delta) {
    const normalizedGroup = normalizeGroup(group);
    if (normalizedGroup === 0) return getGroupCounts();
    const counts = getGroupCounts();
    const index = normalizedGroup - 1;
    counts[index] = Math.max(0, counts[index] + Math.floor(Number(delta) || 0));
    return setGroupCounts(counts);
}

function getLeastUsedGroup() {
    const counts = getGroupCounts();
    let group = 1;
    let count = counts[0];
    for (let index = 1; index < counts.length; index++) {
        if (counts[index] >= count) continue;
        group = index + 1;
        count = counts[index];
    }
    return group;
}

function getTickGroup(entity) {
    try {
        return normalizeGroup(entity?.getProperty?.("avaritia:tick_group"));
    } catch {
        return 0;
    }
}

function setTickGroup(entity, group) {
    const normalizedGroup = normalizeGroup(group);
    try {
        entity?.setProperty?.("avaritia:tick_group", normalizedGroup);
    } catch {
        return 0;
    }
    return normalizedGroup;
}

function assignTickGroup(entity) {
    const currentGroup = getTickGroup(entity);
    if (currentGroup !== 0) return currentGroup;
    const group = getLeastUsedGroup();
    const assignedGroup = setTickGroup(entity, group);
    if (assignedGroup !== 0) {
        updateGroupCount(assignedGroup, 1);
    }
    return assignedGroup;
}

function releaseTickGroup(entity) {
    const group = getTickGroup(entity);
    if (group === 0) return 0;
    updateGroupCount(group, -1);
    setTickGroup(entity, 0);
    return group;
}

function hasOpenUI(entity) {
    try {
        return Number(entity?.getProperty?.("avaritia:open_ui_players") ?? 0) > 0;
    } catch {
        return false;
    }
}

function shouldProcessMachine(entity) {
    if (!worldLoaded) return false;
    const tick = globalThis.avaritiaGlobalTick ?? 0;
    if (hasOpenUI(entity)) {
        return tick % 4 === 0;
    }
    const group = assignTickGroup(entity);
    if (group === 0) return false;
    const { closedInterval } = SCHEDULER_PROFILES_VAL[getSchedulerProfile()];
    const step = closedInterval / 5;
    const phase = group === 5 ? 0 : group * step;
    return tick % closedInterval === phase;
}

export function iterateHolders(tag, callback) {
    if (!worldLoaded) return;
    for (const dimId of DIMS) {
        let dim;
        try { dim = world.getDimension(dimId); } catch (e) { continue; }
        let holders;
        try { holders = dim.getEntities({ tags: [tag] }); } catch (e) { continue; }
        for (const e of holders) {
            if (shouldProcessMachine(e)) {
                callback(e, dim);
            }
        }
    }
}

export function setAvaritiaWorldLoaded(loaded) {
    worldLoaded = loaded;
}

export function setAvaritiaGlobalTick(tick) {
    globalThis.avaritiaGlobalTick = tick;
}

export { assignTickGroup, releaseTickGroup, hasOpenUI, shouldProcessMachine, getTickGroup, setTickGroup, getLeastUsedGroup, updateGroupCount, getGroupCounts, setGroupCounts, getSchedulerProfile, getSchedulerProfileConfig, normalizeProfile, normalizeGroup, normalizeCounts };

export class Machine {
    constructor(block, options = {}) {
        this.valid = false;
        this.entity = this.tryGetEntityFromBlock(block);
        if (!this.entity) return;
        
        this.shouldUpdateUI = hasOpenUI(this.entity);
        if (!options.ignoreTick && !shouldProcessMachine(this.entity)) return;
        
        this.dimension = block.dimension;
        this.block = block;
        
        const inventory = this.entity.getComponent("inventory");
        if (!inventory) return;
        this.container = inventory.container;
        
        this.baseRate = options.rate || 1;
        this.processingInterval = getProcessingInterval(this.entity);
        this.rate = (options.rate || 1) * this.processingInterval;
        this.valid = true;
    }

    tryGetEntityFromBlock(block) {
        const entities = block.dimension.getEntities({
            location: block.center(),
            maxDistance: 1,
            tags: ["avaritia:holder"]
        });
        return entities[0] || null;
    }
}

import { 
    hasOpenUI, 
    shouldProcessMachine, 
    getProcessingInterval,
    assignTickGroup,
    releaseTickGroup
} from "./helperFunctions.js";