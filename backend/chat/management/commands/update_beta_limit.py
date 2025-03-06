from django.core.management.base import BaseCommand
from chat.models import SiteSettings


class Command(BaseCommand):
    help = "Update the maximum number of beta users"

    def add_arguments(self, parser):
        parser.add_argument("count", type=int, help="New maximum number of beta users")

    def handle(self, *args, **options):
        count = options["count"]
        settings, created = SiteSettings.objects.get_or_create(id=1)
        settings.max_beta_users = count
        settings.save()
        self.stdout.write(
            self.style.SUCCESS(f"Successfully updated max beta users to {count}")
        )
