from django.shortcuts import redirect, render
from bb_app.models import Message
from openai import OpenAI
from django.conf import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY)


def chat_page(request):

    if request.method == "POST":
        Message.objects.create(text=request.POST["user_input"])
        return redirect("/")

    messages = Message.objects.all()

    return render(request, "chat.html", {"messages": messages})


def get_ai_response(data):
    assistant_message = Message.objects.create(role="assistant")

    assistant_message.text = client.responses.create(
        model="gpt-5", input=data
    ).output_text

    return assistant_message
