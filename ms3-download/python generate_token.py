# generate_token.py
from jose import jwt

SECRET = "secret"

payload = {"user": "test"}  # tu peux mettre ce que tu veux

token = jwt.encode(payload, SECRET, algorithm="HS256")
print(token)