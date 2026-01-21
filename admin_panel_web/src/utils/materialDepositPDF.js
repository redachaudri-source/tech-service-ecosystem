import jsPDF from 'jspdf';

/**
 * Generates a COMPACT Material Deposit PDF (A5 Format)
 * "Recibo de Señal" - Receipt Style
 */
export const generateMaterialDepositPDF = (ticket, logoImg = null, signatureImg = null) => {
    // A5 Format: 148mm x 210mm
    const doc = new jsPDF({
        format: 'a5',
        orientation: 'portrait'
    });

    const pageWidth = doc.internal.pageSize.width; // ~148
    const pageHeight = doc.internal.pageSize.height; // ~210
    const margin = 10;
    const contentWidth = pageWidth - (margin * 2);

    // --- WATERMARK (Scaled Down) ---
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.08 }));
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(30);
    doc.setFont('helvetica', 'bold');
    doc.text('PENDIENTE', pageWidth / 2, pageHeight / 2 - 10, { align: 'center', angle: 45 });
    doc.text('ENTREGA MATERIALES', pageWidth / 2, pageHeight / 2 + 10, { align: 'center', angle: 45 });
    doc.restoreGraphicsState();

    // --- HEADER ---
    let yPos = 15;

    // Logo (Simpler/Smaller)
    if (logoImg) {
        try {
            const format = logoImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(logoImg, format, margin, yPos, 30, 12); // Smaller logo
        } catch (e) {
            console.error('Error adding logo:', e);
        }
    }

    // Title Block
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('RECIBO DE SEÑAL', pageWidth - margin, yPos + 5, { align: 'right' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, pageWidth - margin, yPos + 10, { align: 'right' });
    doc.text(`Servicio: #${ticket.ticket_number}`, pageWidth - margin, yPos + 14, { align: 'right' });

    yPos += 20;

    // --- CLIENT & APPLIANCE BOX (Unified) ---
    doc.setDrawColor(200);
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, yPos, contentWidth, 35, 'FD'); // Box

    let boxY = yPos + 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE:', margin + 4, boxY);
    doc.setFont('helvetica', 'normal');
    doc.text(ticket.client?.full_name || '-', margin + 25, boxY);

    boxY += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('TEL:', margin + 4, boxY);
    doc.setFont('helvetica', 'normal');
    doc.text(ticket.client?.phone || '-', margin + 25, boxY);

    boxY += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('DIR:', margin + 4, boxY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text((ticket.client?.address || '-').substring(0, 50), margin + 25, boxY);

    // Line Separator inside box
    boxY += 4;
    doc.setDrawColor(220);
    doc.line(margin + 2, boxY, pageWidth - margin - 2, boxY);

    boxY += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('APARATO:', margin + 4, boxY);
    doc.setFont('helvetica', 'normal');
    const appStr = `${ticket.appliance_info?.type || ''} ${ticket.appliance_info?.brand || ''} ${ticket.appliance_info?.model || ''}`;
    doc.text(appStr.substring(0, 45), margin + 25, boxY);

    boxY += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('AVERÍA:', margin + 4, boxY);
    doc.setFont('helvetica', 'normal');
    const failStr = (ticket.description_failure || ticket.description || 'No descr.').substring(0, 45);
    doc.text(failStr, margin + 25, boxY);

    yPos += 40;

    // --- MATERIALS SECTION ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(234, 88, 12); // Orange
    doc.text('MATERIALES SOLICITADOS', margin, yPos);
    doc.setTextColor(0);

    yPos += 5;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const partsDesc = ticket.required_parts_description || 'Repuestos necesarios para la reparación.';
    const splitParts = doc.splitTextToSize(partsDesc, contentWidth);
    doc.text(splitParts, margin, yPos);
    yPos += (splitParts.length * 4) + 5;

    // --- TOTALS SECTION (Right Aligned, Compact) ---
    // Calculate Numbers
    const labor = Array.isArray(ticket.labor_list) ? ticket.labor_list : JSON.parse(ticket.labor_list || '[]');
    const parts = Array.isArray(ticket.parts_list) ? ticket.parts_list : JSON.parse(ticket.parts_list || '[]');
    const partsTotal = parts.reduce((sum, p) => sum + (Number(p.price) * (Number(p.qty) || 1)), 0);
    const laborTotal = labor.reduce((sum, l) => sum + (Number(l.price) * (Number(l.qty) || 1)), 0);
    const subtotal = partsTotal + laborTotal;
    const vat = subtotal * 0.21;
    const total = subtotal + vat;
    const deposit = Number(ticket.deposit_amount || 0);
    const remaining = total - deposit;

    // Background for totals
    doc.setFillColor(254, 243, 199); // Amber-50
    doc.rect(pageWidth / 2, yPos, (pageWidth / 2) - margin, 30, 'F');

    let totalY = yPos + 6;
    const rightX = pageWidth - margin - 2;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Total Presupuestado:', rightX - 35, totalY, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(`${total.toFixed(2)}€`, rightX, totalY, { align: 'right' });

    totalY += 6;
    doc.setTextColor(22, 163, 74); // Green
    doc.text('A CUENTA (PAGADO):', rightX - 35, totalY, { align: 'right' });
    doc.text(`-${deposit.toFixed(2)}€`, rightX, totalY, { align: 'right' });

    totalY += 8;
    doc.setTextColor(234, 88, 12); // Orange
    doc.setFontSize(11);
    doc.text('RESTANTE:', rightX - 35, totalY, { align: 'right' });
    doc.text(`${remaining.toFixed(2)}€`, rightX, totalY, { align: 'right' });

    yPos += 35;

    // --- SIGNATURES ---
    // Compact Signatures
    doc.setTextColor(0);
    doc.setDrawColor(150);

    const sigLineY = pageHeight - 35; // Put at bottom
    doc.line(margin, sigLineY, margin + 40, sigLineY);
    doc.line(pageWidth - margin - 40, sigLineY, pageWidth - margin, sigLineY);

    if (signatureImg) {
        try {
            const format = signatureImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(signatureImg, format, margin + 5, sigLineY - 12, 30, 10);
        } catch (e) { }
    }

    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text('Firma Cliente', margin + 20, sigLineY + 4, { align: 'center' });
    doc.text('Firma Técnico', pageWidth - margin - 20, sigLineY + 4, { align: 'center' });

    // --- FOOTER ---
    doc.setFontSize(6);
    doc.setTextColor(150);
    doc.text('Documento justificante de entrega a cuenta. Validez: 15 días.', pageWidth / 2, pageHeight - 10, { align: 'center' });

    return doc;
};
