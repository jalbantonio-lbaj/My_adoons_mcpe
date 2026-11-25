import { ActionFormData, ModalFormData } from '@minecraft/server-ui';
import { GameMode, ItemStack, MolangVariableMap, Player, system, world } from '@minecraft/server';
import { Configs, getConfig, showCreativeMenu } from './config';
import { configFailedMessage, failed, success } from './messenger';
import { highlightChunks, safeGiveItem } from './util';
import { EXPERIENCEBOTTLE_LORE, EXPERIENCEEXTRACTOR_STAT, SCOREBOARD_ID, vectorEquals } from '../main';

const pages = [
    'help',
    'guide_book',
    'controller',
    'vein_miner',
    'tree_capitator',
    'miners_essentials',
    'chunk_borders',
    'bridge_builder',
    'magnet',
    'fast_place',
    'explosive_pickaxe',
    'multiblock_pickaxe',
    'quarry_pickaxe',
    'end_frame_breaker',
    'omni_tool',
    'spawner_wrench',
    'harvester_hoe',
    'excavator_shovel',
    'deep_digger_shovel',
    'safari_net',
    'stash_snatcher',
    'ocean_rider',
    'player_vaults',
    'miners_lantern',
    'death_waypoint',
    'void_chest',
    'homes',
    'lock',
    'experience_extractor',
    'chunk_minion',
    'disenchanter',
    'portal_pad',
    'jetpack',
    'grab_bag',
    'scuba_tank',
    'warps',
    'amethyst_breaker',
    'suction_hopper',
    'tanning_rack',
    'watering_can'
]

const noRecipes = [
    'help',
    'death_waypoint'
]

