<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class EmailVerificationMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public string $verificationUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Verify Your Email Address - ' . config('app.name', 'PMS'),
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: $this->buildHtml(),
        );
    }

    private function buildHtml(): string
    {
        $appName = config('app.name', 'PMS');
        $userName = htmlspecialchars($this->user->name);
        $verifyUrl = htmlspecialchars($this->verificationUrl);

        return "
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
</head>
<body style='margin:0;padding:0;background-color:#f4f7fa;font-family:Arial,Helvetica,sans-serif;'>
    <div style='max-width:600px;margin:30px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);'>
        <div style='background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;'>
            <h1 style='color:#ffffff;margin:0;font-size:24px;'>{$appName}</h1>
        </div>
        <div style='padding:30px;'>
            <h2 style='color:#333;margin:0 0 15px;font-size:20px;'>Verify Your Email Address</h2>
            <p style='color:#555;line-height:1.6;margin:0 0 20px;'>Hello {$userName},</p>
            <p style='color:#555;line-height:1.6;margin:0 0 20px;'>Thank you for registering. Please verify your email address by clicking the button below:</p>
            <div style='text-align:center;margin:30px 0;'>
                <a href='{$verifyUrl}' style='display:inline-block;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#ffffff;text-decoration:none;padding:14px 40px;border-radius:8px;font-size:16px;font-weight:bold;'>Verify Email Address</a>
            </div>
            <p style='color:#888;line-height:1.6;margin:0 0 10px;font-size:13px;'>If you did not create an account, no further action is required.</p>
            <p style='color:#888;line-height:1.6;margin:0;font-size:13px;'>This verification link will expire in 24 hours.</p>
        </div>
        <div style='background:#f8f9fa;padding:20px;text-align:center;border-top:1px solid #eee;'>
            <p style='color:#999;margin:0;font-size:12px;'>&copy; " . date('Y') . " {$appName}. All rights reserved.</p>
        </div>
    </div>
</body>
</html>";
    }
}
