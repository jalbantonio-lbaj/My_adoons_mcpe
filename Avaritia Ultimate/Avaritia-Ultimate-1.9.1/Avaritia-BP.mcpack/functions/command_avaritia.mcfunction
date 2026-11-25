gamerule sendcommandfeedback false

execute as @e[type=item] run scriptevent avaritia:all_immunity
execute as @e[tag=all_immunity] at @s in overworld run tp @s[y=-64,dy=-69] ~ ~1 ~
execute as @e[tag=all_immunity] at @s in nether run tp @s[y=0,dy=-5] ~ ~1 ~
execute as @e[tag=all_immunity] at @s in the_end run tp @s[y=0,dy=-5] ~ ~1 ~
execute as @e[tag=all_immunity] at @s if block ~~~ cactus run setblock ~~~ air destroy
execute as @e[tag=all_immunity] at @s if block ~1~~ cactus run setblock ~1~~ air destroy
execute as @e[tag=all_immunity] at @s if block ~-1~~ cactus run setblock ~-1~~ air destroy
execute as @e[tag=all_immunity] at @s if block ~~1~ cactus run setblock ~~1~ air destroy
execute as @e[tag=all_immunity] at @s if block ~~-1~ cactus run setblock ~~-1~ air destroy
execute as @e[tag=all_immunity] at @s if block ~~~1 cactus run setblock ~~~1 air destroy
execute as @e[tag=all_immunity] at @s if block ~~~-1 cactus run setblock ~~~-1 air destroy

execute as @a[tag=!immortal] run event entity @s[hasitem={item=avaritia:infinity_totem}] infinity_totem_event
enchant @a[hasitem={item=avaritia:infinity_bow,location=slot.weapon.mainhand}] infinity 1