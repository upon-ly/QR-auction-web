import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

// Create reusable transporter object using SMTP transport
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER, // Your Gmail address
    pass: process.env.GMAIL_APP_PASSWORD, // Your Gmail app password
  },
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, message } = body;

    // Validate required fields
    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create email content
    const emailContent = `
New contact form submission from qrcoin.fun:

Name: ${name}
Email: ${email}
Phone: ${phone || "Not provided"}

Message:
${message}
    `.trim();

    // Send email
    try {
      await transporter.sendMail({
        from: `"QRCoin Contact Form" <${process.env.GMAIL_USER}>`,
        to: "jake@qrcoin.fun",
        subject: `Contact Form Submission from ${name}`,
        text: emailContent,
        replyTo: email,
      });

      console.log("[Contact Form] Email sent successfully to jake@qrcoin.fun");
      return NextResponse.json({ success: true });
    } catch (emailError) {
      console.error("[Contact Form] Email sending failed:", emailError);
      return NextResponse.json(
        { error: "Failed to send email. Please try again later." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Contact Form] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 