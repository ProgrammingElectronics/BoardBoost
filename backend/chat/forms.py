# chat/forms.py
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth.models import User
from django_recaptcha.fields import ReCaptchaField
from django_recaptcha.widgets import ReCaptchaV2Checkbox


class CustomUserCreationForm(UserCreationForm):
    captcha = ReCaptchaField(widget=ReCaptchaV2Checkbox)

    class Meta:
        model = User
        fields = ("username", "password1", "password2")


# class CustomAuthenticationForm(AuthenticationForm):
#     # In your form
#     captcha = ReCaptchaField(
#         widget=ReCaptchaV2Checkbox(
#             attrs={
#                 "data-theme": "dark",  # Options: 'light' (default) or 'dark'
#             }
#         )
#     )
