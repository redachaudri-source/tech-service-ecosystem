const fs = require('fs');
const path = 'c:/Users/PC/.gemini/antigravity/scratch/tech_service_ecosystem/admin_panel_web/src/pages/GlobalAgenda.jsx';

try {
    let content = fs.readFileSync(path, 'utf8');

    // 1. Remove Mode Toggle Logic
    const toggleStart = `{/* 0. MODE TOGGLE */}`;
    // We want to remove the whole block including the div and buttons.
    // Searching for unique strings to define the range.
    const toggleBlockStart = content.indexOf(toggleStart);
    if (toggleBlockStart !== -1) {
        const toggleBlockEnd = content.indexOf(`{/* 1. SELECTION (Conditional) */}`);
        if (toggleBlockEnd !== -1) {
            // Replace with comment
            content = content.substring(0, toggleBlockStart) +
                `{/* 0. MODE TOGGLE (DISABLED) */}\n` +
                content.substring(toggleBlockEnd);
        }
    }

    // 2. Simplify Header 1. SELECTION
    const headerRegex = /<h3 className="[^"]*">\s*<Calendar size=\{12\} \/> \{optimizerMode === 'DAY' \? '1. SELECCIONA DÍA' : '1. RANGO DE FECHAS'\}\s*<\/h3>/;
    content = content.replace(headerRegex, `<h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                            <Calendar size={12} /> 1. SELECCIONA DÍA
                                        </h3>`);

    // 3. Remove Conditional Logic for Date Selector
    // We want to replace `{optimizerMode === 'WEEK' ? (` ... `) : (` with just the DAY logic.
    // This is tricky with regex due to nested braces.
    // Let's target the specific unique condition string.
    const conditionalStart = `{optimizerMode === 'WEEK' ? (`;
    const conditionalEnd = `) : (`;

    // We find the start of the Week Block
    const idxCondStart = content.indexOf(conditionalStart);
    if (idxCondStart !== -1) {
        // Find the split point `) : (`
        const idxSplit = content.indexOf(conditionalEnd, idxCondStart);
        if (idxSplit !== -1) {
            // Find the end of day block. It ends with `)}` before `</section>`
            // Actually, we can just cut out the Week part and the conditional wrapper.
            // The Day block starts after `) : (`
            // We need to keep the content inside the `else` block (the Day Selector).
            // It ends at the matching closing brace.

            // Re-strategy: We know exactly what the Week Block looks like roughly.
            // Let's replace the whole `optimizerMode === 'WEEK' ? ( ... ) : (` sequence 
            // with just `(`.
            // Wait, that leaves the trailing `)`?

            // Let's use a simpler approach: Just force the Day Selector code.
            // I'll overwrite the whole section using known unique markers if possible.

            const daySelectorStartMarker = `{/* EXISTING DAY SELECTOR */}`;
            const daySelectorIdx = content.indexOf(daySelectorStartMarker);

            if (daySelectorIdx !== -1) {
                // Cut straight to the Day Selector
                // We need to remove from `idxCondStart` up to `daySelectorIdx`
                // And then remove the trailing `)}` at the end of the block.

                const part1 = content.substring(0, idxCondStart);
                const part2 = content.substring(daySelectorIdx); // Keeps Day Selector onwards

                // Now we have `part1` + `part2`.
                // But `part2` contains the closing `)}` corresponding to the ternary.
                // We need to find the `</section>` and remove the `)}` before it.

                let newContent = part1 + part2;
                const sectionEndTag = `</section>`;
                const idxSectionEnd = newContent.indexOf(sectionEndTag);
                if (idxSectionEnd !== -1) {
                    // Look backwards from sectionEnd for `)}`
                    const idxClosing = newContent.lastIndexOf(`)}`, idxSectionEnd);
                    if (idxClosing !== -1) {
                        // Remove the `)}`
                        const final = newContent.substring(0, idxClosing) + newContent.substring(idxClosing + 2);
                        content = final;
                    }
                }
            }
        }
    }

    // 4. Update Strategy Selector Condition
    const oldStrategyCondition = `!optimizingDay && optimizerMode === 'DAY' || (optimizerMode === 'WEEK' && (!weekRange.start || !weekRange.end))`;
    const newStrategyCondition = `!optimizingDay`;
    content = content.replace(oldStrategyCondition, newStrategyCondition);

    fs.writeFileSync(path, content, 'utf8');
    console.log("Successfully reverted UI to Day Mode");

} catch (e) {
    console.error("Error patching file:", e);
    process.exit(1);
}
