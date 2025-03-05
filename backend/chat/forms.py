# chat/forms.py
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth.models import User
from django_recaptcha.fields import ReCaptchaField
from django_recaptcha.widgets import ReCaptchaV3
from django_recaptcha.widgets import ReCaptchaV2Checkbox


class CustomUserCreationForm(UserCreationForm):
    captcha = ReCaptchaField(widget=ReCaptchaV2Checkbox, required=False)

    class Meta:
        model = User
        fields = ("username", "password1", "password2")
