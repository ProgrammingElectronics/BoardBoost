from django.contrib import admin
from .models import BoardType, Library, Component, Project, Conversation, Message

admin.site.register(BoardType)
admin.site.register(Library)
admin.site.register(Component)
admin.site.register(Project)
admin.site.register(Conversation)
admin.site.register(Message)