/** * @param {Player} player */
function showMainMenu(player) {

    const form = new ActionFormData()
        .title({ translate: 'gf_wu:guide.name' })
        .body({
            rawtext: [
                { translate: "gf_wu:info.header", with: ["\n"], },
                { text: "§r\n", },
                { translate: "gf_wu:info.description", with: ["\n"], }
            ]
        })

    player.playSound('item.book.page_turn')

    form.button({ translate: 'gf_wu:help.button' }, 'textures/gamefam/world_utils/help_icon')
        .button({ translate: 'gf_wu:guide_book.button' }, 'textures/gamefam/world_utils/items/guide_book')
        .button({ translate: 'gf_wu:controller.button' }, 'textures/gamefam/world_utils/items/controller')
        .button({ translate: 'gf_wu:vein_miner.button' }, 'textures/gamefam/world_utils/items/vein_miner')
        .button({ translate: 'gf_wu:tree_capitator.button' }, 'textures/gamefam/world_utils/items/tree_capitator')
        .button({ translate: 'gf_wu:miners_essentials.button' }, 'textures/gamefam/world_utils/items/miners_essentials')
        .button({ translate: 'gf_wu:chunk_borders.button' }, 'textures/gamefam/world_utils/items/chunk_borders')
        .button({ translate: 'gf_wu:bridge_builder.button' }, 'textures/gamefam/world_utils/items/bridge_builder')
        .button({ translate: 'gf_wu:magnet.button' }, 'textures/gamefam/world_utils/items/magnet.png')
        .button({ translate: 'gf_wu:fast_place.button' }, 'textures/gamefam/world_utils/items/fast_place')
        .button({ translate: 'gf_wu:explosive_pickaxe.button' }, 'textures/gamefam/world_utils/items/explosive_pickaxe')
        .button({ translate: 'gf_wu:multiblock_pickaxe.button' }, 'textures/gamefam/world_utils/items/multiblock_pickaxe')
        .button({ translate: 'gf_wu:quarry_pickaxe.button' }, 'textures/gamefam/world_utils/items/quarry_pickaxe')
        .button({ translate: 'gf_wu:end_frame_breaker.button' }, 'textures/gamefam/world_utils/items/end_frame_breaker')
        .button({ translate: 'gf_wu:omni_tool.button' }, 'textures/gamefam/world_utils/items/omni_tool')
        .button({ translate: 'gf_wu:spawner_wrench.button' }, 'textures/gamefam/world_utils/items/spawner_wrench')
        .button({ translate: 'gf_wu:harvester_hoe.button' }, 'textures/gamefam/world_utils/items/harvester_hoe')
        .button({ translate: 'gf_wu:excavator_shovel.button' }, 'textures/gamefam/world_utils/items/excavator_shovel')
        .button({ translate: 'gf_wu:deep_digger_shovel.button' }, 'textures/gamefam/world_utils/items/deep_digger_shovel')
        .button({ translate: 'gf_wu:safari_net.button' }, 'textures/gamefam/world_utils/items/safari_net')
        .button({ translate: 'gf_wu:stash_snatcher.button' }, 'textures/gamefam/world_utils/stash_snatcher/stash_snatcher1')
        .button({ translate: 'gf_wu:ocean_rider.button' }, 'textures/gamefam/world_utils/ocean_rider')
        .button({ translate: 'gf_wu:player_vaults.button' }, 'textures/gamefam/world_utils/items/vault')
        .button({ translate: 'gf_wu:miners_lantern.button' }, 'textures/gamefam/world_utils/items/miners_lantern')
        .button({ translate: 'gf_wu:death_waypoint.button' }, 'textures/gamefam/world_utils/items/death_waypoint')
        .button({ translate: 'gf_wu:void_chest.button' }, 'textures/gamefam/world_utils/items/void_chest')
        .button({ translate: 'gf_wu:homes.button' }, 'textures/gamefam/world_utils/items/homes')
        .button({ translate: 'gf_wu:lock.button' }, 'textures/gamefam/world_utils/items/lock')
        .button({ translate: 'gf_wu:experience_extractor.button' }, 'textures/gamefam/world_utils/items/experience_extractor')
        .button({ translate: 'gf_wu:chunk_minion.button' }, 'textures/gamefam/world_utils/items/chunk_minion')
        .button({ translate: 'gf_wu:disenchanter.button' }, 'textures/gamefam/world_utils/items/disenchanter')
        .button({ translate: 'gf_wu:portal_pad.button' }, 'textures/gamefam/world_utils/items/portal_pad')
        .button({ translate: 'gf_wu:jetpack.button' }, 'textures/gamefam/world_utils/items/jetpack')
        .button({ translate: 'gf_wu:grab_bag.button' }, 'textures/gamefam/world_utils/items/grab_bag')
        .button({ translate: 'gf_wu:scuba_tank.button' }, 'textures/gamefam/world_utils/items/scuba_tank')
        .button({ translate: 'gf_wu:warps.button' }, 'textures/gamefam/world_utils/items/warp')
        .button({ translate: 'gf_wu:amethyst_breaker.button' }, 'textures/gamefam/world_utils/items/amethyst_breaker')
        .button({ translate: 'gf_wu:suction_hopper.button' }, 'textures/gamefam/world_utils/items/suction_hopper')
        .button({ translate: 'gf_wu:tanning_rack.button' }, 'textures/gamefam/world_utils/items/tanning_rack')
        .button({ translate: 'gf_wu:watering_can.button' }, 'textures/gamefam/world_utils/items/watering_can')
        .button({ translate: 'gf_wu:guide_exit' })
    form.show(player).then(response => {
        if (!response.canceled && response.selection <= pages.length) {
            showPage(player, pages[response.selection])
        }
        else player.playSound('item.book.put')
    })
}

/** * @param {Player} player */
function showUpdateMenu(player) {

    const form = new ActionFormData()
        .title({ translate: 'gf_wu:update_book.name' })
        .body({
            rawtext: [
                { translate: "gf_wu:update_book.thanks", with: ["\n"], },
                { text: "§r\n", },
                { text: "§r\n", },
                { translate: "gf_wu:update_book.commit", with: ["\n"], },
                { text: "§r\n", },
                { text: "§r\n", },
                { translate: "gf_wu:update_book.main", with: ["\n"], },
                { text: "§r\n", },
                { text: "§r\n", },
                { translate: "gf_wu:update_book.cta", with: ["\n"], },
                { text: "§r\n", },
                { text: "§r\n", },
                { translate: "gf_wu:update_book.stars", with: ["\n"], },
                { text: "§r\n ", }
            ]
        })

    player.playSound('item.book.page_turn')

    form.button({ translate: 'gf_wu:update_book.exit' })

    form.show(player).then(response => {
        if (!response.canceled) { }
        else player.playSound('item.book.put')
    })
}

