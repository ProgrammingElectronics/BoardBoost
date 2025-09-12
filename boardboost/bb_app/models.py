from django.db import models


class Message(models.Model):

    class Role(models.TextChoices):
        DEVELOPER = "developer", "Developer"
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    text = models.TextField(default="")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.USER)
