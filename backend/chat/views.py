from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import BoardType, Library, Component, Project, Conversation, Message
from .serializers import (BoardTypeSerializer, LibrarySerializer, 
                          ComponentSerializer, ProjectSerializer, 
                          ConversationSerializer, MessageSerializer)

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
    
# Chat message API
@api_view(['POST'])
def send_message(request):
    """
    Send a message and get a response form the AI assistant
    """
    if request.method == 'POST':
        # Extract data from request
        conversation_id = request.data.get('conversation_id')
        content = request.data.get('content')
        project_id = request.data.get('project_id')
        
        # validate inputs
        if not content:
            return Response(
                {'error': 'Message content is required'}, 
                status=status.HTTP_400_BAD_REQUEST
                )

        # Get or Create conversation
        if conversation_id:
            try:
                conversation = Conversation.objects.get(id=conversation_id)
            except Conversation.DoesNotExist:
                return Response(
                    {'error': 'Conversation not found'}, 
                    status=status.HTTP_404_BAD_REQUEST
                    )
        else:
            if not project_id:
                return Response(
                    {'error': 'Project ID is required for new conversations'}, 
                    status=status.HTTP_400_BAD_REQUEST
                    )
            try:
                project = Project.objects.get(id=project_id)
                conversation = Conversation.objects.create(project=project)
            except Project.DoesNotExist:
                return Response(
                    {'error': 'Project not found'}, 
                    status=status.HTTP_404_BAD_REQUEST
                    )
        # Save user message
        user_message = Message.objects.create(
            conversation=conversation, 
            sender='user', 
            content=content
            )
        
        # TODO: Integrate with AI to get response
        # For now, we'll just return a placeholder response
        assistant_message = Message.objects.create(
            conversation=conversation, 
            sender='assistant', 
            content='assistant_response'
            )
        
        # Return both messages
        return Response({
            'conversation_id': conversation.id,
            'user_message': MessageSerializer(user_message).data,
            'assistant_message': MessageSerializer(assistant_message).data
            })
