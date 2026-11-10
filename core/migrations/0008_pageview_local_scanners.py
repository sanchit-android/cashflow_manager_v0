import re

from django.db import migrations, models

# A frozen copy of core.monitor.PROBE as it was when this migration was written.
PROBE = re.compile(
    r"(^/\.|/\.(env|git|svn|hg|aws|ssh|docker|vscode|idea|DS_Store|s3cfg|npmrc|htaccess|htpasswd)"
    r"|\.(php\d?|asp|aspx|jsp|cgi|pl|bak|old|orig|save|swp|sql|sqlite|db|ini|cfg|conf|yml|yaml|log|tar|gz|zip|rar|7z|pem|key)$"
    r"|/wp-|/wordpress|/phpmyadmin|/pma/|/cgi-bin|/config\.(json|js)$|/credentials|/secrets?(\.|/|$)|/vendor/|/actuator"
    r"|/server-status|/xmlrpc|/boaform|/hnap1|/owa/|/solr/|/telescope|/_profiler|/console/?$|/debug/|/backup"
    r"|/admin(istrator)?(/|\.|$)|/manager/html|/autodiscover|/ecp/|/geoserver|/druid|/jenkins)", re.I)
SCANNER = "Vulnerability scanner"


def mark_scanners(apps, schema_editor):
    """Re-label past vulnerability-scanner traffic (/.env, /.aws/credentials, /wp-login.php ...) as bots.
    A visitor id is per day, so every page that visitor loaded that day was the scanner too."""
    PageView = apps.get_model("core", "PageView")
    probes = PageView.objects.filter(user_id__isnull=True).exclude(source="bot")
    visitors = {v for v, path in probes.values_list("visitor", "path") if PROBE.search(path or "")}
    visitors = list(visitors)
    for i in range(0, len(visitors), 500):
        PageView.objects.filter(visitor__in=visitors[i:i + 500], user_id__isnull=True).update(
            source="bot", source_name=SCANNER, referrer_host="", utm_campaign="", device="bot", demo=False)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0007_pageview_demo"),
    ]

    operations = [
        migrations.AddField(
            model_name="pageview",
            name="local",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(mark_scanners, migrations.RunPython.noop),
    ]
