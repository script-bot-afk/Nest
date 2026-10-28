"""Reproducible code-drawn Nest wallpaper and icon. Requires Pillow + numpy."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / 'assets'
w, h = 2560, 1440
y, x = np.mgrid[0:h, 0:w].astype(float)
x /= w; y /= h
image = np.zeros((h, w, 3)) + [21, 17, 29]
for cx, cy, spread, color in [(.83, .36, .22, [45, 20, 61]), (.72, .91, .23, [42, 23, 42]), (.95, .07, .3, [17, 12, 33])]:
    glow = np.exp(-((x-cx)**2 + (y-cy)**2) / spread**2)
    image += glow[..., None] * color
for i in range(7):
    radius = np.sqrt(((x-.79)*1.32)**2 + ((y-.47)*.86)**2)
    target = .125 + i*.054
    ring = np.exp(-((radius-target)/(.0015 + i*.0003))**2)
    angle_light = .2 + .8 * np.clip((x+y-.4)/1.4, 0, 1)
    image += (ring*angle_light)[..., None] * np.array([38, 23, 40])
grain = np.random.default_rng(7).normal(0, .48, (h,w,1))
Image.fromarray(np.clip(image+grain,0,255).astype('uint8')).save(root/'wallpaper.jpg', quality=85, optimize=True)
s = 1024
im = Image.new('RGBA', (s,s))
d = ImageDraw.Draw(im)
d.rounded_rectangle((30,30,994,994), radius=230, fill='#312337', outline='#76556e', width=5)
d.rounded_rectangle((212,242,812,788), radius=150, outline='#ef9cbd', width=48)
d.line([(354,668),(354,418)], fill='#ef9cbd', width=58)
d.arc((326,368,688,720), 180, 360, fill='#ef9cbd', width=58)
d.line([(658,544),(658,668)], fill='#ef9cbd', width=58)
im.resize((512,512),Image.Resampling.LANCZOS).save(root/'icon.png')
