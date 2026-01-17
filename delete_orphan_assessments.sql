
-- Delete assessments where appliance_id is NULL
DELETE FROM mortify_assessments
WHERE appliance_id IS NULL;

-- Delete assessments where the referenced appliance no longer exists
DELETE FROM mortify_assessments
WHERE appliance_id NOT IN (SELECT id FROM client_appliances);

-- Optional: Delete assessments that have no total_score or critical data missing if that was the issue
-- But the above strictly handles the "join fail" seen in UI.
