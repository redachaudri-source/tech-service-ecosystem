import jsPDF from 'jspdf';

/**
 * Generates User-Requested 'Recibo de Entrega a Cuenta' Format - 1:1 CLONE
 * MATCHES EXACT REFERENCE IMAGE LAYOUT & TYPOGRAPHY
 */
export const generateMaterialDepositPDF = (ticket, logoImg = null, signatureImg = null, companySealImg = null) => {
    // Landscape A5: 210mm x 148mm
    const doc = new jsPDF({
        format: 'a5',
        orientation: 'landscape'
    });

    const width = doc.internal.pageSize.width; // 210
    const height = doc.internal.pageSize.height; // 148
    const margin = 15;

    // --- COLORS ---
    const colorGrayText = [80, 80, 80];
    const colorBorder = [229, 231, 235]; // #e5e7eb
    const colorGreen = [22, 163, 74];   // #16a34a
    const colorRed = [220, 38, 38];     // #dc2626
    const colorBlack = [0, 0, 0];

    // --- HEADER ---
    let yPos = 20;

    // 1. Logo (Top Left)
    if (logoImg) {
        try {
            const format = logoImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(logoImg, format, margin, 12, 50, 18); // Keep this size
        } catch (e) { }
    }

    // 2. Title & Meta (Top Right)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(18); // Large Title
    doc.setTextColor(...colorBlack);
    doc.text('RECIBO DE ENTREGA A CUENTA', width - margin, 20, { align: 'right' });

    doc.setFontSize(10);
    doc.setTextColor(...colorBlack);
    const receiptNo = `R-${ticket.ticket_number}-${new Date().getFullYear()}`;
    // Right aligned
    doc.text(`Nº Recibo: ${receiptNo}`, width - margin, 28, { align: 'right' });
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, width - margin, 33, { align: 'right' });

    // --- BODY LAYOUT ---
    yPos = 55;

    // Column Widths
    // Left Content: Margin -> 120 (approx 60% of space)
    // Right Box: 125 -> Width-Margin (approx 40%)
    const rightColStart = 125;

    // --- LEFT COLUMN ---
    doc.setTextColor(...colorBlack);

    // "Hemos recibido de..."
    doc.setFontSize(11); // Standard reading size
    doc.setFont('helvetica', 'normal');
    const clientName = ticket.client?.full_name || '____________________';
    doc.text(`Hemos recibido de D./Dña: ${clientName}`, margin, yPos);

    yPos += 15;

    // "La cantidad de:" (HUGE & BOLD)
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    const deposit = Number(ticket.deposit_amount || 0);
    doc.text(`La cantidad de: ${deposit.toFixed(2)}€`, margin, yPos);

    yPos += 15;

    // Details Block
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    // Line spacing ~5-6mm

    doc.text('En concepto de señal / pago a cuenta para la reparación del aparato:', margin, yPos);
    yPos += 6;

    const appInfo = `${ticket.appliance_info?.type || 'Aparato'} - ${ticket.appliance_info?.brand || ''} (${ticket.appliance_info?.model || 'Modelo no especificado'})`;
    doc.text(appInfo, margin, yPos);
    yPos += 6;

    doc.text(`Nº Servicio Referencia: ${ticket.ticket_number}`, margin, yPos);
    yPos += 6;

    const partsText = (ticket.required_parts_description || ticket.description_failure || '').substring(0, 55);
    doc.text(`Repuestos solicitados: ${partsText}`, margin, yPos);


    // --- RIGHT COLUMN (ECONOMIC BOX) ---
    // Box Geometry
    const boxY = 45; // Start aligned with "Hemos recibido..." approximately
    const boxWidth = width - rightColStart - margin;
    const boxHeight = 65;

    // Draw Box Border
    doc.setDrawColor(...colorBorder);
    doc.setLineWidth(0.3);
    doc.setFillColor(255, 255, 255); // White bg
    doc.rect(rightColStart, boxY, boxWidth, boxHeight, 'FD');

    // Box Content
    let innerY = boxY + 10;
    const innerLeft = rightColStart + 5;
    const innerRight = rightColStart + boxWidth - 5;

    // Title
    doc.setFontSize(9);
    doc.setTextColor(...colorGrayText);
    doc.setFont('helvetica', 'normal'); // Uppercase small
    doc.text('RESUMEN ECONÓMICO', innerLeft, innerY);

    innerY += 8;

    // Calculations
    const labor = Array.isArray(ticket.labor_list) ? ticket.labor_list : JSON.parse(ticket.labor_list || '[]');
    const parts = Array.isArray(ticket.parts_list) ? ticket.parts_list : JSON.parse(ticket.parts_list || '[]');
    const partsTotal = parts.reduce((sum, p) => sum + (Number(p.price) * (Number(p.qty) || 1)), 0);
    const laborTotal = labor.reduce((sum, l) => sum + (Number(l.price) * (Number(l.qty) || 1)), 0);
    const subtotalCalc = partsTotal + laborTotal;
    const vatCalc = subtotalCalc * 0.21;
    const totalCalc = subtotalCalc + vatCalc;
    const remaining = totalCalc - deposit;

    // Helper for rows
    const drawRow = (label, amount, color = colorBlack, isBold = false) => {
        doc.setTextColor(...color);
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.setFontSize(9);
        doc.text(label, innerLeft, innerY);
        doc.text(amount, innerRight, innerY, { align: 'right' });
        innerY += 7; // Row spacing
    };

    drawRow('Subtotal:', `${subtotalCalc.toFixed(2)}€`);
    drawRow('IVA (21%):', `${vatCalc.toFixed(2)}€`);

    innerY += 2; // Extra gap
    drawRow('TOTAL PRESUPUESTO:', `${totalCalc.toFixed(2)}€`, colorBlack, true);

    innerY += 2; // Extra gap
    drawRow('PAGADO A CUENTA:', `-${deposit.toFixed(2)}€`, colorGreen, true);
    drawRow('PENDIENTE DE PAGO:', `${remaining.toFixed(2)}€`, colorRed, true);


    // --- FOOTER SIGNATURES ---
    // Lowered as requested previously
    const sigLineY = height - 20;
    const sigLineWidth = 60;

    doc.setDrawColor(0); // Black line
    doc.setLineWidth(0.2);

    // Left Line (Empresa)
    const leftLineStart = margin + 10;
    doc.line(leftLineStart, sigLineY, leftLineStart + sigLineWidth, sigLineY);

    // Right Line (Cliente)
    const rightLineStart = width - margin - sigLineWidth - 10;
    doc.line(rightLineStart, sigLineY, rightLineStart + sigLineWidth, sigLineY);

    // Text under lines
    doc.setTextColor(...colorGrayText);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    const leftCenter = leftLineStart + (sigLineWidth / 2);
    const rightCenter = rightLineStart + (sigLineWidth / 2);

    doc.text('Firma y Sello Empresa', leftCenter, sigLineY + 5, { align: 'center' });
    doc.text('Firma Cliente', rightCenter, sigLineY + 5, { align: 'center' });

    // SEAL (Above Left Line)
    if (companySealImg) {
        try {
            const format = companySealImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            // Centered on left line, sitting on top
            // Box is approx 30x20
            doc.addImage(companySealImg, format, leftCenter - 15, sigLineY - 22, 30, 20);
        } catch (e) { }
    }

    // CLIENT SIG (Above Right Line)
    if (signatureImg) {
        try {
            const format = signatureImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(signatureImg, format, rightCenter - 25, sigLineY - 12, 50, 10);
        } catch (e) { }
    }

    return doc;
};
