"""Contact sheet from captured frames: python tools/sheet.py out_name cols frame1 frame2 ... (names in .shots, no extension)"""
import sys
from PIL import Image, ImageDraw
out, cols, names = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f'.shots/{n}.jpg') for n in names]
w, h = ims[0].size
s = min(1.0, 1900 / (w * cols))
tw, th = int(w * s), int(h * s)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, th * rows))
d = ImageDraw.Draw(sheet)
for i, im in enumerate(ims):
    x, y = (i % cols) * tw, (i // cols) * th
    sheet.paste(im.resize((tw, th)), (x, y))
    d.text((x + 8, y + 6), names[i], fill=(255, 255, 0))
sheet.save(f'.shots/{out}.jpg', quality=88)
print(sheet.size)
