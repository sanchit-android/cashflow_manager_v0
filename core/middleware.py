from django.utils.cache import patch_vary_headers


class SecurityHeadersMiddleware:
    """Strict CSP: only our own scripts may run, so no third party can read decrypted data.
    Inline styles are allowed (they can't run code); inline scripts are not."""

    CSP = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; "
        "frame-ancestors 'none'; form-action 'self'; manifest-src 'self'"
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("Content-Security-Policy", self.CSP)
        # same-origin, not no-referrer: with no-referrer browsers send "Origin: null" on form posts,
        # which fails Django's CSRF check. Other sites still never receive a referrer.
        response.setdefault("Referrer-Policy", "same-origin")
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.path.startswith(("/api/", "/app", "/login/", "/logout/", "/auth/")):
            response["Cache-Control"] = "no-store"
        elif (
            request.method == "GET"
            and response.status_code == 200
            and "Set-Cookie" not in response.headers
            and not (getattr(request, "user", None) and request.user.is_authenticated)
        ):
            response.setdefault("Cache-Control", "public, max-age=300, stale-while-revalidate=3600")
            patch_vary_headers(response, ("Cookie",))
        return response
