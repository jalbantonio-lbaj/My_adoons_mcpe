# Place light
execute as @a[hasitem={item=gf_wu:miners_lantern,location=slot.weapon.mainhand},tag=minersLanternEnabled] at @s run function gf/wu/minersLantern/light 
execute as @a[hasitem={item=gf_wu:miners_lantern,location=slot.weapon.offhand},tag=minersLanternEnabled] at @s run function gf/wu/minersLantern/light
# Clear light
execute as @a[tag=equippedLantern] unless entity @s[hasitem={item=gf_wu:miners_lantern,location=slot.weapon.offhand}] unless entity @s[hasitem={item=gf_wu:miners_lantern,location=slot.weapon.mainhand}] at @s run function gf/wu/minersLantern/unequip
# Warning about being disabled
execute as @a[hasitem={item=gf_wu:miners_lantern,location=slot.weapon.mainhand},tag=!minersLanternEnabled] at @s run function gf/wu/minersLantern/disabled 
execute as @a[hasitem={item=gf_wu:miners_lantern,location=slot.weapon.offhand},tag=!minersLanternEnabled] at @s run function gf/wu/minersLantern/disabled

# Prevent water push
execute as @e[type=gf_wu:death_waypoint] at @s run tp @s ~ ~ ~
execute as @e[type=gf_wu:chunk_minion] at @s run tp @s ~ ~ ~

# Prevent gravity
execute as @e[type=gf_wu:lock_barrier] at @s run tp @s ~ ~ ~
execute as @e[type=gf_wu:lock_barrier_barrel] at @s run tp @s ~ ~ ~
execute as @e[type=gf_wu:lock_barrier_double] at @s run tp @s ~ ~ ~

# Check for barrier entities being moved out of chests
execute as @e[type=gf_wu:lock_barrier] at @s unless block ~ ~.5 ~ chest unless block ~ ~.5 ~ trapped_chest unless block ~ ~.5 ~ copper_chest unless block ~ ~.5 ~ exposed_copper_chest unless block ~ ~.5 ~ weathered_copper_chest unless block ~ ~.5 ~ oxidized_copper_chest unless block ~ ~.5 ~ waxed_copper_chest unless block ~ ~.5 ~ waxed_exposed_copper_chest unless block ~ ~.5 ~ waxed_weathered_copper_chest unless block ~ ~.5 ~ waxed_oxidized_copper_chest run scriptevent gf_wu_barrier:remove
execute as @e[type=gf_wu:lock_barrier_barrel] at @s unless block ~ ~.5 ~ barrel run scriptevent gf_wu_barrier:remove
execute as @e[type=gf_wu:lock_barrier_double] at @s unless block ~ ~.5 ~ chest unless block ~ ~.5 ~ trapped_chest run scriptevent gf_wu_barrier:remove

# Show warning for when fast place is active
execute as @a[tag=gfwu:fastPlaceEnabled] run scriptevent gf_wu_warn:config