from openai import OpenAI
from django.conf import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY)

def generate_response(context, user_message):
    """
    Generate a response using OpenAI's API.
    
    Args:
        context (str): Project context information
        user_message (str): User's message
        
    Returns:
        str: The generated response
    """
    try:
        system_prompt = """
        You are PEAple, an Arduino coding assistant. Your purpose is to help users with their Arduino projects.
        You provide clear, accurate guidance for Arduino programming, hardware setup, and troubleshooting.
        When responding, focus on Arduino best practices and provide concise, practical code examples when relevant.
        """
        
        # Build the full prompt
        full_prompt = f"{context}\n\nUser Question: {user_message}"
        
        completion = client.chat.completions.create(
            model="gpt-3.5-turbo",  # You can use gpt-4 for better responses if you have access
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": full_prompt}
            ],
            temperature=0.7,
            max_tokens=1000
        )
        
        return completion.choices[0].message.content
    
    except Exception as e:
        # In case of any errors, return a fallback message
        print(f"Error calling OpenAI API: {e}")
        return f"I'm sorry, I encountered an error generating a response. Please try again later."