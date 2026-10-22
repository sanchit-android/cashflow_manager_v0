class SecurityHeadersMiddleware:
    """Strict CSP: only our own scripts may run, so no third party can read decrypted data.
    Inline styles are allowed (they can't run code); inline scripts are not."""

    CSP = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        "connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; "
        "frame-ancestors 'none'; form-action 'self'"
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("Content-Security-Policy", self.CSP)
        response.setdefault("Referrer-Policy", "no-referrer")
        response.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if request.path.startswith(("/api/", "/app")):
            response["Cache-Control"] = "no-store"
        return response
