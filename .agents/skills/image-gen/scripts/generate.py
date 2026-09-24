#!/usr/bin/env python3
"""Image generation CLI for the project-level image-gen skill (entry point).

Structure (single-responsibility modules in this directory):
  common.py  - backend/key resolution, wire-id mapping, die/guidance
  sizing.py  - size parse/validate/fit + connection-error step-down ladder
  alpha.py   - alpha verification/normalization + final resize (Pillow optional)
  cutout.py  - white-bg -> transparent rounded-rect cutout (cv2+numpy optional)

Backends (resolved in order):
  1. OFOX_API_KEY   + OFOX_BASE_URL   (default https://api.ofox.ai/v1)
  2. OPENAI_API_KEY + OPENAI_BASE_URL (official OpenAI default)

Facts enforced here:
  - This skill supports exactly one model: gpt-image-2. Any other --model
    value is refused up front.
  - Proxy wire ids: ofox routes models under vendor-prefixed ids
    (openai/gpt-image-2); mapped automatically per backend.
  - background=transparent on gpt-image-2 is a PREVIEW feature (per the
    OpenAI API reference); success depends on the call path/backend.
  - Some proxies cut long synchronous generations (observed on ofox for
    quality=high + 2K sizes); the ladder steps down on connection errors.
  - Transparent outputs from preview backends may carry an alpha ceiling
    of ~254; normalized to 255 automatically. Fully opaque results fall
    back to white-background regeneration + geometric cutout.

Required dependency: openai SDK. Optional: Pillow (alpha/resize),
opencv-python + numpy (cutout fallback).
"""

from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path

try:
    from . import alpha, common, cutout, sizing
except ImportError:
    import alpha
    import common
    import cutout
    import sizing

DEFAULT_OUTPUT_DIR = Path("output") / "image-gen"
WHITE_SUFFIX = (" Background: perfectly clean flat uniform seamless pure white #FFFFFF "
                "studio background outside the subject; no gradient, no shadow, no floor, "
                "no reflection, no props.")


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        prog="generate.py",
        description="Generate images via ofox.ai proxy or the official OpenAI Images API.",
    )
    p.add_argument("prompt", help="image description (Chinese or English)")
    p.add_argument("--model", default=common.GPT_IMAGE_2,
                   help="model id (this skill supports gpt-image-2 only; default: %(default)s)")
    p.add_argument("--size", default="1024x1024", help="auto or WIDTHxHEIGHT (default: %(default)s)")
    p.add_argument("--quality", default="auto", choices=["low", "medium", "high", "auto"],
                   help="default: %(default)s")
    p.add_argument("--count", type=int, default=1, help="variants of the same prompt, 1-10 (default: %(default)s)")
    p.add_argument("--background", default="auto", choices=["auto", "transparent", "opaque"],
                   help="transparent: preview feature on gpt-image-2, alpha verified after save (default: %(default)s)")
    p.add_argument("--transparent-strategy", default="auto", choices=["auto", "native", "cutout"],
                   help="auto: native first, white-bg + geometric cutout if opaque; "
                        "native: native only; cutout: skip native, go straight to cutout (default: %(default)s)")
    p.add_argument("--ladder", default="auto", choices=["auto", "off"],
                   help="auto: step down quality/size on connection-type errors (default: %(default)s)")
    p.add_argument("--target-size", default=None,
                   help="final WxH; Lanczos-resize the saved asset when it differs (needs Pillow)")
    p.add_argument("--output", default=None,
                   help="output file path; treated as a directory when --count > 1 "
                        "(a .png suffix is stripped in that case); default: output/image-gen/")
    p.add_argument("--timeout", type=float, default=120.0, help="HTTP timeout in seconds (default: %(default)s)")
    p.add_argument("--api-key", default=None, help="override API key (env vars preferred)")
    p.add_argument("--base-url", default=None, help="override API base URL")
    return p.parse_args(argv)


def plan_outputs(args):
    if args.count == 1 and args.output:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        return [path]
    if args.output:
        directory = Path(args.output)
        if directory.suffix.lower() == ".png":
            directory = directory.with_suffix("")
    else:
        directory = DEFAULT_OUTPUT_DIR
    directory.mkdir(parents=True, exist_ok=True)
    return [directory / ("image_%02d.png" % i) for i in range(1, args.count + 1)]


def call_images(client, kwargs):
    """Returns (resp, None) or (None, 'connection') / (None, 'other:<msg>')."""
    try:
        return client.images.generate(**kwargs), None
    except Exception as exc:
        if type(exc).__name__ in ("APIConnectionError", "ConnectionError") \
                or "connection" in str(exc).lower():
            return None, "connection"
        return None, "other: %s" % exc


