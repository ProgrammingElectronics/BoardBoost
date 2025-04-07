from django.contrib import admin
from .models import Session, Conversation, Message, SiteSettings

admin.site.register(Session)
admin.site.register(Conversation)
admin.site.register(Message)

# In chat/admin.py
from .models import SiteSettings


class SiteSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "registered_users_count",
        "max_beta_users",
        "beta_registration_open",
    )

    def has_add_permission(self, request):
        # Prevent creating multiple settings objects
        return SiteSettings.objects.count() == 0


admin.site.register(SiteSettings, SiteSettingsAdmin)