/** * @param {Player} player */
function showPage(player, string, fromupdate = false) {
    if (string === undefined) return;
    player.playSound('item.book.page_turn');
    const form = new ActionFormData()
        .title({ translate: 'gf_wu:guide.name' })

    if (noRecipes.includes(string)) {
        form.body({
            rawtext: [
                { translate: `gf_wu:${string}.header`, with: ["\n"], },
                { text: "§r\n", },
                { translate: `gf_wu:${string}.description`, with: ["\n"], },
                { text: "§r\n", }
            ]
        })
    } else form.body({
        rawtext: [
            { translate: `gf_wu:${string}.header`, with: ["\n"], },
            { text: "§r\n", },
            { translate: `gf_wu:${string}.description`, with: ["\n"], },
            { text: "§r\n", },
            { translate: `gf_wu:info.recipe`, with: ["\n"], },
            { text: "§r\n", },
            { translate: `gf_wu:${string}.recipe_ingredients`, with: ["\n"], },
            { text: "§r\n", },
            { translate: `gf_wu:${string}.recipe_table`, with: ["\n"], },
            { text: "§r\n", }
        ]
    })
    form.button({ translate: `gf_wu:guide_back` })
    form.show(player).then(() => {
        if (!fromupdate) showMainMenu(player)
        else showUpdateMenu(player)
        player.playSound('item.book.page_turn')
    })
}

/** * @param {Player} player */
function showHomeMenu(player) {

    if (getConfig(Configs.MaxHomes) === 0) { configFailedMessage(player); return }

    const form = new ActionFormData()
        .title({ translate: 'gf_wu:home_menu.name' })

    const homeData = world.getDynamicProperty('gf_wu:home_' + player.id)?.split('|').filter(x => x != '') || []

    const buttons = []

    homeData.forEach(home => {
        home = JSON.parse(home)
        buttons.push({ text: home.name, texture: 'textures/gamefam/world_utils/items/homes' })
    })

    if (homeData.length < getConfig(Configs.MaxHomes)) buttons.push({ text: { translate: 'gf_wu:home_menu.add' }, texture: 'textures/gamefam/world_utils/items/add' })

    buttons.forEach(button => form.button(button.text, button.texture))

    form.show(player).then(response => {

        if (response.canceled) return;

        if (buttons[response.selection].text.translate == 'gf_wu:home_menu.add') addHomeMenu(player, homeData)
        else viewHomeMenu(player, buttons[response.selection].text, homeData)

    })

}

/** * @param {Player} player */
function showWarpsMenu(player) {

    if (getConfig(Configs.MaxWarps) == 0) { configFailedMessage(player); return }

    const form = new ActionFormData()
        .title({ translate: 'gf_wu:warp_menu.name' })

    const homeData = world.getDynamicProperty('gf_wu:warps')?.split('|').filter(x => x != '') || []

    const buttons = []

    homeData.forEach(home => {
        home = JSON.parse(home)
        buttons.push({ text: home.name, texture: 'textures/gamefam/world_utils/items/warp' })
    })

    if (homeData.length < getConfig(Configs.MaxWarps) && (getConfig(Configs.CanAllPlayersModifyWarps) || player.playerPermissionLevel >= 2 || player.getGameMode() == GameMode.Creative)) buttons.push({ text: { translate: 'gf_wu:warp_menu.add' }, texture: 'textures/gamefam/world_utils/items/add' })

    buttons.forEach(button => form.button(button.text, button.texture))

    if (buttons.length == 0) { failed({ translate: 'gf_wu:warp_menu.no_warps' }, player); return }

    form.show(player).then(response => {

        if (response.canceled) return;

        if (buttons[response.selection].text.translate == 'gf_wu:warp_menu.add') addWarpMenu(player, homeData)
        else viewWarpMenu(player, buttons[response.selection].text, homeData)

    })

}

/** * @param {Player} player */
function addHomeMenu(player, homeData) {
    const form = new ModalFormData()
        .title({ translate: 'gf_wu:home_menu.add' })
        .textField({ translate: 'gf_wu:home_menu.enter_name' }, { translate: 'gf_wu:home_menu.placeholder_name' }, { defaultValue: 'Home' })

    form.show(player).then(response => {

        if (response.canceled) return;

        if (homeData.map(home => JSON.parse(home).name).includes(response.formValues[0])) { failed({ translate: 'gf_wu:home_menu.duplicate_name' }, player); return }

        if (response.formValues[0].length > 25) { failed({ translate: 'gf_wu:home_menu.too_long' }, player); return }

        homeData.push(JSON.stringify({ name: response.formValues[0], location: { x: player.location.x, y: player.location.y, z: player.location.z }, dimension: player.dimension.id }))
        world.setDynamicProperty('gf_wu:home_' + player.id, homeData.join('|'))
        success({ translate: 'gf_wu:home_menu.home_added' }, player)

    })
}

