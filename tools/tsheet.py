# contact sheet of trailer stills: python tools/tsheet.py out cols name1 name2 ...   (reads .shots/trailer/p_<name>.jpg)
import sys
from PIL import Image, ImageDraw
out, cols, names = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = [Image.open(f'.shots/trailer/p_{n}.jpg') for n in names]
w, h = ims[0].size; w, h = w * 2 // 3, h * 2 // 3
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * h))
d = ImageDraw.Draw(sheet)
for i, im in enumerate(ims):
    x, y = (i % cols) * w, (i // cols) * h
    sheet.paste(im.resize((w, h)), (x, y)); d.text((x + 6, y + 4), names[i], fill=(255, 255, 0))
sheet.save(f'.shots/{out}.jpg', quality=88); print(sheet.size)
