"""Sign in with Google via the server-side OAuth redirect flow.

No Google scripts are loaded in our pages (keeps the strict Content Security Policy). Flow:
  /auth/google/start    -> redirect to Google with a random state + nonce kept in the session
  /auth/google/callback -> exchange the code for an ID token, check it, sign the user in by verified email

Settings: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. Redirect URI to register in Google Cloud:
  https://<your-host>/auth/google/callback
"""
import json
import logging
import secrets
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.db import IntegrityError
from django.shortcuts import redirect, render
from django.views.decorators.http import require_GET, require_http_methods

from .models import GoogleIdentity

log = logging.getLogger(__name__)
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


def enabled():
    return bool(getattr(settings, "GOOGLE_CLIENT_ID", "") and getattr(settings, "GOOGLE_CLIENT_SECRET", ""))


def _redirect_uri(request):
    return request.build_absolute_uri("/auth/google/callback")


def _fail(reason):
    log.warning("Google sign-in failed: %s", reason)
    from .models import ErrorEvent
    try:
        ErrorEvent.objects.create(kind="api", path="/auth/google/callback", status=0, message=f"Google sign-in failed: {reason}"[:300])
    except Exception:
        pass
    return redirect("/login/?error=google")


@require_GET
def start(request):
    if not enabled():
        return redirect("/login/")
    state, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    request.session["google_oauth"] = {"state": state, "nonce": nonce}
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID, "redirect_uri": _redirect_uri(request), "response_type": "code",
        "scope": "openid email", "state": state, "nonce": nonce, "prompt": "select_account",
    }
    return redirect(AUTH_URL + "?" + urllib.parse.urlencode(params))


def _post_json(url, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(),
                                 headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def _get_json(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())


def check_claims(claims, nonce):
    """Validate an ID token's claims. Returns (sub, verified email), or None."""
    if claims.get("aud") != settings.GOOGLE_CLIENT_ID:
        return None
    if claims.get("iss") not in ISSUERS:
        return None
    if claims.get("nonce") != nonce:
        return None
    if str(claims.get("email_verified")).lower() != "true":
        return None
    email = (claims.get("email") or "").strip().lower()
    sub = str(claims.get("sub") or "")
    return (sub, email) if email and sub else None


@require_GET
def callback(request):
    saved = request.session.pop("google_oauth", None)
    if not saved or not secrets.compare_digest(request.GET.get("state", ""), saved["state"]):
        return _fail("state mismatch")
    if request.GET.get("error") or not request.GET.get("code"):
        return _fail(request.GET.get("error", "no code"))
    try:
        tokens = _post_json(TOKEN_URL, {
            "code": request.GET["code"], "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET, "redirect_uri": _redirect_uri(request),
            "grant_type": "authorization_code",
        })
        # Google checks the token's signature and expiry; we check audience, issuer, nonce, verified email.
        claims = _get_json(TOKENINFO_URL + "?" + urllib.parse.urlencode({"id_token": tokens["id_token"]}))
    except (urllib.error.URLError, KeyError, ValueError) as e:
        return _fail(f"token exchange: {e}")
    checked = check_claims(claims, saved["nonce"])
    if not checked:
        return _fail("claims")
    sub, email = checked

    # 1. This Google account is already linked: sign straight in.
    ident = GoogleIdentity.objects.select_related("user").filter(sub=sub).first()
    if ident:
        return _sign_in(request, ident.user)

    User = get_user_model()
    existing = User.objects.filter(username=email).first()
    # 2. An account already exists for this email (made with an email code): ask before linking.
    if existing:
        request.session["google_link"] = {"user_id": existing.id, "sub": sub, "email": email}
        return redirect("/auth/google/link")
    # 3. New person: create the account and link Google to it.
    user = User.objects.create(username=email, email=email)
    GoogleIdentity.objects.create(user=user, sub=sub, email=email)
    return _sign_in(request, user, "signup:google")


def _sign_in(request, user, event="login:google"):
    from .monitor import log_event
    login(request, user, backend="django.contrib.auth.backends.ModelBackend")
    log_event(user.id, event)
    return redirect("/app")


@require_http_methods(["GET", "POST"])
def link(request):
    """Confirm linking a Google account to an existing account with the same verified email."""
    pending = request.session.get("google_link")
    if not pending:
        return redirect("/login/")
    if request.method == "GET":
        return render(request, "google_link.html", {"email": pending["email"]})
    request.session.pop("google_link", None)
    if request.POST.get("choice") != "link":
        return redirect("/login/")
    user = get_user_model().objects.filter(id=pending["user_id"], username=pending["email"]).first()
    if not user:
        return _fail("account vanished before linking")
    try:
        GoogleIdentity.objects.get_or_create(sub=pending["sub"], defaults={"user": user, "email": pending["email"]})
    except IntegrityError:
        return _fail("link race")
    return _sign_in(request, user)