/** * @param {Player} player */
function addWarpMenu(player, homeData) {
    const form = new ModalFormData()
        .title({ translate: 'gf_wu:warp_menu.add' })
        .textField({ translate: 'gf_wu:home_menu.enter_name' }, { translate: 'gf_wu:warp_menu.placeholder_name' }, { defaultValue: 'Warp' })

    form.show(player).then(response => {

        if (response.canceled) return;

        homeData = world.getDynamicProperty('gf_wu:warps')?.split('|').filter(x => x != '') || homeData
        if (homeData.map(home => JSON.parse(home).name).includes(response.formValues[0])) { failed({ translate: 'gf_wu:warp_menu.duplicate_name' }, player); return }

        if (response.formValues[0].length > 25) { failed({ translate: 'gf_wu:home_menu.too_long' }, player); return }

        homeData.push(JSON.stringify({ name: response.formValues[0], location: { x: player.location.x, y: player.location.y, z: player.location.z }, dimension: player.dimension.id }))
        world.setDynamicProperty('gf_wu:warps', homeData.join('|'))
        success({ translate: 'gf_wu:warp_menu.warp_added' }, player)

    })
}

/** * @param {Player} player */
function viewHomeMenu(player, title, homeData) {

    const form = new ActionFormData()
        .title(title)
        .button({ translate: 'gf_wu:home_menu.teleport' }, 'textures/gamefam/world_utils/items/teleport')
        .button({ translate: 'gf_wu:home_menu.edit_name' }, 'textures/gamefam/world_utils/items/pencil')
        .button({ translate: 'gf_wu:home_menu.remove' }, 'textures/gamefam/world_utils/items/remove')

    homeData = homeData.map(x => JSON.parse(x))

    form.show(player).then(async response => {

        if (response.canceled) return;

        const match = homeData.filter(home => home.name == title)[0]

        switch (response.selection) {
            case 0:
                let timeLeft = getConfig(Configs.HomeTeleportTime);
                if (timeLeft == 0) {
                    player.teleport(match.location, { dimension: world.getDimension(match.dimension) })
                    break;
                }
                const location = player.location
                let startTick = system.currentTick
                player.onScreenDisplay.setTitle(`${timeLeft}`)
                const run = system.runInterval(() => {
                    const sameLocation = vectorEquals(location, player.location)
                    if (timeLeft == 0 || !sameLocation) { player.onScreenDisplay.setTitle(''); system.clearRun(run); if (!sameLocation && timeLeft != 0) failed({ translate: 'gf_wu:home_menu.teleport_cancelled' }, player); return }
                    if (system.currentTick < startTick + 20) return;
                    if (timeLeft == 1) {
                        player.teleport(match.location, { dimension: world.getDimension(match.dimension) })
                        player.onScreenDisplay.setTitle('');
                    } else {
                        startTick = system.currentTick
                        player.onScreenDisplay.setTitle(`${timeLeft - 1}`)
                    }
                    timeLeft--
                })
                break;
            case 1:
                match.name = await editHomeMenu(player, title, homeData)
                if (!match.name) return;
                world.setDynamicProperty('gf_wu:home_' + player.id, homeData.map(home => JSON.stringify(home)).join('|'))
                showHomeMenu(player)
                break;
            case 2:
                world.setDynamicProperty('gf_wu:home_' + player.id, homeData.filter(home => home.name != title).map(home => JSON.stringify(home)).join('|'))
                showHomeMenu(player)
                break;
        }

    })
}

