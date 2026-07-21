#!/usr/bin/env python3
"""
gen_tilemaps.py — 为 LinYi 小说家大脑 WebUI 程序化生成 Tiled 1.9 兼容的像素地图资产。

仿照 ai-town，用 PixiJS 渲染 5 个社会空间。由于无法手工制作像素艺术，
本脚本用 Pillow 绘制简单的像素风 tileset 占位资产。

5 个空间：
  - town_square  (32×24)  暖灰石板   喷泉/长椅/报刊亭/路灯
  - cafe         (20×15)  木色暖调   咖啡机蒸汽/吧台/小桌/窗户
  - home         (16×12)  冷淡水泥   风扇旋转/书桌/床/窗户/漏水痕迹
  - station      (24×16)  冷灰金属   站台灯闪烁/站台/售票机/候车椅
  - night_market (28×20)  深紫霓虹   灯串闪烁/摊位/窄巷

输出：
  /workspace/src/webui/public/assets/tilemaps/{space_id}/tileset.png
  /workspace/src/webui/public/assets/tilemaps/{space_id}/tilemap.json

幂等：可重复运行覆盖输出。
"""

import json
import os

try:
    from PIL import Image, ImageDraw
except ImportError as exc:  # pragma: no cover - 友好提示
    raise SystemExit(
        "Pillow 未安装。请先运行：pip install Pillow"
    ) from exc


# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------

ROOT = "/workspace/src/webui/public/assets/tilemaps"
TILE_SIZE = 16
TILED_VERSION = "1.9"
TILED_VERSION_FULL = "1.9.2"

# 透明色
TRANSPARENT = (0, 0, 0, 0)


# ---------------------------------------------------------------------------
# 调色板
# ---------------------------------------------------------------------------

PALETTES = {
    "town_square": {
        "floor_a": (0x7A, 0x76, 0x70, 0xFF),
        "floor_b": (0x9A, 0x94, 0x8C, 0xFF),
        "floor_c": (0x5A, 0x56, 0x4F, 0xFF),
        "wall": (0x4A, 0x46, 0x40, 0xFF),
        "wall_accent": (0x3A, 0x36, 0x30, 0xFF),
        "window": (0x9A, 0xC8, 0xFF, 0xFF),
        "lamp_post": (0x3A, 0x36, 0x30, 0xFF),
        "lamp_glow": (0xFF, 0xD0, 0x70, 0xFF),
        "fountain_stone": (0x8A, 0x86, 0x80, 0xFF),
        "fountain_water": (0x5A, 0x8E, 0xC8, 0xFF),
        "fountain_splash": (0xA0, 0xC8, 0xFF, 0xFF),
        "bench_wood": (0x8B, 0x6A, 0x3A, 0xFF),
        "bench_shadow": (0x5B, 0x3A, 0x1A, 0xFF),
        "kiosk_body": (0xB0, 0x6A, 0x3A, 0xFF),
        "kiosk_roof": (0x7B, 0x4A, 0x2A, 0xFF),
    },
    "cafe": {
        "floor_a": (0x8B, 0x6A, 0x3A, 0xFF),
        "floor_b": (0xA0, 0x85, 0x60, 0xFF),
        "floor_c": (0x6B, 0x4F, 0x2A, 0xFF),
        "wall": (0x5B, 0x3F, 0x1A, 0xFF),
        "wall_accent": (0x3B, 0x2F, 0x1A, 0xFF),
        "window": (0xC8, 0xE8, 0xFF, 0xFF),
        "table_wood": (0xA0, 0x85, 0x60, 0xFF),
        "table_accent": (0x6B, 0x4F, 0x2A, 0xFF),
        "counter_wood": (0x6B, 0x4F, 0x2A, 0xFF),
        "counter_top": (0xA0, 0x85, 0x60, 0xFF),
        "machine": (0xB0, 0xAA, 0xA0, 0xFF),
        "machine_accent": (0x40, 0x40, 0x60, 0xFF),
        "steam": (0xF0, 0xF0, 0xF0, 0xFF),
        "coffee": (0x4A, 0x2A, 0x1A, 0xFF),
    },
    "home": {
        "floor_a": (0x5A, 0x5E, 0x60, 0xFF),
        "floor_b": (0x70, 0x74, 0x78, 0xFF),
        "floor_c": (0x40, 0x44, 0x48, 0xFF),
        "wall": (0x3A, 0x3E, 0x40, 0xFF),
        "wall_accent": (0x2A, 0x2E, 0x30, 0xFF),
        "window": (0xA8, 0xC8, 0xD8, 0xFF),
        "desk_wood": (0x6B, 0x4F, 0x2A, 0xFF),
        "desk_accent": (0x4B, 0x2F, 0x1A, 0xFF),
        "bed_frame": (0x5A, 0x4A, 0x3A, 0xFF),
        "bed_sheet": (0x9A, 0x8A, 0x7A, 0xFF),
        "leak_water": (0x3A, 0x4A, 0x5A, 0xFF),
        "leak_deep": (0x2A, 0x3A, 0x4A, 0xFF),
        "fan_body": (0x90, 0x94, 0x98, 0xFF),
        "fan_blade": (0xB0, 0xB4, 0xB8, 0xFF),
    },
    "station": {
        "floor_a": (0x6A, 0x6E, 0x72, 0xFF),
        "floor_b": (0x80, 0x84, 0x88, 0xFF),
        "floor_c": (0x4A, 0x4E, 0x52, 0xFF),
        "wall": (0x3A, 0x3E, 0x42, 0xFF),
        "wall_accent": (0x2A, 0x2E, 0x32, 0xFF),
        "window": (0xA0, 0xC0, 0xD0, 0xFF),
        "metal_dark": (0x4A, 0x4E, 0x52, 0xFF),
        "light_body": (0x4A, 0x4E, 0x52, 0xFF),
        "light_glow": (0xFF, 0xD0, 0x70, 0xFF),
        "platform_top": (0x8A, 0x6A, 0x3A, 0xFF),
        "platform_edge": (0x6A, 0x4A, 0x1A, 0xFF),
        "track": (0x2A, 0x2E, 0x32, 0xFF),
        "ticket_body": (0x50, 0x70, 0xA0, 0xFF),
        "ticket_accent": (0xFF, 0xD0, 0x70, 0xFF),
        "chair_frame": (0x4A, 0x4E, 0x52, 0xFF),
        "chair_seat": (0x6A, 0x6E, 0x72, 0xFF),
    },
    "night_market": {
        "floor_a": (0x3A, 0x2A, 0x4A, 0xFF),
        "floor_b": (0x4A, 0x3A, 0x5A, 0xFF),
        "floor_c": (0x2A, 0x1A, 0x3A, 0xFF),
        "wall": (0x1A, 0x0A, 0x2A, 0xFF),
        "wall_accent": (0x0A, 0x00, 0x1A, 0xFF),
        "window_pink": (0xFF, 0x60, 0x90, 0xFF),
        "string_wire": (0x40, 0x40, 0x40, 0xFF),
        "string_bulb_on": (0xFF, 0x60, 0x90, 0xFF),
        "string_bulb_off": (0x60, 0x20, 0x40, 0xFF),
        "stall_body": (0xFF, 0x8A, 0x3A, 0xFF),
        "stall_roof": (0xC0, 0x5A, 0x2A, 0xFF),
        "neon_a": (0xFF, 0x60, 0x90, 0xFF),
        "neon_b": (0x60, 0xFF, 0xC0, 0xFF),
        "alley_dark": (0x1A, 0x0A, 0x2A, 0xFF),
        "alley_accent": (0x2A, 0x1A, 0x3A, 0xFF),
    },
}


