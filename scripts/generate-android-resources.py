#!/usr/bin/env python3
"""
generate-android-resources.py — LBApos Android branding (PR #9 hardening)

Generates, from the official frontend assets (no CI-time sed/cp hacks):
  - drawable-{density}/splash.png      (from assets/splash-512.png, aspect preserved)
  - mipmap-{density}/ic_launcher.png   (from icons/icon-512.png)
  - mipmap-{density}/ic_launcher_foreground.png (safe-zone scaled)
  - mipmap-anydpi-v26/ic_launcher.xml  (adaptive icon)
  - values/ic_launcher_background.xml  (#044392)

The Android project itself is versioned; this script is the documented,
repeatable way to regenerate branding when the logo changes.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

SPLASH_SRC = os.path.join(ROOT, 'frontend', 'assets', 'splash-512.png')
ICON_SRC = os.path.join(ROOT, 'frontend', 'icons', 'icon-512.png')
LBA_BLUE = (4, 67, 146, 255)  # #044392

# Android density scale factors (1dp = N px)
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

def ensure_dir(path):
    os.makedirs(path, exist_ok=True)

def scaled(img, size):
    """Resize with LANCZOS, never distorting aspect ratio."""
    w, h = img.size
    if w == h:
        return img.resize((size, size), Image.LANCZOS)
    ratio = min(size / w, size / h)
    return img.resize((max(1, round(w * ratio)), max(1, round(h * ratio))), Image.LANCZOS)

# ---------------------------------------------------------------------
# 1. Splash — full-screen compositions per orientation bucket.
#    The launch theme sets android:background=@drawable/splash, which
#    STRETCHES the drawable to the window: shipping a bare square logo
#    would deform it. So each resource is composed at the exact window
#    aspect (portrait 0.6, landscape 1.333) with a solid #044392 field
#    and the logo centered, aspect-preserved (never stretched).
# ---------------------------------------------------------------------
splash = Image.open(SPLASH_SRC).convert('RGBA')

def compose_splash(w, h, logo_ratio=0.42):
    """Blue field + centered logo (aspect preserved)."""
    field = Image.new('RGBA', (w, h), LBA_BLUE)
    logo_w = int(w * logo_ratio)
    logo = scaled(splash, logo_w)
    lw, lh = logo.size
    # If the logo is taller than ~55% of the canvas height, bound by height.
    if lh > int(h * 0.55):
        logo = scaled(splash, int(h * 0.55))
        lw, lh = logo.size
    field.paste(logo, ((w - lw) // 2, (h - lh) // 2), logo)
    return field

# density → (portrait px, landscape px). 480x800 is the Capacitor baseline.
SPLASH_SIZES = {
    'mdpi': (480, 800),
    'hdpi': (720, 1280),
    'xhdpi': (960, 1600),
    'xxhdpi': (1440, 2400),
    'xxxhdpi': (1920, 3200),
}
for d, (pw, ph) in SPLASH_SIZES.items():
    for orient, (w, h) in {'port': (pw, ph), 'land': (ph, pw)}.items():
        dst = os.path.join(RES, f'drawable-{orient}-{d}')
        ensure_dir(dst)
        compose_splash(w, h).save(os.path.join(dst, 'splash.png'))
    print(f'  ✓ drawable-port-{d}/ + drawable-land-{d}/splash.png ({pw}x{ph})')

# Square fallback (square windows / ImageView CENTER usages by the plugin).
ensure_dir(os.path.join(RES, 'drawable'))
sq = Image.new('RGBA', (1024, 1024), LBA_BLUE)
logo = scaled(splash, 420)
sq.paste(logo, ((1024 - logo.size[0]) // 2, (1024 - logo.size[1]) // 2), logo)
sq.save(os.path.join(RES, 'drawable', 'splash.png'))
print('  ✓ drawable/splash.png (square fallback, logo centrado)')

# Remove the default Capacitor template art that would otherwise override
# our branding (teal launcher background vector is unreferenced after the
# adaptive-icon switch to the #044392 color resource).
stale = [os.path.join(RES, 'drawable', 'ic_launcher_background.xml')]
for s in stale:
    if os.path.exists(s):
        os.remove(s)
        print(f'  ✗ removed stale template resource: {os.path.relpath(s, RES)}')

# ---------------------------------------------------------------------
# 2. Launcher icons (legacy square PNGs per density)
# ---------------------------------------------------------------------
splash = Image.open(SPLASH_SRC).convert('RGBA')
icon = Image.open(ICON_SRC).convert('RGBA')
for d, scale in DENSITIES.items():
    size = int(48 * scale)  # 48dp launcher icon
    dst = os.path.join(RES, f'mipmap-{d}')
    ensure_dir(dst)
    scaled(icon, size).save(os.path.join(dst, 'ic_launcher.png'))
    # Round icon can reuse the same square art
    scaled(icon, size).save(os.path.join(dst, 'ic_launcher_round.png'))
    print(f'  ✓ mipmap-{d}/ic_launcher.png (+round, {size}px)')

# ---------------------------------------------------------------------
# 3. Adaptive icon foreground: logo scaled into the 66% safe zone on a
#    transparent canvas (background layer supplies the #044392 field).
#    A circular mask may crop ~25% at the edges — the logo stays intact.
# ---------------------------------------------------------------------
for d, scale in DENSITIES.items():
    canvas = int(108 * scale)  # 108dp adaptive foreground layer
    safe = int(canvas * 0.62)  # safe zone diameter
    fg = Image.new('RGBA', (canvas, canvas), (0, 0, 0, 0))
    logo = scaled(icon, safe)
    lw, lh = logo.size
    fg.paste(logo, ((canvas - lw) // 2, (canvas - lh) // 2), logo)
    dst = os.path.join(RES, f'mipmap-{d}')
    fg.save(os.path.join(dst, 'ic_launcher_foreground.png'))
    print(f'  ✓ mipmap-{d}/ic_launcher_foreground.png ({canvas}px, safe {safe}px)')

# ---------------------------------------------------------------------
# 4. Adaptive icon XML + background color
# ---------------------------------------------------------------------
anydpi = os.path.join(RES, 'mipmap-anydpi-v26')
ensure_dir(anydpi)
with open(os.path.join(anydpi, 'ic_launcher.xml'), 'w') as f:
    f.write('''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
''')
print('  ✓ mipmap-anydpi-v26/ic_launcher.xml')
with open(os.path.join(anydpi, 'ic_launcher_round.xml'), 'w') as f:
    f.write('''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
''')
print('  ✓ mipmap-anydpi-v26/ic_launcher_round.xml')

values = os.path.join(RES, 'values')
ensure_dir(values)
with open(os.path.join(values, 'ic_launcher_background.xml'), 'w') as f:
    f.write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#044392</color>
</resources>
''')
print('  ✓ values/ic_launcher_background.xml (#044392)')

print('\nDONE — LBApos Android branding generated (logo never distorted: aspect ratio preserved).')
