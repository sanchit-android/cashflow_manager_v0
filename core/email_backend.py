"""Send email over HTTPS instead of SMTP (Render's free tier blocks outbound SMTP ports).

Settings: EMAIL_API_PROVIDER = "brevo" | "resend", EMAIL_API_KEY, DEFAULT_FROM_EMAIL.
No extra dependencies: uses urllib from the standard library.
"""
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

log = logging.getLogger(__name__)


class HttpApiEmailBackend(BaseEmailBackend):
    TIMEOUT = 10

    def _request(self, msg):
        provider = settings.EMAIL_API_PROVIDER
        sender = msg.from_email or settings.DEFAULT_FROM_EMAIL
        if provider == "brevo":
            url = "https://api.brevo.com/v3/smtp/email"
            headers = {"api-key": settings.EMAIL_API_KEY}
            body = {"sender": {"email": sender}, "to": [{"email": t} for t in msg.to],
                    "subject": msg.subject, "textContent": msg.body}
            if msg.reply_to:
                body["replyTo"] = {"email": msg.reply_to[0]}
        elif provider == "resend":
            url = "https://api.resend.com/emails"
            headers = {"Authorization": f"Bearer {settings.EMAIL_API_KEY}"}
            body = {"from": sender, "to": list(msg.to), "subject": msg.subject, "text": msg.body}
            if msg.reply_to:
                body["reply_to"] = list(msg.reply_to)
        else:
            raise ValueError(f"Unknown EMAIL_API_PROVIDER: {provider!r}")
        headers.update({"Content-Type": "application/json", "Accept": "application/json"})
        return urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")

    def send_messages(self, email_messages):
        sent = 0
        for msg in email_messages:
            try:
                with urllib.request.urlopen(self._request(msg), timeout=self.TIMEOUT):
                    sent += 1
            except urllib.error.HTTPError as e:
                log.error("Email API rejected message: %s %s", e.code, e.read()[:500])
                if not self.fail_silently:
                    raise
            except Exception:
                log.exception("Email API request failed")
                if not self.fail_silently:
                    raise
        return sent
