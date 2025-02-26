from django.db import models
from django.contrib.auth.models import User


class Project(models.Model):
    """Model to store the project"""

    name = models.CharField(max_length=100)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # New text fields for project details
    board_type = models.CharField(max_length=100, blank=True)
    components_text = models.TextField(blank=True)
    libraries_text = models.TextField(blank=True)

    # Additional project information
    description = models.TextField(blank=True)
    history_window_size = models.IntegerField(default=10)

    def __str__(self):
        return self.name


class Conversation(models.Model):
    """Model to store the conversation"""

    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Conversation for {self.project.name} at {self.created_at}"


class Message(models.Model):
    """Model to store individual chat message"""

    SENDER_CHOICES = (
        ("user", "User"),
        ("assistant", "Assistant"),
    )

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.CharField(max_length=10, choices=SENDER_CHOICES)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["timestamp"]

    def __str__(self):
        return f"{self.sender}: {self.content[:50]}..."


class ConversationSummary(models.Model):
    """Model to store summaries of conversations"""

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="summaries"
    )
    content = models.TextField()
    message_count = models.IntegerField()  # Number of messages this summary covers
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Summary for {self.conversation} at {self.created_at}"


class MessageEmbedding(models.Model):
    """Model to store embeddings for messages"""

    message = models.OneToOneField(
        Message, on_delete=models.CASCADE, related_name="embedding_obj"
    )
    embedding = models.JSONField()  # Store the embedding vector as JSON
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Embedding for message {self.message.id}"
