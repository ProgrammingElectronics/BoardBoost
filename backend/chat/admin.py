from django.contrib import admin
from .models import Project, Conversation, Message

admin.site.register(Project)
admin.site.register(Conversation)
admin.site.register(Message)
