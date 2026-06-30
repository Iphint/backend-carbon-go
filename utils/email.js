import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

export async function sendPasswordResetEmail(email, username, code) {
  const subject = "Kode Reset Password - Carbon-Go";
  const text = `Halo ${username},

Kamu menerima email ini karena ada permintaan reset password untuk akun Carbon-Go milikmu.

Kode verifikasi kamu adalah: ${code}

Masukkan kode di atas di halaman reset password untuk melanjutkan.

Kode ini berlaku selama 15 menit.

Jika kamu tidak meminta reset password, abaikan email ini.

Terima kasih,
Tim Carbon-Go`;

  const transporter = getTransporter();

  if (!transporter) {
    console.error(`[Password Reset] SMTP not configured! Cannot send email to ${email}. Code: ${code}`);
    throw new Error("Email service not configured. Please contact support.");
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@carbongo.site",
      to: email,
      subject,
      text,
    });

    console.log(`[Password Reset] Email sent to ${email}`);
    console.log(info);
  } catch (err) {
    console.error(`[Password Reset] Failed to send email to ${email}:`);
    console.error(err);
    throw new Error("Failed to send reset code email. Please try again later.");
  }
}
