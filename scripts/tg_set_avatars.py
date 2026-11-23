"""Ставит аватарки: канал (setChatPhoto) и бот (setMyProfilePhoto, если метод есть в Bot API).
Запуск — workflow «Telegram — аватарки» (секреты PLAYER_BOT_TOKEN, CHANNEL_CHAT_ID)."""
import json, os, uuid, urllib.request, urllib.error

TOKEN = os.environ["PLAYER_BOT_TOKEN"].strip()
CHAT = os.environ.get("CHANNEL_CHAT_ID", "@dvorami_quest").strip() or "@dvorami_quest"

def call(method, fields, file_field, path):
    b = uuid.uuid4().hex
    body = b""
    for k, v in fields.items():
        body += f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    body += (f'--{b}\r\nContent-Disposition: form-data; name="{file_field}"; filename="a.png"\r\n'
             f'Content-Type: image/png\r\n\r\n').encode() + open(path, "rb").read() + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(f"https://api.telegram.org/bot{TOKEN}/{method}", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={b}"})
    try:
        r = json.load(urllib.request.urlopen(req, timeout=60))
    except urllib.error.HTTPError as e:
        r = json.load(e)
    print(method, "→", r.get("ok"), r.get("description", ""))
    return r.get("ok")

ok1 = call("setChatPhoto", {"chat_id": CHAT}, "photo", "docs/marketing/channel/avatar-channel.png")
ok2 = call("setMyProfilePhoto", {"photo": json.dumps({"type": "static", "photo": "attach://p"})}, "p",
           "docs/marketing/channel/avatar-bot.png")
print("channel:", ok1, "bot:", ok2)
