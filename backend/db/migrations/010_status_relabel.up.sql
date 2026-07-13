-- Change UAT/UAI status default + relabel legacy Pending/Passed/Failed → Standard
ALTER TABLE documents ALTER COLUMN uat_status SET DEFAULT 'Standard';
ALTER TABLE documents ALTER COLUMN uai_status SET DEFAULT 'Standard';

UPDATE documents SET uat_status = 'Standard' WHERE uat_status IN ('Pending', 'Passed', 'Failed');
UPDATE documents SET uai_status = 'Standard' WHERE uai_status IN ('Pending', 'Passed', 'Failed');
