from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import BoardType, Library, Component, Project, Conversation, Message
from .serializers import (BoardTypeSerializer, LibrarySerializer, 
                          ComponentSerializer, ProjectSerializer, 
                          ConversationSerializer, MessageSerializer)
from .ai_service import generate_response

def index(request):
    return render(request, 'chat/index.html')


# API ViewSets
class BoardTypeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BoardType.objects.all()
    serializer_class = BoardTypeSerializer
    
class LibraryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Library.objects.all()
    serializer_class = LibrarySerializer
    
class ComponentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Component.objects.all()
    serializer_class = ComponentSerializer
    
class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    
class ConversationViewSet(viewsets.ModelViewSet):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer
    
@api_view(['POST'])
def send_message(request):
    """
    Send a message and get a response from the AI assistant.
    """
    if request.method == 'POST':
        # Extract data from request
        content = request.data.get('content')
        conversation_id = request.data.get('conversation_id')
        project_id = request.data.get('project_id')
        
        # Validate inputs
        if not content:
            return Response(
                {'error': 'Message content is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Get or create conversation
        if conversation_id:
            try:
                conversation = Conversation.objects.get(id=conversation_id)
            except Conversation.DoesNotExist:
                if project_id:
                    try:
                        project = Project.objects.get(id=project_id)
                        conversation = Conversation.objects.create(project=project)
                    except Project.DoesNotExist:
                        return Response(
                            {'error': 'Project not found'}, 
                            status=status.HTTP_404_NOT_FOUND
                        )
                else:
                    return Response(
                        {'error': 'Conversation not found and no project_id provided'}, 
                        status=status.HTTP_400_BAD_REQUEST
                    )
        elif project_id:
            try:
                project = Project.objects.get(id=project_id)
                conversation = Conversation.objects.create(project=project)
            except Project.DoesNotExist:
                return Response(
                    {'error': 'Project not found'}, 
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # For testing: create a temporary project and conversation
            project = Project.objects.create(name="Temporary Project")
            conversation = Conversation.objects.create(project=project)
        
        # Save user message
        user_message = Message.objects.create(
            conversation=conversation,
            sender='user',
            content=content
        )
        
        # Build context from project details
        project = conversation.project
        context = f"Project Name: {project.name}\n"
        
        if project.board:
            context += f"Arduino Board: {project.board.name}\n"
        
        if project.libraries.exists():
            libraries = ", ".join([lib.name for lib in project.libraries.all()])
            context += f"Libraries: {libraries}\n"
        
        if project.components.exists():
            components = ", ".join([comp.name for comp in project.components.all()])
            context += f"Components: {components}\n"
        
        # Add project description if it exists
        if project.description:
            context += f"Project Description: {project.description}\n"
            
        # Generate AI response using OpenAI API
        assistant_response = generate_response(context, content)
        
        # Save assistant message
        assistant_message = Message.objects.create(
            conversation=conversation,
            sender='assistant',
            content=assistant_response
        )
        
        # Return response
        return Response({
            'conversation_id': conversation.id,
            'project_id': conversation.project.id,
            'user_message': MessageSerializer(user_message).data,
            'assistant_message': MessageSerializer(assistant_message).data
        })