/** * @param {Player} player */
function viewWarpMenu(player, title, homeData) {

    homeData = homeData.map(x => JSON.parse(x))
    const match = homeData.filter(home => home.name == title)[0]

    if (getConfig(Configs.CanAllPlayersModifyWarps) === false && player.getGameMode() !== GameMode.Creative) {
        let timeLeft = getConfig(Configs.WarpTeleportTime);
        if (timeLeft == 0) {
            player.teleport(match.location, { dimension: world.getDimension(match.dimension) })
            return;
        }
        const location = player.location
        let startTick = system.currentTick
        player.onScreenDisplay.setTitle(`${timeLeft}`)
        const run = system.runInterval(() => {
            const sameLocation = vectorEquals(location, player.location)
            if (timeLeft == 0 || !sameLocation) { player.onScreenDisplay.setTitle(''); system.clearRun(run); if (!sameLocation && timeLeft != 0) failed({ translate: 'gf_wu:home_menu.teleport_cancelled' }, player); return }
            if (system.currentTick < startTick + 20) return;
            if (timeLeft == 1) {
                player.teleport(match.location, { dimension: world.getDimension(match.dimension) })
                player.onScreenDisplay.setTitle('');
            } else {
                startTick = system.currentTick
                player.onScreenDisplay.setTitle(`${timeLeft - 1}`)
            }
            timeLeft--
        })
        return
    }

    const form = new ActionFormData()
        .title(title)
        .button({ translate: 'gf_wu:home_menu.teleport' }, 'textures/gamefam/world_utils/items/teleport')
        .button({ translate: 'gf_wu:home_menu.edit_name' }, 'textures/gamefam/world_utils/items/pencil')
        .button({ translate: 'gf_wu:home_menu.remove' }, 'textures/gamefam/world_utils/items/remove')

    form.show(player).then(async response => {

        if (response.canceled) return;

        switch (response.selection) {
            case 0:
                let timeLeft = getConfig(Configs.WarpTeleportTime);
                if (timeLeft == 0) {
                    player.teleport(match.location, { dimension: world.getDimension(match.dimension) })
                    break;
                }
                const location = player.location
                let startTick = system.currentTick
                player.onScreenDisplay.setTitle(`${timeLeft}`)
                const run = system.runInterval(() => {
                    const sameLocation = vectorEquals(location, player.location)
                    if (timeLeft == 0 || !sameLocation) { player.onScreenDisplay.setTitle(''); system.clearRun(run); if (!sameLocation && timeLeft != 0) failed({ translate: 'gf_wu:home_menu.teleport_cancelled' }, player); return }
                    if (system.currentTick < startTick + 20) return;
                    if (timeLeft == 1) {
                        player.teleport(match.location, { dimension: world.getDimension(match.dimension) })
                        player.onScreenDisplay.setTitle('');
                    } else {
                        startTick = system.currentTick
                        player.onScreenDisplay.setTitle(`${timeLeft - 1}`)
                    }
                    timeLeft--
                })
                break;
            case 1:
                match.name = await editWarpMenu(player, title, homeData)
                if (!match.name) return;
                world.setDynamicProperty('gf_wu:warps', homeData.map(home => JSON.stringify(home)).join('|'))
                showWarpsMenu(player)
                break;
            case 2:
                world.setDynamicProperty('gf_wu:warps', homeData.filter(home => home.name != title).map(home => JSON.stringify(home)).join('|'))
                showWarpsMenu(player)
                break;
        }

    })
}

/** * @param {Player} player */
async function editHomeMenu(player, oldName, homeData) {
    const form = new ModalFormData()
        .title({ translate: 'gf_wu:home_menu.edit_name' })
        .textField({ translate: 'gf_wu:home_menu.enter_name' }, { translate: 'gf_wu:home_menu.placeholder_name' }, { defaultValue: oldName })

    const response = await form.show(player)

    if (response.canceled) return;

    if (homeData.map(home => home.name).includes(response.formValues[0])) { failed({ translate: 'gf_wu:home_menu.duplicate_name' }, player); return editHomeMenu(player, oldName) }

    if (response.formValues[0].length > 25) { failed({ translate: 'gf_wu:home_menu.too_long' }, player); return editHomeMenu(player, oldName) }

    return response.formValues[0]

}

/** * @param {Player} player */
async function editWarpMenu(player, oldName, homeData) {
    const form = new ModalFormData()
        .title({ translate: 'gf_wu:home_menu.edit_name' })
        .textField({ translate: 'gf_wu:home_menu.enter_name' }, { translate: 'gf_wu:warp_menu.placeholder_name' }, { defaultValue: oldName })

    const response = await form.show(player)

    if (response.canceled) return;

    homeData = world.getDynamicProperty('gf_wu:warps')?.split('|').filter(x => x != '') || []
    if (homeData.map(home => JSON.parse(home).name).includes(response.formValues[0])) { failed({ translate: 'gf_wu:warp_menu.duplicate_name' }, player); return editWarpMenu(player, oldName) }

    if (response.formValues[0].length > 25) { failed({ translate: 'gf_wu:home_menu.too_long' }, player); return editWarpMenu(player, oldName) }

    return response.formValues[0]

}

const usersInForm = new Map()

