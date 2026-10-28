from django.core.management.base import BaseCommand

from core import gsc


class Command(BaseCommand):
    help = "Ask Google Search Console which public pages are indexed (results show on the admin page)."

    def add_arguments(self, parser):
        parser.add_argument("--if-stale", action="store_true", help="Skip if the last check is under 6 days old.")

    def handle(self, *args, if_stale=False, **opts):
        if not gsc.enabled():
            self.stdout.write("GSC: GSC_SERVICE_ACCOUNT_JSON not set; skipping.")
            return
        if if_stale and not gsc.is_stale():
            self.stdout.write("GSC: checked recently; skipping.")
            return
        try:
            checked, errors = gsc.check_all()
        except Exception as e:  # bad key, no access to the property, network
            self.stderr.write(f"GSC: check failed: {e}")
            return
        self.stdout.write(f"GSC: checked {checked} page(s).")
        for e in errors:
            self.stderr.write(f"  {e}")
