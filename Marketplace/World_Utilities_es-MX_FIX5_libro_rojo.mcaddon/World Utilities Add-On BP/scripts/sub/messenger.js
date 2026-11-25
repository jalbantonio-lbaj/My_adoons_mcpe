import { Player, system } from "@minecraft/server"

/**
 * @param {(import("@minecraft/server").RawMessage | string)[] | import("@minecraft/server").RawMessage | string} msg 
 * @param {Player} player 
 */
function failed(msg, player) {
    system.run(()=>{
        player.onScreenDisplay.setActionBar(msg)
        player.playSound('note.bass', { pitch: 1, volume: 0.8, location: player.location })
    })
}

/**
 * @param {(import("@minecraft/server").RawMessage | string)[] | import("@minecraft/server").RawMessage | string} msg 
 * @param {Player} player 
 */
function failedChat(msg, player) {
    player.sendMessage(msg)
    player.playSound('note.bass', { pitch: 1, volume: 0.8, location: player.location })
}

/**
 * @param {import("@minecraft/server").RawMessage | string)[] | import("@minecraft/server").RawMessage | string} msg 
 * @param {Player} player 
 */
function success(msg, player) {
    player.onScreenDisplay.setActionBar(msg)
    player.playSound('note.chime', { pitch: 1, volume: 0.8, location: player.location })
}


function configFailedMessage(player) {
    failed([{ translate: 'gf_wu:configuration.module_disabled1' }, '\n', { translate: 'gf_wu:configuration.module_disabled2' }], player)
}

export { failed, success, configFailedMessage, failedChat }