/** * @param {Player} player */
async function showXpMenu(player) {

    const form = new ActionFormData()
        .title('gf_wu:experience_extractor.title')
        .body({ translate: 'gf_wu:experience_extractor.info' })
        .button({ translate: 'gf_wu:experience_extractor.withdraw_1' })
        .button({ translate: 'gf_wu:experience_extractor.withdraw_10' })
        .button({ translate: 'gf_wu:experience_extractor.withdraw_30' })
        .button({ translate: 'gf_wu:experience_extractor.withdraw_all' })

    usersInForm.set(player.id, true)
    const result = await form.show(player);
    usersInForm.set(player.id, false)

    if (result.canceled) return;

    const xpEarnedAtCurrentLevel = player.xpEarnedAtCurrentLevel;
    const totalxp = player.getTotalXp() - xpEarnedAtCurrentLevel;

    const withdrawAmount = [7, 160, 1395, player.getTotalXp()][result.selection];

    if (player.getTotalXp() < withdrawAmount || withdrawAmount == 0) { failed({ translate: 'gf_wu:experience_extractor.insufficient_xp' }, player); return }

    const itemResult = new ItemStack('gf_wu:experience_bottle');
    itemResult.setLore([EXPERIENCEBOTTLE_LORE, `§r§7Experience: ${withdrawAmount}`]);
    player.addLevels(-Math.pow(2, 24));

    await system.waitTicks(1);
    let xpAmount = totalxp - withdrawAmount + xpEarnedAtCurrentLevel;
    while (xpAmount > 0 && result.selection != 3) {
        const amount = Math.min(16777216, xpAmount);
        player.addExperience(amount)
        xpAmount -= amount
    }
    safeGiveItem(player, itemResult);
    success({ translate: 'gf_wu:experience_extractor.withdraw_successful' }, player)
    world.scoreboard.getObjective(SCOREBOARD_ID).addScore(EXPERIENCEEXTRACTOR_STAT, withdrawAmount);
}

async function showChunkMenu(player, entity, defaultSize) {

    const form = new ModalFormData()
        .title({ translate: 'gf_wu:chunk_minion_menu.title' })
        .slider({ translate: 'gf_wu:chunk_minion_menu.radius' }, 1, 3, { defaultValue: defaultSize })
        .toggle({ translate: 'gf_wu:chunk_minion_menu.remove' }, { defaultValue: false })
    const result = await form.show(player);

    if (result.canceled) return;

    if (result.formValues[1]) { entity.triggerEvent('poof'); return }

    const size = result.formValues[0];
    const location = { x: Math.floor(entity.location.x / 16) * 16, y: 128, z: Math.floor(entity.location.z / 16) * 16 };

    entity.triggerEvent(`size_${size}`);
    entity.dimension.runCommand(`tickingarea remove gf_wu:chunk_${entity.getDynamicProperty('gf_wu:id')}`);
    await system.waitTicks(2);
    entity.dimension.runCommand(`tickingarea add ${location.x + 15 * size} 0 ${location.z + 15 * size} ${location.x - 15 * (size - 1)} 0 ${location.z - 15 * (size - 1)}  gf_wu:chunk_${entity.getDynamicProperty('gf_wu:id')}`);
    entity.dimension.spawnParticle(`gf_wu:chunk_minion_border_${size}`, {
        x: location.x + 8,
        y: location.y,
        z: location.z + 8
    });
}

/** * @param {Player} player */
async function showFastplaceMenu(player) {

    const tags = player.getTags()
    const tag = tags.find(tag => tag.startsWith('gfwu:fastplace'))
    const length = tag ? parseInt(tag.slice(14, -1)) : undefined
    const direction = tag ? tag.slice(-1) : undefined

    const form = new ModalFormData()
        .title({ translate: 'gf_wu:fast_place.title' })
        .slider({ translate: 'gf_wu:fast_place.distance' }, 2, 10, { defaultValue: length })
        .dropdown({ translate: 'gf_wu:fast_place.direction' }, [{ translate: 'gf_wu:fast_place.vertical' }, { translate: 'gf_wu:fast_place.horizontal' }], { defaultValue: direction === undefined ? undefined : direction == 'v' ? 0 : 1 })
    const response = await form.show(player)

    if (response.canceled) return;

    tags.forEach(tag => { if (tag.startsWith('gfwu:fastplace')) player.removeTag(tag) })
    player.addTag('gfwu:fastplace' + response.formValues[0] + (response.formValues[1] == 0 ? 'v' : 'h'))
}

export { showMainMenu, showUpdateMenu, showCreativeMenu, showHomeMenu, showXpMenu, showChunkMenu, showWarpsMenu, showFastplaceMenu, usersInForm }
