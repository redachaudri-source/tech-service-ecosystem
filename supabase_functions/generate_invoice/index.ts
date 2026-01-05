// Supabase Edge Function: generate_invoice
// Imports form mapeados en deno.json
import { serve } from "std/http/server.ts"
import { createClient } from "@supabase/supabase-js"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

// CONFIGURACIÓN:
// Puedes pegar tus claves aquí si no usas 'supabase secrets set'
// PERO es más seguro usar las variables de entorno.
const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'TU_SUPABASE_URL_AQUI';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'TU_SERVICE_ROLE_KEY_AQUI';

serve(async (req: Request) => {
    try {
        const { ticketId } = await req.json()

        // Validar keys
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Faltan las credenciales de Supabase (URL o Service Role Key).')
        }

        const supabase = createClient(supabaseUrl, supabaseKey)

        // 1. Fetch Data
        const { data: ticket, error: tErr } = await supabase
            .from('tickets')
            .select('*, profiles:client_id(*), service_parts(*, inventory(*))')
            .eq('id', ticketId)
            .single()

        if (tErr) throw tErr;

        // 2. Create PDF
        const pdfDoc = await PDFDocument.create()
        const page = pdfDoc.addPage()
        const { width, height } = page.getSize()
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

        let y = height - 50

        // Header
        page.drawText('TECH SERVICE ECOSYSTEM', { x: 50, y, size: 20, font: fontBold })
        y -= 40
        page.drawText(`Factura / Garantía #${ticket.ticket_number}`, { x: 50, y, size: 16, font: fontBold })
        y -= 30
        page.drawText(`Fecha: ${new Date().toLocaleDateString()}`, { x: 50, y, size: 12, font })
        y -= 20
        page.drawText(`Cliente: ${ticket.profiles.full_name}`, { x: 50, y, size: 12, font })
        y -= 20
        page.drawText(`Equipo: ${ticket.appliance_info?.type} (${ticket.appliance_info?.brand})`, { x: 50, y, size: 12, font })

        y -= 40
        page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 1 })
        y -= 20

        // Body
        page.drawText('Concepto', { x: 50, y, size: 12, font: fontBold })
        page.drawText('Monto', { x: 400, y, size: 12, font: fontBold })
        y -= 20

        // Labor
        page.drawText('Mano de Obra', { x: 50, y, size: 12, font })
        page.drawText(`$${ticket.labor_cost}`, { x: 400, y, size: 12, font })
        y -= 20

        // Parts
        let maxWarranty = 0;

        ticket.service_parts.forEach((sp: any) => {
            const item = sp.inventory;
            const total = sp.unit_price_at_time * sp.quantity;

            page.drawText(`${item.name} (x${sp.quantity})`, { x: 50, y, size: 12, font })
            page.drawText(`$${total}`, { x: 400, y, size: 12, font })

            if (item.warranty_months > maxWarranty) maxWarranty = item.warranty_months;
            y -= 20
        })

        y -= 20
        page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 1 })
        y -= 30
        page.drawText(`TOTAL PAGADO: $${ticket.total_price}`, { x: 300, y, size: 16, font: fontBold })

        // Warranty Certificate
        y -= 80
        page.drawText('CERTIFICADO DE GARANTÍA', { x: 50, y, size: 16, font: fontBold, color: rgb(0, 0.5, 0) })
        y -= 30

        // Warranty Logic
        const startDate = new Date();
        const endDate = new Date();
        // Use max warranty of parts, or default 3 months for labor
        const months = maxWarranty > 0 ? maxWarranty : 3;
        endDate.setMonth(endDate.getMonth() + months);

        page.drawText(`Este servicio cuenta con ${months} meses de garantía.`, { x: 50, y, size: 12, font })
        y -= 20
        page.drawText(`Fecha Vencimiento: ${endDate.toLocaleDateString()}`, { x: 50, y, size: 12, font: fontBold })

        // Save
        const pdfBytes = await pdfDoc.save()

        // 3. Upload to Storage
        const fileName = `${ticketId}.pdf`
        const { error: uploadErr } = await supabase
            .storage
            .from('invoices')
            .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true })

        if (uploadErr) throw uploadErr

        // 4. Update Ticket with Warranty Dates
        await supabase.from('warranties').insert({
            ticket_id: ticketId,
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
            pdf_url: fileName // or public url
        })

        return new Response(
            JSON.stringify({ success: true, file: fileName }),
            { headers: { "Content-Type": "application/json" } },
        )
    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { "Content-Type": "application/json" } },
        )
    }
})
