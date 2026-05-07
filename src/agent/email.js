import nodemailer from 'nodemailer';
import { marked } from 'marked';
import { config } from 'dotenv';

config();

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

export async function sendBriefingEmail(date, briefingText) {
  const subject = `Fane Morning Briefing — ${date}`;
  const briefingHtml = marked(briefingText);
  const webUrl = `http://62.238.13.86:3000/briefing/${date}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 680px; margin: 0 auto;">
      <h2 style="color: #333;">Fane Market Briefing</h2>
      <p style="color: #666;">Date: ${date}</p>
      <hr/>
      <div style="line-height: 1.7;">
        ${briefingHtml}
      </div>
      <hr/>
      <p>
        <a href="${webUrl}" style="color: #555;">View full briefing online →</a>
      </p>
      <p style="color: #999; font-size: 12px;">
        Default recommendation is no action. Action requires documented justification. — Fane
      </p>
    </div>
  `;

  const result = await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_TO,
    subject,
    html
  });

  return result;
}