// Supabase Edge Function: send-email
// Uses Resend API to send emails with optional PDF attachment

import { serve } from "std/http/server.ts"

// Environment variables (set with `supabase secrets set`)
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@fixarr.es';
const COMPANY_NAME = Deno.env.get('COMPANY_NAME') || 'Fixarr Servicio Técnico';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
    to: string;              // Email address
    subject: string;         // Email subject
    html?: string;           // HTML body content
    text?: string;           // Plain text fallback
    attachmentUrl?: string;  // Optional: URL of PDF to attach
    attachmentName?: string; // Optional: Filename for attachment
}

interface EmailResponse {
    success: boolean;
    messageId?: string;
    error?: string;
}

/**
 * Fetch PDF from URL and convert to base64 for attachment
 */
async function fetchPdfAsBase64(url: string): Promise<{ content: string; filename: string }> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Convert to base64
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);

    // Extract filename from URL or use default
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1] || 'documento.pdf';

    return { content: base64, filename };
}

/**
 * Send email via Resend API
 */
async function sendViaResend(
    to: string,
    subject: string,
    html: string,
    text?: string,
    attachmentUrl?: string,
    attachmentName?: string
): Promise<EmailResponse> {

    if (!RESEND_API_KEY) {
        throw new Error('Missing RESEND_API_KEY. Set it with supabase secrets set.');
    }

    // Build email payload
    const emailPayload: any = {
        from: `${COMPANY_NAME} <${RESEND_FROM_EMAIL}>`,
        to: [to],
        subject: subject,
        html: html,
    };

    if (text) {
        emailPayload.text = text;
    }

    // Attach PDF if provided
    if (attachmentUrl) {
        try {
            const { content, filename } = await fetchPdfAsBase64(attachmentUrl);
            emailPayload.attachments = [{
                filename: attachmentName || filename,
                content: content,
                type: 'application/pdf',
            }];
        } catch (err) {
            console.warn('[send-email] Failed to attach PDF, sending without attachment:', err);
            // Continue without attachment rather than failing completely
        }
    }

    // Call Resend API
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailPayload),
    });

    const result = await response.json();

    if (!response.ok) {
        console.error('Resend Error:', result);
        throw new Error(result.message || `Resend API error: ${response.status}`);
    }

    return {
        success: true,
        messageId: result.id,
    };
}

/**
 * Generate default HTML template for PDF delivery
 */
function generateEmailHtml(customMessage?: string, pdfName?: string): string {
    const message = customMessage || 'Adjunto encontrarás el documento solicitado de tu servicio técnico.';
    const docName = pdfName || 'documento';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${COMPANY_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <tr>
            <td>
                <!-- Header -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border-radius: 16px 16px 0 0; padding: 32px;">
                    <tr>
                        <td style="text-align: center;">
                            <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 700;">${COMPANY_NAME}</h1>
                        </td>
                    </tr>
                </table>
                
                <!-- Content -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background: white; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <tr>
                        <td>
                            <p style="margin: 0 0 16px 0; color: #1e293b; font-size: 16px; line-height: 1.6;">
                                Estimado/a cliente,
                            </p>
                            <p style="margin: 0 0 24px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                                ${message}
                            </p>
                            
                            <!-- Document Info -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                                <tr>
                                    <td>
                                        <p style="margin: 0 0 8px 0; color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                                            Documento adjunto
                                        </p>
                                        <p style="margin: 0; color: #1e293b; font-size: 16px; font-weight: 600;">
                                            📄 ${docName}
                                        </p>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.5;">
                                Si tienes alguna pregunta, no dudes en contactarnos.
                            </p>
                        </td>
                    </tr>
                </table>
                
                <!-- Footer -->
                <table width="100%" cellpadding="0" cellspacing="0" style="padding: 24px; text-align: center;">
                    <tr>
                        <td>
                            <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                                © ${new Date().getFullYear()} ${COMPANY_NAME}. Todos los derechos reservados.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Parse request body
        const { to, subject, html, text, attachmentUrl, attachmentName }: EmailRequest = await req.json();

        // Validate required fields
        if (!to) {
            throw new Error('Missing required field: to (email address)');
        }
        if (!subject) {
            throw new Error('Missing required field: subject');
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            throw new Error(`Invalid email format: ${to}`);
        }

        // Use provided HTML or generate default
        const emailHtml = html || generateEmailHtml(text, attachmentName);

        console.log(`[send-email] Sending to ${to} | Subject: ${subject}`);

        const result = await sendViaResend(to, subject, emailHtml, text, attachmentUrl, attachmentName);

        console.log(`[send-email] Success: ${result.messageId}`);

        return new Response(
            JSON.stringify(result),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );

    } catch (error: any) {
        console.error('[send-email] Error:', error.message);

        return new Response(
            JSON.stringify({
                success: false,
                error: error.message,
            }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
