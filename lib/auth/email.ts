/**
 * Email utilities for sending OTP codes
 * Uses nodemailer with Gmail SMTP
 */

import nodemailer from "nodemailer";

/**
 * Create nodemailer transporter
 */
function createTransporter() {
  const config = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };

  if (!config.auth.user || !config.auth.pass) {
    throw new Error("SMTP credentials not configured in environment variables");
  }

  return nodemailer.createTransport(config);
}

/**
 * Generate styled HTML email template for OTP
 */
function getOTPEmailTemplate(code: string, firstName?: string): string {
  const greeting = firstName ? `Hi ${firstName}` : "Hi there";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Login Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #1a1a1a;">
                Your Login Code
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 24px; color: #4a4a4a;">
                ${greeting},
              </p>
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 24px; color: #4a4a4a;">
                Use the following code to complete your login:
              </p>
              
              <!-- OTP Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px; background-color: #f8f9fa; border-radius: 8px; border: 2px dashed #e0e0e0;">
                    <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1a1a1a;">
                      ${code}
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; font-size: 14px; line-height: 20px; color: #6b7280;">
                This code will expire in <strong>10 minutes</strong>. If you didn't request this code, please ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px 40px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 14px; line-height: 20px; color: #9ca3af; text-align: center;">
                This is an automated message, please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Send OTP email to a user
 */
export async function sendOTPEmail(
  email: string,
  code: string,
  firstName?: string
): Promise<void> {
  try {
    const transporter = createTransporter();
    const htmlContent = getOTPEmailTemplate(code, firstName);

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: `Your login code: ${code}`,
      html: htmlContent,
      text: `Your login code is: ${code}. This code will expire in 10 minutes.`,
    });

    console.log(`OTP email sent to ${email}`);
  } catch (error) {
    console.error("Error sending OTP email:", error);
    throw new Error("Failed to send OTP email");
  }
}
