import { world, system, EquipmentSlot, EntityComponentTypes, InputButton, ButtonState, GameMode } from "@minecraft/server";

export function handleCustomFlight(player, velocity, flyingPlayers, jumpState, tick, HORIZONTAL_SPEED, HORIZONTAL_SPEED_SPRINT, ASCEND_SPEED, DESCEND_SPEED, HORIZONTAL_DRAG, VERTICAL_DRAG, DEADZONE, DOUBLE_TAP_WINDOW) {
    const id = player.id;
    const inputInfo = player.inputInfo;
    if (!inputInfo) return;

    const jump = inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
    const isFlying = flyingPlayers.has(id);
    const isCreative = player.getGameMode() === "Creative" || player.getGameMode() === "Spectator";


    if (player.isOnGround) {
        if (isFlying) flyingPlayers.delete(id);
        const state = jumpState.get(id);
        if (state) {
            state.lastTime = 0;
            state.tapCount = 0;
            state.lastPressed = jump;
        }
        return;
    }

    let state = jumpState.get(id);
    if (!state) {
        state = { lastPressed: false, lastTime: 0, tapCount: 0 };
        jumpState.set(id, state);
    }

    if (jump && !state.lastPressed) {
        const currentTime = Date.now();
        if (currentTime - state.lastTime > DOUBLE_TAP_WINDOW * 50) {
            state.tapCount = 1;
        } else {
            state.tapCount++;
            if (state.tapCount >= 2) {
                if (isFlying) {
                    flyingPlayers.delete(id);
                    state.tapCount = 0;
                    state.lastTime = 0;
                    state.lastPressed = jump;
                    return;
                } else {
                    flyingPlayers.add(id);
                    state.tapCount = 0;
                    state.lastTime = 0;
                }
            }
        }
        state.lastTime = currentTime;
    }
    state.lastPressed = jump;

    if (flyingPlayers.has(id) && !isCreative) {
        const movement = inputInfo.getMovementVector();
        const moving = movement && (movement.x !== 0 || movement.y !== 0);

        let impX = 0;
        let impZ = 0;

        if (moving) {
            const look = player.getViewDirection();
            
            const dirX = look.x * movement.y + look.z * movement.x;
            const dirZ = look.z * movement.y - look.x * movement.x;
            const len = Math.hypot(dirX, dirZ);

            if (len > 0.001) {
                const currentSpeed = player.isSprinting ? HORIZONTAL_SPEED_SPRINT : HORIZONTAL_SPEED;
                impX = (dirX / len) * currentSpeed;
                impZ = (dirZ / len) * currentSpeed;
            }
        } else {
            impX = -velocity.x * HORIZONTAL_DRAG;
            impZ = -velocity.z * HORIZONTAL_DRAG;
        }

        const sneak = inputInfo.getButtonState(InputButton.Sneak) === ButtonState.Pressed;
        let impY = -velocity.y;

        if (jump) {
            impY += (ASCEND_SPEED + 0.12);
        } else if (sneak) {
            impY += (-DESCEND_SPEED - 0.05);
        } else {
            impY += 0.0784;
        }

        player.applyImpulse({ x: impX, y: impY, z: impZ });

        if (!moving && !jump && !sneak) {
            player.clearVelocity();
        }
    }
}
