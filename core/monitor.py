"""Site monitoring and the admin dashboard API.

What gets recorded (none of it financial; record contents stay encrypted):
- PageView: each HTML page view, with where the visitor came from. Visitors are a hash that changes
  daily; no IP address is stored.
- EndpointStat: per-hour request counts, errors and timings per route.
- ErrorEvent: server errors, failed API calls and browser errors reported by the app.
- UsageDaily: per user per day counts of named actions (screen opened, button used) sent by the app.
"""
import hashlib
import json
import platform
import re
import sys
import time
import traceback
from collections import Counter, defaultdict
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import django
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError, connection, transaction
from django.db.models import Count, F, Max, Min, Q, Sum
from django.db.models.functions import TruncDate
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from .models import (AdminGrant, Boot, EndpointStat, ErrorEvent, GoogleIdentity, IndexStatus, LoginCode, PageView, Record,
                     UsageDaily, UserFlag, Vault)

User = get_user_model()
PROCESS_STARTED = timezone.now()

# ---------- admin access ----------

def owner_email():
    return settings.OWNER_EMAIL.strip().lower()


def is_admin(user):
    if not user.is_authenticated:
        return False
    email = (user.email or user.username or "").lower()
    return email == owner_email() or AdminGrant.objects.filter(email=email).exists()


def admin_required(view):
    def wrapped(request, *a, **kw):
        if not is_admin(request.user):
            return JsonResponse({"error": "Not found."}, status=404)  # don't reveal the endpoint exists
        return view(request, *a, **kw)
    return wrapped


# ---------- traffic sources ----------

SEARCH = {"google": "google", "bing.com": "bing", "duckduckgo.com": "duckduckgo", "search.yahoo.com": "yahoo",
          "yahoo.com": "yahoo", "yandex": "yandex", "ecosia.org": "ecosia", "baidu.com": "baidu",
          "search.brave.com": "brave", "startpage.com": "startpage", "qwant.com": "qwant"}
AI = {"chatgpt.com": "chatgpt", "chat.openai.com": "chatgpt", "openai.com": "chatgpt", "perplexity.ai": "perplexity",
      "claude.ai": "claude", "gemini.google.com": "gemini", "bard.google.com": "gemini",
      "copilot.microsoft.com": "copilot", "you.com": "you.com", "phind.com": "phind", "meta.ai": "meta ai",
      "grok.com": "grok", "chat.deepseek.com": "deepseek", "deepseek.com": "deepseek", "poe.com": "poe",
      "chat.mistral.ai": "mistral"}
SOCIAL = {"facebook.com": "facebook", "fb.com": "facebook", "instagram.com": "instagram", "t.co": "x",
          "twitter.com": "x", "x.com": "x", "linkedin.com": "linkedin", "lnkd.in": "linkedin",
          "reddit.com": "reddit", "youtube.com": "youtube", "whatsapp.com": "whatsapp", "wa.me": "whatsapp",
          "quora.com": "quora", "pinterest.com": "pinterest", "threads.net": "threads", "telegram.org": "telegram",
          "t.me": "telegram", "news.ycombinator.com": "hacker news"}
EMAIL = {"mail.google.com": "gmail", "outlook.live.com": "outlook", "outlook.office.com": "outlook",
         "mail.yahoo.com": "yahoo mail"}
BOTS = [("gptbot", "GPTBot (OpenAI)"), ("oai-searchbot", "OAI-SearchBot (ChatGPT search)"),
        ("chatgpt-user", "ChatGPT-User (live fetch)"), ("claudebot", "ClaudeBot"), ("claude-user", "Claude-User (live fetch)"),
        ("claude-searchbot", "Claude-SearchBot"), ("perplexitybot", "PerplexityBot"), ("perplexity-user", "Perplexity-User"),
        ("google-extended", "Google-Extended"), ("googlebot", "Googlebot"), ("bingbot", "Bingbot"),
        ("applebot", "Applebot"), ("duckduckbot", "DuckDuckBot"), ("yandex", "YandexBot"), ("bytespider", "Bytespider"),
        ("ccbot", "CCBot (Common Crawl)"), ("amazonbot", "Amazonbot"), ("meta-externalagent", "Meta AI crawler"),
        ("facebookexternalhit", "Facebook preview"), ("linkedinbot", "LinkedIn preview"), ("twitterbot", "X preview"),
        ("whatsapp", "WhatsApp preview"), ("slackbot", "Slack preview"), ("ahrefs", "Ahrefs"), ("semrush", "Semrush")]
AI_BOT_WORDS = ("gpt", "oai", "claude", "perplexity", "google-extended", "ccbot", "bytespider", "meta-external", "amazonbot")
GENERIC_BOT = re.compile(r"bot|crawl|spider|slurp|preview|fetch|headless|python-requests|curl|wget|httpx|go-http", re.I)


