"""Alpha verification/normalization and final resizing. Pillow is optional."""

from __future__ import annotations

from pathlib import Path

try:
    from . import sizing
except ImportError:
    import sizing

ALPHA_CEILING_OK = 250


def alpha_extrema(path: Path):
    """Best-effort RGBA alpha extrema; None when Pillow is missing or unreadable."""
    try:
        from PIL import Image
    except ImportError:
        return None
    try:
        with Image.open(path) as im:
            return im.convert("RGBA").getchannel("A").getextrema()
    except Exception:
        return None


def normalize_alpha(path: Path) -> bool:
    """Clip near-opaque alpha (>= ALPHA_CEILING_OK) to 255; True when written."""
    try:
        from PIL import Image
    except ImportError:
        return False
    with Image.open(path) as im:
        im = im.convert("RGBA")
        a = im.getchannel("A").point(lambda v: 255 if v >= ALPHA_CEILING_OK else v)
        im.putalpha(a)
        im.save(path)
    return True


def resize_to(path: Path, target: str) -> bool:
    """Lanczos-resize the asset to target WxH; False when Pillow is missing."""
    try:
        from PIL import Image
    except ImportError:
        return False
    w, h = sizing.parse_size(target)
    with Image.open(path) as im:
        if im.size == (w, h):
            return True
        im = im.resize((w, h), Image.LANCZOS)
        im.save(path, format="PNG")
    return True
