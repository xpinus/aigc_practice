"""Shared backend resolution and small helpers for the image-gen skill CLI."""

from __future__ import annotations

import os
import sys

DEFAULT_OFOX_BASE_URL = "https://api.ofox.ai/v1"
DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
GPT_IMAGE_2 = "gpt-image-2"
SUPPORTED_MODELS = {GPT_IMAGE_2}
# ofox routes models under vendor-prefixed ids; map user-facing names to wire ids.
WIRE_MODEL_IDS = {"ofox": {GPT_IMAGE_2: "openai/" + GPT_IMAGE_2}}


def die(msg: str, code: int = 2):
    print("error: " + msg, file=sys.stderr)
    raise SystemExit(code)


def key_setup_guidance() -> str:
    return (
        "No API key found. Set one of:\n"
        "  1) ofox proxy (recommended, no overseas network needed):\n"
        "     - create a key at https://ofox.ai\n"
        "     - PowerShell: [Environment]::SetEnvironmentVariable(\"OFOX_API_KEY\", \"<key>\", \"User\")\n"
        "     - optional OFOX_BASE_URL (default " + DEFAULT_OFOX_BASE_URL + ")\n"
        "  2) official OpenAI:\n"
        "     - create a key at https://platform.openai.com/api-keys\n"
        "     - PowerShell: [Environment]::SetEnvironmentVariable(\"OPENAI_API_KEY\", \"<key>\", \"User\")\n"
        "Then reopen the terminal and retry. Never paste the full key into chat."
    )


def resolve_backend(cli_key, cli_url):
    """Returns (api_key, base_url, backend_name); all None when no key is configured."""
    if cli_key:
        base = (cli_url or os.environ.get("OFOX_BASE_URL")
                or os.environ.get("OPENAI_BASE_URL") or DEFAULT_OFOX_BASE_URL)
        return cli_key, base, "cli-override"
    ofox = os.environ.get("OFOX_API_KEY")
    if ofox:
        return ofox, (cli_url or os.environ.get("OFOX_BASE_URL") or DEFAULT_OFOX_BASE_URL), "ofox"
    official = os.environ.get("OPENAI_API_KEY")
    if official:
        return official, (cli_url or os.environ.get("OPENAI_BASE_URL") or DEFAULT_OPENAI_BASE_URL), "openai"
    return None, None, None
