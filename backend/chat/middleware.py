# In chat/middleware.py
from django.shortcuts import redirect
from django.urls import resolve, reverse
from .models import SiteSettings


class BetaRegistrationMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Check if we're trying to access the signup page
        url_name = resolve(request.path_info).url_name

        if url_name == "signup" and not request.user.is_authenticated:
            # Get or create settings
            settings, created = SiteSettings.objects.get_or_create(id=1)

            # Check if beta is closed or full
            if (
                not settings.beta_registration_open
                or settings.registered_users_count >= settings.max_beta_users
            ):
                return redirect("beta_closed")

        response = self.get_response(request)
        return response
