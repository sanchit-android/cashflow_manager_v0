"""Google Search Console: check whether each public page is in Google's index, and fetch search queries & ranks.

Uses the URL Inspection API (read-only) for index status and the Search Analytics API for queries,
landing pages, clicks, impressions and average SERP position.

Setup (once):
  1. Google Cloud console: enable the "Google Search Console API", create a service account and
     download its JSON key.
  2. Search Console -> Settings -> Users and permissions: add the service account's email
     (Restricted access is enough).
  3. On Render set GSC_SERVICE_ACCOUNT_JSON to the key file's contents, and GSC_PROPERTY to the
     property name if it isn't "<SITE_URL>/" (a domain property looks like "sc-domain:plannedout.in").

Quota is 2,000 inspections a day, far more than our ~25 public pages.
"""
import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from . import seo

TOKEN_URL = "https://oauth2.googleapis.com/token"
INSPECT_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
ANALYTICS_URL = "https://searchconsole.googleapis.com/webmasters/v3/sites/{}/searchAnalytics/query"
SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"
TIMEOUT = 20
STALE_AFTER = timedelta(days=6)


def enabled():
    return bool(settings.GSC_SERVICE_ACCOUNT_JSON)


def property_url():
    return settings.GSC_PROPERTY or f"{settings.SITE_URL}/"


def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _post(url, data, headers):
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get("error", {})
            msg = msg.get("message", msg) if isinstance(msg, dict) else msg
        except ValueError:
            msg = e.reason
        raise RuntimeError(f"Google returned {e.code}: {msg}") from None


def access_token():
    """Swap a signed service-account JWT for a short-lived access token."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    info = json.loads(settings.GSC_SERVICE_ACCOUNT_JSON)
    now = int(time.time())
    header = _b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    claims = _b64(json.dumps({"iss": info["client_email"], "scope": SCOPE, "aud": TOKEN_URL,
                              "iat": now, "exp": now + 3600}).encode())
    key = serialization.load_pem_private_key(info["private_key"].encode(), password=None)
    sig = _b64(key.sign(f"{header}.{claims}".encode(), padding.PKCS1v15(), hashes.SHA256()))
    body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                                   "assertion": f"{header}.{claims}.{sig}"}).encode()
    return _post(TOKEN_URL, body, {"Content-Type": "application/x-www-form-urlencoded"})["access_token"]


def inspect(url, token):
    """Google's index status for one URL, trimmed to the fields we show."""
    body = json.dumps({"inspectionUrl": url, "siteUrl": property_url()}).encode()
    data = _post(INSPECT_URL, body, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    r = data.get("inspectionResult", {}).get("indexStatusResult", {})
    crawled = parse_datetime(r["lastCrawlTime"]) if r.get("lastCrawlTime") else None
    return {"verdict": r.get("verdict", ""), "coverage": r.get("coverageState", ""), "last_crawl": crawled,
            "google_canonical": r.get("googleCanonical", "")}


_token = {"value": None, "expires": 0}


def cached_token():
    """Reuse one access token (valid 1h) across single-page checks."""
    if not _token["value"] or time.time() > _token["expires"]:
        _token["value"], _token["expires"] = access_token(), time.time() + 3000
    return _token["value"]


def check_one(path):
    """Inspect one public page and save its result. Raises on Google/network errors."""
    from .models import IndexStatus
    if path not in seo.public_paths():
        raise ValueError(f"{path} is not a public page")
    result = inspect(f"{settings.SITE_URL}{path}", cached_token())
    IndexStatus.objects.update_or_create(path=path, defaults=result)


def check_all():
    """Inspect every public page and save the results. Returns (checked, errors)."""
    from .models import IndexStatus
    token = access_token()
    checked, errors = 0, []
    for path in seo.public_paths():
        try:
            result = inspect(f"{settings.SITE_URL}{path}", token)
        except (RuntimeError, urllib.error.URLError, TimeoutError) as e:
            errors.append(f"{path}: {e}")
            continue
        IndexStatus.objects.update_or_create(path=path, defaults=result)
        checked += 1
    IndexStatus.objects.exclude(path__in=seo.public_paths()).delete()  # pages we removed
    return checked, errors


def is_stale():
    from .models import IndexStatus
    last = IndexStatus.objects.order_by("-checked_at").values_list("checked_at", flat=True).first()
    return last is None or timezone.now() - last > STALE_AFTER


def _query_analytics(token, start, end, dimensions, row_limit=100):
    url = ANALYTICS_URL.format(urllib.parse.quote(property_url(), safe=""))
    body = json.dumps({"startDate": start.isoformat(), "endDate": end.isoformat(),
                       "dimensions": dimensions, "rowLimit": row_limit}).encode()
    data = _post(url, body, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return data.get("rows") or []


def _fmt_row(r, keys):
    return {**dict(zip(keys, r.get("keys", []))),
            "clicks": int(r.get("clicks", 0)), "impressions": int(r.get("impressions", 0)),
            "ctr": round(100 * float(r.get("ctr", 0)), 1), "position": round(float(r.get("position", 0)), 1)}


def _path_of(url):
    p = urllib.parse.urlparse(url).path or "/"
    return p if p.startswith("/") else "/" + p


def search_analytics(days=28):
    """Fetch top Google search queries, landing pages, and query+page pairs with rank positions."""
    from django.core.cache import cache
    days = max(1, min(365, int(days)))
    cache_key = f"gsc:analytics:{days}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    end = timezone.localdate() - timedelta(days=2)  # Search Console data lags ~2 days
    start = end - timedelta(days=days - 1)
    token = cached_token()
    q_rows = [_fmt_row(r, ["query"]) for r in _query_analytics(token, start, end, ["query"], 100)]
    p_rows = [_fmt_row(r, ["page"]) for r in _query_analytics(token, start, end, ["page"], 50)]
    for r in p_rows:
        r["path"] = _path_of(r["page"])
    qp_rows = [_fmt_row(r, ["query", "page"]) for r in _query_analytics(token, start, end, ["query", "page"], 100)]
    for r in qp_rows:
        r["path"] = _path_of(r["page"])
    tot_clicks = sum(r["clicks"] for r in p_rows)
    tot_impr = sum(r["impressions"] for r in p_rows)
    avg_pos = round(sum(r["position"] * r["impressions"] for r in p_rows) / tot_impr, 1) if tot_impr else None
    out = {
        "days": days, "from": start.isoformat(), "to": end.isoformat(),
        "totals": {"clicks": tot_clicks, "impressions": tot_impr,
                   "ctr": round(100 * tot_clicks / tot_impr, 1) if tot_impr else 0,
                   "position": avg_pos, "queries": len(q_rows)},
        "queries": q_rows, "pages": p_rows, "query_pages": qp_rows,
    }
    cache.set(cache_key, out, 60 * 30)
    return out

