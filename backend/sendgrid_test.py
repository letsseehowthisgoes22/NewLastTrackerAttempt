import os
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from urllib.error import HTTPError

message = Mail(
    from_email='bobby@interactiveyouthtransport.com',  # verified sender
    to_emails='rwtredin@gmail.com',
    subject='IYT Compass – SendGrid test email',
    html_content='<strong>If you see this, SendGrid is working.</strong>',
)

try:
    sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
    response = sg.send(message)
    print("Status code:", response.status_code)
    print("Body:", response.body)
    print("Headers:", response.headers)
except HTTPError as e:
    print("HTTPError status:", e.code)
    print("HTTPError body:", e.read().decode("utf-8", errors="ignore"))
except Exception as e:
    print("Error:", repr(e))
