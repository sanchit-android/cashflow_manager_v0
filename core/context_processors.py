from django.conf import settings


def js_dir(request):
    """Readable source while developing; the minified bundle (static/dist) in production."""
    return {"JS_DIR": "js" if settings.DEBUG else "dist"}


def site(request):
    """Absolute site address and this page's canonical URL (query strings dropped)."""
    from .seo import COMPANY, CONTACT_EMAIL, GUIDES
    return {"SITE_URL": settings.SITE_URL, "CANONICAL_URL": settings.SITE_URL + request.path,
            "guides_nav": list(GUIDES.items()), "COMPANY": COMPANY, "CONTACT_EMAIL": CONTACT_EMAIL}