# ---------------------------------------------------------------------------
# 像素绘制工具
# ---------------------------------------------------------------------------

def _new_tile():
    """创建一张透明 16×16 tile 画布。"""
    return Image.new("RGBA", (TILE_SIZE, TILE_SIZE), TRANSPARENT)


def _draw_floor(img, base_color, accent_color, seed):
    """绘制地砖：底色 + 少量像素点缀（无抗锯齿）。"""
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, TILE_SIZE - 1, TILE_SIZE - 1), fill=base_color)
    # 确定性点缀（避免随机以保证幂等）
    accent_points = [
        [(2, 3), (10, 5), (5, 11), (13, 13), (8, 8)],
        [(4, 2), (8, 6), (12, 10), (3, 13), (6, 9)],
        [(6, 4), (14, 8), (2, 12), (9, 14), (11, 3)],
    ]
    for x, y in accent_points[seed % 3]:
        d.point((x, y), fill=accent_color)
    # 边角描点强化像素感
    d.point((0, 0), fill=accent_color)
    d.point((15, 15), fill=accent_color)
    return img


def _draw_wall(img, color, accent):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, TILE_SIZE - 1, TILE_SIZE - 1), fill=color)
    # 砖缝网格
    for y in (4, 8, 12):
        d.line((0, y, 15, y), fill=accent)
    # 错位的竖向砖缝
    d.line((7, 0, 7, 4), fill=accent)
    d.line((3, 4, 3, 8), fill=accent)
    d.line((11, 4, 11, 8), fill=accent)
    d.line((7, 8, 7, 12), fill=accent)
    d.line((3, 12, 3, 15), fill=accent)
    d.line((11, 12, 11, 15), fill=accent)
    return img


def _draw_window(img, frame_color, glass_color):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 15, 15), fill=frame_color)
    d.rectangle((2, 2, 13, 13), fill=glass_color)
    d.line((7, 2, 7, 13), fill=frame_color)
    d.line((2, 7, 13, 7), fill=frame_color)
    # 高光
    d.point((4, 4), fill=(255, 255, 255, 200))
    d.point((5, 4), fill=(255, 255, 255, 200))
    d.point((4, 5), fill=(255, 255, 255, 200))
    return img


