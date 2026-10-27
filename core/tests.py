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
        self.assertEqual(b["kpis"]["users"], 2)

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
        for slug, g in seo.GUIDES.items():
            r = self.client.get(f"/{slug}/")
            self.assertContains(r, "<h1>")
            self.assertContains(r, "FAQPage")
        self.assertEqual(self.client.get("/calculators/nope/").status_code, 404)
        self.assertContains(self.client.get("/sitemap.xml"), "/calculators/emergency-fund/")
        self.assertContains(self.client.get("/sitemap.xml"), "/budget-app-without-sms-india/")
        self.assertContains(self.client.get("/llms.txt"), "Sinking fund calculator")
        self.assertContains(self.client.get("/llms.txt"), "Private YNAB & Mint alternative")
        self.assertContains(self.client.get("/"), "month-overview.webp")
        self.assertContains(self.client.get("/budget-planner-india/"), "month-overview.webp")

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
