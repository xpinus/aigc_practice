"""Size parsing/validation and the connection-error step-down ladder."""

from __future__ import annotations

try:
    from . import common
except ImportError:
    import common

MAX_EDGE = 3840
MIN_PIXELS = 655_360
MAX_PIXELS = 8_294_400
LADDER_MAX_ATTEMPTS = 3
LADDER_PIXEL_CAP = 1_500_000


def parse_size(size: str):
    parts = size.lower().split("x")
    if len(parts) != 2:
        common.die("--size/--target-size must be 'auto' or WIDTHxHEIGHT, got: " + size)
    try:
        w, h = int(parts[0]), int(parts[1])
    except ValueError:
        common.die("--size/--target-size must be 'auto' or WIDTHxHEIGHT, got: " + size)
    if w <= 0 or h <= 0:
        common.die("dimensions must be positive, got: " + size)
    return w, h


def validate_size(model: str, size: str) -> None:
    if size == "auto":
        return
    w, h = parse_size(size)
    if model != common.GPT_IMAGE_2:
        return
    if max(w, h) > MAX_EDGE:
        common.die("%s max edge is %dpx, got %dx%d" % (common.GPT_IMAGE_2, MAX_EDGE, w, h))
    if w % 16 or h % 16:
        common.die("%s requires both edges to be multiples of 16, got %dx%d" % (common.GPT_IMAGE_2, w, h))
    if max(w, h) / min(w, h) > 3:
        common.die("%s long:short ratio must be <= 3:1, got %dx%d" % (common.GPT_IMAGE_2, w, h))
    px = w * h
    if not (MIN_PIXELS <= px <= MAX_PIXELS):
        common.die("%s total pixels must be in [%d, %d], got %d"
                   % (common.GPT_IMAGE_2, MIN_PIXELS, MAX_PIXELS, px))


def fit_to_pixels(size: str, max_pixels: int) -> str:
    """Scale a WxH size down (keep ratio) so total pixels <= max_pixels, edges multiples of 16."""
    w, h = parse_size(size)
    if w * h <= max_pixels:
        return size
    import math
    f = math.sqrt(max_pixels / float(w * h))
    nw = max(16, int(w * f // 16) * 16)
    nh = max(16, int(h * f // 16) * 16)
    return "%dx%d" % (nw, nh)


def ladder_configs(quality: str, size: str):
    """Step-down sequence used on connection-type errors only; capped at LADDER_MAX_ATTEMPTS.

    Empirically ordered: shrink size before dropping quality (proxies tend to cut
    long generations by quality x pixel budget), second rung lands on the
    <= LADDER_PIXEL_CAP size that completed reliably in production.
    """
    fitted = fit_to_pixels(size, LADDER_PIXEL_CAP)
    seq = [(quality, size)]
    if quality in ("high", "auto", "medium"):
        seq += [("medium", fitted), ("low", fitted)]
    else:
        seq += [("low", fitted)]
    out = []
    for item in seq:
        if item not in out:
            out.append(item)
    return out[:LADDER_MAX_ATTEMPTS]
