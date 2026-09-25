/**
 * WhatsApp Business (Meta Cloud API) channel configuration.
 *
 * Until the real Cloud API credentials are set at deploy time, the channel runs
 * SIMULATED: every outbound message is written to whatsapp_log with status
 * 'simulated' instead of being sent, and the webhook still works for signed
 * test payloads. A key that is missing or starts with "dummy" counts as not set.
 *
 *   WHATSAPP_ACCESS_TOKEN      system-user token for the Cloud API
 *   WHATSAPP_PHONE_NUMBER_ID   the sending number's id in Meta Business
 *   WHATSAPP_APP_SECRET        signs webhook deliveries (X-Hub-Signature-256)
 *   WHATSAPP_VERIFY_TOKEN      echoed back when Meta verifies the webhook URL
 *   WHATSAPP_BUSINESS_NUMBER   the school-facing number, shown to parents (e.g. +919800000000)
 *   WHATSAPP_TEMPLATE_ALERT    approved utility template with one body parameter, for
 *                              messages outside the 24-hour window (default sthara_alert)
 *   WHATSAPP_TEMPLATE_OTP      approved authentication template for link codes (default sthara_otp)
 */
const real = (v: string | undefined) => {
  const x = v?.trim();
  return x && !/^dummy/i.test(x) ? x : null;
};

export const GRAPH_VERSION = 'v21.0';

export function whatsappConfig() {
  const token = real(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId = real(process.env.WHATSAPP_PHONE_NUMBER_ID);
  return {
    mode: (token && phoneNumberId ? 'live' : 'simulated') as 'live' | 'simulated',
    token,
    phoneNumberId,
    // The webhook secrets may be dummy values locally: signed test payloads still verify.
    appSecret: process.env.WHATSAPP_APP_SECRET?.trim() || null,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() || null,
    businessNumber: process.env.WHATSAPP_BUSINESS_NUMBER?.trim() || null,
    templateAlert: process.env.WHATSAPP_TEMPLATE_ALERT?.trim() || 'sthara_alert',
    templateOtp: process.env.WHATSAPP_TEMPLATE_OTP?.trim() || 'sthara_otp',
  };
}

/** Indian numbers without a country code get +91; anything else must be written in full. */
export function toE164(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let d = raw.replace(/[^\d+]/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = `+${d.slice(2)}`;
  if (!d.startsWith('+')) {
    const digits = d.replace(/^0+/, '');
    d = digits.length === 10 ? `+91${digits}` : `+${digits}`;
  }
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}

/** +91 98xxx xx123 for display. */
export const maskPhone = (e164: string) => `${e164.slice(0, 3)} ${e164.slice(3, 5)}${'x'.repeat(Math.max(0, e164.length - 8))}${e164.slice(-3)}`;

/**
 * A link can carry messages when it is verified, and, once the channel is live,
 * was verified by a code that was actually delivered (not a simulated one).
 */
export const linkUsable = (l: { verified_at?: string | null; verified_mode?: string | null } | null | undefined) =>
  !!l?.verified_at && (whatsappConfig().mode === 'simulated' || l.verified_mode === 'live');