def _draw_street_lamp(img, post_color, glow_color):
    d = ImageDraw.Draw(img)
    d.line((7, 5, 7, 15), fill=post_color)
    d.line((8, 5, 8, 15), fill=post_color)
    d.rectangle((5, 2, 10, 5), fill=post_color)
    d.rectangle((6, 3, 9, 4), fill=glow_color)
    d.rectangle((5, 14, 10, 15), fill=post_color)
    return img


def _draw_bench(img, wood_color, shadow_color):
    d = ImageDraw.Draw(img)
    d.rectangle((1, 7, 14, 9), fill=wood_color)
    d.rectangle((1, 4, 14, 6), fill=wood_color)
    d.rectangle((1, 10, 2, 14), fill=shadow_color)
    d.rectangle((13, 10, 14, 14), fill=shadow_color)
    d.line((1, 5, 14, 5), fill=shadow_color)
    d.line((1, 8, 14, 8), fill=shadow_color)
    return img


def _draw_kiosk(img, body_color, roof_color):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 2, 15, 4), fill=roof_color)
    d.rectangle((1, 5, 14, 14), fill=body_color)
    d.rectangle((3, 6, 12, 9), fill=(0x40, 0x40, 0x40, 0xFF))
    d.rectangle((4, 7, 11, 8), fill=roof_color)
    d.rectangle((1, 11, 14, 14), fill=roof_color)
    return img


def _draw_fountain_base(img, stone_color, water_color):
    d = ImageDraw.Draw(img)
    d.ellipse((1, 3, 14, 14), fill=stone_color)
    d.ellipse((3, 5, 12, 12), fill=water_color)
    d.point((5, 6), fill=(255, 255, 255, 180))
    d.point((8, 7), fill=(255, 255, 255, 180))
    d.point((10, 9), fill=(255, 255, 255, 180))
    return img


def _draw_fountain_splash(img, water_color, splash_color, frame):
    d = ImageDraw.Draw(img)
    d.rectangle((3, 5, 12, 12), fill=water_color)
    if frame == 0:
        for pt in [(5, 7), (9, 8), (7, 6), (10, 10), (4, 9), (8, 11)]:
            d.point(pt, fill=splash_color)
    else:
        for pt in [(6, 8), (10, 7), (8, 9), (5, 10), (9, 5), (11, 9), (7, 11)]:
            d.point(pt, fill=splash_color)
    return img


def _draw_table(img, wood_color, accent):
    d = ImageDraw.Draw(img)
    d.rectangle((1, 4, 14, 9), fill=wood_color)
    d.rectangle((1, 9, 3, 14), fill=accent)
    d.rectangle((12, 9, 14, 14), fill=accent)
    d.rectangle((1, 9, 14, 10), fill=accent)
    return img


def _draw_counter(img, wood_color, top_color):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 6, 15, 12), fill=wood_color)
    d.rectangle((0, 4, 15, 6), fill=top_color)
    d.line((0, 9, 15, 9), fill=top_color)
    d.rectangle((0, 12, 15, 14), fill=top_color)
    return img


def _draw_coffee_machine(img, machine_color, accent):
    d = ImageDraw.Draw(img)
    d.rectangle((2, 4, 13, 14), fill=machine_color)
    d.rectangle((4, 5, 11, 7), fill=(0x20, 0x20, 0x40, 0xFF))
    d.point((5, 6), fill=accent)
    d.point((9, 6), fill=accent)
    d.point((10, 6), fill=accent)
    d.rectangle((6, 11, 9, 13), fill=(0x40, 0x40, 0x40, 0xFF))
    d.rectangle((5, 13, 10, 14), fill=(0xFF, 0xFF, 0xFF, 0xFF))
    return img


def _draw_steam(img, steam_color, frame):
    d = ImageDraw.Draw(img)
    if frame == 0:
        for pt in [(6, 3), (7, 5), (8, 2), (9, 4), (10, 6), (5, 7)]:
            d.point(pt, fill=steam_color)
    else:
        for pt in [(5, 1), (6, 3), (7, 5), (9, 2), (10, 4), (11, 6), (8, 7)]:
            d.point(pt, fill=steam_color)
    return img


def _draw_desk(img, wood_color, accent):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 6, 15, 11), fill=wood_color)
    d.rectangle((1, 7, 7, 10), fill=accent)
    d.point((4, 8), fill=wood_color)
    d.rectangle((0, 11, 2, 14), fill=accent)
    d.rectangle((13, 11, 15, 14), fill=accent)
    return img


def _draw_bed(img, frame_color, sheet_color):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 5, 15, 14), fill=frame_color)
    d.rectangle((1, 6, 14, 11), fill=sheet_color)
    d.rectangle((1, 6, 4, 8), fill=(0xFF, 0xFF, 0xFF, 0xFF))
    d.rectangle((0, 14, 1, 15), fill=frame_color)
    d.rectangle((14, 14, 15, 15), fill=frame_color)
    return img


