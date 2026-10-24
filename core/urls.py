from django.urls import path

from . import google_auth, seo, views

urlpatterns = [
    path("", views.landing),
    path("privacy/", views.privacy),
    path("robots.txt", views.robots_txt),
    path("sitemap.xml", views.sitemap_xml),
    path("llms.txt", views.llms_txt),
    path("login/", views.login_page),
    path("logout/", views.logout_view),
    path("auth/google/start", google_auth.start),
    path("auth/google/callback", google_auth.callback),
    path("auth/google/link", google_auth.link),
    path("app", views.app_page),
    path("api/auth/request-code", views.request_code),
    path("api/auth/verify-code", views.verify_code),
    path("api/vault", views.vault),
    path("api/vault/keys", views.vault_keys),
    path("api/vault/keys/<int:key_id>", views.vault_keys),
    path("api/records", views.records_pull),
    path("api/records/push", views.records_push),
    path("api/account/delete", views.delete_account),
] + [path(f"{slug}/", views.guide, {"slug": slug}) for slug in seo.GUIDES]
