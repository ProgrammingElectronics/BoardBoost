from django.db import models
from django.contrib.auth.models import User

class BoardType(models.Model):
    """Model to store the type of board"""
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name
    
class Library(models.Model):
    """Model to store the library used"""
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name

class Component(models.Model):
    """Model to store the component used"""
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name
    
class Project(models.Model):
    """Model to store the project"""
    name = models.CharField(max_length=100)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True) 
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Project details
    board = models.ForeignKey(BoardType, on_delete=models.SET_NULL, null=True, blank=True)
    libraries = models.ManyToManyField(Library, blank=True)
    components = models.ManyToManyField(Component, blank=True)

    # Additional project information
    description = models.TextField(blank=True)
    
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
        ('user', 'User'),
        ('assistant', 'Assistant'),
    )
    
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.CharField(max_length=10, choices=SENDER_CHOICES)
    content = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['timestamp']
    
    def __str__(self):
        return f"{self.sender}: {self.content[:50]}..."

