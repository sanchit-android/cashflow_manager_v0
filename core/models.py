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
