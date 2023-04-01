const nodemailer = require('nodemailer');

class EmailSender {
  constructor(config) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: config.password
      }
    });
    this.from = config.from;
  }

  send(to, subject, body) {
    const mailOptions = {
      from: this.from,
      to,
      subject,
      html: body
    };
    return this.transporter.sendMail(mailOptions);
  }
}
