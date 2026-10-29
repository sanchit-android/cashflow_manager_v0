import json

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from .models import AdminGrant, PageView, UsageDaily
from .monitor import classify

User = get_user_model()
OWNER = "pravaha.ai@gmail.com"


def _post(client, url, body, method="post"):
    return getattr(client, method)(url, data=json.dumps(body), content_type="application/json")


@override_settings(OWNER_EMAIL=OWNER)
class AdminAccessTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create(username=OWNER, email=OWNER)
        self.other = User.objects.create(username="a@b.com", email="a@b.com")

    def test_non_admin_gets_404(self):
        self.client.force_login(self.other)
        for path in ("/api/admin/tech", "/api/admin/business", "/api/admin/admins"):
            self.assertEqual(self.client.get(path).status_code, 404)
        self.assertFalse(self.client.get("/api/vault").json()["is_admin"])

    def test_owner_sees_dashboards(self):
        self.client.force_login(self.owner)
        self.assertTrue(self.client.get("/api/vault").json()["is_admin"])
        self.client.get("/")  # creates a page view
        t = self.client.get("/api/admin/tech?days=7").json()
        self.assertIn("traffic", t)
        self.assertIn("db", t)
        b = self.client.get("/api/admin/business?days=30").json()
        self.assertEqual(b["kpis"]["users"], 1)  # the owner matches pravaha.ai, so is internal
        self.assertEqual(b["internal_users"], 1)

    def test_traffic_explorer(self):
        self.client.force_login(self.other)
        AdminGrant.objects.create(email="a@b.com")
        self.client.logout()
        self.client.get("/", HTTP_REFERER="https://www.google.com/", HTTP_USER_AGENT="Mozilla/5.0")
        self.client.get("/features/", HTTP_USER_AGENT="Mozilla/5.0 (iPhone) Mobile")
        self.client.force_login(self.other)
        d = self.client.get("/api/admin/traffic?days=7&split=source").json()
        self.assertEqual(d["group"], "day")
        self.assertEqual(len(d["labels"]), 7)
        self.assertEqual(sum(d["series"]["views"]), 2)
        self.assertIn("search", [s["name"] for s in d["split"]])
        d = self.client.get("/api/admin/traffic?days=1&source=search").json()
        self.assertEqual(d["group"], "hour")
        self.assertEqual(d["totals"]["visits"], 1)
        self.assertEqual(self.client.get("/api/admin/traffic?path=/features").json()["totals"]["views"], 1)
        self.client.logout()
        self.client.get("/", HTTP_USER_AGENT="GPTBot/1.0")
        self.client.force_login(self.other)
        only_bots = self.client.get("/api/admin/traffic?days=7&sources=bot&split=bot").json()
        self.assertEqual((only_bots["totals"]["views"], only_bots["totals"]["bots"]), (0, 1))
        self.assertEqual(only_bots["split"][0]["name"], "GPTBot (OpenAI)")
        both = self.client.get("/api/admin/traffic?days=7&sources=search,bot").json()
        self.assertEqual((both["totals"]["visits"], both["totals"]["bots"]), (1, 1))

    def test_internal_users_left_out_of_stats(self):
        self.client.force_login(self.owner)
        internal = self.client.get("/api/admin/internal").json()["users"]
        self.assertEqual([u["email"] for u in internal], [OWNER])
        _post(self.client, "/api/admin/internal", {"email": "a@b.com", "internal": True})
        UsageDaily.objects.create(day=__import__("datetime").date.today(), user_id=self.other.id, event="tab:month", count=3)
        b = self.client.get("/api/admin/business?days=30").json()
        self.assertEqual(b["kpis"]["users"], 0)
        self.assertEqual(b["tabs"][0]["count"], 0)
        # an admin can put a default-internal user back into the stats
        r = _post(self.client, "/api/admin/internal", {"email": OWNER, "internal": False}).json()
        self.assertEqual([u["email"] for u in r["users"]], ["a@b.com"])
        self.assertEqual(self.client.get("/api/admin/business").json()["kpis"]["users"], 1)
        self.assertEqual(_post(self.client, "/api/admin/internal", {"email": "x@y.com", "internal": True}).status_code, 404)

    def test_owner_adds_admin_and_cannot_be_removed(self):
        self.client.force_login(self.owner)
        r = _post(self.client, "/api/admin/admins", {"email": "A@B.com"})
        self.assertEqual([a["email"] for a in r.json()["admins"]], [OWNER, "a@b.com"])
        # the new admin can now see the dashboard and add others, but can't remove the owner
        self.client.force_login(self.other)
        self.assertEqual(self.client.get("/api/admin/tech").status_code, 200)
        self.assertEqual(_post(self.client, "/api/admin/admins", {"email": OWNER}, "delete").status_code, 400)
        _post(self.client, "/api/admin/admins", {"email": "a@b.com"}, "delete")
        self.assertFalse(AdminGrant.objects.exists())