def _draw_leak(img, floor_color, leak_color, deep_color):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 15, 15), fill=floor_color)
    d.ellipse((3, 4, 12, 13), fill=leak_color)
    d.ellipse((5, 6, 10, 11), fill=deep_color)
    d.line((7, 0, 7, 4), fill=leak_color)
    d.point((6, 8), fill=(0x80, 0xA0, 0xC0, 200))
    d.point((9, 9), fill=(0x80, 0xA0, 0xC0, 200))
    return img


def _draw_fan_mount(img, body_color):
    d = ImageDraw.Draw(img)
    d.rectangle((6, 0, 9, 3), fill=body_color)
    d.ellipse((6, 5, 9, 8), fill=body_color)
    return img


def _draw_fan_blades(img, body_color, blade_color, frame):
    d = ImageDraw.Draw(img)
    d.ellipse((6, 6, 9, 9), fill=body_color)
    if frame == 0:
        d.line((7, 7, 3, 3), fill=blade_color)
        d.line((8, 8, 12, 12), fill=blade_color)
        d.line((7, 8, 3, 11), fill=blade_color)
        d.line((8, 7, 12, 4), fill=blade_color)
    else:
        d.line((7, 7, 4, 12), fill=blade_color)
        d.line((8, 8, 11, 3), fill=blade_color)
        d.line((7, 8, 11, 11), fill=blade_color)
        d.line((8, 7, 4, 4), fill=blade_color)
    return img


def _draw_platform(img, top_color, edge_color, track_color):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 15, 9), fill=top_color)
    d.rectangle((0, 9, 15, 11), fill=edge_color)
    d.rectangle((0, 11, 15, 15), fill=track_color)
    # 警示条纹
    d.line((0, 9, 4, 9), fill=(0xFF, 0xD0, 0x70, 0xFF))
    d.line((8, 9, 12, 9), fill=(0xFF, 0xD0, 0x70, 0xFF))
    return img


def _draw_platform_light(img, body_color, glow_color, on):
    d = ImageDraw.Draw(img)
    d.rectangle((7, 0, 8, 8), fill=body_color)
    d.rectangle((4, 8, 11, 11), fill=body_color)
    if on:
        d.rectangle((5, 9, 10, 10), fill=glow_color)
        d.point((2, 7), fill=glow_color)
        d.point((13, 7), fill=glow_color)
        d.point((0, 5), fill=glow_color)
        d.point((15, 5), fill=glow_color)
    else:
        d.rectangle((5, 9, 10, 10), fill=(0x60, 0x60, 0x60, 0xFF))
    return img


def _draw_ticket_machine(img, body_color, accent):
    d = ImageDraw.Draw(img)
    d.rectangle((3, 1, 12, 14), fill=body_color)
    d.rectangle((4, 2, 11, 6), fill=(0x20, 0x40, 0x60, 0xFF))
    d.point((5, 3), fill=accent)
    d.point((10, 4), fill=accent)
    d.rectangle((4, 8, 6, 9), fill=accent)
    d.rectangle((8, 8, 10, 9), fill=accent)
    d.rectangle((4, 11, 6, 12), fill=accent)
    d.rectangle((8, 11, 10, 12), fill=accent)
    d.rectangle((6, 13, 9, 13), fill=(0x20, 0x20, 0x20, 0xFF))
    return img


def _draw_chair(img, frame_color, seat_color):
    d = ImageDraw.Draw(img)
    d.rectangle((3, 1, 12, 5), fill=frame_color)
    d.rectangle((2, 6, 13, 9), fill=seat_color)
    d.rectangle((2, 9, 3, 14), fill=frame_color)
    d.rectangle((12, 9, 13, 14), fill=frame_color)
    return img


def _draw_stall(img, body_color, roof_color):
    d = ImageDraw.Draw(img)
    d.polygon([(0, 4), (15, 4), (13, 1), (2, 1)], fill=roof_color)
    d.rectangle((0, 5, 1, 14), fill=body_color)
    d.rectangle((14, 5, 15, 14), fill=body_color)
    d.rectangle((0, 9, 15, 13), fill=body_color)
    d.rectangle((3, 7, 6, 8), fill=roof_color)
    d.rectangle((9, 7, 12, 8), fill=roof_color)
    return img


def _draw_string_lights(img, wire_color, bulb_color, on):
    d = ImageDraw.Draw(img)
    d.line((0, 4, 15, 6), fill=wire_color)
    positions = [(2, 5), (5, 5), (8, 5), (11, 6), (14, 6)]
    color = bulb_color if on else (0x40, 0x20, 0x40, 0xFF)
    for x, y in positions:
        d.point((x, y), fill=color)
        d.point((x, y + 1), fill=color)
    return img


def _draw_neon_sign(img, neon_a, neon_b):
    d = ImageDraw.Draw(img)
    d.rectangle((1, 3, 14, 12), fill=(0x20, 0x10, 0x30, 0xFF))
    d.line((3, 5, 12, 5), fill=neon_a)
    d.line((3, 10, 12, 10), fill=neon_b)
    d.line((3, 5, 3, 10), fill=neon_a)
    d.line((12, 5, 12, 10), fill=neon_b)
    d.point((7, 7), fill=neon_a)
    d.point((8, 8), fill=neon_b)
    return img