def _match(host, table):
    for k, v in table.items():
        if host == k or host.endswith("." + k) or (k in ("google", "yandex") and k in host.split(".")):
            return v
    return None


def bot_name(ua):
    low = ua.lower()
    for key, name in BOTS:
        if key in low:
            return name
    return "Other bot" if (not ua or GENERIC_BOT.search(ua)) else None


def classify(referer, query, own_host):
    """-> (source, source_name, referrer_host, campaign)."""
    q = parse_qs(query or "")
    utm = (q.get("utm_source") or [""])[0].lower()[:64]
    medium = (q.get("utm_medium") or [""])[0].lower()
    campaign = (q.get("utm_campaign") or [""])[0][:80]
    host = (urlparse(referer).hostname or "").lower().removeprefix("www.") if referer else ""
    if host and own_host and (host == own_host or host.endswith("." + own_host)):
        host = ""
        internal = True
    else:
        internal = False
    if utm:  # ChatGPT and others add utm_source=chatgpt.com to links they show
        name = _match(utm, AI) or _match(utm, SEARCH) or _match(utm, SOCIAL)
        if _match(utm, AI):
            return "ai", name, host, campaign
        if medium in ("email", "newsletter"):
            return "email", utm, host, campaign
        if _match(utm, SEARCH):
            return "search", name, host, campaign
        if _match(utm, SOCIAL):
            return "social", name, host, campaign
        return "campaign", utm, host, campaign
    if internal:
        return "internal", "", "", campaign
    if not host:
        return "direct", "", "", campaign
    for src, table in (("ai", AI), ("search", SEARCH), ("social", SOCIAL), ("email", EMAIL)):
        name = _match(host, table)
        if name:
            return src, name, host, campaign
    return "referral", host, host, campaign


def device_of(ua):
    if re.search(r"iPad|Tablet", ua):
        return "tablet"
    if "Mobi" in ua or "Android" in ua:
        return "mobile"
    return "desktop"


def client_ip(request):
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return fwd.split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")


def visitor_hash(request):
    raw = f"{settings.SECRET_KEY}|{timezone.now().date()}|{client_ip(request)}|{request.META.get('HTTP_USER_AGENT', '')}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ---------- recording ----------

def log_event(user_id, event, n=1, day=None):
    """Add n to a (day, user, event) counter. Never raises."""
    day = day or timezone.now().date()
    try:
        if UsageDaily.objects.filter(day=day, user_id=user_id, event=event).update(count=F("count") + n):
            return
        try:
            with transaction.atomic():
                UsageDaily.objects.create(day=day, user_id=user_id, event=event, count=n)
        except IntegrityError:
            UsageDaily.objects.filter(day=day, user_id=user_id, event=event).update(count=F("count") + n)
    except Exception:
        pass


def _bump_endpoint(route, status, ms):
    hour = timezone.now().replace(minute=0, second=0, microsecond=0)
    vals = dict(count=F("count") + 1, total_ms=F("total_ms") + ms,
                err4=F("err4") + (1 if 400 <= status < 500 else 0), err5=F("err5") + (1 if status >= 500 else 0),
                slow=F("slow") + (1 if ms > 1000 else 0))
    if EndpointStat.objects.filter(hour=hour, route=route).update(**vals):
        EndpointStat.objects.filter(hour=hour, route=route, max_ms__lt=ms).update(max_ms=ms)
        return
    try:
        with transaction.atomic():
            EndpointStat.objects.create(hour=hour, route=route, count=1, total_ms=ms, max_ms=ms,
                                        err4=1 if 400 <= status < 500 else 0, err5=1 if status >= 500 else 0,
                                        slow=1 if ms > 1000 else 0)
    except IntegrityError:
        EndpointStat.objects.filter(hour=hour, route=route).update(**vals)


RETENTION = {PageView: 90, ErrorEvent: 90, EndpointStat: 35, Boot: 120, UsageDaily: 400}


def _purge_old():
    """Keep the free-tier database small. Runs at most once a day per process."""
    if cache.get("monitor:purged"):
        return
    cache.set("monitor:purged", 1, 60 * 60 * 24)
    now = timezone.now()
    for model, days in RETENTION.items():
        field = {EndpointStat: "hour", UsageDaily: "day"}.get(model, "created_at")
        cutoff = now - timedelta(days=days)
        model.objects.filter(**{f"{field}__lt": cutoff.date() if field == "day" else cutoff}).delete()


_booted = False


