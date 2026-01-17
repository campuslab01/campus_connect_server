const { Resend } = require('@resend/node');

let resend;
let defaultFrom;

const initializeEmailService = () => {
  if (resend) return;

  const apiKey = process.env.RESEND_API_KEY;
  defaultFrom = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM;

  if (process.env.NODE_ENV !== 'production') {
    console.log('📧 Email Service Configuration (Resend):');
    console.log('   API Key:', apiKey ? '***SET***' : 'NOT SET');
    console.log('   From:', defaultFrom || 'NOT SET');
  }

  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('⚠️ Resend not configured. Email sending will be logged instead of sent.');
    }
    return;
  }

  try {
    resend = new Resend(apiKey);
    if (process.env.NODE_ENV === 'production') {
      console.log('✅ Email Ready.');
    } else {
      console.log('✅ Resend client initialized successfully.');
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('❌ Error initializing Resend client:', error.message);
    }
    resend = null;
  }
};

/**
 * Create email builder with fluent API
 */
class EmailBuilder {
  constructor() {
    this.mailOptions = {};
  }

  from(email) {
    this.mailOptions.from = email;
    return this;
  }

  to(email) {
    this.mailOptions.to = email;
    return this;
  }

  subject(subject) {
    this.mailOptions.subject = subject;
    return this;
  }

  text(text) {
    this.mailOptions.text = text;
    return this;
  }

  html(html) {
    this.mailOptions.html = html;
    return this;
  }

  /**
   * Send the email via Resend
   */
  async send() {
    if (!resend) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('📧 [Email would be sent via Resend]', this.mailOptions);
      }
      return { id: '<test-message-id@resend>', message: 'Queued. Thank you.' };
    }

    if (!this.mailOptions.from) {
      this.mailOptions.from = defaultFrom || 'Campus Connection <noreply@example.com>';
    }

    try {
      if (process.env.NODE_ENV !== 'production') {
        console.log('🚀 Sending email via Resend...');
      }
      const msg = await resend.emails.send({
        from: this.mailOptions.from,
        to: this.mailOptions.to,
        subject: this.mailOptions.subject,
        html: this.mailOptions.html,
        text: this.mailOptions.text
      });
      if (process.env.NODE_ENV !== 'production') {
        console.log('✅ Email sent successfully via Resend');
        console.log('   Message ID:', msg.id || msg.data?.id);
        console.log('   To:', this.mailOptions.to);
        console.log('   Subject:', this.mailOptions.subject);
      }
      return msg;
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('❌ Error sending email via Resend:');
        console.error('   Error message:', error.message);
        if (error.response) {
          console.error('   Error response:', error.response);
        }
        console.error('   To:', this.mailOptions.to);
        console.error('   Subject:', this.mailOptions.subject);
      }
      throw error;
    }
  }
}

/**
 * Fluent email API entry point
 */
const Email = {
  /**
   * Start building a new email
   */
  create() {
    return new EmailBuilder();
  },

  /**
   * Quick send email (chainable)
   */
  from(email) {
    return new EmailBuilder().from(email);
  }
};

/**
 * Email templates
 */
const emailTemplates = {
  /**
   * Email verification template
   */
  verificationEmail(name, verificationLink) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Campus Connection</div>
          </div>
          <h2>Welcome, ${name}! 🎉</h2>
          <p>Thank you for registering with Campus Connection. To complete your registration, please verify your email address.</p>
          <p style="text-align: center;">
            <a href="${verificationLink}" class="button">Verify Email</a>
          </p>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${verificationLink}</p>
          <p><strong>This link will expire in 24 hours.</strong></p>
          <div class="footer">
            <p>If you didn't create this account, please ignore this email.</p>
            <p>&copy; ${new Date().getFullYear()} Campus Connection. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Password reset template
   */
  passwordResetEmail(name, resetLink) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .button {
            display: inline-block;
            padding: 12px 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .warning {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Campus Connection</div>
          </div>
          <h2>Password Reset Request</h2>
          <p>Hi ${name},</p>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <p style="text-align: center;">
            <a href="${resetLink}" class="button">Reset Password</a>
          </p>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #667eea;">${resetLink}</p>
          <div class="warning">
            <p><strong>⚠️ Security Notice:</strong></p>
            <p>This link will expire in 10 minutes for security reasons.</p>
            <p>If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Campus Connection. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  ,
  /**
   * Password reset OTP template
   */
  passwordResetOtpEmail(name, otp, expiresMinutes = 10) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .otp {
            font-size: 28px;
            font-weight: bold;
            letter-spacing: 4px;
            background: #f1f5ff;
            color: #333;
            padding: 12px 20px;
            border-radius: 8px;
            text-align: center;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Campus Connection</div>
          </div>
          <h2>Password Reset Code</h2>
          <p>Hi ${name},</p>
          <p>Use the verification code below to reset your password:</p>
          <div class="otp">${otp}</div>
          <p>This code expires in <strong>${expiresMinutes} minutes</strong>.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Campus Connection. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  ,
  signupOtpEmail(name, otp, expiresMinutes = 10) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          .otp {
            font-size: 28px;
            font-weight: bold;
            letter-spacing: 4px;
            background: #f1f5ff;
            color: #333;
            padding: 12px 20px;
            border-radius: 8px;
            text-align: center;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Campus Connection</div>
          </div>
          <h2>Signup Verification Code</h2>
          <p>Hi ${name},</p>
          <p>Use the verification code below to complete your signup:</p>
          <div class="otp">${otp}</div>
          <p>This code expires in <strong>${expiresMinutes} minutes</strong>.</p>
          <p>If you didn't attempt to sign up, please ignore this email.</p>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Campus Connection. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
};

// Initialize on module load
initializeEmailService();

module.exports = {
  Email,
  emailTemplates,
  initializeEmailService
};