class TrackingTests(TestCase):
    def test_telemetry_counts_events_and_rejects_bad_names(self):
        u = User.objects.create(username="x@y.com", email="x@y.com")
        self.client.force_login(u)
        _post(self.client, "/api/telemetry", {"events": {"tab:month": 2, "Bad Name ₹500": 1}})
        _post(self.client, "/api/telemetry", {"events": {"tab:month": 1}})
        self.assertEqual(UsageDaily.objects.get(event="tab:month").count, 3)
        self.assertEqual(UsageDaily.objects.count(), 1)

    def test_page_view_source(self):
        self.client.get("/", HTTP_REFERER="https://www.google.com/", HTTP_USER_AGENT="Mozilla/5.0 (iPhone; Mobile)")
        self.client.get("/", HTTP_USER_AGENT="Mozilla/5.0 (compatible; GPTBot/1.1)")
        pv = list(PageView.objects.order_by("id").values_list("source", "source_name", "device"))
        self.assertEqual(pv, [("search", "google", "mobile"), ("bot", "GPTBot (OpenAI)", "bot")])

    def test_classify(self):
        self.assertEqual(classify("", "utm_source=chatgpt.com", "plannedout.in")[:2], ("ai", "chatgpt"))
        self.assertEqual(classify("https://www.perplexity.ai/search", "", "plannedout.in")[:2], ("ai", "perplexity"))
        self.assertEqual(classify("https://plannedout.in/about/", "", "plannedout.in")[0], "internal")
        self.assertEqual(classify("https://lnkd.in/x", "", "plannedout.in")[:2], ("social", "linkedin"))
        self.assertEqual(classify("https://someblog.com/post", "", "plannedout.in")[:2], ("referral", "someblog.com"))
        self.assertEqual(classify("", "", "plannedout.in")[0], "direct")