class MonitorMiddleware:
    """Counts requests, page views and errors. Monitoring failures never break a request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        global _booted
        path = request.path
        if path.startswith(("/static/", "/favicon", "/manifest.webmanifest")):
            return self.get_response(request)
        t0 = time.monotonic()
        response = self.get_response(request)
        ms = int((time.monotonic() - t0) * 1000)
        try:
            if not _booted:
                _booted = True
                Boot.objects.create()
            self._record(request, response, ms)
            _purge_old()
        except Exception:
            pass
        return response

    def process_exception(self, request, exc):
        try:
            ErrorEvent.objects.create(
                kind="server", path=request.path[:200], status=500, message=f"{type(exc).__name__}: {exc}"[:300],
                detail="".join(traceback.format_exception(exc))[-4000:],
                user_id=request.user.id if getattr(request, "user", None) and request.user.is_authenticated else None)
        except Exception:
            pass
        return None

    def _record(self, request, response, ms):
        path, status = request.path, response.status_code
        match = getattr(request, "resolver_match", None)
        route = ("/" + match.route) if match and match.route is not None else ("404" if status == 404 else "other")
        _bump_endpoint(route[:80], status, ms)
        user_id = request.user.id if request.user.is_authenticated else None

        if path.startswith("/api/") and status >= 400 and status != 404 and not path.startswith("/api/admin"):
            try:
                msg = json.loads(response.content or b"{}").get("error", "")
            except Exception:
                msg = ""
            ErrorEvent.objects.create(kind="api", path=path[:200], status=status, message=(msg or f"HTTP {status}")[:300],
                                      user_id=user_id)
        elif status >= 500 and not ErrorEvent.objects.filter(kind="server", path=path[:200],
                                                               created_at__gte=timezone.now() - timedelta(seconds=5)).exists():
            ErrorEvent.objects.create(kind="server", path=path[:200], status=status, message=f"HTTP {status}", user_id=user_id)

        if request.method != "GET" or path.startswith(("/api/", "/auth/")) or 300 <= status < 400:
            return
        ua = request.META.get("HTTP_USER_AGENT", "")
        bot = bot_name(ua)
        if bot:
            source, name, host, campaign = "bot", bot, "", ""
        else:
            source, name, host, campaign = classify(request.META.get("HTTP_REFERER", ""), request.META.get("QUERY_STRING", ""),
                                                    request.get_host().split(":")[0].lower().removeprefix("www."))
        PageView.objects.create(path=path[:200], status=status, ms=ms, visitor=visitor_hash(request), user_id=user_id,
                                source=source, source_name=name[:64], referrer_host=host[:120], utm_campaign=campaign,
                                device="bot" if bot else device_of(ua))


# ---------- telemetry from the app ----------

EVENT_RE = re.compile(r"^[a-z0-9:_\-]{1,48}$")


@require_POST
def telemetry(request):
    if not request.user.is_authenticated:
        return JsonResponse({"ok": False}, status=401)
    try:
        data = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Bad JSON."}, status=400)
    events = data.get("events") or {}
    if isinstance(events, dict):
        for name, n in list(events.items())[:60]:
            if isinstance(name, str) and EVENT_RE.match(name) and isinstance(n, int) and n > 0:
                log_event(request.user.id, name, min(n, 500))
    errors = data.get("errors") or []
    today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
    if isinstance(errors, list) and errors and \
            ErrorEvent.objects.filter(kind="client", user_id=request.user.id, created_at__gte=today).count() < 50:
        for e in errors[:5]:
            if not isinstance(e, dict):
                continue
            ErrorEvent.objects.create(kind="client", path=str(e.get("where", ""))[:200], message=str(e.get("message", ""))[:300],
                                      detail=str(e.get("stack", ""))[:2000], user_id=request.user.id)
    return JsonResponse({"ok": True})


# ---------- admin: manage admins ----------

def _admins_json():
    owner = owner_email()
    rows = [{"email": owner, "owner": True, "added_by": "", "added": None}]
    rows += [{"email": g.email, "owner": False, "added_by": g.added_by, "added": g.created_at.isoformat()}
             for g in AdminGrant.objects.exclude(email=owner).order_by("created_at")]
    return {"admins": rows}


@require_http_methods(["GET", "POST", "DELETE"])
@admin_required
def admins(request):
    if request.method == "GET":
        return JsonResponse(_admins_json())
    try:
        email = str(json.loads(request.body or b"{}").get("email", "")).strip().lower()
    except json.JSONDecodeError:
        email = ""
    if not email or "@" not in email or len(email) > 254:
        return JsonResponse({"error": "Enter a valid email address."}, status=400)
    if email == owner_email():
        msg = "The owner is always an admin." if request.method == "POST" else "The owner can't be removed."
        return JsonResponse({"error": msg}, status=400)
    if request.method == "POST":
        AdminGrant.objects.get_or_create(email=email, defaults={"added_by": request.user.email})
    else:
        AdminGrant.objects.filter(email=email).delete()
    return JsonResponse(_admins_json())


# ---------- admin: internal (testing) users ----------

def default_internal(email):
    email = (email or "").lower()
    return any(m in email for m in settings.INTERNAL_EMAIL_MATCH)


def internal_user_ids():
    """Users left out of dashboard stats: an admin's flag wins, otherwise the email rule."""
    flags = dict(UserFlag.objects.values_list("user_id", "internal"))
    return {uid for uid, email, username in User.objects.values_list("id", "email", "username")
            if flags.get(uid, default_internal(email or username))}


