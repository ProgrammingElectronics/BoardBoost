from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Project, Conversation, Message
from .serializers import (
    ProjectSerializer,
    ConversationSerializer,
    MessageSerializer,
)
from .ai_service import generate_response


def index(request):
    return render(request, "chat/index.html")


### API ViewSets ############################################
class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer


class ConversationViewSet(viewsets.ModelViewSet):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer


### SEND MESSAGE #######################################
from .ai_service import generate_response
from .models import MessageEmbedding  # Make sure this is imported


@api_view(["POST"])
def send_message(request):
    """
    Send a message and get a response from the AI assistant.
    """
    if request.method == "POST":
        # Extract data from request
        content = request.data.get("content")
        conversation_id = request.data.get("conversation_id")
        project_id = request.data.get("project_id")

        # Validate inputs
        if not content:
            return Response(
                {"error": "Message content is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get or create conversation - keep your existing code here
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
                            {"error": "Project not found"},
                            status=status.HTTP_404_NOT_FOUND,
                        )
                else:
                    return Response(
                        {"error": "Conversation not found and no project_id provided"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
        elif project_id:
            try:
                project = Project.objects.get(id=project_id)
                conversation = Conversation.objects.create(project=project)
            except Project.DoesNotExist:
                return Response(
                    {"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND
                )
        else:
            # For testing: create a temporary project and conversation
            project = Project.objects.create(name="Temporary Project")
            conversation = Conversation.objects.create(project=project)

        # Save user message
        user_message = Message.objects.create(
            conversation=conversation, sender="user", content=content
        )

        # Generate embedding for user message for future similarity searches
        try:
            from .ai_service import get_message_embedding

            embedding = get_message_embedding(content)
            if embedding:
                MessageEmbedding.objects.create(
                    message=user_message, embedding=embedding
                )
        except Exception as e:
            print(f"Error creating message embedding: {e}")

        # Generate AI response using our enhanced service
        assistant_response = generate_response(content, conversation.id)

        # Save assistant message
        assistant_message = Message.objects.create(
            conversation=conversation, sender="assistant", content=assistant_response
        )

        # Generate embedding for assistant message for future similarity searches
        try:
            embedding = get_message_embedding(assistant_response)
            if embedding:
                MessageEmbedding.objects.create(
                    message=assistant_message, embedding=embedding
                )
        except Exception as e:
            print(f"Error creating message embedding: {e}")

        # Return response
        return Response(
            {
                "conversation_id": conversation.id,
                "project_id": conversation.project.id,
                "user_message": MessageSerializer(user_message).data,
                "assistant_message": MessageSerializer(assistant_message).data,
            }
        )
