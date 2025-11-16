import os
from typing import List, Optional
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail


SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY")
SENDGRID_FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", os.getenv("SENDGRID_FROM_ADDRESS", "noreply@example.com"))
SENDGRID_FROM_NAME = os.getenv("SENDGRID_FROM_NAME", "IYT Compass")
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")


def send_email(to_emails: List[str], subject: str, html_content: str, text_content: Optional[str] = None) -> bool:
    """
    Send an email via SendGrid. Returns True if accepted (202).
    """
    if not SENDGRID_API_KEY:
        print("[notifications] SendGrid not configured: SENDGRID_API_KEY missing")
        return False
    if not to_emails:
        print("[notifications] No recipients provided")
        return False

    from_email = f"{SENDGRID_FROM_NAME} <{SENDGRID_FROM_EMAIL}>"
    print(f"[notifications] Sending email: subject='{subject}', from='{from_email}', to={to_emails}")
    message = Mail(
        from_email=from_email,
        to_emails=list(set([e for e in to_emails if e])),
        subject=subject,
        html_content=html_content,
    )
    if text_content:
        try:
            # Set plain text content if provided
            message.add_content(text_content, "text/plain")
        except Exception:
            pass

    try:
        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)
        ok = 200 <= int(response.status_code) < 300
        print(f"[notifications] SendGrid response status={response.status_code}")
        return ok
    except Exception as e:
        print("[notifications] SendGrid error:", e)
        return False

def send_sms(to_phone: str, body: str) -> bool:
    """
    Send an SMS via Twilio. Returns True if accepted.
    """
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER):
        print("[notifications] Twilio not configured; skipping SMS")
        return False
    try:
        from twilio.rest import Client  # imported lazily to avoid dependency if unused
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        msg = client.messages.create(
            body=body,
            from_=TWILIO_PHONE_NUMBER,
            to=to_phone
        )
        print(f"[notifications] Twilio SMS sent sid={msg.sid} to={to_phone}")
        return True
    except Exception as e:
        print("[notifications] Twilio SMS error:", e)
        return False


