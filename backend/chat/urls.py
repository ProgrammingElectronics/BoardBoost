from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# from chat.forms import CustomAuthenticationForm
from django.contrib.auth import views as auth_views

router = DefaultRouter()
router.register("projects", views.ProjectViewSet)
router.register("conversations", views.ConversationViewSet)

urlpatterns = [
    path("", views.index, name="index"),
    path("api/", include(router.urls)),
    path("api/send-message/", views.send_message, name="send_message"),
    path("api/model-choices/", views.get_model_choices, name="model-choices"),
    path(
        "api/projects/<int:project_id>/messages/",
        views.project_messages,
        name="project_messages",
    ),
    path("beta-closed/", views.beta_closed, name="beta_closed"),
    path("api/compile-arduino/", views.compile_arduino_code, name="compile_arduino"),
    path("api/arduino-boards/", views.get_arduino_boards, name="arduino_boards"),
    path(
        "api/sign-arduino-command/",
        views.sign_arduino_command_view,
        name="sign_arduino_command",
    ),
]
