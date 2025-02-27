from django.contrib.auth.models import User
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    tokens_remaining = models.IntegerField(default=10000)  # 10,000 tokens per day
    last_token_reset = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.user.username}'s profile"

    def reset_tokens_if_needed(self):
        """Reset tokens if it's past midnight since the last reset"""
        now = timezone.now()
        # Check if the current date is different from last reset date
        if now.date() > self.last_token_reset.date():
            self.tokens_remaining = 10000  # Reset to daily limit
            self.last_token_reset = now
            self.save()
            return True
        return False


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Create a UserProfile automatically when a User is created"""
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """Save the UserProfile when the User is saved"""
    instance.userprofile.save()


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
