import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper to load image as Base64
export const loadImage = async (url) => {
    if (!url) return null;
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Error loading logo:', error);
        return null;
    }
};

export const generateServiceReport = (ticket, logoImg = null, options = {}) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const isQuote = options.isQuote || false;

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

    doc.setFontSize(22);
    doc.text(isQuote ? 'PRESUPUESTO' : 'PARTE DE TRABAJO', pageWidth - 15, 25, { align: 'right' });

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
        doc.text(`A cuenta / Señal: -${deposit.toFixed(2)}€`, pageWidth - 50, yPos, { align: 'right' });
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
        doc.text(`PENDIENTE: ${remaining.toFixed(2)}€`, pageWidth - 50, yPos, { align: 'right' });
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

    // --- TIMELINE VISUAL (AMAZON STYLE) ---
    if (!isQuote) {
        drawTimeline(doc, ticket, 200); // Draw at Y=200
    }

    // --- Footer / Signatures ---
    yPos = 250;
    doc.setDrawColor(150);
    doc.line(30, yPos, 90, yPos);
    doc.line(120, yPos, 180, yPos);

    doc.setFontSize(8);
    doc.text('Firma Cliente', 60, yPos + 5, { align: 'center' });
    doc.text('Firma Técnico', 150, yPos + 5, { align: 'center' });

    doc.setFontSize(7);
    doc.text('Garantía de reparación de 3 meses según normativa vigente.', pageWidth / 2, 280, { align: 'center' });

    return doc;
};

// --- TIMELINE HELPER (PRO UI) ---
const drawTimeline = (doc, ticket, startY) => {
    const pageWidth = doc.internal.pageSize.width;
    const history = ticket.status_history || [];

    // Define Milestones with Colors (Tailwind-ish RGB)
    const steps = [
        { label: 'Entrada', status: ['abierto', 'asignado', 'pendiente'], color: [29, 78, 216] }, // Blue
        { label: 'En Camino', status: ['en_camino'], color: [67, 56, 202] }, // Indigo
        { label: 'Diagnosis', status: ['en_diagnostico', 'presupuesto_pd', 'presupuestado', 'rechazado'], color: [126, 34, 206] }, // Purple
        { label: 'Reparación', status: ['asignado_reparacion', 'en_espera_pieza', 'en_reparacion', 'pendiente_material'], color: [194, 65, 12] }, // Orange
        { label: 'Finalizado', status: ['finalizado', 'pagado'], color: [21, 128, 61] } // Green
    ];

    const margin = 25;
    const totalWidth = pageWidth - (margin * 2);
    const stepWidth = totalWidth / (steps.length - 1);

    doc.saveGraphicsState();

    // 1. Draw Base Line (Dark Grey, Thin)
    doc.setDrawColor(75, 85, 99); // Gray-600
    doc.setLineWidth(0.5);
    doc.line(margin, startY, pageWidth - margin, startY);

    // Determine current progress
    const currentStatus = ticket.status;
    let maxStepIndex = 0;

    // Parse Timestamps details
    const stepDetails = steps.map(s => {
        // Find LATEST entry matching one of the statuses
        const entry = history.slice().reverse().find(h => s.status.includes(h.status));
        if (!entry) return null;

        const d = new Date(entry.timestamp || entry.changed_at);
        return {
            date: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
            time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        };
    });

    // Find active step index based on logic
    steps.forEach((s, idx) => {
        if (s.status.includes(currentStatus)) maxStepIndex = idx;
        else if (history.some(h => s.status.includes(h.status)) && idx > maxStepIndex) maxStepIndex = idx;
    });
    if (currentStatus === 'finalizado' || currentStatus === 'pagado') maxStepIndex = steps.length - 1;

    // 2. Draw Active Line (Darker Overlay? Or just colored dots)
    // User asked for "linea de gris oscuro". We already did that. 
    // Maybe "Active" part shouldn't be green line, just the dots colored? 
    // "puntos en la misma secuencia de colores... la linea que sea de gris oscuro".
    // So ONLY dots are colored. Line is always gray.

    // Draw Dots & Text
    steps.forEach((step, i) => {
        const cx = margin + (i * stepWidth);
        const isActive = i <= maxStepIndex;
        const hasData = !!stepDetails[i];

        // Dot Style
        let circleColor = [229, 231, 235]; // Gray-200 (Inactive)
        let ringColor = [156, 163, 175]; // Gray-400

        if (isActive || hasData) {
            circleColor = step.color;
            ringColor = step.color;
        }

        // Draw Dot
        doc.setFillColor(...circleColor);
        doc.setDrawColor(...(isActive ? [255, 255, 255] : ringColor));
        doc.setLineWidth(0.5);

        // External Ring for aesthetics
        if (isActive) {
            doc.setDrawColor(...step.color);
            doc.circle(cx, startY, 2.5, 'FD'); // Filled Dot
        } else {
            // Hollow or Gray filled
            doc.circle(cx, startY, 2, 'FD');
        }

        // Label (Top)
        doc.setFontSize(8);
        doc.setTextColor(isActive ? 0 : 150);
        doc.setFont('helvetica', isActive ? 'bold' : 'normal');
        doc.text(step.label, cx, startY - 6, { align: 'center' });

        // Date & Time (Bottom)
        if (hasData) {
            doc.setFontSize(7);
            doc.setTextColor(80);
            doc.setFont('helvetica', 'normal');
            doc.text(stepDetails[i].date, cx, startY + 6, { align: 'center' });

            doc.setFontSize(6);
            doc.setTextColor(120);
            doc.text(stepDetails[i].time, cx, startY + 9, { align: 'center' });
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
