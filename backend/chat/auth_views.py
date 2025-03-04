from django.contrib.auth.forms import UserCreationForm
from django.urls import reverse_lazy
from .forms import CustomUserCreationForm  # Import your custom form
from django.views.generic.edit import CreateView
from .models import SiteSettings


class SignUpView(CreateView):
    form_class = CustomUserCreationForm
    success_url = reverse_lazy("login")
    template_name = "registration/signup.html"

    def form_valid(self, form):
        # First save the user
        response = super().form_valid(form)

        # Then increment the counter
        settings, created = SiteSettings.objects.get_or_create(id=1)
        settings.registered_users_count += 1
        settings.save()

        return response
