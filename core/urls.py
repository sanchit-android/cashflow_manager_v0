from django.urls import path

from . import views

urlpatterns = [
    path("", views.landing),
    path("privacy/", views.privacy),
    path("login/", views.login_page),
    path("logout/", views.logout_view),
    path("app", views.app_page),
    path("api/auth/request-code", views.request_code),
    path("api/auth/verify-code", views.verify_code),
    path("api/vault", views.vault),
    path("api/vault/keys", views.vault_keys),
    path("api/vault/keys/<int:key_id>", views.vault_keys),
    path("api/records", views.records_pull),
    path("api/records/push", views.records_push),
    path("api/account/delete", views.delete_account),
]
