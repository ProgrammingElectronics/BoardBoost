from rest_framework import serializers
from .models import BoardType, Library, Component, Project, Conversation, Message

class BoardTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardType
        fields = ['id', 'name', 'description']
        
class LibrarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Library
        fields = ['id', 'name', 'description']
        
class ComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Component
        fields = ['id', 'name', 'description']
        
class ProjectSerializer(serializers.ModelSerializer):
    
    # Make sure any references to models are properly serialized
    board = serializers.PrimaryKeyRelatedField(queryset=BoardType.objects.all(), allow_null=True, required=False)
    
    class Meta:
        model = Project
        fields = ['id', 'name', 'user', 'created_at', 'updated_at', 'board', 'libraries', 'components', 'description']

class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'conversation', 'sender', 'content', 'timestamp']
        
class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    
    class Meta:
        model = Conversation
        fields = ['id', 'project', 'created_at', 'messages']
        