def _draw_alley(img, dark_color, accent):
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 15, 15), fill=dark_color)
    d.rectangle((1, 1, 7, 7), fill=accent)
    d.rectangle((8, 1, 14, 7), fill=accent)
    d.rectangle((1, 8, 7, 14), fill=accent)
    d.rectangle((8, 8, 14, 14), fill=accent)
    d.line((0, 7, 15, 7), fill=dark_color)
    d.line((7, 0, 7, 15), fill=dark_color)
    return img


# ---------------------------------------------------------------------------
# 各空间 tileset 构建
# ---------------------------------------------------------------------------

def build_tileset_town_square(p):
    """返回 [tile_image, ...]，索引即 tile id（0=空）。"""
    tiles = [_new_tile()]  # 0 empty
    # 1 main floor
    tiles.append(_draw_floor(_new_tile(), p["floor_a"], p["floor_c"], 0))
    # 2 alt floor
    tiles.append(_draw_floor(_new_tile(), p["floor_b"], p["floor_a"], 1))
    # 3 wall
    tiles.append(_draw_wall(_new_tile(), p["wall"], p["wall_accent"]))
    # 4 window
    tiles.append(_draw_window(_new_tile(), p["wall"], p["window"]))
    # 5 street lamp
    tiles.append(_draw_street_lamp(_new_tile(), p["lamp_post"], p["lamp_glow"]))
    # 6 bench
    tiles.append(_draw_bench(_new_tile(), p["bench_wood"], p["bench_shadow"]))
    # 7 kiosk
    tiles.append(_draw_kiosk(_new_tile(), p["kiosk_body"], p["kiosk_roof"]))
    # 8 fountain base
    tiles.append(_draw_fountain_base(_new_tile(), p["fountain_stone"], p["fountain_water"]))
    # 9 fountain splash frame 1
    tiles.append(_draw_fountain_splash(_new_tile(), p["fountain_water"], p["fountain_splash"], 0))
    # 10 fountain splash frame 2
    tiles.append(_draw_fountain_splash(_new_tile(), p["fountain_water"], p["fountain_splash"], 1))
    return tiles


def build_tileset_cafe(p):
    tiles = [_new_tile()]
    tiles.append(_draw_floor(_new_tile(), p["floor_a"], p["floor_c"], 0))
    tiles.append(_draw_floor(_new_tile(), p["floor_b"], p["floor_a"], 1))
    tiles.append(_draw_wall(_new_tile(), p["wall"], p["wall_accent"]))
    tiles.append(_draw_window(_new_tile(), p["wall"], p["window"]))
    tiles.append(_draw_table(_new_tile(), p["table_wood"], p["table_accent"]))
    tiles.append(_draw_counter(_new_tile(), p["counter_wood"], p["counter_top"]))
    tiles.append(_draw_coffee_machine(_new_tile(), p["machine"], p["machine_accent"]))
    tiles.append(_draw_steam(_new_tile(), p["steam"], 0))
    tiles.append(_draw_steam(_new_tile(), p["steam"], 1))
    tiles.append(_draw_window(_new_tile(), p["wall"], p["window"]))  # 9 alt window variant slot
    return tiles


def build_tileset_home(p):
    tiles = [_new_tile()]
    tiles.append(_draw_floor(_new_tile(), p["floor_a"], p["floor_c"], 0))
    tiles.append(_draw_floor(_new_tile(), p["floor_b"], p["floor_a"], 1))
    tiles.append(_draw_wall(_new_tile(), p["wall"], p["wall_accent"]))
    tiles.append(_draw_window(_new_tile(), p["wall"], p["window"]))
    tiles.append(_draw_desk(_new_tile(), p["desk_wood"], p["desk_accent"]))
    tiles.append(_draw_bed(_new_tile(), p["bed_frame"], p["bed_sheet"]))
    tiles.append(_draw_leak(_new_tile(), p["floor_a"], p["leak_water"], p["leak_deep"]))
    tiles.append(_draw_fan_mount(_new_tile(), p["fan_body"]))
    tiles.append(_draw_fan_blades(_new_tile(), p["fan_body"], p["fan_blade"], 0))
    tiles.append(_draw_fan_blades(_new_tile(), p["fan_body"], p["fan_blade"], 1))
    return tiles


def build_tileset_station(p):
    tiles = [_new_tile()]
    tiles.append(_draw_floor(_new_tile(), p["floor_a"], p["floor_c"], 0))
    tiles.append(_draw_floor(_new_tile(), p["floor_b"], p["floor_a"], 1))
    tiles.append(_draw_wall(_new_tile(), p["wall"], p["wall_accent"]))
    tiles.append(_draw_window(_new_tile(), p["wall"], p["window"]))
    tiles.append(_draw_platform(_new_tile(), p["platform_top"], p["platform_edge"], p["track"]))
    tiles.append(_draw_ticket_machine(_new_tile(), p["ticket_body"], p["ticket_accent"]))
    tiles.append(_draw_chair(_new_tile(), p["chair_frame"], p["chair_seat"]))
    tiles.append(_draw_platform_light(_new_tile(), p["light_body"], p["light_glow"], True))
    tiles.append(_draw_platform_light(_new_tile(), p["light_body"], p["light_glow"], False))
    return tiles


