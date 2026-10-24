import hashlib
import hmac
import json
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.core.cache import cache
from django.core.mail import EmailMessage, send_mail
from django.db import transaction
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from . import seo
from .models import LoginCode, Record, Vault, VaultKey

User = get_user_model()


# ---------- helpers ----------

def _hash_code(email, code):
    return hmac.new(settings.SECRET_KEY.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _body(request):
    try:
        return json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return None


def _err(msg, status=400):
    return JsonResponse({"error": msg}, status=status)


def api_login_required(view):
    def wrapped(request, *a, **kw):
        if not request.user.is_authenticated:
            return _err("Sign in to continue.", 401)
        return view(request, *a, **kw)
    return wrapped


# ---------- pages ----------

@require_GET
def landing(request):
    return render(request, "landing.html", {
        "benefits": seo.BENEFITS, "faq": seo.HOME_FAQ, "guides": seo.GUIDES,
        "jsonld": seo.home_jsonld(settings.SITE_URL)})


@require_GET
def guide(request, slug):
    g = seo.GUIDES.get(slug)
    if not g:
        raise Http404
    others = {k: v for k, v in seo.GUIDES.items() if k != slug}
    sections = [(h, items, ill) for (h, items), ill in zip(g["sections"], seo.GUIDE_ILLUS.get(slug, []) + [None] * 9)]
    return render(request, "guide.html", {"g": g, "slug": slug, "others": others, "sections": sections,
                                          "jsonld": seo.guide_jsonld(settings.SITE_URL, slug, g)})


@require_GET
def robots_txt(request):
    site = settings.SITE_URL
    body = ("User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /auth/\nDisallow: /logout/\n\n"
            f"Sitemap: {site}/sitemap.xml\n")
    return HttpResponse(body, content_type="text/plain; charset=utf-8")


@require_GET
def sitemap_xml(request):
    site = settings.SITE_URL
    paths = ["/", "/about/", "/contact/", "/privacy/"] + [f"/{slug}/" for slug in seo.GUIDES]
    urls = "".join(f"<url><loc>{site}{p}</loc></url>" for p in paths)
    body = ('<?xml version="1.0" encoding="UTF-8"?>'
            f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>')
    return HttpResponse(body, content_type="application/xml; charset=utf-8")


@require_GET
def llms_txt(request):
    """Plain-text summary for AI assistants and answer engines (llmstxt.org format)."""
    site = settings.SITE_URL
    lines = [f"# {seo.NAME}", "", f"> {seo.TAGLINE}. Free, works in the browser, built in India for Indian and global users.", "",
             "## Key benefits", ""]
    lines += [f"- **{t}**: {d}" for t, d in seo.BENEFITS]
    lines += ["", "## Guides", ""]
    lines += [f"- [{g['nav']}]({site}/{slug}/): {g['description']}" for slug, g in seo.GUIDES.items()]
    lines += ["", "## FAQ", ""]
    lines += [f"### {q}\n{a}\n" for q, a in seo.HOME_FAQ]
    lines += ["## Links", "", f"- [Home]({site}/)", f"- [Privacy: what we can and can't see]({site}/privacy/)",
              f"- [About]({site}/about/)", f"- [Contact]({site}/contact/)",
              f"- [Sign up free]({site}/login/)", "",
              f"{seo.NAME} is a product of {seo.COMPANY}, a privately owned business based in India. Contact: {seo.CONTACT_EMAIL}", ""]
    return HttpResponse("\n".join(lines), content_type="text/plain; charset=utf-8")


@require_GET
def privacy(request):
    return render(request, "privacy.html")


@require_GET
def about(request):
    return render(request, "about.html")


def _client_ip(request):
    fwd = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return fwd.split(",")[0].strip() or request.META.get("REMOTE_ADDR", "")


@require_http_methods(["GET", "POST"])
@ensure_csrf_cookie
def contact(request):
    ctx = {"topics": seo.CONTACT_TOPICS, "contact_email": seo.CONTACT_EMAIL, "form": {}}
    if request.method == "GET":
        ctx["sent"] = request.GET.get("sent") == "1"
        return render(request, "contact.html", ctx)
    f = {k: (request.POST.get(k) or "").strip() for k in ("name", "email", "topic", "subject", "message", "website")}
    ctx["form"] = f
    if f["website"]:  # honeypot: bots fill hidden fields
        return redirect("/contact/?sent=1")
    errors = []
    if not f["email"] or "@" not in f["email"] or len(f["email"]) > 254:
        errors.append("Enter a valid email address so we can reply.")
    if f["topic"] not in seo.CONTACT_TOPIC_VALUES:
        errors.append("Choose a topic.")
    if len(f["message"]) < 10 or len(f["message"]) > 5000:
        errors.append("Write a message between 10 and 5,000 characters.")
    if len(f["name"]) > 100 or len(f["subject"]) > 150:
        errors.append("Name or subject is too long.")
    key = "contact:" + _client_ip(request)
    if not errors and cache.get(key, 0) >= 5:
        errors.append(f"Too many messages from your network. Please email {seo.CONTACT_EMAIL} directly.")
    if errors:
        ctx["errors"] = errors
        return render(request, "contact.html", ctx, status=400)
    signed_in = request.user.email if request.user.is_authenticated else "(not signed in)"
    body = (f"From: {f['name'] or '(no name)'} <{f['email']}>\n"
            f"Topic: {f['topic']}\n"
            f"Signed in as: {signed_in}\n\n"
            f"{f['message']}\n")
    subject = f"[PlannedOut] {f['topic']}" + (f": {f['subject']}" if f["subject"] else "")
    try:
        EmailMessage(" ".join(subject.split())[:200], body, settings.DEFAULT_FROM_EMAIL,
                     [seo.CONTACT_EMAIL], reply_to=[f["email"]]).send()
    except Exception:
        ctx["errors"] = [f"We couldn't send your message right now. Please email {seo.CONTACT_EMAIL} directly."]
        return render(request, "contact.html", ctx, status=502)
    cache.set(key, cache.get(key, 0) + 1, 3600)
    return redirect("/contact/?sent=1")


@require_GET
@ensure_csrf_cookie
def login_page(request):
    if request.user.is_authenticated:
        return redirect("/app")
    from .google_auth import enabled
    return render(request, "login.html", {"google": enabled(), "google_error": request.GET.get("error") == "google"})


@require_GET
@ensure_csrf_cookie
def app_page(request):
    if not request.user.is_authenticated:
        return redirect(settings.LOGIN_URL)
    return render(request, "app.html")


@require_POST
def logout_view(request):
    logout(request)
    return redirect("/")


# ---------- email-code login ----------

@require_POST
def request_code(request):
    data = _body(request)
    email = (data or {}).get("email", "").strip().lower()
    if not email or "@" not in email or len(email) > 254:
        return _err("Enter a valid email address.")
    hour_ago = timezone.now() - timedelta(hours=1)
    if LoginCode.objects.filter(email=email, created_at__gte=hour_ago).count() >= settings.LOGIN_CODES_PER_HOUR:
        return _err("Too many codes requested. Try again in an hour.", 429)
    code = f"{secrets.randbelow(1_000_000):06d}"
    LoginCode.objects.filter(email=email, used=False).update(used=True)
    lc = LoginCode.objects.create(
        email=email, code_hash=_hash_code(email, code),
        expires_at=timezone.now() + timedelta(minutes=settings.LOGIN_CODE_TTL_MINUTES),
    )
    try:
        _send_code(email, code)
    except Exception:
        lc.delete()
        return _err("We couldn't send the email just now. Try again in a minute.", 503)
    return JsonResponse({"ok": True})


def _send_code(email, code):
    send_mail(
        "Your sign-in code",
        f"Your sign-in code is {code}. It expires in {settings.LOGIN_CODE_TTL_MINUTES} minutes.\n\n"
        "If you didn't ask for this, ignore this email.",
        settings.DEFAULT_FROM_EMAIL, [email],
    )


@require_POST
def verify_code(request):
    data = _body(request) or {}
    email = data.get("email", "").strip().lower()
    code = str(data.get("code", "")).strip()
    lc = LoginCode.objects.filter(email=email, used=False).order_by("-created_at").first()
    if not lc or lc.expires_at < timezone.now():
        return _err("That code has expired. Request a new one.")
    if lc.attempts >= settings.LOGIN_CODE_MAX_ATTEMPTS:
        return _err("Too many wrong attempts. Request a new code.", 429)
    if not hmac.compare_digest(lc.code_hash, _hash_code(email, code)):
        lc.attempts += 1
        lc.save(update_fields=["attempts"])
        return _err("That code isn't right. Check the email and try again.")
    lc.used = True
    lc.save(update_fields=["used"])
    user, _ = User.objects.get_or_create(username=email, defaults={"email": email})
    login(request, user)
    return JsonResponse({"ok": True})


# ---------- vault ----------

def _vault_json(v):
    return {
        "kdf": v.kdf, "salt": v.salt, "wrapped_key": v.wrapped_key,
        "keys": [{"id": k.id, "kind": k.kind, "label": k.label, "wrapped_key": k.wrapped_key,
                  "created_at": k.created_at.isoformat()}
                 for k in v.keys.filter(revoked_at__isnull=True).order_by("id")],
    }


@require_http_methods(["GET", "POST", "PUT"])
@api_login_required
def vault(request):
    v = Vault.objects.filter(user=request.user).first()
    if request.method == "GET":
        return JsonResponse({"vault": _vault_json(v) if v else None, "email": request.user.email})

    data = _body(request)
    if not data or not all(isinstance(data.get(k), (str, dict)) for k in ("kdf", "salt", "wrapped_key")):
        return _err("Missing vault fields.")

    if request.method == "POST":  # create
        if v:
            return _err("Vault already exists.", 409)
        keys = data.get("recovery_keys") or []
        if not 1 <= len(keys) <= 5:
            return _err("Create between 1 and 5 recovery keys.")
        with transaction.atomic():
            v = Vault.objects.create(user=request.user, kdf=data["kdf"], salt=data["salt"],
                                     wrapped_key=data["wrapped_key"])
            for k in keys:
                VaultKey.objects.create(vault=v, label=str(k.get("label", ""))[:64],
                                        wrapped_key=k["wrapped_key"])
        return JsonResponse({"vault": _vault_json(v)}, status=201)

    # PUT: change passphrase (re-wrap only; data untouched)
    if not v:
        return _err("No vault yet.", 404)
    v.kdf, v.salt, v.wrapped_key = data["kdf"], data["salt"], data["wrapped_key"]
    v.save()
    return JsonResponse({"vault": _vault_json(v)})


@require_http_methods(["POST", "DELETE"])
@api_login_required
def vault_keys(request, key_id=None):
    v = Vault.objects.filter(user=request.user).first()
    if not v:
        return _err("No vault yet.", 404)
    if request.method == "POST":
        data = _body(request) or {}
        if v.keys.filter(revoked_at__isnull=True).count() >= 5:
            return _err("You already have 5 recovery keys. Revoke one first.")
        if not isinstance(data.get("wrapped_key"), str):
            return _err("Missing key.")
        VaultKey.objects.create(vault=v, label=str(data.get("label", ""))[:64], wrapped_key=data["wrapped_key"])
        return JsonResponse({"vault": _vault_json(v)}, status=201)
    k = v.keys.filter(id=key_id, revoked_at__isnull=True).first()
    if not k:
        return _err("Key not found.", 404)
    if v.keys.filter(revoked_at__isnull=True).count() <= 1:
        return _err("Keep at least one recovery key.")
    k.revoked_at = timezone.now()
    k.save(update_fields=["revoked_at"])
    return JsonResponse({"vault": _vault_json(v)})


# ---------- encrypted records sync ----------

def _rec_json(r):
    return {"id": str(r.id), "type": r.type, "period": r.period, "ciphertext": r.ciphertext,
            "iv": r.iv, "version": r.version, "deleted": r.deleted, "updated_at": r.updated_at.isoformat()}


@require_GET
@api_login_required
def records_pull(request):
    qs = Record.objects.filter(user=request.user)
    since = request.GET.get("since")
    if since:
        dt = parse_datetime(since)
        if dt:
            qs = qs.filter(updated_at__gt=dt)
    return JsonResponse({"records": [_rec_json(r) for r in qs.order_by("updated_at")],
                         "server_time": timezone.now().isoformat()})


@require_POST
@api_login_required
def records_push(request):
    data = _body(request) or {}
    items = data.get("records")
    if not isinstance(items, list) or len(items) > settings.RECORD_BATCH_MAX:
        return _err("Send a list of up to %d records." % settings.RECORD_BATCH_MAX)
    saved, conflicts = [], []
    with transaction.atomic():
        for it in items:
            try:
                rid = uuid.UUID(str(it["id"]))
            except (KeyError, ValueError):
                return _err("Each record needs a valid id.")
            ct = it.get("ciphertext", "")
            if len(ct) > settings.RECORD_MAX_BYTES:
                return _err("A record is too large.")
            base = int(it.get("base_version", 0))
            r = Record.objects.select_for_update().filter(id=rid).first()
            if r and r.user_id != request.user.id:
                return _err("Record not found.", 404)
            if r and r.version != base:
                conflicts.append(_rec_json(r))
                continue
            if not r:
                r = Record(id=rid, user=request.user, version=0)
            r.type = str(it.get("type", ""))[:32]
            r.period = str(it.get("period", ""))[:10]
            r.ciphertext, r.iv = ct, str(it.get("iv", ""))[:32]
            r.deleted = bool(it.get("deleted", False))
            if r.deleted:
                r.ciphertext, r.iv = "", ""
            r.version += 1
            r.save()
            saved.append({"id": str(r.id), "version": r.version, "updated_at": r.updated_at.isoformat()})
    return JsonResponse({"saved": saved, "conflicts": conflicts})


@require_POST
@api_login_required
def delete_account(request):
    user = request.user
    logout(request)
    user.delete()  # cascades to vault, keys, records
    return JsonResponse({"ok": True})
