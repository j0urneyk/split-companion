"""Render the three Split Companion SVG candidates and an actual-size contact sheet."""

import base64
from pathlib import Path
import subprocess


CANDIDATE_DIRECTORY = Path(__file__).resolve().parent
RSVG_CONVERT = "/opt/homebrew/bin/rsvg-convert"
CANDIDATE_NAMES = {"a": "Bridge", "b": "Linked", "c": "Flow"}


def render_candidate_pngs():
    """Rasterize directly at each target size to preserve toolbar-size antialiasing."""
    for candidate in CANDIDATE_NAMES:
        for size in (128, 32, 16):
            subprocess.run(
                [RSVG_CONVERT, "-w", str(size), "-h", str(size),
                 str(CANDIDATE_DIRECTORY / f"icon-{candidate}.svg"),
                 "-o", str(CANDIDATE_DIRECTORY / f"icon-{candidate}-{size}.png")],
                check=True,
            )


def build_candidate_preview():
    """Show every PNG at native pixel dimensions on light and dark toolbars."""
    sheet = [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        'width="1040" height="700" viewBox="0 0 1040 700">',
        '<rect width="1040" height="700" fill="#eeedf2"/>',
        '<g font-family="Helvetica, Arial, sans-serif">',
        '<text x="32" y="44" font-size="25" font-weight="700" fill="#262339">Split Companion</text>',
        '<text x="32" y="73" font-size="14" fill="#625d72">Three icon directions · rendered at actual pixel sizes</text>',
    ]
    for panel_x, background, foreground, muted, theme in (
        (24, "#ffffff", "#262339", "#716c80", "WHITE"),
        (528, "#1c1b22", "#f2effa", "#aaa4ba", "DARK · #1c1b22"),
    ):
        sheet.append(f'<rect x="{panel_x}" y="100" width="488" height="548" rx="16" fill="{background}"/>')
        sheet.append(f'<text x="{panel_x + 24}" y="132" font-size="11" font-weight="700" fill="{muted}">{theme}</text>')
        for size, offset in ((128, 192), (32, 328), (16, 416)):
            sheet.append(f'<text x="{panel_x + offset}" y="132" text-anchor="middle" font-size="11" fill="{muted}">{size} px</text>')
        for index, (candidate, name) in enumerate(CANDIDATE_NAMES.items()):
            center_y = 220 + index * 168
            sheet.append(f'<text x="{panel_x + 24}" y="{center_y - 5}" font-size="19" font-weight="700" fill="{foreground}">{candidate.upper()}</text>')
            sheet.append(f'<text x="{panel_x + 24}" y="{center_y + 18}" font-size="12" fill="{muted}">{name}</text>')
            for size, offset in ((128, 192), (32, 328), (16, 416)):
                encoded_png = base64.b64encode((CANDIDATE_DIRECTORY / f"icon-{candidate}-{size}.png").read_bytes()).decode()
                sheet.append(f'<image x="{panel_x + offset - size // 2}" y="{center_y - size // 2}" width="{size}" height="{size}" xlink:href="data:image/png;base64,{encoded_png}"/>')
    sheet.extend([
        '<text x="32" y="678" font-size="12" fill="#625d72">128 px · listing     /     32 px · high-density toolbar     /     16 px · toolbar</text>',
        '</g></svg>',
    ])
    preview_svg = CANDIDATE_DIRECTORY / "preview.svg"
    preview_svg.write_text("\n".join(sheet) + "\n")
    subprocess.run([RSVG_CONVERT, str(preview_svg), "-o", str(CANDIDATE_DIRECTORY / "preview.png")], check=True)


if __name__ == "__main__":
    render_candidate_pngs()
    build_candidate_preview()
