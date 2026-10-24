"""IndexNow: tell Bing, Yandex and Seznam right away when a public page changes.

Run `python manage.py indexnow` after a deploy. It renders each public page, compares it with the
fingerprint saved last time, and submits only the pages that changed (or are new).
Protocol: https://www.indexnow.org/documentation
"""
import hashlib
import hmac
import json
import re
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.test import RequestFactory
from django.urls import resolve

from . import seo

ENDPOINTS = [
    "https://www.bing.com/indexnow",
    "https://yandex.com/indexnow",
    "https://search.seznam.cz/indexnow",
]
TIMEOUT = 15

# CSRF tokens change on every render, so leave them out of the fingerprint.
_VOLATILE = re.compile(r'name="csrfmiddlewaretoken" value="[^"]*"')


def key():
    """Stable key: INDEXNOW_KEY if set, otherwise derived from SECRET_KEY (spec allows 8-128 hex chars)."""
    return settings.INDEXNOW_KEY or hmac.new(settings.SECRET_KEY.encode(), b"indexnow", hashlib.sha256).hexdigest()[:32]


def _host():
    return urllib.parse.urlsplit(settings.SITE_URL).hostname


def page_digest(path):
    """Fingerprint of a page as an anonymous visitor sees it."""
    request = RequestFactory().get(path, HTTP_HOST=_host())
    request.user = AnonymousUser()
    match = resolve(path)
    response = match.func(request, *match.args, **match.kwargs)
    body = _VOLATILE.sub("", response.content.decode())
    return hashlib.sha256(body.encode()).hexdigest()


def submit(urls):
    """POST the URLs to every endpoint. Returns {endpoint: HTTP status or error text}."""
    k = key()
    payload = json.dumps({"host": _host(), "key": k, "keyLocation": f"{settings.SITE_URL}/{k}.txt",
                          "urlList": urls}).encode()
    results = {}
    for endpoint in ENDPOINTS:
        req = urllib.request.Request(endpoint, data=payload, method="POST",
                                     headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                results[endpoint] = resp.status
        except urllib.error.HTTPError as e:
            results[endpoint] = e.code
        except (urllib.error.URLError, TimeoutError) as e:
            results[endpoint] = str(e)
    return results


def ping_changed(dry_run=False, force=False):
    """Submit pages that changed since the last accepted ping. Returns (urls, results)."""
    from .models import IndexNowPage
    saved = dict(IndexNowPage.objects.values_list("path", "digest"))
    pages = [(p, page_digest(p)) for p in seo.public_paths()]
    if not force:
        pages = [(p, d) for p, d in pages if saved.get(p) != d]
    if not pages:
        return [], {}
    urls = [f"{settings.SITE_URL}{p}" for p, _ in pages]
    if dry_run:
        return urls, {}
    results = submit(urls)
    # 200/202 = accepted. Only save fingerprints if an engine accepted, so failures retry next deploy.
    if any(r in (200, 202) for r in results.values()):
        for p, d in pages:
            IndexNowPage.objects.update_or_create(path=p, defaults={"digest": d})
    return urls, results
