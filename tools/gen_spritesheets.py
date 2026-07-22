#!/usr/bin/env python3
"""Generate 4-direction × 4-frame pixel-art spritesheets for 11 characters.

Outputs to {project_root}/src/webui/public/assets/spritesheets/:
  - {character_id}.png  — 128×128 spritesheet (4×4 grid of 32×32 frames)
  - {character_id}.json — ai-town compatible spritesheetData

Placeholder art: simple pixel humanoid silhouettes drawn with PIL rectangles.
AI cannot produce pixel art, so this draws simple shapes that can later be
replaced with real art assets.

Spritesheet layout (4×4 grid):
    row 0 (down)  : frames 0,1,2,3
    row 1 (left)  : frames 4,5,6,7
    row 2 (right) : frames 8,9,10,11
    row 3 (up)    : frames 12,13,14,15
"""

import json
import os
from pathlib import Path

from PIL import Image, ImageDraw

# ---------------------------------------------------------------------------
# Character definitions (mirrors DEFAULT_NPCS in src/novelist_brain/social_models.py)
# ---------------------------------------------------------------------------
CHARACTERS = [
    {"id": "linyi", "archetype": "protagonist", "color": (58, 90, 138), "hair": (40, 30, 20)},
    {"id": "npc_old_paper_vendor", "archetype": "stranger", "color": (106, 106, 106), "hair": (200, 200, 200)},
    {"id": "npc_guitar_busker", "archetype": "outsider", "color": (122, 74, 154), "hair": (40, 30, 30)},
    {"id": "npc_cafe_owner", "archetype": "regular", "color": (58, 122, 74), "hair": (40, 30, 20)},
    {"id": "npc_cafe_regular", "archetype": "regular", "color": (74, 138, 90), "hair": (80, 60, 40)},
    {"id": "npc_upstairs_neighbor", "archetype": "stranger", "color": (122, 122, 122), "hair": (60, 40, 30)},
    {"id": "npc_landlord", "archetype": "authority", "color": (154, 58, 58), "hair": (40, 30, 20)},
    {"id": "npc_security_guard", "archetype": "authority", "color": (170, 74, 74), "hair": (30, 30, 30)},
    {"id": "npc_wanderer", "archetype": "outsider", "color": (138, 90, 170), "hair": (50, 40, 30)},
    {"id": "npc_night_vendor", "archetype": "regular", "color": (90, 154, 106), "hair": (40, 30, 20)},
    {"id": "npc_night_youth", "archetype": "stranger", "color": (138, 138, 138), "hair": (60, 50, 40)},
]

# Frame geometry
FRAME_SIZE = 32
SHEET_COLS = 4
SHEET_ROWS = 4
SHEET_SIZE = 128  # 4 × 32

# Shared palette
SKIN = (212, 165, 116, 255)    # #d4a574
SHOE = (42, 42, 42, 255)       # #2a2a2a
EYE = (30, 30, 30, 255)        # dark eyes
MOUTH = (120, 60, 60, 255)     # mouth

# Row order in the spritesheet matches this tuple
DIRECTIONS = ("down", "left", "right", "up")


def _rgba(rgb):
    """Add alpha channel to an RGB tuple."""
    return (rgb[0], rgb[1], rgb[2], 255)


def _darken(rgb, factor=0.7):
    """Return a darkened RGBA tuple (used for pants)."""
    return (int(rgb[0] * factor), int(rgb[1] * factor), int(rgb[2] * factor), 255)


def _rect(draw, box, color):
    """Draw a filled rectangle (pixel block, no anti-aliasing)."""
    draw.rectangle(box, fill=color)


def _draw_head(draw, direction, hair_color):
    """Draw 8×8 head at (12, 6) with direction-specific features.

    Head box: x=12..19, y=6..13 (8×8).
    """
    hx0, hy0 = 12, 6
    hx1, hy1 = hx0 + 8, hy0 + 8  # PIL rectangle end is exclusive

    # Base head (skin)
    _rect(draw, (hx0, hy0, hx1, hy1), SKIN)

    if direction == "down":
        # Hair: top 3 rows (y=6,7,8)
        _rect(draw, (hx0, hy0, hx1, hy0 + 3), hair_color)
        # Eyes: 1×2 vertical at x=14 and x=17, y=10..11
        _rect(draw, (hx0 + 2, hy0 + 4, hx0 + 3, hy0 + 6), EYE)
        _rect(draw, (hx0 + 5, hy0 + 4, hx0 + 6, hy0 + 6), EYE)
        # Mouth: 2×1 at y=12, x=15..16
        _rect(draw, (hx0 + 3, hy0 + 6, hx0 + 5, hy0 + 7), MOUTH)
    elif direction == "up":
        # Back of head: hair covers the entire head
        _rect(draw, (hx0, hy0, hx1, hy1), hair_color)
    elif direction == "left":
        # Profile facing left: hair on left half (back) + top 2 rows
        _rect(draw, (hx0, hy0, hx0 + 4, hy1), hair_color)
        _rect(draw, (hx0, hy0, hx1, hy0 + 2), hair_color)
        # One eye on the right side (per spec)
        _rect(draw, (hx0 + 5, hy0 + 4, hx0 + 6, hy0 + 6), EYE)
        # Mouth on the right side
        _rect(draw, (hx0 + 5, hy0 + 6, hx0 + 6, hy0 + 7), MOUTH)
    elif direction == "right":
        # Profile facing right: hair on right half (back) + top 2 rows
        _rect(draw, (hx0 + 4, hy0, hx1, hy1), hair_color)
        _rect(draw, (hx0, hy0, hx1, hy0 + 2), hair_color)
        # One eye on the left side (per spec)
        _rect(draw, (hx0 + 2, hy0 + 4, hx0 + 3, hy0 + 6), EYE)
        # Mouth on the left side
        _rect(draw, (hx0 + 2, hy0 + 6, hx0 + 3, hy0 + 7), MOUTH)


