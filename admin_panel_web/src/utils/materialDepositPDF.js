import jsPDF from 'jspdf';

/**
 * Generates User-Requested 'Recibo de Entrega a Cuenta' Format
 * Matches specific layout: Logo Left, Title Right, 2-Column Body, Economic Box Right
 */
export const generateMaterialDepositPDF = (ticket, logoImg = null, signatureImg = null) => {
    // Landscape format for "Receipt" look (Wide)
    // A5 Landscape is 210mm x 148mm
    const doc = new jsPDF({
        format: 'a5',
        orientation: 'landscape'
    });

    const width = doc.internal.pageSize.width; // 210
    const height = doc.internal.pageSize.height; // 148
    const margin = 12;

    // --- HEADER ---
    let yPos = 15;

    // 1. Logo (Top Left)
    if (logoImg) {
        try {
            const format = logoImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(logoImg, format, margin, 10, 45, 15);
        } catch (e) { }
    }

    // 2. Title & Meta (Top Right)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(16);
    doc.text('RECIBO DE ENTREGA A CUENTA', width - margin, 18, { align: 'right' });

    doc.setFontSize(10);
    const receiptNo = `R-${ticket.ticket_number}-${new Date().getFullYear()}`;
    doc.text(`Nº Recibo: ${receiptNo}`, width - margin, 25, { align: 'right' });
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, width - margin, 30, { align: 'right' });

    // --- BODY (Two Columns) ---
    // Left Column: Text Info
    // Right Column: Economic Summary Box

    yPos = 50;
    const leftColWidth = 110;

    // "Hemos recibido de..."
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Hemos recibido de D./Dña:', margin, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(ticket.client?.full_name || '____________________', margin + 50, yPos);

    yPos += 12;

    // "La cantidad de: X €" (Big)
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('La cantidad de:', margin, yPos);
    const deposit = Number(ticket.deposit_amount || 0);
    doc.setFontSize(16);
    doc.text(`${deposit.toFixed(2)}€`, margin + 45, yPos);

    yPos += 12;

    // Concept Block
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('En concepto de señal / pago a cuenta para la reparación del aparato:', margin, yPos);
    yPos += 5;

    const appInfo = `${ticket.appliance_info?.type || 'Aparato'} - ${ticket.appliance_info?.brand || ''} (${ticket.appliance_info?.model || 'Modelo no especificado'})`;
    doc.text(appInfo, margin, yPos);

    yPos += 5;
    doc.text(`Nº Servicio Referencia: ${ticket.ticket_number}`, margin, yPos);

    yPos += 5;
    const partsText = (ticket.required_parts_description || ticket.description_failure || '').substring(0, 60);
    doc.text(`Repuestos solicitados: ${partsText}...`, margin, yPos);

    // --- RIGHT COLUMN: ECONOMIC BOX ---
    // Start X = 130 (approx)
    // Width = width - 130 - margin
    const boxX = 130;
    const boxWidth = width - boxX - margin;
    const boxY = 45;
    const boxHeight = 65;

    doc.setDrawColor(200);
    doc.setFillColor(252, 252, 252);
    doc.rect(boxX, boxY, boxWidth, boxHeight, 'FD'); // Light Gray Box

    let boxLineY = boxY + 8;

    // Header inside box
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text('RESUMEN ECONÓMICO', boxX + 5, boxLineY);

    // Line
    boxLineY += 3;
    doc.setDrawColor(220);
    doc.line(boxX + 2, boxLineY, boxX + boxWidth - 2, boxLineY);

    // Calculation
    const labor = Array.isArray(ticket.labor_list) ? ticket.labor_list : JSON.parse(ticket.labor_list || '[]');
    const parts = Array.isArray(ticket.parts_list) ? ticket.parts_list : JSON.parse(ticket.parts_list || '[]');
    const partsTotal = parts.reduce((sum, p) => sum + (Number(p.price) * (Number(p.qty) || 1)), 0);
    const laborTotal = labor.reduce((sum, l) => sum + (Number(l.price) * (Number(l.qty) || 1)), 0);
    const subtotalCalc = partsTotal + laborTotal;
    const vatCalc = subtotalCalc * 0.21;
    const totalCalc = subtotalCalc + vatCalc;
    const remaining = totalCalc - deposit;

    // Rows
    boxLineY += 10;
    doc.setTextColor(0);
    doc.setFontSize(9);

    // Subtotal
    doc.text('Subtotal:', boxX + 5, boxLineY);
    doc.text(`${subtotalCalc.toFixed(2)}€`, boxX + boxWidth - 5, boxLineY, { align: 'right' });

    boxLineY += 6;
    doc.text('IVA (21%):', boxX + 5, boxLineY);
    doc.text(`${vatCalc.toFixed(2)}€`, boxX + boxWidth - 5, boxLineY, { align: 'right' });

    boxLineY += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL PRESUPUESTO:', boxX + 5, boxLineY);
    doc.text(`${totalCalc.toFixed(2)}€`, boxX + boxWidth - 5, boxLineY, { align: 'right' });

    boxLineY += 8;
    doc.setTextColor(22, 163, 74); // Green
    doc.text('PAGADO A CUENTA:', boxX + 5, boxLineY);
    doc.text(`-${deposit.toFixed(2)}€`, boxX + boxWidth - 5, boxLineY, { align: 'right' });

    boxLineY += 8;
    doc.setTextColor(220, 38, 38); // Red
    doc.text('PENDIENTE DE PAGO:', boxX + 5, boxLineY);
    doc.text(`${remaining.toFixed(2)}€`, boxX + boxWidth - 5, boxLineY, { align: 'right' });

    // Reset
    doc.setTextColor(0);

    // --- SIGNATURES (Bottom aligned) ---
    const sigY = height - 25;

    doc.setDrawColor(0);
    doc.line(margin + 20, sigY, margin + 80, sigY); // Left Line
    doc.line(width - margin - 80, sigY, width - margin - 20, sigY); // Right Line

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Firma y Sello Empresa', margin + 50, sigY + 5, { align: 'center' });
    doc.text('Firma Cliente', width - margin - 50, sigY + 5, { align: 'center' });

    // Signature Images
    if (signatureImg) {
        try {
            const format = signatureImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(signatureImg, format, width - margin - 75, sigY - 15, 50, 12);
        } catch (e) { }
    }

    return doc;
};
