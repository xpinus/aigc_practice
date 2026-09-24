"""White-background -> transparent RGBA via fitted rounded-rect alpha.

Requires opencv-python + numpy; geometric_cutout returns None when they are
missing so callers can degrade gracefully.
"""

from __future__ import annotations

from pathlib import Path


def geometric_cutout(src: Path, dst: Path):
    try:
        import cv2
        import numpy as np
    except ImportError:
        return None
    import math
    im = cv2.imread(str(src), cv2.IMREAD_COLOR).astype(np.float64)
    H, W = im.shape[:2]
    mn = im.min(axis=2)
    mask = (mn < 245).astype(np.uint8)
    num, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if num <= 1:
        return None
    best = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    mask = (lab == best).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    ff = mask.copy()
    mm = np.zeros((H + 2, W + 2), np.uint8)
    cv2.floodFill(ff, mm, (0, 0), 1)
    mask = np.clip(mask + (ff == 0).astype(np.uint8), 0, 1)
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    w = float(x1 - x0 + 1)
    h = float(y1 - y0 + 1)
    area = float(mask.sum())
    r = math.sqrt(max(0.0, (w * h - area) / (4.0 - math.pi)))
    SS = 8
    gw, gh = int(round(w * SS)), int(round(h * SS))
    rr = int(round(r * SS))
    M = np.zeros((gh, gw), np.uint8)
    M[:, rr:gw - rr] = 255
    M[rr:gh - rr, :] = 255
    for (cx, cy) in [(rr, rr), (gw - 1 - rr, rr), (rr, gh - 1 - rr), (gw - 1 - rr, gh - 1 - rr)]:
        cv2.circle(M, (cx, cy), rr, 255, -1)
    alpha = cv2.resize(M, (int(round(w)), int(round(h))),
                       interpolation=cv2.INTER_AREA).astype(np.float64) / 255.0
    aw, ah = alpha.shape[1], alpha.shape[0]
    card = im[y0:y0 + ah, x0:x0 + aw].copy()
    a3 = alpha[..., None]
    edge = (alpha > 0.001) & (alpha < 0.999)
    F = np.clip((card - (1.0 - a3) * 255.0) / np.maximum(a3, 0.02), 0, 255)
    card = np.where(edge[..., None], F, card)
    out = np.zeros((H, W, 4), np.float64)
    ox = (W - aw) // 2
    oy = (H - ah) // 2
    out[oy:oy + ah, ox:ox + aw, :3] = card
    out[oy:oy + ah, ox:ox + aw, 3] = alpha * 255.0
    cv2.imwrite(str(dst), np.clip(out, 0, 255).astype(np.uint8))
    return {"bbox": (x0, y0, x1, y1), "ratio": round(w / h, 4), "radius": round(r, 1)}
