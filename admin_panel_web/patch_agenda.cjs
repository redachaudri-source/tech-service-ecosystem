const fs = require('fs');
const path = 'c:/Users/PC/.gemini/antigravity/scratch/tech_service_ecosystem/admin_panel_web/src/pages/GlobalAgenda.jsx';

try {
    let content = fs.readFileSync(path, 'utf8');

    // Define the block start and a unique substring near the end to identify the block
    const startMarker = "// STRICT SEPARATION: P.R.O.C. WEEK only moves dates.";

    // We want to replace everything from startMarker down to the end of the forEach loop.
    // The loop ends with "});" at indentation level 16 spaces (based on previous view).
    // Let's find the start index.
    const startIndex = content.indexOf(startMarker);

    if (startIndex === -1) {
        console.error("Could not find start marker!");
        process.exit(1);
    }

    // Find the end of the block. 
    // We look for the closing of the forEach loop: `                });` 
    // We can search for the specific comment inside the loop to be sure: `// Else: Job is already on the correct day for its zone. Leave it alone.`
    const endMarkerComment = "// Else: Job is already on the correct day for its zone. Leave it alone.";
    const endCommentIndex = content.indexOf(endMarkerComment, startIndex);

    if (endCommentIndex === -1) {
        console.error("Could not find end marker comment!");
        process.exit(1);
    }

    // Find the next "});" after the end comment
    const closingBraceIndex = content.indexOf("});", endCommentIndex);

    if (closingBraceIndex === -1) {
        console.error("Could not find closing brace!");
        process.exit(1);
    }

    // The end index should include the "});" (3 chars)
    const endIndex = closingBraceIndex + 3;

    // Construct the new block
    const newBlock = `// CASCADE: Week Distributor -> Day Optimizer
                // Zone Clustering determined the DAY. Now we let P.R.O.C. DAY determine the TIME.
                const dayMoves = calculateDayMoves(targetDateObj, dayJobs, optimizationStrategy, startCP);

                // Add to aggregate list
                aggregatedMoves.push(...dayMoves.map(m => ({
                    type: 'RESCHEDULE',
                    appt: m.appt,
                    newStart: m.newStart, 
                    travelMin: 0,
                    reason: 'Zone + Route Optimization'
                })));`;

    // Perform replacement
    const before = content.substring(0, startIndex);
    const after = content.substring(endIndex);
    const newContent = before + newBlock + after;

    fs.writeFileSync(path, newContent, 'utf8');
    console.log("Successfully patched GlobalAgenda.jsx");

} catch (e) {
    console.error("Error patching file:", e);
    process.exit(1);
}
