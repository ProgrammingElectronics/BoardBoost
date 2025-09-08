from django.shortcuts import redirect, render
from bb_app.models import Message


def chat_page(request):

    if request.method == "POST":
        Message.objects.create(text=request.POST["user_input"])
        return redirect("/")

    messages = Message.objects.all()

    return render(request, "chat.html", {"messages": messages})
