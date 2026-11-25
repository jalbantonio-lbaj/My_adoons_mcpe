import { world, system } from "@minecraft/server";

// Avaritia addon metadata
export const addonData = {
    name: "Avaritia",
    author: "QuantumMaster",
    identifier: "avaritia",
    version: "1.0.0",
    optionalAddons: {
        "utilitycraft": {
            name: "UtilityCraft",
            version: "3.5.0",
            description: "UtilityCraft recommended for resource production and additional recipes in the machines."
        }
    }
};

// Registry of detected addons
export const detectedAddons = new Map();

let isUtilityCraftPresent = false;
let utilityCraftVersion = null;

/**
 * Check if an optional addon is present
 */
export function isAddonPresent(identifier) {
    if (typeof identifier !== 'string' || identifier.length === 0) return false;
    return detectedAddons.has(identifier);
}


export function refreshUtilityCraftState() {
    const utilityCraft = detectedAddons.get("utilitycraft") ?? null;
    isUtilityCraftPresent = Boolean(utilityCraft);
    utilityCraftVersion = utilityCraft?.version ?? null;
    return utilityCraft ?? null;
}

// Emit addon info on world load (silent)
world.afterEvents.worldLoad.subscribe(() => {
    system.sendScriptEvent("avaritia:addon_broadcast", JSON.stringify(addonData));
    
    // Check for addons after a short delay
    system.runTimeout(() => {
        refreshUtilityCraftState();
    }, 300);
});

// Listen for BOTH broadcast formats:
// 1. Avaritia's own: "avaritia:addon_broadcast"
// 2. DoriosAPI standard: "dorios:dependency_checker"
system.afterEvents.scriptEventReceive.subscribe(({ id, message: raw }) => {
    if (id !== "avaritia:addon_broadcast" && id !== "dorios:dependency_checker") return;
    
    let data;
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch { return; }
    
    if (!data.identifier || detectedAddons.has(data.identifier)) return;
    detectedAddons.set(data.identifier, data);
    
    // If UtilityCraft just registered, refresh state
    if (data.identifier === "utilitycraft") {
        system.runTimeout(() => {
            refreshUtilityCraftState();
        }, 10);
    }
});