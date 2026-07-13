-- Company default WorkOrder — prefilled into the document "WorkOrder" field
-- when this company is chosen on the upload page (still editable per document).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS work_order VARCHAR(255) NOT NULL DEFAULT '';
