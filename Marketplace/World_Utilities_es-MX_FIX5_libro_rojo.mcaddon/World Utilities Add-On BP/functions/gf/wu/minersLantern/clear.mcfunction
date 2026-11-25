fill ~-3~-4~-3 ~3~-1~3 air replace light_block_14
fill ~-3~~-3 ~3~3~-1 air replace light_block_14
fill ~-3~~ ~-1~3~3 air replace light_block_14
fill ~~2~ ~3~3~3 air replace light_block_14
fill ~1~~ ~3~1~3 air replace light_block_14
fill ~~~1 ~~1~3 air replace light_block_14

execute unless entity @s[hasitem={item=gf_wu:miners_lantern,location=slot.weapon.offhand}] unless entity @s[hasitem={item=gf_wu:miners_lantern,location=slot.weapon.mainhand}] run fill ~ ~1 ~ ~ ~ ~ air replace light_block_14