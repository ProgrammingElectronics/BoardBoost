# Generated by Django 5.1.6 on 2025-03-13 15:01

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("chat", "0015_userprofile_max_tokens_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="board_fqbn",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
    ]