def build_tileset_night_market(p):
    tiles = [_new_tile()]
    tiles.append(_draw_floor(_new_tile(), p["floor_a"], p["floor_c"], 0))
    tiles.append(_draw_floor(_new_tile(), p["floor_b"], p["floor_a"], 1))
    tiles.append(_draw_wall(_new_tile(), p["wall"], p["wall_accent"]))
    tiles.append(_draw_window(_new_tile(), p["wall"], p["window_pink"]))
    tiles.append(_draw_string_lights(_new_tile(), p["string_wire"], p["string_bulb_on"], True))
    tiles.append(_draw_string_lights(_new_tile(), p["string_wire"], p["string_bulb_on"], False))
    tiles.append(_draw_stall(_new_tile(), p["stall_body"], p["stall_roof"]))
    tiles.append(_draw_neon_sign(_new_tile(), p["neon_a"], p["neon_b"]))
    tiles.append(_draw_alley(_new_tile(), p["alley_dark"], p["alley_accent"]))
    return tiles


# ---------------------------------------------------------------------------
# 各空间地图层构建
# ---------------------------------------------------------------------------

def _flat_bg(width, height, tile_main, tile_alt):
    """bgTiles：checker 风格铺满主/副地砖。"""
    data = []
    for y in range(height):
        for x in range(width):
            data.append(tile_main if (x + y) % 2 == 0 else tile_alt)
    return data


def _empty_layer(width, height):
    return [0] * (width * height)


def _set_tile(data, width, x, y, tile_id):
    """安全放置单个 tile，越界忽略。"""
    data[y * width + x] = tile_id


def _set_rect(data, width, height, x0, y0, x1, y1, tile_id):
    for y in range(max(0, y0), min(height, y1 + 1)):
        for x in range(max(0, x0), min(width, x1 + 1)):
            data[y * width + x] = tile_id


def _set_border_walls(data, width, height, wall_tile):
    """沿地图四边放置墙。"""
    for x in range(width):
        _set_tile(data, width, x, 0, wall_tile)
        _set_tile(data, width, x, height - 1, wall_tile)
    for y in range(height):
        _set_tile(data, width, 0, y, wall_tile)
        _set_tile(data, width, width - 1, y, wall_tile)


def build_layers_town_square(width, height):
    bg = _flat_bg(width, height, 1, 2)
    obj = _empty_layer(width, height)

    # 四边墙
    _set_border_walls(obj, width, height, 3)
    # 窗户在墙边
    for x in (4, 10, 20, 27):
        _set_tile(obj, width, x, 0, 4)
    for x in (6, 14, 24):
        _set_tile(obj, width, x, height - 1, 4)

    # 长椅沿路
    for x in (6, 14, 22):
        _set_tile(obj, width, x, 12, 6)
    for x in (10, 18, 26):
        _set_tile(obj, width, x, 17, 6)

    # 报刊亭
    _set_rect(obj, width, height, 3, 6, 4, 7, 7)
    _set_rect(obj, width, height, 27, 6, 28, 7, 7)

    # 路灯
    for (x, y) in [(8, 4), (16, 4), (24, 4), (8, 19), (24, 19)]:
        _set_tile(obj, width, x, y, 5)

    # 中央喷泉（base 占 3×3，中心留空给动画层）
    cx, cy = width // 2, height // 2
    _set_rect(obj, width, height, cx - 1, cy - 1, cx + 1, cy + 1, 8)

    # 动画对象：喷泉位于中心 tile，使用 tile 9（splash frame 1），2 帧
    animated = [
        {
            "name": "fountain",
            "type": "animated",
            "x": cx * TILE_SIZE,
            "y": cy * TILE_SIZE,
            "width": TILE_SIZE,
            "height": TILE_SIZE,
            "properties": [
                {"name": "tileId", "type": "int", "value": 9},
                {"name": "frames", "type": "int", "value": 2},
                {"name": "fps", "type": "float", "value": 4.0},
            ],
        }
    ]
    return bg, obj, animated


