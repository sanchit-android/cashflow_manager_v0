from django.db import migrations, models


def add_internal_if_missing(apps, schema_editor):
    ChatMiss = apps.get_model("core", "ChatMiss")
    table = ChatMiss._meta.db_table
    with schema_editor.connection.cursor() as cursor:
        cols = {c.name for c in schema_editor.connection.introspection.get_table_description(cursor, table)}
    if "internal" not in cols:
        field = models.BooleanField(default=False)
        field.set_attributes_from_name("internal")
        schema_editor.add_field(ChatMiss, field)


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0010_entitlement"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(add_internal_if_missing, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="chatmiss",
                    name="internal",
                    field=models.BooleanField(default=False),
                ),
            ],
        ),
    ]

