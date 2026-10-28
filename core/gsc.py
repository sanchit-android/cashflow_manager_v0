"""Google Search Console: check whether each public page is in Google's index.

Uses the URL Inspection API, which is read-only: it reports a page's status but can't request
indexing. Pages that aren't indexed are listed on the admin page (Indexing view), so you only need
to click "Request indexing" in Search Console for those few.

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
