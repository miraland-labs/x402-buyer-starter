PR402_FACILITATOR_URL_PRODUCTION = "https://agent.pay402.me"
PR402_FACILITATOR_URL_PREVIEW = "https://preview.agent.pay402.me"


def facilitator_base_url(capabilities_url: str | None, fallback_base_url: str) -> str:
    raw = (capabilities_url or fallback_base_url or "").strip().rstrip("/")
    suffix = "/api/v1/facilitator/capabilities"
    if raw.endswith(suffix):
        raw = raw[: -len(suffix)].rstrip("/")
    elif raw.endswith(suffix + "/"):
        raw = raw[: -len(suffix) - 1].rstrip("/")
    return raw


def is_exact_rail_scheme(scheme: object | None) -> bool:
    return scheme in ("exact", "v2:solana:exact")


def canonical_accepted_for_build(accepted: dict) -> dict:
    if accepted.get("scheme") == "v2:solana:exact":
        out = dict(accepted)
        out["scheme"] = "exact"
        return out
    return accepted
