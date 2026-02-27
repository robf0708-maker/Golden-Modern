import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.FROM_EMAIL || 'BarberGold <onboarding@resend.dev>';

export async function sendPasswordResetEmail(
  toEmail: string,
  userName: string,
  resetLink: string
): Promise<boolean> {
  if (!resend) {
    console.log('[Email] Resend não configurado. Link de reset:', resetLink);
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject: 'Recuperação de Senha - BarberGold',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; background-color: #0a0a0a; color: #ffffff; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background-color: #1a1a1a; border-radius: 12px; padding: 40px; }
            .logo { text-align: center; margin-bottom: 30px; }
            .logo span { font-size: 28px; font-weight: bold; }
            .logo .gold { color: #d4af37; }
            h1 { color: #d4af37; margin-bottom: 20px; }
            p { line-height: 1.6; color: #cccccc; }
            .button { display: inline-block; background-color: #d4af37; color: #000000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #333; font-size: 12px; color: #888888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">
              <span>BARBER<span class="gold">GOLD</span></span>
            </div>
            <h1>Recuperação de Senha</h1>
            <p>Olá <strong>${userName}</strong>,</p>
            <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:</p>
            <p style="text-align: center;">
              <a href="${resetLink}" class="button">Redefinir Senha</a>
            </p>
            <p>Este link é válido por <strong>1 hora</strong>.</p>
            <p>Se você não solicitou esta redefinição, ignore este e-mail. Sua senha não será alterada.</p>
            <div class="footer">
              <p>Este e-mail foi enviado automaticamente pelo sistema BarberGold.</p>
              <p>Se o botão não funcionar, copie e cole este link no navegador:<br>
              <a href="${resetLink}" style="color: #d4af37;">${resetLink}</a></p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('[Email] Erro ao enviar:', error);
      return false;
    }

    console.log('[Email] E-mail de reset enviado para:', toEmail, 'ID:', data?.id);
    return true;
  } catch (error) {
    console.error('[Email] Erro ao enviar e-mail:', error);
    return false;
  }
}
