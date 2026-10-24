from django.conf import settings
from django.core.management.base import BaseCommand

from core import indexnow


class Command(BaseCommand):
    help = "Submit changed public pages to IndexNow (Bing, Yandex, Seznam)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="List changed pages without submitting.")
        parser.add_argument("--all", action="store_true", help="Submit every public page, changed or not.")

    def handle(self, *args, dry_run=False, all=False, **opts):
        if settings.DEBUG and not dry_run:
            self.stdout.write("DEBUG is on; skipping IndexNow (use --dry-run to preview).")
            return
        urls, results = indexnow.ping_changed(dry_run=dry_run, force=all)
        if not urls:
            self.stdout.write("IndexNow: no page changes.")
            return
        self.stdout.write(f"IndexNow: {len(urls)} page(s) {'to submit' if dry_run else 'submitted'}:")
        for u in urls:
            self.stdout.write(f"  {u}")
        for endpoint, status in results.items():
            self.stdout.write(f"  {endpoint} -> {status}")