def _internal_json():
    ids = internal_user_ids()
    flagged = set(UserFlag.objects.values_list("user_id", flat=True))
    rows = [{"email": u.email or u.username, "manual": u.id in flagged}
            for u in User.objects.filter(id__in=ids).order_by("email")]
    return {"users": rows, "rule": settings.INTERNAL_EMAIL_MATCH}


@require_http_methods(["GET", "POST"])
@admin_required
def internal(request):
    """GET: internal users. POST {email, internal: bool}: mark or unmark a user."""
    if request.method == "POST":
        try:
            data = json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            data = {}
        email = str(data.get("email", "")).strip().lower()
        user = User.objects.filter(Q(email__iexact=email) | Q(username__iexact=email)).first() if email else None
        if not user:
            return JsonResponse({"error": "No user with that email."}, status=404)
        UserFlag.objects.update_or_create(user=user, defaults={"internal": bool(data.get("internal")),
                                                               "updated_by": request.user.email})
    return JsonResponse(_internal_json())


# ---------- admin: dashboards ----------

def _window(request):
    try:
        days = max(1, min(365, int(request.GET.get("days", 30))))
    except ValueError:
        days = 30
    end = timezone.localdate()
    start = end - timedelta(days=days - 1)
    return days, start, end


def _day_labels(start, end):
    out, d = [], start
    while d <= end:
        out.append(d)
        d += timedelta(days=1)
    return out


def _since(start):
    return timezone.make_aware(timezone.datetime.combine(start, timezone.datetime.min.time()))


def _top(counter, n=12):
    return [{"label": k or "(none)", "value": v} for k, v in counter.most_common(n)]


def _db_stats():
    vendor = connection.vendor
    limit_mb = settings.DB_SIZE_LIMIT_MB
    out = {"vendor": vendor, "limit_mb": limit_mb, "tables": [], "size_bytes": None, "notes": []}
    with connection.cursor() as c:
        if vendor == "postgresql":
            c.execute("SELECT version(), pg_database_size(current_database())")
            ver, size = c.fetchone()
            out["version"], out["size_bytes"] = ver.split(" on ")[0], size
            c.execute("""SELECT relname, pg_total_relation_size(relid), n_live_tup, n_dead_tup,
                                last_autovacuum, last_autoanalyze
                         FROM pg_stat_user_tables ORDER BY 2 DESC""")
            out["tables"] = [{"name": r[0], "bytes": r[1], "rows": r[2], "dead_rows": r[3],
                              "last_vacuum": r[4].isoformat() if r[4] else None} for r in c.fetchall()]
            c.execute("SELECT count(*), count(*) FILTER (WHERE state = 'active') FROM pg_stat_activity WHERE datname = current_database()")
            out["connections"], out["active_connections"] = c.fetchone()
            c.execute("SHOW max_connections")
            out["max_connections"] = int(c.fetchone()[0])
            c.execute("""SELECT blks_hit, blks_read, deadlocks, conflicts, temp_bytes, xact_rollback, xact_commit
                         FROM pg_stat_database WHERE datname = current_database()""")
            hit, read, deadlocks, conflicts, temp_bytes, rb, cm = c.fetchone()
            out["cache_hit_pct"] = round(100 * hit / (hit + read), 2) if (hit + read) else None
            out["deadlocks"], out["temp_bytes"] = deadlocks, temp_bytes
            out["rollback_pct"] = round(100 * rb / (rb + cm), 2) if (rb + cm) else None
            t0 = time.monotonic()
            c.execute("SELECT 1")
            out["ping_ms"] = round((time.monotonic() - t0) * 1000, 1)
        elif vendor == "sqlite":
            import os
            name = settings.DATABASES["default"]["NAME"]
            out["size_bytes"] = os.path.getsize(name) if os.path.exists(str(name)) else 0
            out["version"] = "SQLite " + connection.Database.sqlite_version
            c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            for (t,) in c.fetchall():
                c.execute(f'SELECT count(*) FROM "{t}"')
                out["tables"].append({"name": t, "bytes": None, "rows": c.fetchone()[0], "dead_rows": None})
            out["tables"].sort(key=lambda r: -r["rows"])
            t0 = time.monotonic()
            c.execute("SELECT 1")
            out["ping_ms"] = round((time.monotonic() - t0) * 1000, 1)
    live = Record.objects.filter(deleted=False)
    out["records"] = live.count()
    out["tombstones"] = Record.objects.filter(deleted=True).count()
    if out["size_bytes"]:
        used_pct = 100 * out["size_bytes"] / (limit_mb * 1024 * 1024)
        out["used_pct"] = round(used_pct, 1)
        if out["records"]:
            per = out["size_bytes"] / max(1, out["records"] + Record.objects.filter(deleted=True).count())
            out["room_for_records"] = int(max(0, limit_mb * 1024 * 1024 - out["size_bytes"]) / per)
        if used_pct > 80:
            out["notes"].append("Database is over 80% of the free-tier limit.")
    for t in out["tables"]:
        if t.get("dead_rows") and t["rows"] and t["dead_rows"] > t["rows"] * 0.3 and t["dead_rows"] > 1000:
            out["notes"].append(f"Table {t['name']} has many dead rows; a VACUUM would reclaim space.")
    if out["tombstones"] > 5000:
        out["notes"].append(f"{out['tombstones']:,} deleted-record markers are kept for sync; they can be pruned.")
    return out


