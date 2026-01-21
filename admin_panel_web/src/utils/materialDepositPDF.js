import jsPDF from 'jspdf';

/**
 * Generates User-Requested 'Recibo de Entrega a Cuenta' Format
 * TWEAKED: Better alignments, Bigger Logo, Professional spacing
 */
export const generateMaterialDepositPDF = (ticket, logoImg = null, signatureImg = null) => {
    // Landscape A5: 210mm x 148mm
    const doc = new jsPDF({
        format: 'a5',
        orientation: 'landscape'
    });

    const width = doc.internal.pageSize.width; // 210
    const height = doc.internal.pageSize.height; // 148
    const margin = 15; // Increased margin for "air"

    // --- WATERMARK (Subtle) ---
    /* Removed or made extremely subtle to maintain "Clean Corporate" look if user didn't ask for it explicitly in this iteration, 
       but kept very faint just in case. */
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.05 }));
    doc.setTextColor(200);
    doc.setFontSize(40);
    // doc.text('BORRADOR', width/2, height/2, { align: 'center', angle: 45 }); // Optional
    doc.restoreGraphicsState();

    // --- HEADER ---
    let yPos = 20;

    // 1. Logo (Top Left) - BIGGER & ALIGNED
    if (logoImg) {
        try {
            const format = logoImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            // Aspect ratio preservation could be good, but fixed box is safer for layout
            doc.addImage(logoImg, format, margin, 12, 50, 18); // W:50, H:18
        } catch (e) { }
    }

    // 2. Title & Meta (Top Right)
    // Align text baseline better
    doc.setFont('helvetica', 'normal'); // Clean, not bold? Or bold? Target looks Normal/Light
    doc.setFontSize(14);
    doc.setTextColor(20); // Almost black
    doc.text('RECIBO DE ENTREGA A CUENTA', width - margin, 20, { align: 'right' });

    doc.setFontSize(9);
    doc.setTextColor(60); // Dark Gray
    const receiptNo = `R-${ticket.ticket_number}-${new Date().getFullYear()}`;
    doc.text(`Nº Recibo: ${receiptNo}`, width - margin, 26, { align: 'right' });
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, width - margin, 31, { align: 'right' });

    // --- SEPARATOR LINE (Subtle) ---
    // doc.setDrawColor(240);
    // doc.line(margin, 38, width - margin, 38);

    // --- BODY ---
    yPos = 55;
    const rightColStart = 125; // X position for the box

    // LEFT COLUMN (Info)
    doc.setTextColor(0);

    // "Hemos recibido de..."
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Hemos recibido de D./Dña:', margin, yPos);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(ticket.client?.full_name || '', margin + 50, yPos);

    yPos += 14;

    // "La cantidad de..."
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('La cantidad de:', margin, yPos);

    // Amount
    const deposit = Number(ticket.deposit_amount || 0);
    doc.setFontSize(16);
    doc.text(`${deposit.toFixed(2)}€`, margin + 35, yPos);

    yPos += 14;

    // Concept
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const conceptLine1 = 'En concepto de señal / pago a cuenta para la reparación del aparato:';
    doc.text(conceptLine1, margin, yPos);

    yPos += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold'); // Highlight Appliance
    const appStr = `${ticket.appliance_info?.type || 'Aparato'} - ${ticket.appliance_info?.brand || ''}`;
    const modelStr = ticket.appliance_info?.model ? `(Mod. ${ticket.appliance_info.model})` : '';
    doc.text(`${appStr} ${modelStr}`, margin, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(`Nº Servicio Referencia: ${ticket.ticket_number}`, margin, yPos);

    yPos += 5;
    const partsText = (ticket.required_parts_description || ticket.description_failure || '').substring(0, 55);
    doc.text(`Repuestos: ${partsText}...`, margin, yPos);


    // --- RIGHT COLUMN (Economic Box) ---
    // Mimic the clean gray border box
    const boxY = 48;
    const boxWidth = width - rightColStart - margin;
    const boxHeight = 58;

    doc.setDrawColor(200); // Light Gray Border
    doc.setLineWidth(0.1);
    doc.setFillColor(255, 255, 255); // White background
    // doc.setFillColor(250, 250, 250); // Very light gray optional
    doc.rect(rightColStart, boxY, boxWidth, boxHeight, 'FD');

    let innerY = boxY + 8;
    const innerMargin = rightColStart + 5;
    const innerRight = rightColStart + boxWidth - 5;

    // Box Header
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN ECONÓMICO', innerMargin, innerY);

    // innerY += 2;
    // doc.line(innerMargin, innerY, innerRight, innerY);

    // Calculations
    const labor = Array.isArray(ticket.labor_list) ? ticket.labor_list : JSON.parse(ticket.labor_list || '[]');
    const parts = Array.isArray(ticket.parts_list) ? ticket.parts_list : JSON.parse(ticket.parts_list || '[]');
    const partsTotal = parts.reduce((sum, p) => sum + (Number(p.price) * (Number(p.qty) || 1)), 0);
    const laborTotal = labor.reduce((sum, l) => sum + (Number(l.price) * (Number(l.qty) || 1)), 0);
    const subtotalCalc = partsTotal + laborTotal;
    const vatCalc = subtotalCalc * 0.21;
    const totalCalc = subtotalCalc + vatCalc;
    const remaining = totalCalc - deposit;

    innerY += 10;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    // Rows
    doc.text('Subtotal:', innerMargin, innerY);
    doc.text(`${subtotalCalc.toFixed(2)}€`, innerRight, innerY, { align: 'right' });

    innerY += 5;
    doc.text('IVA (21%):', innerMargin, innerY);
    doc.text(`${vatCalc.toFixed(2)}€`, innerRight, innerY, { align: 'right' });

    innerY += 7;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', innerMargin, innerY);
    doc.text(`${totalCalc.toFixed(2)}€`, innerRight, innerY, { align: 'right' });

    innerY += 7;
    doc.setTextColor(22, 163, 74); // Green
    doc.text('PAGADO A CUENTA:', innerMargin, innerY);
    doc.text(`-${deposit.toFixed(2)}€`, innerRight, innerY, { align: 'right' });

    innerY += 7;
    doc.setTextColor(220, 38, 38); // Red
    doc.text('PENDIENTE:', innerMargin, innerY);
    doc.text(`${remaining.toFixed(2)}€`, innerRight, innerY, { align: 'right' });


    // --- FOOTER SIGNATURES ---
    const sigY = height - 25;
    doc.setTextColor(0);
    doc.setDrawColor(50); // Darker line for signature
    doc.setLineWidth(0.2);

    // Left Line
    doc.line(margin + 10, sigY, margin + 70, sigY);
    // Right Line
    doc.line(rightColStart + 10, sigY, rightColStart + 70, sigY);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');

    doc.text('Firma y Sello Empresa', margin + 40, sigY + 5, { align: 'center' });
    doc.text('Firma Cliente', rightColStart + 40, sigY + 5, { align: 'center' });

    // Signature Images
    if (signatureImg) {
        try {
            const format = signatureImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            // Adjust placement to sit ON line
            doc.addImage(signatureImg, format, rightColStart + 15, sigY - 12, 50, 10);
        } catch (e) { }
    }

    return doc;
};
