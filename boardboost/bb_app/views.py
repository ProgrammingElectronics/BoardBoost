from django.shortcuts import redirect, render
from bb_app.models import Message
from openai import OpenAI
from django.conf import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY)


def chat_page(request):

    if request.method == "POST":
        next_user_message = Message.objects.create(text=request.POST["user_input"])
        get_ai_response(next_user_message.text)
        return redirect("/")

    messages = Message.objects.all()

    return render(request, "chat.html", {"messages": messages})


def get_ai_response(data):

    # Get the ID of previous AI message
    previous_message_id = None

    # Select the last AI message
    previous_message = (
        Message.objects.filter(role="assistant")
        .exclude(response_id__isnull=True)
        .order_by("-id")
        .first()
    )

    # If last AI message has id, set it to the previous message id
    if previous_message:
        previous_message_id = previous_message.response_id

    # if Message.objects.count() > 2:
    #     previous_message_ids = Message.objects.all().order_by("-id")
    #     previous_message_id = previous_message_ids[1].response_id

    assistant_message = Message.objects.create(role="assistant")
    context = [{"role": "user", "content": data}]

    response = client.responses.create(
        model="gpt-5",
        input=context,
        previous_response_id=previous_message_id,
        store=True,
    )
    assistant_message.text = response.output_text
    assistant_message.response_id = response.id

    print(assistant_message.text)
    print(assistant_message.response_id)

    assistant_message.save()

    return assistant_message