def build_layers_cafe(width, height):
    bg = _flat_bg(width, height, 1, 2)
    obj = _empty_layer(width, height)

    _set_border_walls(obj, width, height, 3)
    # 窗户
    for x in (3, 8, 13, 17):
        _set_tile(obj, width, x, 0, 4)

    # 吧台沿下边
    _set_rect(obj, width, height, 2, 9, 17, 9, 6)
    # 咖啡机
    _set_tile(obj, width, 6, 8, 7)
    _set_tile(obj, width, 12, 8, 7)

    # 小桌 + 椅子占位（用 4=table）
    for (x, y) in [(4, 4), (10, 4), (15, 4), (4, 11), (15, 11)]:
        _set_tile(obj, width, x, y, 5)

    # 动画对象：咖啡机蒸汽（tile 8，2 帧）
    animated = [
        {
            "name": "coffee_machine_steam",
            "type": "animated",
            "x": 6 * TILE_SIZE,
            "y": 7 * TILE_SIZE,
            "width": TILE_SIZE,
            "height": TILE_SIZE,
            "properties": [
                {"name": "tileId", "type": "int", "value": 8},
                {"name": "frames", "type": "int", "value": 2},
                {"name": "fps", "type": "float", "value": 5.0},
            ],
        },
        {
            "name": "coffee_machine_steam_2",
            "type": "animated",
            "x": 12 * TILE_SIZE,
            "y": 7 * TILE_SIZE,
            "width": TILE_SIZE,
            "height": TILE_SIZE,
            "properties": [
                {"name": "tileId", "type": "int", "value": 8},
                {"name": "frames", "type": "int", "value": 2},
                {"name": "fps", "type": "float", "value": 5.0},
            ],
        },
    ]
    return bg, obj, animated


def build_layers_home(width, height):
    bg = _flat_bg(width, height, 1, 2)
    obj = _empty_layer(width, height)

    _set_border_walls(obj, width, height, 3)
    # 窗户
    _set_tile(obj, width, 5, 0, 4)
    _set_tile(obj, width, 10, 0, 4)

    # 床（左下）
    _set_rect(obj, width, height, 1, 8, 5, 10, 6)

    # 书桌（右下）
    _set_rect(obj, width, height, 10, 9, 14, 10, 5)

    # 漏水痕迹（右上墙角）
    _set_tile(obj, width, 13, 1, 7)
    _set_tile(obj, width, 13, 2, 7)

    # 风扇（贴墙）
    _set_tile(obj, width, 7, 1, 8)

    # 动画对象：风扇旋转（tile 9 frame1，2 帧）
    animated = [
        {
            "name": "fan",
            "type": "animated",
            "x": 7 * TILE_SIZE,
            "y": 1 * TILE_SIZE,
            "width": TILE_SIZE,
            "height": TILE_SIZE,
            "properties": [
                {"name": "tileId", "type": "int", "value": 9},
                {"name": "frames", "type": "int", "value": 2},
                {"name": "fps", "type": "float", "value": 6.0},
            ],
        }
    ]
    return bg, obj, animated


def build_layers_station(width, height):
    bg = _flat_bg(width, height, 1, 2)
    obj = _empty_layer(width, height)

    _set_border_walls(obj, width, height, 3)
    # 窗户
    for x in (3, 8, 14, 19):
        _set_tile(obj, width, x, 0, 4)

    # 站台（下半部一长条）
    _set_rect(obj, width, height, 1, 9, width - 2, 11, 5)

    # 售票机
    _set_tile(obj, width, 2, 5, 6)
    _set_tile(obj, width, width - 3, 5, 6)

    # 候车椅
    for x in (6, 10, 14, 18):
        _set_tile(obj, width, x, 7, 7)

    # 站台灯（左右各一）
    _set_tile(obj, width, 4, 1, 8)
    _set_tile(obj, width, width - 5, 1, 8)

    # 动画对象：站台灯闪烁（tile 8 on 帧，2 帧）
    animated = [
        {
            "name": "platform_light_left",
            "type": "animated",
            "x": 4 * TILE_SIZE,
            "y": 1 * TILE_SIZE,
            "width": TILE_SIZE,
            "height": TILE_SIZE,
            "properties": [
                {"name": "tileId", "type": "int", "value": 8},
                {"name": "frames", "type": "int", "value": 2},
                {"name": "fps", "type": "float", "value": 2.0},
            ],
        },
        {
            "name": "platform_light_right",
            "type": "animated",
            "x": (width - 5) * TILE_SIZE,
            "y": 1 * TILE_SIZE,
            "width": TILE_SIZE,
            "height": TILE_SIZE,
            "properties": [
                {"name": "tileId", "type": "int", "value": 8},
                {"name": "frames", "type": "int", "value": 2},
                {"name": "fps", "type": "float", "value": 2.0},
            ],
        },
    ]
    return bg, obj, animated


