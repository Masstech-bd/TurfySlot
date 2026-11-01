// Branded HTML email templates (TurfySlot dark-green + lime theme) used for
// account activation and password-reset codes sent via the configured SMTP gateway.

const wrapEmailShell = (title: string, bodyHtml: string): string => `
<div style="background:#07130c;padding:32px 16px;font-family:Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#0A1E14;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
    <tr>
      <td style="padding:24px 28px;background:#0e271a;border-bottom:1px solid rgba(255,255,255,0.08);">
        <table role="presentation" width="100%">
          <tr>
            <td style="vertical-align:middle;">
              <span style="display:inline-block;width:34px;height:34px;border-radius:10px;background:#C8FF5E;color:#0A1E14;font-weight:900;font-size:16px;line-height:34px;text-align:center;">⚽</span>
              <span style="color:#ffffff;font-size:20px;font-weight:800;margin-left:10px;vertical-align:middle;">TurfySlot</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 28px;color:#e5f2e9;">
        <h1 style="margin:0 0 16px;font-size:20px;font-weight:800;color:#ffffff;">${title}</h1>
        ${bodyHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;background:#07130c;border-top:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.45);font-size:11px;">
        Turfyslot Marketplace Engine • This is an automated message, please do not reply.
      </td>
    </tr>
  </table>
</div>`;

const codeBlock = (code: string): string => `
  <div style="margin:20px 0;padding:18px;border-radius:14px;background:rgba(200,255,94,0.08);border:1px dashed rgba(200,255,94,0.4);text-align:center;">
    <span style="font-size:28px;letter-spacing:8px;font-weight:900;color:#C8FF5E;">${code}</span>
  </div>`;

export const buildActivationEmail = (name: string, code: string) => ({
  subject: 'Activate your TurfySlot account',
  html: wrapEmailShell(
    'Confirm your email address',
    `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;">Hi ${name},</p>
     <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">Welcome to TurfySlot! Use the activation code below to verify your email and activate your account.</p>
     ${codeBlock(code)}
     <p style="margin:16px 0 0;font-size:12px;color:rgba(229,242,233,0.6);">This code expires in 30 minutes. If you didn't create this account, you can safely ignore this email.</p>`
  ),
});

export const buildPasswordResetEmail = (name: string, code: string) => ({
  subject: 'Your TurfySlot password reset code',
  html: wrapEmailShell(
    'Reset your password',
    `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;">Hi ${name},</p>
     <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">Use the code below to reset your TurfySlot password.</p>
     ${codeBlock(code)}
     <p style="margin:16px 0 0;font-size:12px;color:rgba(229,242,233,0.6);">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>`
  ),
});