class CalculatorTests(TestCase):
    def test_pages_render_and_are_in_sitemap(self):
        from . import seo
        self.assertEqual(self.client.get("/calculators/").status_code, 200)
        for slug in seo.CALCULATORS:
            r = self.client.get(f"/calculators/{slug}/")
            self.assertContains(r, f'data-calc="{slug}"')
            self.assertContains(r, "FAQPage")
            self.assertContains(r, "Related guides")
            self.assertContains(r, '<html lang="en">')
        home = self.client.get("/")
        self.assertEqual(len(seo.GUIDES), 15)
        for slug, g in seo.GUIDES.items():
            self.assertContains(home, f'href="/{slug}/"')
            r = self.client.get(f"/{slug}/")
            self.assertContains(r, "<h1>")
            self.assertContains(r, "FAQPage")
            self.assertContains(r, '"@type": "Article"')
            self.assertContains(r, "/calculators/")
            self.assertContains(r, '<table class="compare">')
            self.assertContains(r, 'href="/app?demo=1"')
            expected_lang = "en-IN" if slug in seo.INDIA_GUIDES else "en"
            self.assertContains(r, f'<html lang="{expected_lang}">')
        for tpl_slug in ("indian-household-budget-template", "excel-budget-alternative"):
            tr = self.client.get(f"/{tpl_slug}/")
            self.assertContains(tr, "indian-household-budget-template.xlsx")
            self.assertContains(tr, "monthly-budget-template.csv")
        self.assertContains(self.client.get("/about/"), "AboutPage")
        self.assertContains(self.client.get("/contact/"), "ContactPage")
        self.assertContains(self.client.get("/privacy/"), "FAQPage")
        manifest = self.client.get("/manifest.webmanifest")
        self.assertEqual(manifest.status_code, 200)
        self.assertEqual(manifest.json()["short_name"], "PlannedOut")
        self.assertIn("max-age=300", home.headers.get("Cache-Control", ""))
        self.assertEqual(self.client.get("/login/").headers.get("Cache-Control"), "no-store")
        self.assertEqual(self.client.get("/calculators/nope/").status_code, 404)
        sitemap = self.client.get("/sitemap.xml")
        self.assertContains(sitemap, "/calculators/emergency-fund/")
        self.assertContains(sitemap, "/budget-app-without-sms-india/")
        self.assertContains(sitemap, "/first-salary-budget-planner-india/")
        self.assertContains(sitemap, "/festival-wedding-budget-planner-india/")
        self.assertContains(sitemap, "/child-education-savings-planner-india/")
        self.assertContains(sitemap, "/indian-household-budget-template/")
        self.assertContains(sitemap, "/freelance-irregular-income-budget/")
        self.assertContains(sitemap, "/sinking-funds-guide/")
        llms = self.client.get("/llms.txt")
        self.assertContains(llms, "Sinking fund calculator")
        self.assertContains(llms, "Private YNAB & Mint alternative")
        self.assertContains(llms, "First-salary planner (India)")
        self.assertContains(llms, "Sinking funds guide")
        self.assertContains(self.client.get("/"), "month-overview.webp")
        self.assertContains(self.client.get("/"), "transactions-sheet.webp")
        self.assertContains(self.client.get("/budget-planner-india/"), "month-overview.webp")
        self.assertContains(self.client.get("/budget-planner-india/"), "transactions-sheet.webp")
        self.assertContains(self.client.get("/excel-budget-alternative/"), "transactions-sheet.webp")
        self.assertContains(self.client.get("/budget-app-without-sms-india/"), "transactions-sheet.webp")

    def test_features_themes_changelog_and_embed(self):
        from . import seo
        for path, marker in (("/features/", "featureList"), ("/themes/", "Liquid Glass"), ("/changelog/", "dateModified")):
            r = self.client.get(path)
            self.assertContains(r, marker)
            self.assertContains(self.client.get("/sitemap.xml"), path)
        self.assertContains(self.client.get("/themes/"), "FAQPage")
        self.assertEqual(len(seo.THEMES), 15)
        self.assertNotIn("Five themes", self.client.get("/").content.decode())
        llms = self.client.get("/llms.txt")
        self.assertContains(llms, "/themes/")
        self.assertContains(llms, "custom theme builder")
        for slug in seo.CALCULATORS:
            page = self.client.get(f"/calculators/{slug}/")
            self.assertContains(page, "Common mistakes")
            self.assertContains(page, "data-share")
            self.assertContains(page, f"/embed/{slug}/")
            self.assertContains(page, '<table class="compare">')
            e = self.client.get(f"/embed/{slug}/")
            self.assertContains(e, f'data-calc="{slug}"')
            self.assertContains(e, "noindex")
            self.assertRegex(e.content.decode(), rf'rel="canonical" href="[^"]*/calculators/{slug}/"')
            self.assertIn("frame-ancestors *", e.headers["Content-Security-Policy"])
            self.assertNotIn("X-Frame-Options", e.headers)
        self.assertIn("frame-ancestors 'none'", self.client.get("/calculators/").headers["Content-Security-Policy"])
        self.assertEqual(self.client.get("/embed/nope/").status_code, 404)

    def test_sitemap_lastmod_from_indexnow(self):
        from .models import IndexNowPage
        IndexNowPage.objects.create(path="/about/", digest="x")
        body = self.client.get("/sitemap.xml").content.decode()
        self.assertIn("/about/</loc><lastmod>", body)
        self.assertIn("/contact/</loc></url>", body)

    def test_calc_use_counts_anonymously(self):
        _post(self.client, "/api/calc-use", {"calc": "emergency-fund"})
        _post(self.client, "/api/calc-use", {"calc": "emergency-fund"})
        self.assertEqual(_post(self.client, "/api/calc-use", {"calc": "x"}).status_code, 400)
        row = UsageDaily.objects.get(event="calc:emergency-fund")
        self.assertEqual((row.count, row.user_id), (2, None))

    def test_demo_mode_works_without_login(self):
        self.assertEqual(self.client.get("/app").status_code, 302)
        redir = self.client.get("/demo/")
        self.assertEqual(redir.status_code, 302)
        self.assertEqual(redir["Location"], "/app?demo=1")
        demo = self.client.get("/app?demo=1")
        self.assertEqual(demo.status_code, 200)
        self.assertContains(demo, 'id="demo-reset"')
        self.assertContains(demo, "Live demo")
        self.assertTrue(UsageDaily.objects.filter(event="demo:open").exists())


