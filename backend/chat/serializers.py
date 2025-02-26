from rest_framework import serializers
from .models import Project, Conversation, Message


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "user",
            "created_at",
            "updated_at",
            "board_type",
            "components_text",
            "libraries_text",
            "description",
            "history_window_size",
        ]


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ["id", "conversation", "sender", "content", "timestamp"]


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = Conversation
        fields = ["id", "project", "created_at", "messages"]