def _draw_body(draw, color):
    """Draw torso + arms (static across frames and directions).

    Torso: 12×10 at (10, 14). Arms: 2×8 flanking the torso. Hands: 1px skin.
    """
    torso = _rgba(color)
    # Torso: x=10..21, y=14..23
    _rect(draw, (10, 14, 22, 24), torso)
    # Arms: x=8..9 and x=22..23, y=14..21
    _rect(draw, (8, 14, 10, 22), torso)
    _rect(draw, (22, 14, 24, 22), torso)
    # Hands: 1px skin at the bottom of each arm (y=22)
    _rect(draw, (8, 22, 10, 23), SKIN)
    _rect(draw, (22, 22, 24, 23), SKIN)


def _draw_legs(draw, color, frame):
    """Draw two legs + shoes with a 4-frame walk cycle.

    Base leg: 5px pants (y=24..28) + 1px shoe (y=29).
    Stepping leg (frame 1 → left, frame 3 → right) extends 1px forward (down).
    """
    pants = _darken(color, 0.7)
    left_x0, left_x1 = 12, 15   # x=12..14 (3px wide)
    right_x0, right_x1 = 17, 20  # x=17..19

    base_y0 = 24  # leg top

    def draw_leg(x0, x1, step_forward):
        if step_forward:
            # Extend 1px down (forward stride): pants y=24..29, shoe y=30
            pants_y1 = 30
            shoe_y1 = 31
        else:
            # Base: pants y=24..28, shoe y=29
            pants_y1 = 29
            shoe_y1 = 30
        _rect(draw, (x0, base_y0, x1, pants_y1), pants)
        _rect(draw, (x0, pants_y1, x1, shoe_y1), SHOE)

    draw_leg(left_x0, left_x1, step_forward=(frame == 1))
    draw_leg(right_x0, right_x1, step_forward=(frame == 3))


def draw_frame(direction, frame, character):
    """Render a single 32×32 frame for the given direction and walk-frame index."""
    img = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    color = character["color"]
    hair = _rgba(character["hair"])

    _draw_body(draw, color)
    _draw_legs(draw, color, frame)
    _draw_head(draw, direction, hair)

    return img


def build_spritesheet(character):
    """Build a 128×128 spritesheet (4×4 grid) for one character."""
    sheet = Image.new("RGBA", (SHEET_SIZE, SHEET_SIZE), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        for col in range(SHEET_COLS):
            frame = draw_frame(direction, col, character)
            sheet.paste(frame, (col * FRAME_SIZE, row * FRAME_SIZE))
    return sheet


SPRITESHEET_DATA = {
    "frames": 16,
    "frameSize": {"w": 32, "h": 32},
    "animations": {
        "down": [0, 1, 2, 3],
        "left": [4, 5, 6, 7],
        "right": [8, 9, 10, 11],
        "up": [12, 13, 14, 15],
    },
    "frameDuration": 120,
}

OUT_DIR = str(Path(__file__).resolve().parent.parent / "src" / "webui" / "public" / "assets" / "spritesheets")


def generate_all(out_dir=OUT_DIR):
    """Generate .png and .json for every character. Idempotent."""
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for character in CHARACTERS:
        cid = character["id"]
        sheet = build_spritesheet(character)

        png_path = os.path.join(out_dir, f"{cid}.png")
        json_path = os.path.join(out_dir, f"{cid}.json")

        sheet.save(png_path)
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(SPRITESHEET_DATA, f, indent=2)

        paths.append((cid, png_path, json_path))
        print(f"[{cid}] -> {png_path}")
        print(f"[{cid}] -> {json_path}")
    return paths


if __name__ == "__main__":
    generate_all()