def main(argv=None) -> int:
    args = parse_args(argv)
    if not 1 <= args.count <= 10:
        common.die("--count must be between 1 and 10, got %d" % args.count)
    if args.model not in common.SUPPORTED_MODELS:
        common.die("this skill supports only %s, got --model %s" % (common.GPT_IMAGE_2, args.model))
    if args.background == "transparent":
        print("warning: %s transparent background is a PREVIEW feature; success depends "
              "on call path/backend. Saved alpha will be verified after download; strategy: %s."
              % (args.model, args.transparent_strategy), file=sys.stderr)
    sizing.validate_size(args.model, args.size)
    if args.target_size:
        sizing.validate_size(args.model, args.target_size)

    key, base_url, backend = common.resolve_backend(args.api_key, args.base_url)
    if not key:
        print(common.key_setup_guidance(), file=sys.stderr)
        return 2
    wire_model = common.WIRE_MODEL_IDS.get(backend, {}).get(args.model, args.model)
    suffix = (" | wire model: " + wire_model) if wire_model != args.model else ""
    print("[backend] %s @ %s%s" % (backend, base_url, suffix), file=sys.stderr)

    try:
        from openai import OpenAI
    except ImportError:
        common.die("openai SDK not installed. Install with: uv pip install openai  (or: pip install openai)")
    client = OpenAI(api_key=key, base_url=base_url, timeout=args.timeout)

    configs = (sizing.ladder_configs(args.quality, args.size) if args.ladder == "auto"
               else [(args.quality, args.size)])
    outputs = plan_outputs(args)

    def run_route(prompt_text, with_background):
        """Try ladder configs until one succeeds; returns (used_config, saved_paths)."""
        last = None
        for idx, (q, s) in enumerate(configs, 1):
            sizing.validate_size(args.model, s)
            kwargs = {"model": wire_model, "prompt": prompt_text, "n": args.count,
                      "size": s, "quality": q, "response_format": "b64_json"}
            if with_background and args.background != "auto":
                kwargs["background"] = args.background
            print("[ladder] attempt %d/%d: quality=%s size=%s" % (idx, len(configs), q, s),
                  file=sys.stderr)
            resp, err = call_images(client, kwargs)
            if err is None:
                saved = []
                for item, dest in zip(resp.data, outputs):
                    if not getattr(item, "b64_json", None):
                        common.die("API returned an image without b64_json payload")
                    dest.write_bytes(base64.b64decode(item.b64_json))
                    saved.append(dest)
                return (q, s), saved
            last = err
            if err != "connection" or args.ladder == "off" or idx == len(configs):
                common.die("image generation failed: %s"
                           % (err if err != "connection"
                              else "connection error (ladder exhausted or disabled)"))
            print("[ladder] connection error; stepping down", file=sys.stderr)
        common.die("image generation failed: %s" % last)

    def apply_cutout(saved):
        for path in saved:
            info = cutout.geometric_cutout(path, path)
            if info is None:
                print("[fallback] cutout skipped for %s (opencv-python/numpy not installed); "
                      "kept opaque image" % path.name, file=sys.stderr)
            else:
                print("[fallback] %s: cutout done bbox=%s ratio=%.4f r=%.1f"
                      % (path.name, info["bbox"], info["ratio"], info["radius"]), file=sys.stderr)

    use_native = args.background == "transparent" and args.transparent_strategy in ("auto", "native")
    if use_native:
        cfg, saved = run_route(args.prompt, True)
        opaque = []
        for path in saved:
            extrema = alpha.alpha_extrema(path)
            if extrema is None:
                print("[alpha] %s: verification skipped (Pillow not installed)" % path.name,
                      file=sys.stderr)
                continue
            lo, hi = extrema
            if lo == 0 and hi >= alpha.ALPHA_CEILING_OK:
                if hi < 255:
                    alpha.normalize_alpha(path)
                print("[alpha] %s: extrema=%s -> transparent OK (ceiling normalized)"
                      % (path.name, extrema), file=sys.stderr)
            elif lo == 0 and hi < alpha.ALPHA_CEILING_OK:
                print("[alpha] %s: extrema=%s -> partial alpha; inspect before use"
                      % (path.name, extrema), file=sys.stderr)
            elif hi == 0:
                print("[alpha] %s: fully transparent; check the prompt" % path.name, file=sys.stderr)
            else:
                opaque.append(path)
                print("[alpha] %s: FULLY OPAQUE - preview transparency did not materialize"
                      % path.name, file=sys.stderr)
        if opaque and args.transparent_strategy == "auto":
            print("[fallback] regenerating on pure white background for geometric cutout",
                  file=sys.stderr)
            cfg, saved = run_route(args.prompt + WHITE_SUFFIX, False)
            apply_cutout(saved)
    else:
        prompt_text = args.prompt
        if args.background == "transparent" and args.transparent_strategy == "cutout":
            prompt_text = args.prompt + WHITE_SUFFIX
        cfg, saved = run_route(prompt_text, args.background == "opaque")
        if args.background == "transparent" and args.transparent_strategy == "cutout":
            apply_cutout(saved)

    if args.target_size:
        for path in saved:
            if alpha.resize_to(path, args.target_size):
                print("[resize] %s -> %s" % (path.name, args.target_size), file=sys.stderr)
            else:
                print("[resize] skipped for %s (Pillow not installed)" % path.name, file=sys.stderr)

    for path in saved:
        print(str(path.resolve()))
    print("[saved] %d image(s) via quality=%s size=%s" % (len(saved), cfg[0], cfg[1]), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
