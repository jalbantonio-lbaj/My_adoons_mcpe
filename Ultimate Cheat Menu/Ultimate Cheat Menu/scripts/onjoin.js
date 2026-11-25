import { world, system } from "@minecraft/server";
import { getOreHighlighterState } from "./orehighlighter.js";
import { getPlayerTrackerState } from "./playertracker.js";
import { getPlayerAlertState } from "./playersalert.js";
import { getMagnetState, restartMagnet } from "./magnet.js";
import { getOthersState, reapplyOthersEffects } from "./others.js";
import { getTreecapState } from "./treecapitator.js";
import { getVeinState } from "./veinminer.js";
import { getCropHarvesterState } from "./cropharvester.js";
import { getAutoSmeltState } from "./autosmelt.js";
import { getDurabilityAlertState } from "./durabilityalert.js";
import { getDangerRadarState } from "./dangerradar.js";

world.afterEvents.playerSpawn.subscribe((ev) => {
    if (!ev.initialSpawn) return;
    const player = ev.player;

    system.runTimeout(() => {
        getOreHighlighterState(player);
        getPlayerTrackerState(player);
        getPlayerAlertState(player);
        getMagnetState(player);
        getOthersState(player);
        getTreecapState(player);
        getVeinState(player);
        getCropHarvesterState(player);
        getAutoSmeltState(player);
        getDurabilityAlertState(player);
        getDangerRadarState(player);

        reapplyOthersEffects(player);

        const magnet = getMagnetState(player);
        if (magnet.active) restartMagnet(player);
    }, 40);
});
