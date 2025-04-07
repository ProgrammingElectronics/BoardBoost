from django.http import HttpResponse, JsonResponse
from .arduino_cli_service import ArduinoCliService
import base64
from django.contrib.auth.decorators import login_required
from django.contrib.auth import logout
from django.contrib import messages
from django.shortcuts import render, redirect
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .ai_service import generate_response
from .models import Session, Conversation, Message, MessageEmbedding, UserProfile
from .serializers import (
    SessionSerializer,
    ConversationSerializer,
    MessageSerializer,
)
import json
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST
from .arduino_create_agent_signature import sign_arduino_command
from .ai_mode_factory import get_mode_handler, get_welcome_message


@api_view(["GET"])
def get_model_choices(request):
    return Response(
        {
            "query_models": UserProfile.QUERY_MODEL_CHOICES,
            "summary_models": UserProfile.SUMMARY_MODEL_CHOICES,
        }
    )


@api_view(["GET"])
def get_session_types(request):
    """Get the available session types with descriptions"""
    session_types = [
        {
            "type": "chat",
            "name": "Chat Mode",
            "symbol": "💬",
            "description": "Standard chat interface for getting help with Arduino programming.",
        },
        {
            "type": "widget",
            "name": "Widget Mode",
            "symbol": "🔧",
            "description": "Focused session for creating a complete project with guidance.",
        },
        {
            "type": "library",
            "name": "Learn a Library Mode",
            "symbol": "📚",
            "description": "Interactive session focused on mastering a specific Arduino library.",
        },
        {
            "type": "topic",
            "name": "Learn a Topic Mode",
            "symbol": "🎓",
            "description": "Educational session to learn about a specific Arduino programming concept.",
        },
    ]

    return Response(session_types)


def index(request):
    return render(request, "chat/index.html")


def logout_view(request):
    logout(request)
    return redirect("login")


def beta_closed(request):
    """View for when beta registration is closed"""
    return render(request, "registration/beta_closed.html")


### API ViewSets ############################################
class SessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and editing sessions.
    """

    serializer_class = SessionSerializer
    permission_classes = [IsAuthenticated]
    queryset = Session.objects.all()

    def get_queryset(self):
        """
        This view should return a list of all sessions
        for the currently authenticated user.
        """
        user = self.request.user
        return Session.objects.filter(user=user).order_by("-updated_at")

    def create(self, request, *args, **kwargs):
        """
        Custom create method to ensure user is set
        """
        # Get the data from the request
        data = request.data.copy()
        # Add the user to the data
        data["user"] = request.user.id

        serializer = self.get_serializer(data=data)
        if serializer.is_valid():
            # Save the serializer with the user
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, *args, **kwargs):
        """
        Custom update method to ensure user remains the same
        """
        instance = self.get_object()
        data = request.data.copy()
        # Make sure user doesn't change
        data["user"] = instance.user.id

        serializer = self.get_serializer(
            instance, data=data, partial=kwargs.get("partial", False)
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ConversationViewSet(viewsets.ModelViewSet):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer


### SEND MESSAGE #######################################
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_message(request):
    """Send a message - requires login and token availability"""
    if request.method == "POST":
        # Check if user has tokens remaining
        profile = request.user.userprofile

        # Reset tokens if needed
        profile.reset_tokens_if_needed()

        # Extract data from request
        content = request.data.get("content")
        session_id = request.data.get("session_id")

        # Validate inputs
        if not content:
            return Response(
                {"error": "Message content is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Get or create session
        if not session_id:
            # Create a default session if none specified
            session = Session.objects.create(
                name="Default Session", user=request.user, session_type="chat"
            )
            session_id = session.id
        else:
            try:
                session = Session.objects.get(id=session_id)
            except Session.DoesNotExist:
                return Response(
                    {"error": "Session not found"}, status=status.HTTP_404_NOT_FOUND
                )

        # Get or create the SINGLE conversation for this session
        conversation, created = Conversation.objects.get_or_create(session=session)

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
        assistant_response, tokens_used = generate_response(
            content, conversation.id, request.user
        )

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
                "session_id": session.id,
                "session_type": session.session_type,
                "user_message": MessageSerializer(user_message).data,
                "assistant_message": MessageSerializer(assistant_message).data,
                "tokens_used": tokens_used,
                "tokens_remaining": profile.tokens_remaining,
            }
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def session_messages(request, session_id):
    """Get all messages for a session's conversation"""
    try:
        session = Session.objects.get(id=session_id)

        # Get the session's conversation (or create it if it doesn't exist)
        conversation, created = Conversation.objects.get_or_create(session=session)

        # Get all messages for this conversation
        messages = Message.objects.filter(conversation=conversation).order_by(
            "timestamp"
        )

        return Response(
            {
                "conversation_id": conversation.id,
                "messages": MessageSerializer(messages, many=True).data,
            }
        )
    except Session.DoesNotExist:
        return Response({"error": "Session not found"}, status=404)


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

    if request.method == "POST":
        # Update user settings
        profile.default_query_model = request.POST.get("default_query_model")
        profile.default_summary_model = request.POST.get("default_summary_model")
        # Add default provider if it's in the form
        if "default_provider" in request.POST:
            profile.default_provider = request.POST.get("default_provider")
        profile.save()

        messages.success(request, "Settings updated successfully!")
        return redirect("user_settings")

    # For GET requests, just display the settings form
    return render(
        request,
        "chat/settings.html",
        {
            "profile": profile,
            "query_models": UserProfile.QUERY_MODEL_CHOICES,
            "summary_models": UserProfile.SUMMARY_MODEL_CHOICES,
            "providers": (
                UserProfile.PROVIDER_CHOICES
                if hasattr(UserProfile, "PROVIDER_CHOICES")
                else []
            ),
        },
    )


