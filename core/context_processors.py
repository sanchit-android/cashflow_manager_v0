from django.conf import settings


def js_dir(request):
    """Readable source while developing; the minified bundle (static/dist) in production."""
    return {"JS_DIR": "js" if settings.DEBUG else "dist"}


def site(request):
    """Absolute site address and this page's canonical URL (query strings dropped)."""
    from .seo import CALCULATORS, COMPANY, CONTACT_EMAIL, GUIDES, LAUNCH_POSTS, SOCIALS, X_HANDLE
    return {"SITE_URL": settings.SITE_URL, "CANONICAL_URL": settings.SITE_URL + request.path,
            "guides_nav": list(GUIDES.items()), "calcs_nav": list(CALCULATORS.items()), "COMPANY": COMPANY, "CONTACT_EMAIL": CONTACT_EMAIL,
            "SOCIALS": SOCIALS, "X_HANDLE": X_HANDLE, "LAUNCH_POSTS": LAUNCH_POSTS}
