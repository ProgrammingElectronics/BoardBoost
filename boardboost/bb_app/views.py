from django.shortcuts import render
from django.http import HttpResponse

def chat_page(request):
  return render(request, 'chat.html')
