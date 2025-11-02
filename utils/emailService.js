const nodemailer = require('nodemailer');

/**
 * Email Service using Nodemailer
 * Provides a fluent-like API for sending emails
 */

let transporter = null;

/**
 * Initialize email transporter
 */
const initializeEmailService = () => {
  if (transporter) return transporter;

  // Get email configuration from environment variables
  const emailConfig = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };

  // If credentials are not provided, create a test account (development only)
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️ SMTP credentials not configured - emails will not be sent');
      return null;
    }
    // For development, use ethereal.email test account
    console.warn('⚠️ Using test email service (ethereal.email) - emails won\'t actually be sent');
    return null; // Will be created on-demand for development
  }

  try {
    transporter = nodemailer.createTransport(emailConfig);
    console.log('✅ Email service initialized');
    return transporter;
  } catch (error) {
    console.error('❌ Error initializing email service:', error);
    return null;
  }
};

/**
 * Create email builder with fluent API
 */
class EmailBuilder {
  constructor() {
    this.mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@campusconnection.com',
    };
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
   * Send the email
   */
  async send() {
    if (!transporter) {
      transporter = initializeEmailService();
    }

    if (!transporter) {
      // In development/test mode, log the email instead of sending
      if (process.env.NODE_ENV !== 'production') {
        console.log('📧 [Email would be sent]', this.mailOptions);
        return { accepted: [this.mailOptions.to], messageId: 'test-message-id' };
      }
      throw new Error('Email service not initialized');
    }

    try {
      const info = await transporter.sendMail(this.mailOptions);
      console.log('✅ Email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('❌ Error sending email:', error);
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
};

// Initialize on module load
initializeEmailService();

module.exports = {
  Email,
  emailTemplates,
  initializeEmailService
};

