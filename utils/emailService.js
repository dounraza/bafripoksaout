const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendResetCode = async (email, code) => {
  await transporter.sendMail({
    from: '"Support Poker" <no-reply@example.com>',
    to: email,
    subject: 'Code de réinitialisation de mot de passe',
    text: `Votre code de réinitialisation est : ${code}`,
    html: `<b>Votre code de réinitialisation est : ${code}</b>`,
  });
};

module.exports = { sendResetCode };