def build_layers_night_market(width, height):
    bg = _flat_bg(width, height, 1, 2)
    obj = _empty_layer(width, height)

    _set_border_walls(obj, width, height, 3)
    # 窗户（霓虹粉）
    for x in (4, 12, 20, 25):
        _set_tile(obj, width, x, 0, 4)

    # 摊位（左右两排）
    for x in (2, 6, 10, 14, 18, 22):
        _set_tile(obj, width, x, 4, 7)
        _set_tile(obj, width, x, 14, 7)

    # 霓虹招牌
    _set_tile(obj, width, 8, 1, 8)
    _set_tile(obj, width, 19, 1, 8)

    # 窄巷
    _set_rect(obj, width, height, 13, 6, 14, 13, 9)

    # 灯串位置（上方）
    _set_tile(obj, width, 5, 2, 5)
    _set_tile(obj, width, 22, 2, 5)

    # 动画对象：灯串闪烁（tile 5 frame1，2 帧）
    animated = [
        {
            "name": "string_lights_left",
            "type": "animated",
            "x": 5 * TILE_SIZE,
            "y": 2 * TILE_SIZE,
            "width": TILE_SIZE,
            "height": TILE_SIZE,
            "properties": [
                {"name": "tileId", "type": "int", "value": 5},
                {"name": "frames", "type": "int", "value": 2},
                {"name": "fps", "type": "float", "value": 3.0},
            ],
        },
        {
            "name": "string_lights_right",
            "type": "animated",
            "x": 22 * TILE_SIZE,
            "y": 2 * TILE_SIZE,
            "width": TILE_SIZE,
            "height": TILE_SIZE,
            "properties": [
                {"name": "tileId", "type": "int", "value": 5},
                {"name": "frames", "type": "int", "value": 2},
                {"name": "fps", "type": "float", "value": 3.0},
            ],
        },
    ]
    return bg, obj, animated


# ---------------------------------------------------------------------------
# 空间规格
# ---------------------------------------------------------------------------

SPACES = [
    {
        "space_id": "town_square",
        "name": "广场",
        "width": 32,
        "height": 24,
        "build_tileset": build_tileset_town_square,
        "build_layers": build_layers_town_square,
    },
    {
        "space_id": "cafe",
        "name": "咖啡馆",
        "width": 20,
        "height": 15,
        "build_tileset": build_tileset_cafe,
        "build_layers": build_layers_cafe,
    },
    {
        "space_id": "home",
        "name": "出租屋",
        "width": 16,
        "height": 12,
        "build_tileset": build_tileset_home,
        "build_layers": build_layers_home,
    },
    {
        "space_id": "station",
        "name": "车站",
        "width": 24,
        "height": 16,
        "build_tileset": build_tileset_station,
        "build_layers": build_layers_station,
    },
    {
        "space_id": "night_market",
        "name": "夜市",
        "width": 28,
        "height": 20,
        "build_tileset": build_tileset_night_market,
        "build_layers": build_layers_night_market,
    },
]


# ---------------------------------------------------------------------------
# 生成
# ---------------------------------------------------------------------------

def build_tileset_image(tiles):
    """把 tile list 横向拼成单行 PNG。"""
    count = len(tiles)
    sheet = Image.new("RGBA", (TILE_SIZE * count, TILE_SIZE), TRANSPARENT)
    for idx, tile in enumerate(tiles):
        sheet.paste(tile, (idx * TILE_SIZE, 0))
    return sheet


def build_tilemap_json(space, tiles, bg, obj, animated):
    tile_count = len(tiles)
    return {
        "version": TILED_VERSION,
        "tiledversion": TILED_VERSION_FULL,
        "orientation": "orthogonal",
        "renderorder": "right-down",
        "width": space["width"],
        "height": space["height"],
        "tilewidth": TILE_SIZE,
        "tileheight": TILE_SIZE,
        "tilesets": [
            {
                "firstgid": 1,
                "source": "tileset.png",
                "tilewidth": TILE_SIZE,
                "tileheight": TILE_SIZE,
                "tilecount": tile_count,
                "columns": tile_count,
            }
        ],
        "layers": [
            {
                "name": "bgTiles",
                "type": "tilelayer",
                "width": space["width"],
                "height": space["height"],
                "data": list(bg),
            },
            {
                "name": "objectTiles",
                "type": "tilelayer",
                "width": space["width"],
                "height": space["height"],
                "data": list(obj),
            },
            {
                "name": "animatedSprites",
                "type": "objectgroup",
                "objects": list(animated),
            },
        ],
    }


def generate_space(space):
    palette = PALETTES[space["space_id"]]
    tiles = space["build_tileset"](palette)
    bg, obj, animated = space["build_layers"](space["width"], space["height"])

    out_dir = os.path.join(ROOT, space["space_id"])
    os.makedirs(out_dir, exist_ok=True)

    tileset_img = build_tileset_image(tiles)
    png_path = os.path.join(out_dir, "tileset.png")
    tileset_img.save(png_path)

    tilemap = build_tilemap_json(space, tiles, bg, obj, animated)
    json_path = os.path.join(out_dir, "tilemap.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(tilemap, f, ensure_ascii=False, indent=2)

    return png_path, json_path, len(tiles)


def generate_all():
    print(f"Output root: {ROOT}")
    print("-" * 60)
    for space in SPACES:
        png_path, json_path, tile_count = generate_space(space)
        print(
            f"[{space['space_id']}] {space['name']}  "
            f"{space['width']}×{space['height']} tiles, "
            f"tile_count={tile_count}"
        )
        print(f"  PNG  : {png_path}")
        print(f"  JSON : {json_path}")
    print("-" * 60)
    print(f"Done. {len(SPACES)} spaces generated.")


if __name__ == "__main__":
    generate_all()
