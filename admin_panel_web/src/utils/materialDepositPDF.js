import jsPDF from 'jspdf';

/**
 * Generates a professional Material Deposit PDF with watermark
 * This PDF is given to the customer when they pay a deposit while waiting for parts
 */
export const generateMaterialDepositPDF = (ticket, logoImg = null, signatureImg = null) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // --- DIAGONAL WATERMARK: "PENDIENTE ENTREGA MATERIALES" ---
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.12 })); // Very light but visible
    doc.setTextColor(220, 38, 38); // Red-600
    doc.setFontSize(45);
    doc.setFont('helvetica', 'bold');

    // Calculate center position for diagonal text
    const centerX = pageWidth / 2;
    const centerY = pageHeight / 2;

    // Rotate and draw watermark
    doc.text('PENDIENTE', centerX, centerY - 15, {
        align: 'center',
        angle: 45
    });
    doc.text('ENTREGA MATERIALES', centerX, centerY + 15, {
        align: 'center',
        angle: 45
    });

    doc.restoreGraphicsState();

    // --- HEADER ---
    if (logoImg) {
        try {
            const format = logoImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(logoImg, format, 15, 15, 40, 15);
        } catch (e) {
            console.error('Error adding logo to PDF:', e);
        }
    }

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('RECIBO DE SEÑAL - ANTICIPO', pageWidth - 15, 20, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Pendiente de Entrega de Materiales', pageWidth - 15, 27, { align: 'right' });
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES')}`, pageWidth - 15, 32, { align: 'right' });

    // --- SERVICE INFO BOX ---
    doc.setFillColor(245, 247, 250);
    doc.rect(15, 40, pageWidth - 30, 15, 'F');

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Servicio Nº: ${ticket.ticket_number}`, 20, 47);
    doc.text(`Estado: ESPERANDO REPUESTOS`, pageWidth - 20, 47, { align: 'right' });

    // --- CLIENT INFO ---
    let yPos = 65;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL CLIENTE', 15, yPos);

    yPos += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nombre: ${ticket.client?.full_name || '-'}`, 15, yPos);
    doc.text(`Teléfono: ${ticket.client?.phone || '-'}`, pageWidth / 2, yPos);

    yPos += 5;
    doc.text(`Dirección: ${ticket.client?.address || '-'}`, 15, yPos);

    // --- APPLIANCE INFO ---
    yPos += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('APARATO REPARADO', 15, yPos);

    yPos += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const appInfo = ticket.appliance_info || {};
    doc.text(`Tipo: ${appInfo.type || '-'}`, 15, yPos);
    doc.text(`Marca: ${appInfo.brand || '-'}`, 80, yPos);
    doc.text(`Modelo: ${appInfo.model || '-'}`, 140, yPos);

    // --- PARTS DESCRIPTION (CRITICAL SECTION) ---
    yPos += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(234, 88, 12); // Orange-600
    doc.text('🔧 MATERIALES SOLICITADOS', 15, yPos);

    yPos += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    const partsDescription = ticket.required_parts_description || 'No especificado';
    const splitParts = doc.splitTextToSize(partsDescription, pageWidth - 30);
    doc.text(splitParts, 15, yPos);
    yPos += (splitParts.length * 5) + 5;

    // --- DIAGNOSIS & SOLUTION (Brief) ---
    if (ticket.tech_diagnosis || ticket.tech_solution) {
        yPos += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('DIAGNÓSTICO', 15, yPos);

        yPos += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);

        const diagText = ticket.tech_diagnosis || 'Pendiente de completar diagnóstico';
        const splitDiag = doc.splitTextToSize(`Avería: ${diagText}`, pageWidth - 30);
        doc.text(splitDiag, 15, yPos);
        yPos += (splitDiag.length * 4) + 2;

        if (ticket.tech_solution) {
            const splitSol = doc.splitTextToSize(`Solución: ${ticket.tech_solution}`, pageWidth - 30);
            doc.text(splitSol, 15, yPos);
            yPos += (splitSol.length * 4);
        }
    }

    // --- FINANCIAL BREAKDOWN (MAIN SECTION) ---
    yPos += 10;
    doc.setFillColor(254, 243, 199); // Amber-100
    doc.rect(15, yPos, pageWidth - 30, 50, 'F');
    doc.setDrawColor(251, 191, 36); // Amber-400
    doc.rect(15, yPos, pageWidth - 30, 50, 'D');

    yPos += 8;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14); // Amber-900
    doc.text('💰 RESUMEN FINANCIERO', 20, yPos);

    // Calculate totals
    const labor = Array.isArray(ticket.labor_list) ? ticket.labor_list : JSON.parse(ticket.labor_list || '[]');
    const parts = Array.isArray(ticket.parts_list) ? ticket.parts_list : JSON.parse(ticket.parts_list || '[]');

    const partsTotal = parts.reduce((sum, p) => sum + (Number(p.price) * (Number(p.qty) || 1)), 0);
    const laborTotal = labor.reduce((sum, l) => sum + (Number(l.price) * (Number(l.qty) || 1)), 0);
    const subtotal = partsTotal + laborTotal;
    const vat = subtotal * 0.21;
    const total = subtotal + vat;
    const deposit = Number(ticket.deposit_amount || 0);
    const remaining = total - deposit;

    yPos += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);

    // Total row
    doc.text('Total Presupuesto Reparación:', 25, yPos);
    doc.setFont('helvetica', 'bold');
    doc.text(`${total.toFixed(2)}€`, pageWidth - 25, yPos, { align: 'right' });

    yPos += 8;
    // Deposit row
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74); // Green-600
    doc.text('✅ Pagado a Cuenta (Señal):', 25, yPos);
    doc.text(`${deposit.toFixed(2)}€`, pageWidth - 25, yPos, { align: 'right' });

    yPos += 8;
    // Remaining row
    doc.setTextColor(234, 88, 12); // Orange-600
    doc.text('⏳ Saldo Pendiente al Entregar:', 25, yPos);
    doc.text(`${remaining.toFixed(2)}€`, pageWidth - 25, yPos, { align: 'right' });

    // Payment method
    if (ticket.payment_method) {
        yPos += 8;
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text(`Método de pago señal: ${ticket.payment_method.toUpperCase()}`, 25, yPos);
    }

    doc.setTextColor(0, 0, 0); // Reset

    // --- TERMS & CONDITIONS ---
    yPos += 20;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('CONDICIONES', 15, yPos);

    yPos += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const terms = [
        '• El saldo pendiente debe abonarse al momento de la entrega del aparato reparado.',
        '• Este presupuesto tiene validez de 15 días desde la fecha indicada.',
        '• Una vez recibidos los materiales, se procederá a contactar al cliente para coordinar la finalización del servicio.',
        '• La garantía de la reparación entrará en vigor tras el pago total y recepción del aparato.'
    ];

    terms.forEach(term => {
        const splitTerm = doc.splitTextToSize(term, pageWidth - 30);
        doc.text(splitTerm, 15, yPos);
        yPos += (splitTerm.length * 4) + 1;
    });

    // --- SIGNATURES ---
    yPos = 255;
    doc.setDrawColor(150);
    doc.line(30, yPos, 90, yPos);
    doc.line(120, yPos, 180, yPos);

    // Client signature
    if (signatureImg) {
        try {
            const format = signatureImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(signatureImg, format, 35, yPos - 20, 50, 15);
        } catch (e) {
            console.error('Error adding signature:', e);
        }
    }

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Firma Cliente', 60, yPos + 5, { align: 'center' });
    doc.text('(Conforme con condiciones)', 60, yPos + 9, { align: 'center' });
    doc.text('Firma Técnico', 150, yPos + 5, { align: 'center' });

    // --- FOOTER ---
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text('Este documento certifica el pago a cuenta. Conservar para presentar al recoger el aparato.', pageWidth / 2, 285, { align: 'center' });
    doc.text(`Generado el ${new Date().toLocaleString('es-ES')}`, pageWidth / 2, 290, { align: 'center' });

    return doc;
};
