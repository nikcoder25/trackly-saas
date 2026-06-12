#!/usr/bin/env python3
"""Generate public/og-image.png (1200x630).

Thumbnail-style OG image (viral-product principle: "treat the OG image
like a YouTube thumbnail"): a mock AI answer that lists competitors with
the missing fourth slot circled in red, next to a big serif question.
Palette mirrors livesov-home.css (--paper / --ink / --accent / --danger).

Usage: python3 scripts/generate-og-image.py   (requires Pillow)
"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
PAPER = "#FBFAF7"
INK = "#1B1A17"
INK2 = "#56524A"
INK3 = "#8A857B"
ACCENT = "#5B5BD6"
DANGER = "#DC2626"
LINE = "#EAE7E0"
SURFACE = "#FFFFFF"

SERIF_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

img = Image.new("RGB", (W, H), PAPER)
d = ImageDraw.Draw(img)

# ── logo (rounded accent square + zigzag mark + wordmark) ──
lx, ly, ls = 64, 52, 44
d.rounded_rectangle([lx, ly, lx + ls, ly + ls], radius=11, fill=ACCENT)
zig = [(0.17, 0.58), (0.33, 0.58), (0.46, 0.29), (0.58, 0.71), (0.71, 0.46), (0.83, 0.46)]
d.line([(lx + ls * x, ly + ls * y) for x, y in zig], fill="white", width=4, joint="curve")
d.text((lx + ls + 16, ly + 4), "livesov", font=ImageFont.truetype(SANS_BOLD, 34), fill=INK)

# ── headline (left) ──
serif = ImageFont.truetype(SERIF_BOLD, 78)
d.text((64, 170), "Is your brand", font=serif, fill=INK)
d.text((64, 264), "in the", font=serif, fill=INK)
ai_x = 64 + d.textlength("in the ", font=serif)
d.text((ai_x, 264), "AI", font=serif, fill=ACCENT)
d.text((64, 358), "answer?", font=serif, fill=ACCENT)

sub = ImageFont.truetype(SANS, 28)
d.text((64, 478), "Free 90-second audit · no signup", font=sub, fill=INK2)

d.text((64, 548), "livesov.com", font=ImageFont.truetype(SANS_BOLD, 26), fill=INK3)

# ── mock AI answer card (right) ──
cx0, cy0, cx1, cy1 = 742, 110, 1148, 545
d.rounded_rectangle([cx0 + 6, cy0 + 10, cx1 + 6, cy1 + 10], radius=20, fill="#E5E2DA")  # soft shadow
d.rounded_rectangle([cx0, cy0, cx1, cy1], radius=20, fill=SURFACE, outline=LINE, width=2)

pad = 34
q_lbl = ImageFont.truetype(SANS_BOLD, 20)
d.text((cx0 + pad, cy0 + 28), "You asked an AI:", font=q_lbl, fill=INK3)
q_f = ImageFont.truetype(SANS_BOLD, 24)
d.text((cx0 + pad, cy0 + 60), "“what’s the best tool for…”", font=q_f, fill=INK)
d.line([cx0 + pad, cy0 + 112, cx1 - pad, cy0 + 112], fill=LINE, width=2)

row_f = ImageFont.truetype(SANS, 28)
rows = ["1.  Competitor A", "2.  Competitor B", "3.  Competitor C"]
ry = cy0 + 142
for r in rows:
    d.text((cx0 + pad, ry), r, font=row_f, fill=INK2)
    d.text((cx1 - pad - 28, ry), "✓", font=ImageFont.truetype(SANS_BOLD, 28), fill="#059669")
    ry += 56

# the missing fourth slot, circled in red
d.text((cx0 + pad, ry + 2), "4.", font=row_f, fill=INK2)
d.line([cx0 + pad + 52, ry + 24, cx0 + pad + 220, ry + 24], fill=INK3, width=3)
ell = [cx0 + pad - 16, ry - 14, cx0 + pad + 240, ry + 46]
d.ellipse(ell, outline=DANGER, width=5)
d.ellipse([e + o for e, o in zip(ell, (4, 3, -2, 6))], outline=DANGER, width=3)  # double stroke, marker feel
d.text((cx0 + pad + 262, ry - 2), "you?", font=ImageFont.truetype(SANS_BOLD, 32), fill=DANGER)

img.save("public/og-image.png", optimize=True)
print("wrote public/og-image.png", img.size)
