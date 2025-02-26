from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register("projects", views.ProjectViewSet)
router.register("conversations", views.ConversationViewSet)

urlpatterns = [
    path("", views.index, name="index"),
    path("api/", include(router.urls)),
    path("api/send-message/", views.send_message, name="send_message"),
]