def _health():
    from django.db.migrations.executor import MigrationExecutor
    try:
        ex = MigrationExecutor(connection)
        pending = len(ex.migration_plan(ex.loader.graph.leaf_nodes()))
    except Exception:
        pending = None
    from .google_auth import enabled as google_enabled
    email_ok = "console" not in settings.EMAIL_BACKEND
    checks = [
        {"name": "Debug mode off", "ok": not settings.DEBUG},
        {"name": "Migrations applied", "ok": pending == 0, "detail": f"{pending} pending" if pending else ""},
        {"name": "Email sending configured", "ok": email_ok},
        {"name": "Google sign-in configured", "ok": google_enabled()},
        {"name": "HTTPS cookies", "ok": settings.SESSION_COOKIE_SECURE if hasattr(settings, "SESSION_COOKIE_SECURE") else False},
    ]
    return {"checks": checks, "python": platform.python_version(), "django": django.get_version(),
            "process_started": PROCESS_STARTED.isoformat(), "server_time": timezone.now().isoformat(),
            "host": settings.SITE_URL, "pid_uptime_min": int((timezone.now() - PROCESS_STARTED).total_seconds() // 60)}


@require_GET
@admin_required
def tech(request):
    days, start, end = _window(request)
    since = _since(start)
    labels = _day_labels(start, end)
    idx = {d: i for i, d in enumerate(labels)}

    # traffic
    internal_ids = internal_user_ids()
    pv = list(PageView.objects.filter(created_at__gte=since).exclude(user_id__in=internal_ids).order_by("created_at")
              .values("created_at", "path", "status", "ms", "visitor", "user_id", "source", "source_name",
                      "referrer_host", "utm_campaign", "device"))
    humans = [p for p in pv if p["source"] != "bot"]
    views = [0] * len(labels)
    uniq = [set() for _ in labels]
    bot_views = [0] * len(labels)
    for p in pv:
        i = idx.get(timezone.localtime(p["created_at"]).date())
        if i is None:
            continue
        if p["source"] == "bot":
            bot_views[i] += 1
        else:
            views[i] += 1
            uniq[i].add(p["visitor"])
    # A visit = a visitor's first page view of the day. Its source is how they arrived.
    first = {}
    for p in humans:
        key = (timezone.localtime(p["created_at"]).date(), p["visitor"])
        if key not in first and p["source"] != "internal":
            first[key] = p
    visits = list(first.values())
    by_source = Counter(v["source"] for v in visits)
    source_names = defaultdict(Counter)
    for v in visits:
        if v["source_name"]:
            source_names[v["source"]][v["source_name"]] += 1
    login_visitors = {(timezone.localtime(p["created_at"]).date(), p["visitor"]) for p in humans if p["path"].startswith("/login")}
    signed_in_visitors = {(timezone.localtime(p["created_at"]).date(), p["visitor"]) for p in humans if p["path"] == "/app"}

    # requests and errors
    es = EndpointStat.objects.filter(hour__gte=since)
    routes = list(es.values("route").annotate(count=Sum("count"), err4=Sum("err4"), err5=Sum("err5"), total_ms=Sum("total_ms"),
                                               max_ms=Max("max_ms"), slow=Sum("slow")).order_by("-count")[:40])
    for r in routes:
        r["avg_ms"] = round(r.pop("total_ms") / r["count"]) if r["count"] else 0
    req_daily = [0] * len(labels)
    err5_daily = [0] * len(labels)
    for r in es.values("hour", "count", "err5"):
        i = idx.get(timezone.localtime(r["hour"]).date())
        if i is not None:
            req_daily[i] += r["count"]
            err5_daily[i] += r["err5"]
    tot = es.aggregate(n=Sum("count"), e4=Sum("err4"), e5=Sum("err5"), ms=Sum("total_ms"), slow=Sum("slow"))
    ev = ErrorEvent.objects.filter(created_at__gte=since).exclude(user_id__in=internal_ids)
    grouped = list(ev.values("kind", "message", "path").annotate(n=Count("id"), users=Count("user_id", distinct=True),
                                                                 last=Max("created_at")).order_by("-n")[:30])
    for g in grouped:
        g["last"] = g["last"].isoformat()
    recent = [{"at": e.created_at.isoformat(), "kind": e.kind, "status": e.status, "path": e.path, "message": e.message,
               "detail": e.detail[-1500:]} for e in ev.order_by("-created_at")[:25]]

    # email sign-in health
    codes = LoginCode.objects.filter(created_at__gte=since)
    login_codes = {"sent": codes.count(), "used": codes.filter(used=True).count(),
                   "locked": codes.filter(attempts__gte=settings.LOGIN_CODE_MAX_ATTEMPTS).count()}

    boots = Counter(timezone.localtime(b).date() for b in Boot.objects.filter(created_at__gte=since).values_list("created_at", flat=True))

    try:
        db = _db_stats()
    except Exception as e:  # never let a stats query take the dashboard down
        db = {"error": str(e)}

    return JsonResponse({
        "days": days, "labels": [d.isoformat() for d in labels],
        "health": _health(),
        "traffic": {
            "views": views, "visitors": [len(s) for s in uniq], "bot_views": bot_views,
            "total_views": len(humans), "total_visits": len(visits), "unique_visitors": len({p["visitor"] for p in humans}),
            "sources": _top(by_source, 20),
            "source_names": {k: _top(v, 15) for k, v in source_names.items()},
            "referrers": _top(Counter(v["referrer_host"] for v in visits if v["referrer_host"]), 15),
            "campaigns": _top(Counter(v["utm_campaign"] for v in visits if v["utm_campaign"]), 10),
            "landing_pages": _top(Counter(v["path"] for v in visits), 15),
            "top_pages": _top(Counter(p["path"] for p in humans), 15),
            "not_found": _top(Counter(p["path"] for p in humans if p["status"] == 404), 15),
            "devices": _top(Counter(p["device"] for p in visits), 5),
            "bots": _top(Counter(p["source_name"] for p in pv if p["source"] == "bot"), 20),
            "ai_bot_pages": _top(Counter(p["path"] for p in pv if p["source"] == "bot"
                                         and any(w in p["source_name"].lower() for w in AI_BOT_WORDS)), 10),
            "funnel": {"visits": len(visits), "login_page": len(login_visitors), "reached_app": len(signed_in_visitors),
                       "signups": User.objects.filter(date_joined__gte=since).exclude(id__in=internal_ids).count()},
            "slow_pages": sorted(({"label": k, "value": round(sum(v) / len(v))} for k, v in
                                  _group([(p["path"], p["ms"]) for p in humans]).items() if len(v) >= 3),
                                 key=lambda r: -r["value"])[:10],
        },
        "requests": {"daily": req_daily, "err5_daily": err5_daily, "routes": routes,
                     "total": tot["n"] or 0, "err4": tot["e4"] or 0, "err5": tot["e5"] or 0, "slow": tot["slow"] or 0,
                     "avg_ms": round((tot["ms"] or 0) / tot["n"]) if tot["n"] else 0},
        "errors": {"grouped": grouped, "recent": recent,
                   "by_kind": _top(Counter(ev.values_list("kind", flat=True)), 5)},
        "login_codes": login_codes,
        "boots": [boots.get(d, 0) for d in labels],
        "db": db,
    })


def _group(pairs):
    out = defaultdict(list)
    for k, v in pairs:
        out[k].append(v)
    return out


TAB_NAMES = ["month", "year", "insights", "plan", "accounts", "savings", "import", "settings"]


@require_GET
@admin_required
def business(request):
    days, start, end = _window(request)
    since = _since(start)
    labels = _day_labels(start, end)
    idx = {d: i for i, d in enumerate(labels)}
    now = timezone.now()
    internal_ids = internal_user_ids()
    all_users = list(User.objects.values("id", "email", "date_joined", "last_login"))
    users = [u for u in all_users if u["id"] not in internal_ids]
    joined = {u["id"]: timezone.localtime(u["date_joined"]).date() for u in users}

    vault_users = set(Vault.objects.exclude(user_id__in=internal_ids).values_list("user_id", flat=True))
    live = Record.objects.filter(deleted=False).exclude(user_id__in=internal_ids)
    per_user_type = defaultdict(Counter)
    for uid, typ, n in live.values_list("user_id", "type").annotate(n=Count("id")):
        per_user_type[uid][typ] = n
    months_per_user = dict(live.filter(type="transaction").values_list("user_id").annotate(n=Count("period", distinct=True)))
    onboarded = {u for u, c in per_user_type.items() if c.get("settings")}
    with_tx = {u for u, c in per_user_type.items() if c.get("transaction")}
    google = set(GoogleIdentity.objects.exclude(user_id__in=internal_ids).values_list("user_id", flat=True))

    usage = list(UsageDaily.objects.filter(day__gte=start - timedelta(days=35)).exclude(user_id__in=internal_ids).values("day", "user_id", "event", "count"))
    active_days = defaultdict(set)  # user -> days they used the app
    for u in usage:
        if u["user_id"]:
            active_days[u["user_id"]].add(u["day"])
    # last_login also counts as activity (covers users from before tracking existed)
    for u in users:
        if u["last_login"]:
            active_days[u["id"]].add(timezone.localtime(u["last_login"]).date())

    signups = [0] * len(labels)
    for uid, d in joined.items():
        if d in idx:
            signups[idx[d]] += 1
    new_active, returning_active = [0] * len(labels), [0] * len(labels)
    for uid, ds in active_days.items():
        for d in ds:
            i = idx.get(d)
            if i is None:
                continue
            if joined.get(uid) == d:
                new_active[i] += 1
            else:
                returning_active[i] += 1

    def active_in(n):
        cutoff = end - timedelta(days=n - 1)
        return sum(1 for ds in active_days.values() if any(d >= cutoff for d in ds))
    dau, wau, mau = active_in(1), active_in(7), active_in(30)

    # funnel (all time)
    multi_day = {u for u, ds in active_days.items() if len(ds) >= 2}
    week_active = {u for u, ds in active_days.items() if any(d >= end - timedelta(days=6) for d in ds)}
    funnel = [
        {"label": "Signed up", "value": len(users)},
        {"label": "Created vault", "value": len(vault_users)},
        {"label": "Finished setup", "value": len(onboarded)},
        {"label": "Added a transaction", "value": len(with_tx)},
        {"label": "Came back another day", "value": len(multi_day & set(joined))},
        {"label": "Active in last 7 days", "value": len(week_active & set(joined))},
    ]

    # weekly cohorts: share of each signup week active in the following weeks
    cohorts = []
    week0 = end - timedelta(days=end.weekday())
    for w in range(7, -1, -1):
        cstart = week0 - timedelta(weeks=w)
        members = [u for u, d in joined.items() if cstart <= d < cstart + timedelta(days=7)]
        row = {"week": cstart.isoformat(), "size": len(members), "weeks": []}
        for k in range(1, 5):
            ws = cstart + timedelta(weeks=k)
            if ws > end:
                break
            act = sum(1 for u in members if any(ws <= d < ws + timedelta(days=7) for d in active_days.get(u, ())))
            row["weeks"].append(round(100 * act / len(members)) if members else None)
        cohorts.append(row)

    # depth
    def bucket(n, edges):
        for lo, hi, label in edges:
            if lo <= n <= hi:
                return label
    tx_edges = [(0, 0, "0"), (1, 10, "1–10"), (11, 50, "11–50"), (51, 200, "51–200"), (201, 1000, "201–1,000"), (1001, 10**9, "1,000+")]
    m_edges = [(0, 0, "0"), (1, 1, "1"), (2, 3, "2–3"), (4, 6, "4–6"), (7, 12, "7–12"), (13, 10**6, "13+")]
    tx_dist = Counter(bucket(per_user_type[u["id"]].get("transaction", 0), tx_edges) for u in users if u["id"] in vault_users)
    m_dist = Counter(bucket(months_per_user.get(u["id"], 0), m_edges) for u in users if u["id"] in vault_users)
    type_totals = Counter()
    for c in per_user_type.values():
        type_totals.update(c)

    # features in the window
    win = [u for u in usage if u["day"] >= start]
    ev_count, ev_users = Counter(), defaultdict(set)
    for u in win:
        ev_count[u["event"]] += u["count"]
        if u["user_id"]:
            ev_users[u["event"]].add(u["user_id"])

    def feature_rows(prefix, strip=True):
        rows = [{"event": e[len(prefix):] if strip else e, "count": n, "users": len(ev_users[e])}
                for e, n in ev_count.items() if e.startswith(prefix)]
        return sorted(rows, key=lambda r: -r["count"])
    tabs = {r["event"]: r for r in feature_rows("tab:")}
    tab_rows = [tabs.get(t, {"event": t, "count": 0, "users": 0}) for t in TAB_NAMES] + \
               [r for k, r in tabs.items() if k not in TAB_NAMES]
    saves_daily = [0] * len(labels)
    for u in win:
        if u["event"].startswith("save:") and u["day"] in idx:
            saves_daily[idx[u["day"]]] += u["count"]

    active_window = {u for u, ds in active_days.items() if any(d >= start for d in ds)}
    top_users = sorted(({
        "email": u["email"], "joined": joined[u["id"]].isoformat(),
        "last_seen": max(active_days.get(u["id"]) or [joined[u["id"]]]).isoformat(),
        "days_active": len([d for d in active_days.get(u["id"], ()) if d >= start]),
        "transactions": per_user_type[u["id"]].get("transaction", 0),
        "months": months_per_user.get(u["id"], 0), "vault": u["id"] in vault_users,
    } for u in users), key=lambda r: (-r["days_active"], -r["transactions"]))[:25]
    stalled = sum(1 for u in users if u["id"] not in vault_users and joined[u["id"]] < end - timedelta(days=1))
    dormant = sum(1 for u in users if u["id"] in with_tx
                  and max(active_days.get(u["id"]) or [joined[u["id"]]]) < end - timedelta(days=30))

    return JsonResponse({
        "days": days, "labels": [d.isoformat() for d in labels],
        "kpis": {"users": len(users), "new_users": sum(signups), "active_window": len(active_window),
                 "dau": dau, "wau": wau, "mau": mau, "stickiness": round(100 * dau / mau) if mau else 0,
                 "vaults": len(vault_users), "with_transactions": len(with_tx), "google_users": len(google),
                 "stalled_signups": stalled, "dormant_users": dormant,
                 "deleted_accounts": sum(u["count"] for u in win if u["event"] == "account:deleted"),
                 "records": sum(type_totals.values())},
        "daily": {"signups": signups, "new_active": new_active, "returning_active": returning_active, "saves": saves_daily},
        "funnel": funnel, "cohorts": cohorts,
        "records_by_type": _top(type_totals, 15),
        "depth": {"transactions": [{"label": l, "value": tx_dist.get(l, 0)} for *_, l in tx_edges],
                  "months": [{"label": l, "value": m_dist.get(l, 0)} for *_, l in m_edges],
                  "avg_accounts": round(sum(c.get("account", 0) for c in per_user_type.values()) / max(1, len(vault_users)), 1)},
        "tabs": tab_rows,
        "whatif": feature_rows("whatif:"),
        "metrics": feature_rows("metric:"),
        "calcs": feature_rows("calc:"),
        "motion": feature_rows("motion:"),
        "saves": feature_rows("save:"), "edits": feature_rows("edit:"), "deletes": feature_rows("delete:"),
        "clicks": feature_rows("click:")[:40],
        "changes": feature_rows("change:")[:40],
        "lifecycle": [r for r in feature_rows("", strip=False)
                      if r["event"].split(":")[0] in ("login", "signup", "unlock", "vault", "onboard", "import", "app", "account", "demo")],
        "top_users": top_users,
        "internal_users": len(internal_ids),
    })


# ---------- admin: Google index status ----------

def _indexing_json(error=""):
    from . import gsc, seo
    saved = {s.path: s for s in IndexStatus.objects.all()}
    rows = []
    for path in seo.public_paths():
        s = saved.get(path)
        rows.append({"path": path, "url": f"{settings.SITE_URL}{path}",
                     "indexed": bool(s and s.verdict == "PASS"), "checked": s is not None,
                     "coverage": s.coverage if s else "", "verdict": s.verdict if s else "",
                     "last_crawl": s.last_crawl.isoformat() if s and s.last_crawl else None,
                     "google_canonical": s.google_canonical if s else ""})
    last = max((s.checked_at for s in saved.values()), default=None)
    return {"enabled": gsc.enabled(), "property": gsc.property_url(), "error": error,
            "checked_at": last.isoformat() if last else None, "pages": rows}


@require_http_methods(["GET", "POST"])
@admin_required
def indexing(request):
    """GET: saved results. POST: run a fresh check now (takes ~10-20s for ~25 pages)."""
    from . import gsc
    if request.method == "GET":
        return JsonResponse(_indexing_json())
    if not gsc.enabled():
        return JsonResponse({"error": "Set GSC_SERVICE_ACCOUNT_JSON on the server first."}, status=400)
    try:
        _, errors = gsc.check_all()
    except Exception as e:  # bad key, no access to the property, network
        return JsonResponse(_indexing_json(f"Check failed: {e}"))
    return JsonResponse(_indexing_json("; ".join(errors[:3])))
