import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="LoginCode",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(db_index=True, max_length=254)),
                ("code_hash", models.CharField(max_length=64)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("used", models.BooleanField(default=False)),
            ],
        ),
        migrations.CreateModel(
            name="Vault",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kdf", models.JSONField()),
                ("salt", models.CharField(max_length=64)),
                ("wrapped_key", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE,
                                              related_name="vault", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="VaultKey",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("recovery", "Recovery key"), ("passkey", "Passkey")],
                                          default="recovery", max_length=16)),
                ("label", models.CharField(max_length=64)),
                ("wrapped_key", models.TextField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("vault", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                            related_name="keys", to="core.vault")),
            ],
        ),
        migrations.CreateModel(
            name="Record",
            fields=[
                ("id", models.UUIDField(primary_key=True, serialize=False)),
                ("type", models.CharField(max_length=32)),
                ("period", models.CharField(blank=True, default="", max_length=10)),
                ("ciphertext", models.TextField(blank=True, default="")),
                ("iv", models.CharField(blank=True, default="", max_length=32)),
                ("version", models.PositiveIntegerField(default=1)),
                ("deleted", models.BooleanField(default=False)),
                ("updated_at", models.DateTimeField(auto_now=True, db_index=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                           related_name="records", to=settings.AUTH_USER_MODEL)),
            ],
            options={"indexes": [models.Index(fields=["user", "updated_at"], name="core_record_user_id_upd_idx")]},
        ),
    ]
