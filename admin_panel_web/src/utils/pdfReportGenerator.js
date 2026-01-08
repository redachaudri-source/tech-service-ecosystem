import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Generates an Executive PDF Report from Analytics Data
 * @param {Object} data - The dataset from get_business_intelligence RPC
 * @param {Object} filters - Current active filters
 */
export const generateExecutiveReport = (data, filters) => {
    const doc = new jsPDF();
    const today = format(new Date(), 'dd MMMM yyyy', { locale: es });

    // HEADER
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text("INFORME EJECUTIVO", 20, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado el: ${today}`, 20, 26);
    doc.text(`Rango Analizado: ${filters.startDate ? format(new Date(filters.startDate), 'dd/MM/yyyy') : 'N/A'} - ${filters.endDate ? format(new Date(filters.endDate), 'dd/MM/yyyy') : 'Hoy'}`, 20, 31);

    // KPI SUMMARY LINE
    doc.setDrawColor(200);
    doc.line(20, 35, 190, 35);

    const kpis = data.kpis || {};
    doc.setFontSize(12);
    doc.setTextColor(0);

    let yPos = 45;
    doc.text("RESUMEN OPERATIVO", 20, yPos);
    yPos += 10;

    // KPI Grid Simulation
    doc.setFontSize(10);
    doc.text(`Volumen Total: ${kpis.total_volume || 0} avisos`, 20, yPos);
    doc.text(`Facturación: ${kpis.total_revenue || 0} €`, 80, yPos);
    doc.text(`Ticket Medio: ${kpis.avg_ticket || 0} €`, 140, yPos);
    yPos += 15;

    // 1. BRAND PERFORMANCE
    doc.setFontSize(14);
    doc.setTextColor(0, 51, 102); // Dark Blue
    doc.text("1. Cuota de Mercado (Top Marcas)", 20, yPos);
    yPos += 5;

    const brandRows = (data.market_share || []).map(b => [b.name, b.value]);
    doc.autoTable({
        startY: yPos,
        head: [['Marca', 'Volumen']],
        body: brandRows,
        theme: 'striped',
        headStyles: { fillColor: [59, 130, 246] }, // Blue-500
        margin: { left: 20 }
    });

    yPos = doc.lastAutoTable.finalY + 15;

    // 2. TECH PERFORMANCE
    doc.setFontSize(14);
    doc.text("2. Rendimiento Técnico (ROI)", 20, yPos);
    yPos += 5;

    const techRows = (data.tech_performance || []).map(t => [t.name, t.jobs, `${t.revenue} €`]);
    doc.autoTable({
        startY: yPos,
        head: [['Técnico', 'Trabajos', 'Facturación']],
        body: techRows,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129] }, // Green-500
        margin: { left: 20 }
    });

    yPos = doc.lastAutoTable.finalY + 15;

    // 3. HOT ZONES (Check page break)
    if (yPos > 250) {
        doc.addPage();
        yPos = 20;
    }

    doc.setFontSize(14);
    doc.text("3. Zonas Calientes (Top CPs)", 20, yPos);
    yPos += 5;

    const zoneRows = (data.hot_zones || []).slice(0, 10).map(z => [z.postal_code, z.value]);
    doc.autoTable({
        startY: yPos,
        head: [['C. Postal', 'Incidencias']],
        body: zoneRows,
        theme: 'striped',
        headStyles: { fillColor: [239, 68, 68] }, // Red-500
        margin: { left: 20, right: 100 } // Narrow table
    });

    // FOOTER
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, 190, 285, { align: 'right' });
        doc.text("Antigravity Business Intelligence", 20, 285);
    }

    doc.save(`Informe_Ejecutivo_${format(new Date(), 'yyyyMMdd')}.pdf`);
};
