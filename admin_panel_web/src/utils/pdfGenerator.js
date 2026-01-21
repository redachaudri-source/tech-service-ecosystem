import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to load image as Base64
export const loadImage = async (url) => {
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Failed to load image: ${url} (${response.status})`);
            return null;
        }
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Error loading image:', error);
        return null;
    }
};

export const generateServiceReport = (ticket, logoImg = null, options = {}) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const isQuote = options.isQuote || false;
    const signatureImg = options.signatureImg || null;

    // --- Header ---
    if (logoImg) {
        try {
            // Extract format from Data URI (e.g., data:image/png;base64,...)
            const format = logoImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(logoImg, format, 15, 15, 40, 15);
        } catch (e) {
            console.error('Error adding logo to PDF:', e);
        }
    }

    // [New] Pending Material Label
    if (ticket.status === 'pendiente_material' || ticket.status === 'pending_parts') {
        doc.setTextColor(234, 88, 12); // Orange-600
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('PENDIENTE DE MATERIALES', pageWidth - 15, 18, { align: 'right' });
        doc.setTextColor(0); // Reset
    }

    doc.setFontSize(22);
    const title = options.title || (isQuote ? 'PRESUPUESTO' : 'PARTE DE TRABAJO');
    doc.text(title, pageWidth - 15, 25, { align: 'right' });

    doc.setFontSize(10);
    doc.text('Servicio Técnico Especializado', pageWidth - 15, 30, { align: 'right' });

    // Ticket Info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Nº Servicio: ${ticket.ticket_number}`, 15, 50);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, pageWidth - 50, 50);

    // --- Client Info ---
    doc.setFillColor(245, 247, 250);
    doc.rect(15, 55, pageWidth - 30, 25, 'F');
    doc.setFontSize(11);
    doc.text('DATOS DEL CLIENTE', 20, 62);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Nombre: ${ticket.client?.full_name || '-'}`, 20, 70);
    doc.text(`Teléfono: ${ticket.client?.phone || '-'}`, pageWidth / 2, 70);
    doc.text(`Dirección: ${ticket.client?.address || '-'}`, 20, 76);

    // --- Appliance Info ---
    // Only show if NOT a generic budget OR if data exists
    const appInfo = ticket.appliance_info || {};
    const hasApplianceData = appInfo.type || appInfo.brand || appInfo.model;
    const isGenericBudget = ticket.type === 'budget';

    if (!isGenericBudget || (hasApplianceData && hasApplianceData !== '-')) {
        doc.setFont('helvetica', 'bold');
        doc.text('DATOS DEL APARATO', 20, 90);
        doc.line(20, 92, pageWidth - 20, 92);

        doc.setFont('helvetica', 'normal');
        const type = appInfo.type || '-';
        const brand = appInfo.brand || '-';
        const model = appInfo.model || '-';

        doc.text(`Aparato: ${type}`, 20, 100);
        doc.text(`Marca: ${brand}`, 80, 100);
        doc.text(`Modelo: ${model}`, 140, 100);
    }

    // --- Diagnosis & Intervention ---
    let yPos = 115;

    doc.setFont('helvetica', 'bold');
    doc.text('DIAGNÓSTICO Y SOLUCIÓN', 20, yPos);
    yPos += 7;

    doc.setFont('helvetica', 'normal');
    const splitDiagnosis = doc.splitTextToSize(`Avería: ${ticket.tech_diagnosis || 'Sin diagnosis'}`, pageWidth - 40);
    doc.text(splitDiagnosis, 20, yPos);
    yPos += (splitDiagnosis.length * 5) + 3;

    const splitSolution = doc.splitTextToSize(`Solución: ${ticket.tech_solution || 'Sin solución registrada'}`, pageWidth - 40);
    doc.text(splitSolution, 20, yPos);
    yPos += (splitSolution.length * 5) + 10;

    // --- Materials & Labor Table ---
    const labor = Array.isArray(ticket.labor_list) ? ticket.labor_list : JSON.parse(ticket.labor_list || '[]');
    const parts = Array.isArray(ticket.parts_list) ? ticket.parts_list : JSON.parse(ticket.parts_list || '[]');

    const tableData = [
        ...labor.map(l => [l.name, 'Mano de Obra', `${l.price}€`]),
        ...parts.map(p => [p.name, 'Pieza', `${p.price}€`])
    ];

    autoTable(doc, {
        startY: yPos,
        head: [['Concepto', 'Tipo', 'Precio']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 9 },
        margin: { top: 10, left: 15, right: 15 }
    });

    yPos = doc.lastAutoTable.finalY + 10;

    // --- Diagnosis Payment Logic ---
    const diagnosisPaid = Number(ticket.diagnosis_paid || 0);
    // If diagnosis is paid, it counts towards the total PAID, but checking logic carefully:
    // User wants: "precio total - el diagnostico ya pagado" if accepted.
    // If isQuote (Budget), show it as paid ITEM.

    // --- Totals ---
    // Calculate totals manually to ensure accuracy with current data
    const subtotal = labor.reduce((s, i) => s + (Number(i.price) * (i.qty || 1)), 0) +
        parts.reduce((s, i) => s + (Number(i.price) * (i.qty || 1)), 0);
    const vat = subtotal * 0.21;
    const total = subtotal + vat;
    const deposit = Number(ticket.deposit_amount || ticket.payment_deposit || 0);

    const totalPaid = ticket.is_paid ? total : (deposit + diagnosisPaid);
    const remaining = total - totalPaid;

    doc.setFontSize(11);
    doc.text(`Subtotal: ${subtotal.toFixed(2)}€`, pageWidth - 50, yPos, { align: 'right' });
    yPos += 6;
    doc.text(`IVA (21%): ${vat.toFixed(2)}€`, pageWidth - 50, yPos, { align: 'right' });
    yPos += 8;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL: ${total.toFixed(2)}€`, pageWidth - 50, yPos, { align: 'right' });
    yPos += 10;

    if (deposit > 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`PAGADO A CUENTA: -${deposit.toFixed(2)}€`, pageWidth - 50, yPos, { align: 'right' });
        yPos += 6;
    }

    if (diagnosisPaid > 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Diagnóstico Pagado: -${diagnosisPaid.toFixed(2)}€`, pageWidth - 50, yPos, { align: 'right' });
        yPos += 6;
    }

    if (!ticket.is_paid && (deposit > 0 || diagnosisPaid > 0)) {
        doc.setFont('helvetica', 'bold');
        doc.text(`PENDIENTE DE PAGO: ${remaining.toFixed(2)}€`, pageWidth - 50, yPos, { align: 'right' });
    }

    // Disclaimer for Budget w/ Diagnosis
    if (isQuote && diagnosisPaid > 0) {
        yPos += 8;
        doc.setFontSize(9);
        doc.setTextColor(200, 100, 0); // Orange
        doc.text('NOTA: Si se acepta este presupuesto en 15 días, se descontará el importe del diagnóstico.', 20, yPos);
        doc.setTextColor(0);
        yPos += 6;
    }

    // Payment Terms / Legal
    if (ticket.payment_terms) {
        yPos += 10;
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.setFont('helvetica', 'italic');
        const splitTerms = doc.splitTextToSize(`Condiciones de Pago: ${ticket.payment_terms}`, pageWidth - 40);
        doc.text(splitTerms, 20, yPos);
        doc.setTextColor(0);
        yPos += (splitTerms.length * 4);
    }

    if (ticket.is_paid) {
        doc.setTextColor(0, 150, 0);
        doc.text('PAGADO', pageWidth - 50, yPos + 10, { align: 'right' });
        doc.setFontSize(9);
        doc.text(`Método: ${ticket.payment_method?.toUpperCase()}`, pageWidth - 50, yPos + 16, { align: 'right' });
        doc.setTextColor(0, 0, 0);
    }

    // --- Footer / Signatures ---
    yPos = 245; // Moved up slightly to make space
    doc.setDrawColor(200);
    doc.line(30, yPos, 90, yPos);
    doc.line(120, yPos, 180, yPos);

    doc.setFontSize(8);
    // Draw Signature Image if available
    if (signatureImg) {
        try {
            const format = signatureImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(signatureImg, format, 40, yPos - 15, 40, 20);
        } catch (e) {
            console.error("Sig err", e);
        }
    }

    doc.text('Firma Cliente', 60, yPos + 5, { align: 'center' });
    doc.text('Firma Técnico', 150, yPos + 5, { align: 'center' });


    // --- TIMELINE VISUAL (PRO COMPACT UI) ---
    // Moved below signatures
    if (!isQuote) {
        drawTimeline(doc, ticket, 275);
    }

    doc.setFontSize(6);
    doc.setTextColor(150);
    doc.text('Garantía de reparación de 3 meses según normativa vigente.', pageWidth / 2, 290, { align: 'center' });

    return doc;
};

// --- TIMELINE HELPER (PRO UI) ---
const drawTimeline = (doc, ticket, startY) => {
    const pageWidth = doc.internal.pageSize.width;
    const history = ticket.status_history || [];

    // Define Milestones with Colors (Modern Muted Palette)
    const steps = [
        { label: 'Entrada', status: ['abierto', 'asignado', 'pendiente'], color: [59, 130, 246] }, // Blue-500
        { label: 'En Camino', status: ['en_camino'], color: [99, 102, 241] }, // Indigo-500
        { label: 'Diagnosis', status: ['en_diagnostico', 'presupuesto_pd', 'presupuestado', 'rechazado'], color: [168, 85, 247] }, // Purple-500
        { label: 'Reparación', status: ['asignado_reparacion', 'en_espera_pieza', 'en_reparacion', 'pendiente_material'], color: [249, 115, 22] }, // Orange-500
        { label: 'Finalizado', status: ['finalizado', 'pagado'], color: [34, 197, 94] } // Green-500
    ];

    const margin = 35; // Wider margins = Compact timeline
    const totalWidth = pageWidth - (margin * 2);
    const stepWidth = totalWidth / (steps.length - 1);

    doc.saveGraphicsState();

    // 1. Draw Base Line (Very Light & Thin)
    doc.setDrawColor(220, 220, 220); // Gray-200
    doc.setLineWidth(0.3); // Thinner
    doc.line(margin, startY, pageWidth - margin, startY);

    // Determine current progress
    const currentStatus = ticket.status;
    let maxStepIndex = 0;

    // Parse Timestamps details
    const stepDetails = steps.map(s => {
        const entry = history.slice().reverse().find(h => s.status.includes(h.status));
        if (!entry) return null;
        const d = new Date(entry.timestamp || entry.changed_at);
        return {
            date: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
            time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        };
    });

    steps.forEach((s, idx) => {
        if (s.status.includes(currentStatus)) maxStepIndex = idx;
        else if (history.some(h => s.status.includes(h.status)) && idx > maxStepIndex) maxStepIndex = idx;
    });
    if (currentStatus === 'finalizado' || currentStatus === 'pagado') maxStepIndex = steps.length - 1;

    // 2. Draw Active Path (Darker Gray Line)
    if (maxStepIndex > 0) {
        const activeWidth = stepWidth * maxStepIndex;
        doc.setDrawColor(100, 100, 100); // Gray-500
        doc.setLineWidth(0.3);
        doc.line(margin, startY, margin + activeWidth, startY);
    }

    // Draw Dots & Text
    steps.forEach((step, i) => {
        const cx = margin + (i * stepWidth);
        const isActive = i <= maxStepIndex;
        const hasData = !!stepDetails[i];

        // Dot Style (Minimalist)
        let circleColor = [243, 244, 246]; // Gray-100 (Inactive)
        let ringColor = [209, 213, 219]; // Gray-300

        if (isActive || hasData) {
            circleColor = step.color;
            ringColor = step.color; // No ring, just solid color looks cleaner small
        }

        // Draw Dot
        doc.setFillColor(...circleColor);
        // doc.setDrawColor(...(isActive ? [255, 255, 255] : ringColor));
        doc.setDrawColor(...ringColor);
        doc.setLineWidth(0.2);

        // Tiny dots
        if (isActive) {
            // Filled Colored Dot
            doc.circle(cx, startY, 1.2, 'F');
        } else {
            // Hollow or Light Gray
            doc.circle(cx, startY, 1.2, 'F');
        }

        // Label (Top) - Very subtle
        doc.setFontSize(5);
        doc.setTextColor(isActive ? 50 : 180);
        doc.setFont('helvetica', isActive ? 'bold' : 'normal');
        doc.text(step.label.toUpperCase(), cx, startY - 3, { align: 'center' });

        // Date & Time (Bottom)
        if (hasData) {
            doc.setFontSize(4.5);
            doc.setTextColor(100);
            doc.setFont('helvetica', 'normal');
            doc.text(stepDetails[i].date, cx, startY + 4, { align: 'center' });

            // doc.setTextColor(150);
            // doc.text(stepDetails[i].time, cx, startY + 6, { align: 'center' }); // Hide time to save space/cleanliness? User asked for "more pro". 
            // Let's keep date only for "super clean", OR date+time very tight.
            // Let's keep just date for cleaner look unless they requested time.
            // Actually, timestamps are useful. Let's keep time but very small.
            doc.setFontSize(4);
            doc.setTextColor(150);
            doc.text(stepDetails[i].time, cx, startY + 6, { align: 'center' });
        }
    });

    doc.restoreGraphicsState();
};

export const generateDepositReceipt = (ticket, logoImg = null) => {
    const doc = new jsPDF({ format: 'a5', orientation: 'landscape' }); // Receipt style
    const pageWidth = doc.internal.pageSize.width;

    // --- Header ---
    if (logoImg) {
        try {
            const format = logoImg.match(/^data:image\/(.*);base64/)?.[1]?.toUpperCase() || 'PNG';
            doc.addImage(logoImg, format, 10, 10, 30, 10);
        } catch (e) {
            console.error('Error adding logo to Receipt:', e);
        }
    }

    doc.setFontSize(16);
    doc.text('RECIBO DE ENTREGA A CUENTA', pageWidth - 10, 20, { align: 'right' });

    doc.setFontSize(10);
    doc.text(`Nº Recibo: R-${ticket.ticket_number}-${Date.now().toString().slice(-4)}`, pageWidth - 10, 28, { align: 'right' });
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, pageWidth - 10, 33, { align: 'right' });

    // --- Client Info ---
    doc.setFontSize(12);
    doc.text(`Hemos recibido de D./Dña: ${ticket.client?.full_name || 'Cliente'}`, 15, 50);

    // --- Financial Calculations (Replicated from TechTicketDetail) ---
    const labor = Array.isArray(ticket.labor_list) ? ticket.labor_list : [];
    const parts = Array.isArray(ticket.parts_list) ? ticket.parts_list : [];
    const deposit = Number(ticket.deposit_amount || 0);

    // Calculate Totals
    const partsTotal = parts.reduce((sum, p) => sum + (Number(p.price) * (Number(p.qty) || 1)), 0);
    const laborTotal = labor.reduce((sum, l) => sum + (Number(l.price) * (Number(l.qty) || 1)), 0);
    const subtotal = partsTotal + laborTotal;
    const vat = subtotal * 0.21;
    const total = subtotal + vat;
    const remaining = total - deposit;

    // --- Main Amount (Deposit) ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`La cantidad de: ${deposit.toFixed(2)}€`, 15, 65);

    // --- Concept / Details ---
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`En concepto de señal / pago a cuenta para la reparación del aparato:`, 15, 75);
    doc.text(`${ticket.appliance_info?.type || 'Aparato'} - ${ticket.appliance_info?.brand || ''} (${ticket.appliance_info?.model || 'Modelo no especificado'})`, 15, 80);
    doc.text(`Nº Servicio Referencia: ${ticket.ticket_number}`, 15, 85);

    // --- Parts Description ---
    if (ticket.required_parts_description || parts.length > 0) {
        const partsDesc = ticket.required_parts_description || parts.map(p => p.name).join(', ');
        doc.text(`Repuestos solicitados: ${partsDesc}`, 15, 90);
    }

    // --- Financial Breakdown Box ---
    doc.setDrawColor(200);
    doc.setFillColor(250, 250, 250);
    doc.rect(pageWidth - 85, 45, 75, 50, 'FD'); // Box on right

    doc.setFontSize(9);
    doc.text('RESUMEN ECONÓMICO', pageWidth - 80, 52);

    let yBox = 60;
    doc.text(`Subtotal:`, pageWidth - 80, yBox);
    doc.text(`${subtotal.toFixed(2)}€`, pageWidth - 15, yBox, { align: 'right' });

    yBox += 5;
    doc.text(`IVA (21%):`, pageWidth - 80, yBox);
    doc.text(`${vat.toFixed(2)}€`, pageWidth - 15, yBox, { align: 'right' });

    yBox += 7;
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL PRESUPUESTO:`, pageWidth - 80, yBox);
    doc.text(`${total.toFixed(2)}€`, pageWidth - 15, yBox, { align: 'right' });

    yBox += 7;
    doc.setTextColor(0, 100, 0); // Dark Green
    doc.text(`PAGADO A CUENTA:`, pageWidth - 80, yBox);
    doc.text(`-${deposit.toFixed(2)}€`, pageWidth - 15, yBox, { align: 'right' });

    yBox += 8;
    doc.setTextColor(200, 0, 0); // Dark Red
    doc.setFontSize(11);
    doc.text(`PENDIENTE DE PAGO:`, pageWidth - 80, yBox);
    doc.text(`${remaining.toFixed(2)}€`, pageWidth - 15, yBox, { align: 'right' });

    doc.setTextColor(0); // Reset color

    // --- Signatures ---
    const yPos = 110;
    doc.setDrawColor(0);
    doc.line(20, yPos, 80, yPos);
    doc.line(110, yPos, 170, yPos);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Firma y Sello Empresa', 50, yPos + 5, { align: 'center' });
    doc.text('Firma Cliente', 140, yPos + 5, { align: 'center' });

    return doc;
};

// Export Material Deposit PDF Generator
export { generateMaterialDepositPDF } from './materialDepositPDF';
