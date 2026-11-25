import { world, system } from "@minecraft/server";
import { isAddonPresent } from "./dependency_checker.js";

/**
 * Dynamic infinity catalyst recipe generator.
 * Pattern changes based on installed optional addons.
 * 
 * Base pattern (Avaritia only): 3 rows with specific items
 * +UC: Adds UC singularities
 * +HM: Adds HM singularities  
 * +AT: Adds AT singularities
 */

// Base pattern - 3 rows with 9, 9, 1 items (rest empty)
const BASE_PATTERN = [
    "ABCDEFGHI",
    "JKLMNOPQR",
    "S        ",
    "         ",
    "         ",
    "         ",
    "         ",
    "         ",
    "         "
];

const BASE_KEY = {
    // Row 1 - Core Avaritia items
    A: "avaritia:diamond_lattice",
    B: "avaritia:crystal_matrix_ingot",
    C: "avaritia:neutron_pile",
    D: "avaritia:neutronium_nugget",
    E: "avaritia:neutronium_ingot",
    F: "avaritia:ultimate_stew",
    G: "avaritia:cosmic_meatballs",
    H: "avaritia:endest_pearl",
    I: "avaritia:record_fragment",
    // Vanilla singularities
    J: "avaritia:singularity_coal",
    K: "avaritia:singularity_copper",
    L: "avaritia:singularity_iron",
    M: "avaritia:singularity_gold",
    N: "avaritia:singularity_lapis",
    O: "avaritia:singularity_redstone",
    P: "avaritia:singularity_diamond",
    Q: "avaritia:singularity_emerald",
    R: "avaritia:singularity_quartz",
    S: "avaritia:singularity_netherite"
};

// Additional singularities per addon
const ADDON_SINGULARITIES = {
    // UtilityCraft singularities
    utilitycraft: [
        "avaritia:singularity_steel",
        "avaritia:singularity_energized_iron",
        "avaritia:singularity_silicon",
        "avaritia:singularity_lead",
        "avaritia:singularity_uranium"
    ],
    // Heavy Machinery singularities
    uc_heavy_machinery: [
        "avaritia:singularity_tin",
        "avaritia:singularity_bronze"
    ],
    // Ascendant Technology singularities
    ascendant_technology: [
        "avaritia:singularity_titanium",
        "avaritia:singularity_tungsten",
        "avaritia:singularity_aetherium"
    ],
    uc_digital_storage: [
        "avaritia:singularity_fluxite",
    ]
};

export function generateInfinityCatalystRecipe() {
    const pattern = BASE_PATTERN.map(row => {
        return row.padEnd(9, " ").split("");
    });
    
    const key = { ...BASE_KEY };
    const addedSingularities = new Set(Object.values(BASE_KEY));
    const allSingularities = [];

    for (const [addonId, singularities] of Object.entries(ADDON_SINGULARITIES)) {
        if (isAddonPresent(addonId)) {
            for (const s of singularities) {
                if (!addedSingularities.has(s)) {
                    allSingularities.push(s);
                    addedSingularities.add(s);
                }
            }
        }
    }

    let singularityIndex = 0;
    let charCode = 84;

    for (let row = 0; row < 9 && singularityIndex < allSingularities.length; row++) {
        for (let col = 0; col < 9 && singularityIndex < allSingularities.length; col++) {
            if (pattern[row][col] === " ") {
                const s = allSingularities[singularityIndex];
                const ch = String.fromCharCode(charCode);
                
                pattern[row][col] = ch;
                key[ch] = s;
                
                singularityIndex++;
                charCode++;

                if (charCode > 90 && charCode < 97) {
                    charCode = 97; 
                }
                
                if (charCode > 122) break;
            }
        }
    }

    const finalPattern = pattern.map(row => row.join(""));

    return {
        pattern: finalPattern,
        key: key,
        result: { item: "avaritia:infinity_catalyst", count: 1 }
    };
}


export let INFINITY_CATALYST_RECIPE = generateInfinityCatalystRecipe();

system.runTimeout(() => {
    INFINITY_CATALYST_RECIPE = generateInfinityCatalystRecipe();
}, 20);