const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Sends a stylish HTML email.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} title - The main heading inside the email body
 * @param {string} intro - The introductory text
 * @param {string} contentHtml - Optional HTML content (e.g., custom colored box for OTP or credentials)
 * @param {string} outro - Optional closing text or call to action
 */
const sendStylishEmail = async (to, subject, title, intro, contentHtml = '', outro = '') => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; padding: 40px 20px;">
        <div style="margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); max-width: 600px;">
          <div style="background-color: #ffffff; padding: 25px; text-align: center; border-bottom: 1px solid #f3f4f6;">
            <img src="cid:logo" alt="TN HRMS Logo" style="max-height: 60px;">
          </div>
          <div style="padding: 40px 30px;">
            <h2 style="color: #111827; margin-top: 0; font-size: 24px; text-align: center;">${title}</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; text-align: center;">${intro}</p>
            
            ${contentHtml ? `<div style="margin: 30px 0; text-align: center;">${contentHtml}</div>` : ''}
            
            ${outro ? `<p style="color: #64748b; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 30px;">${outro}</p>` : ''}
            
            <div style="text-align: center; margin-top: 40px; margin-bottom: 20px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" style="background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block; transition: background-color 0.2s;">Open App Dashboard</a>
            </div>
          </div>
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <img src="cid:favicon" alt="Favicon" style="max-height: 24px; vertical-align: middle; margin-right: 10px; border-radius: 4px;">
            <span style="color: #94a3b8; font-size: 14px; vertical-align: middle; font-weight: 500;">Techie Nutpam - HR Management System</span>
          </div>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'logo.png',
        path: path.join(__dirname, '../public/images/logo.png'),
        cid: 'logo'
      },
      {
        filename: 'favicon.jpg',
        path: path.join(__dirname, '../public/images/favicon.jpg'),
        cid: 'favicon'
      }
    ]
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${to}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

module.exports = {
  sendStylishEmail,
};
