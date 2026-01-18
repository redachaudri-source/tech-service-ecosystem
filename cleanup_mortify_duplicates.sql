-- CLEANUP SCRIPT: Delete duplicate PENDING_JUDGE assessments
-- Keep only the LATEST one for each appliance

DELETE FROM mortify_assessments
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY appliance_id, status 
                   ORDER BY created_at DESC
               ) as row_num
        FROM mortify_assessments
        WHERE status = 'PENDING_JUDGE'
    ) t
    WHERE t.row_num > 1
);
