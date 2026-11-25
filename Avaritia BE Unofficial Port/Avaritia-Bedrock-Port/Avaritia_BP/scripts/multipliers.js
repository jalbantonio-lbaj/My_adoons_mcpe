import { world, system } from "@minecraft/server";
import { isAddonPresent } from "./dependency_checker.js";

/**
 * Multiplier configuration for optional addons.
 * Format: "addon_identifier": multiplier_value
 * 
 * Addon identifiers (from their manifest.json or DoriosAPI config):
 * - UtilityCraft: "utilitycraft" (from its dependency broadcasts)
 * - Heavy Machinery: "uc_heavy_machinery" (from DoriosAPI config - checked by Ascendant Tech)
 * - Ascendant Technology: "uc_ascendant_technology" (from its manifest)
 */
export const ADDON_MULTIPLIERS = {
    "utilitycraft": 4.0,
    "uc_heavy_machinery": 4.0,
    "uc_ascendant_technology": 5.0,
    "uc_tiered_machines": 1.5,
    "uc_digital_storage": 1,
    "advanced_chemistry": 1.5,
};

/**
 * Base multiplier when no addons are present
 */
export const DEFAULT_MULTIPLIER = 1.0;

/**
 * Get the active multiplier by SUMMING all detected addon multipliers.
 * Total = sum of all present addon multipliers (or 1.0 if none)
 */

export function getSingularityMultiplier() {
    let total = 0;
    let foundAny = false;
    
    for (const [addonId, multiplier] of Object.entries(ADDON_MULTIPLIERS)) {
        if (isAddonPresent(addonId)) {
            total += multiplier;
            foundAny = true;
        }
    }
    
    return foundAny ? total : DEFAULT_MULTIPLIER;
}

/**
 * Get all active multipliers for debugging/display
 */
export function getActiveMultipliers() {
    const active = {};
    for (const [addonId, multiplier] of Object.entries(ADDON_MULTIPLIERS)) {
        if (isAddonPresent(addonId)) {
            active[addonId] = multiplier;
        }
    }
    return active;
}