<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to TechXaro - Employee Portal Sign-In Credentials</title>
</head>
<body style="font-family: Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 20px; color: #333333;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08);">
    
    <!-- HEADER -->
    <div style="background-color: #0082FF; padding: 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">TechXaro Pvt. Ltd.</h1>
      <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">Workforce &amp; Employee Management Portal</p>
    </div>

    <!-- CONTENT -->
    <div style="padding: 30px;">
      <h2 style="color: #0f172a; margin-top: 0;">Welcome Aboard, {{ $name }}! 🎉</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #475569;">
        We are thrilled to welcome you to the TechXaro team! Your official employee account has been created on the TechXaro PMS &amp; HRM Management Portal.
      </p>

      <!-- CREDENTIALS BOX -->
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #0082FF; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <h3 style="margin-top: 0; color: #0082FF; font-size: 15px;">Your Official Sign-In Credentials</h3>
        <p style="margin: 6px 0; font-size: 14px;"><strong>Portal URL:</strong> <a href="{{ config('app.frontend_url', 'http://localhost:5173') }}" style="color: #0082FF;">{{ config('app.frontend_url', 'http://localhost:5173') }}</a></p>
        <p style="margin: 6px 0; font-size: 14px;"><strong>Sign-In Email:</strong> {{ $email }}</p>
        <p style="margin: 6px 0; font-size: 14px;"><strong>Temporary Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #0f172a;">{{ $password }}</code></p>
      </div>

      <p style="font-size: 14px; color: #64748b;">
        Please log into the portal to complete your workforce onboarding profile and upload any required compliance documents (CNIC copy, police clearance certificate, degree).
      </p>

      <div style="text-align: center; margin: 30px 0 10px 0;">
        <a href="{{ config('app.frontend_url', 'http://localhost:5173') }}" style="background-color: #0082FF; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Access Employee Portal</a>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
      <p style="margin: 0;">&copy; {{ date('Y') }} TechXaro Pvt. Ltd. | Lahore, Pakistan | Contact: +923119121134</p>
    </div>
  </div>
</body>
</html>
