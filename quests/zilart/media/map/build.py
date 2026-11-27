#!/usr/bin/env python3
"""Подложка карты ЗИЛАРТа для плеера: рисунок map-gouache-4.jpg (fal, по маске mask.py) → site/play/zilart/media/map.jpg.
Рисунок покрывает 55.6936–55.7021 с. ш., 37.625945–37.646055 в. д. (как маска). Вокруг — поле 200 м цвета «суши», край рисунка
растушёван: рамка схемы у первых точек выходит за рисунок, жёсткого края быть не должно. Печатает bounds для quest.json → map.
  python3 quests/zilart/media/map/build.py && python3 scripts/player_webp.py zilart"""
import math, pathlib
from PIL import Image, ImageDraw, ImageFilter
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parents[3] / 'site/play/zilart/media/map.jpg'
S, N, W, E = 55.6936, 55.7021, 37.625945, 37.646055
PAD_M, PPM, FEATHER = 200, 0.65, 70
LAND = (250, 233, 203)   # средний цвет «суши» рисунка; тот же — в player.css (.pl-map-under)
k = math.cos(math.radians(55.696283))
mw, mh = (E - W) * 111320 * k, (N - S) * 111320
src = Image.open(HERE / 'map-gouache-4.jpg').convert('RGB').resize((round(mw * PPM), round(mh * PPM)), Image.LANCZOS)
pad = round(PAD_M * PPM)
canvas = Image.new('RGB', (src.width + 2 * pad, src.height + 2 * pad), LAND)
mask = Image.new('L', src.size, 0)
ImageDraw.Draw(mask).rectangle([FEATHER // 2, FEATHER // 2, src.width - FEATHER // 2, src.height - FEATHER // 2], fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(FEATHER / 4))
canvas.paste(src, (pad, pad), mask)
canvas.save(OUT, quality=84, optimize=True)
dlat, dlon = PAD_M / 111320, PAD_M / (111320 * k)
print(OUT, canvas.size, 'bounds', [[round(S - dlat, 6), round(W - dlon, 6)], [round(N + dlat, 6), round(E + dlon, 6)]])
