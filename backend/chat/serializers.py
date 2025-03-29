from rest_framework import serializers
from .models import Project, Conversation, Message


class ProjectSerializer(serializers.ModelSerializer):
    """Serializer for the Project model"""

    class Meta:
        model = Project
        fields = [
            "id",
            "name",
            "board_type",
            "board_fqbn",
            "components_text",
            "libraries_text",
            "description",
            "created_at",
            "updated_at",
            "query_model",
            "summary_model",
            "history_window_size",
            "user",
        ]
        # User is read-only, will be set in the view
        read_only_fields = ["id", "created_at", "updated_at", "user"]

    def validate_history_window_size(self, value):
        """
        Check that history_window_size is a positive integer
        """
        try:
            value = int(value)
            if value < 1:
                raise serializers.ValidationError(
                    "History window size must be at least 1."
                )
            return value
        except (TypeError, ValueError):
            raise serializers.ValidationError("History window size must be a number.")


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ["id", "conversation", "sender", "content", "timestamp"]


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = Conversation
        fields = ["id", "project", "created_at", "messages"]
