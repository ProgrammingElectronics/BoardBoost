from django.contrib.auth.decorators import login_required
from django.contrib.auth import logout
from django.contrib import messages
from django.shortcuts import render, redirect
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .ai_service import generate_response
from .models import Project, Conversation, Message, MessageEmbedding, UserProfile
from .serializers import (
    ProjectSerializer,
    ConversationSerializer,
    MessageSerializer,
)
from .ai_service import generate_response


@api_view(['GET'])
def get_model_choices(request):
    return Response({
        'query_models': UserProfile.QUERY_MODEL_CHOICES,
        'summary_models': UserProfile.SUMMARY_MODEL_CHOICES
    })

def index(request):
    return render(request, "chat/index.html")


def logout_view(request):
    logout(request)
    return redirect("login")


### API ViewSets ############################################
class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer


class ConversationViewSet(viewsets.ModelViewSet):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer


### SEND MESSAGE #######################################
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_message(request):
    """Send a message - requires login and token availability"""
    if request.method == 'POST':
        # Check if user has tokens remaining
        profile = request.user.userprofile
        
        # Reset tokens if needed
        profile.reset_tokens_if_needed()
        
        # Extract data from request
        content = request.data.get('content')
        project_id = request.data.get('project_id')
        
        # Validate inputs
        if not content:
            return Response(
                {'error': 'Message content is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Get or create project
        if not project_id:
            # Create a default project if none specified
            project = Project.objects.create(
                name="Default Project",
                user=request.user
            )
            project_id = project.id
        else:
            try:
                project = Project.objects.get(id=project_id)
            except Project.DoesNotExist:
                return Response(
                    {'error': 'Project not found'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
        
        # Get or create the SINGLE conversation for this project
        conversation, created = Conversation.objects.get_or_create(project=project)

        # Estimate token count based on message length (approximately 4 chars per token)
        estimated_message_tokens = len(content) // 4 + 1

        # Check if user might exceed token limit
        if profile.tokens_remaining < estimated_message_tokens:
            return Response(
                {
                    "error": "You have insufficient tokens remaining. Tokens will reset at midnight."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Save user message
        user_message = Message.objects.create(
            conversation=conversation, sender="user", content=content
        )

        # Generate response with token usage information
        assistant_response, tokens_used = generate_response(content, conversation.id, request.user)
        
        # Update user's token balance
        profile.tokens_remaining -= tokens_used
        if profile.tokens_remaining < 0:
            profile.tokens_remaining = 0
        profile.save()

        # Save assistant message
        assistant_message = Message.objects.create(
            conversation=conversation, sender="assistant", content=assistant_response
        )

        # Add token usage information to the response
        return Response(
            {
                "conversation_id": conversation.id,
                "project_id": conversation.project.id,
                "user_message": MessageSerializer(user_message).data,
                "assistant_message": MessageSerializer(assistant_message).data,
                "tokens_used": tokens_used,
                "tokens_remaining": profile.tokens_remaining,
            }
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def project_messages(request, project_id):
    """Get all messages for a project's conversation"""
    try:
        project = Project.objects.get(id=project_id)
        
        # Get the project's conversation (or create it if it doesn't exist)
        conversation, created = Conversation.objects.get_or_create(project=project)
        
        # Get all messages for this conversation
        messages = Message.objects.filter(conversation=conversation).order_by('timestamp')
        
        return Response({
            'conversation_id': conversation.id,
            'messages': MessageSerializer(messages, many=True).data
        })
    except Project.DoesNotExist:
        return Response({'error': 'Project not found'}, status=404)

## Login ################################################
@login_required
def index(request):
    """Main chat interface - requires login"""
    # Get or create user profile
    profile, created = UserProfile.objects.get_or_create(user=request.user)

    # Reset tokens if 24 hours have passed
    profile.reset_tokens_if_needed()

    return render(
        request, "chat/index.html", {"tokens_remaining": profile.tokens_remaining}
    )


## User Settings #######################################
@login_required
def user_settings(request):
    profile = request.user.userprofile
    
    if request.method == 'POST':
        # Update user settings
        profile.default_query_model = request.POST.get('default_query_model')
        profile.default_summary_model = request.POST.get('default_summary_model')
        profile.save()
        
        messages.success(request, 'Settings updated successfully!')
        return redirect('user_settings')
    
    # For GET requests, just display the settings form
    return render(request, 'chat/settings.html', {
        'profile': profile,
        'query_models': UserProfile.QUERY_MODEL_CHOICES,
        'summary_models': UserProfile.SUMMARY_MODEL_CHOICES,
    })