@override_settings(OWNER_EMAIL=OWNER, GSC_SERVICE_ACCOUNT_JSON="{}")
class IndexingTests(TestCase):
    def setUp(self):
        self.client.force_login(User.objects.create(username=OWNER, email=OWNER))

    def test_check_saves_status_and_lists_missing(self):
        from unittest import mock
        from . import gsc

        def fake(url, token):
            ok = not url.endswith("/sinking-funds-guide/")
            return {"verdict": "PASS" if ok else "NEUTRAL", "last_crawl": None, "google_canonical": "",
                    "coverage": "Submitted and indexed" if ok else "Discovered - currently not indexed"}
        with mock.patch.object(gsc, "access_token", return_value="t"), mock.patch.object(gsc, "inspect", fake):
            d = self.client.post("/api/admin/indexing").json()
        missing = [p["path"] for p in d["pages"] if not p["indexed"]]
        self.assertEqual(missing, ["/sinking-funds-guide/"])
        self.assertEqual(self.client.get("/api/admin/indexing").json()["pages"], d["pages"])
        self.assertFalse(gsc.is_stale())

    @override_settings(GSC_SERVICE_ACCOUNT_JSON="")
    def test_not_configured(self):
        self.assertFalse(self.client.get("/api/admin/indexing").json()["enabled"])
        self.assertEqual(self.client.post("/api/admin/indexing").status_code, 400)

    def test_signed_token_request(self):
        """The JWT we build is signed with the key and verifies with its public half."""
        import base64
        from unittest import mock
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding, rsa
        from . import gsc
        k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                              serialization.NoEncryption()).decode()
        sent = {}
        def fake_post(url, data, headers):
            sent["assertion"] = dict(x.split("=", 1) for x in data.decode().split("&"))["assertion"]
            return {"access_token": "abc"}
        with override_settings(GSC_SERVICE_ACCOUNT_JSON=json.dumps({"client_email": "s@x.iam", "private_key": pem})), \
                mock.patch.object(gsc, "_post", fake_post):
            self.assertEqual(gsc.access_token(), "abc")
        h, c, s = sent["assertion"].split(".")
        k.public_key().verify(base64.urlsafe_b64decode(s + "=="), f"{h}.{c}".encode(), padding.PKCS1v15(), hashes.SHA256())
