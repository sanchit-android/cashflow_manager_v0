from django.conf import settings


def js_dir(request):
    """Readable source while developing; the minified bundle (static/dist) in production."""
    return {"JS_DIR": "js" if settings.DEBUG else "dist"}
