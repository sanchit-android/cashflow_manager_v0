from django.conf import settings
from django.db import models


class LoginCode(models.Model):
    """One-time email login code. Only an HMAC of the code is stored."""
    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used = models.BooleanField(default=False)


class Vault(models.Model):
    """Key material for a user's encrypted data. The server never sees the data key.

    wrapped_key = data key encrypted with a key derived from the vault passphrase.
    """
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="vault")
    kdf = models.JSONField()  # e.g. {"alg": "argon2id", "m": 65536, "t": 3, "p": 1}
    salt = models.CharField(max_length=64)
    wrapped_key = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class VaultKey(models.Model):
    """Extra ways to unlock: recovery keys (and passkeys later). Each wraps its own copy of the data key."""
    KINDS = [("recovery", "Recovery key"), ("passkey", "Passkey")]
    vault = models.ForeignKey(Vault, on_delete=models.CASCADE, related_name="keys")
    kind = models.CharField(max_length=16, choices=KINDS, default="recovery")
    label = models.CharField(max_length=64)
    wrapped_key = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)


class Record(models.Model):
    """One encrypted logical record (transaction, account, settings, ...).

    Plaintext columns are limited to what sync needs: type, period, version, timestamps.
    """
    id = models.UUIDField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="records")
    type = models.CharField(max_length=32)
    period = models.CharField(max_length=10, blank=True, default="")
    ciphertext = models.TextField(blank=True, default="")
    iv = models.CharField(max_length=32, blank=True, default="")
    version = models.PositiveIntegerField(default=1)
    deleted = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["user", "updated_at"], name="core_record_user_id_upd_idx")]


class GoogleIdentity(models.Model):
    """A Google account (by its stable `sub` id) linked to one of our users."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="google_identities")
    sub = models.CharField(max_length=255, unique=True)
    email = models.EmailField()
    linked_at = models.DateTimeField(auto_now_add=True)


# ---------- admin and monitoring ----------
# None of these hold financial data. Visitors are counted with a daily-rotating hash; no IP is stored.

class AdminGrant(models.Model):
    """An email allowed to see the admin dashboard. The owner (settings.OWNER_EMAIL) is always admin."""
    email = models.EmailField(unique=True)
    added_by = models.EmailField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)


class PageView(models.Model):
    """One HTML page view: where the visitor came from and what they saw."""
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    path = models.CharField(max_length=200)
    status = models.PositiveSmallIntegerField(default=200)
    ms = models.PositiveIntegerField(default=0)
    visitor = models.CharField(max_length=16, db_index=True)  # hash(secret, day, ip, user agent)
    user_id = models.IntegerField(null=True, blank=True)
    source = models.CharField(max_length=16)  # direct, search, ai, social, referral, email, internal, bot
    source_name = models.CharField(max_length=64, blank=True, default="")  # google, chatgpt, linkedin, utm source…
    referrer_host = models.CharField(max_length=120, blank=True, default="")
    utm_campaign = models.CharField(max_length=80, blank=True, default="")
    device = models.CharField(max_length=8, default="desktop")  # desktop, mobile, tablet, bot


class EndpointStat(models.Model):
    """Per-hour counters for every non-static request, grouped by route."""
    hour = models.DateTimeField()
    route = models.CharField(max_length=80)
    count = models.PositiveIntegerField(default=0)
    err4 = models.PositiveIntegerField(default=0)
    err5 = models.PositiveIntegerField(default=0)
    total_ms = models.BigIntegerField(default=0)
    max_ms = models.PositiveIntegerField(default=0)
    slow = models.PositiveIntegerField(default=0)  # over 1 second

    class Meta:
        constraints = [models.UniqueConstraint(fields=["hour", "route"], name="uniq_endpoint_hour")]


class ErrorEvent(models.Model):
    """A server error, a failed API call, or a browser-side error reported by the app."""
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    kind = models.CharField(max_length=8)  # server, api, client
    path = models.CharField(max_length=200)
    status = models.PositiveSmallIntegerField(default=0)
    message = models.CharField(max_length=300)
    detail = models.TextField(blank=True, default="")
    user_id = models.IntegerField(null=True, blank=True)


class UsageDaily(models.Model):
    """How many times a signed-in user did a named thing on a day (screen opened, button used).
    Event names are fixed labels from the app code; they never contain what the user typed."""
    day = models.DateField()
    user_id = models.IntegerField(null=True, blank=True)
    event = models.CharField(max_length=48)
    count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["day", "user_id", "event"], name="uniq_usage_day")]
        indexes = [models.Index(fields=["day", "event"], name="core_usage_day_event_idx")]


class Boot(models.Model):
    """One row per app process start. On a free host that sleeps, these are cold starts."""
    created_at = models.DateTimeField(auto_now_add=True)