# Compilation view
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def compile_arduino_code(request):
    """Compile Arduino code and return the binary file"""
    try:
        # Extract data from request
        code = request.data.get("code")
        board_fqbn = request.data.get("board_fqbn")
        upload_method = request.data.get(
            "upload_method", "download"
        )  # 'download' or 'webserial'

        # Validate inputs
        if not code:
            return Response(
                {"error": "Code is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        if not board_fqbn:
            return Response(
                {"error": "Board FQBN is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Compile the code
        result = ArduinoCliService.compile_sketch(code, board_fqbn)

        # Handle different return types based on upload method
        if upload_method == "webserial":
            # For WebSerial upload, return JSON with binary data
            webserial_data = ArduinoCliService.prepare_for_webserial_upload(
                result["data"], board_fqbn
            )
            return JsonResponse(webserial_data)
        else:
            # For direct download, return the binary file
            response = HttpResponse(
                result["data"], content_type="application/octet-stream"
            )
            response["Content-Disposition"] = (
                f"attachment; filename={result['filename']}"
            )
            response["Content-Length"] = result["size"]
            return response

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Board List View
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_arduino_boards(request):
    """Get list of available Arduino boards"""
    try:
        boards = ArduinoCliService.get_installed_boards()
        return Response(boards)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


## Arduino Create Agent Signature ###################################
@require_POST
@ensure_csrf_cookie
def sign_arduino_command_view(request):
    """
    API endpoint that signs an Arduino command with the private key.

    Expects JSON with a 'commandline' field.
    Returns JSON with a 'signature' field.
    """
    try:
        # Parse the request body
        data = json.loads(request.body)
        commandline = data.get("commandline")

        if not commandline:
            return JsonResponse({"error": "Commandline is required"}, status=400)

        # Sign the commandline
        signature = sign_arduino_command(commandline)

        # Return the signature
        return JsonResponse({"signature": signature})

    except ValueError as e:
        return JsonResponse({"error": str(e)}, status=400)
    except Exception as e:
        return JsonResponse({"error": "Failed to sign command"}, status=500)
