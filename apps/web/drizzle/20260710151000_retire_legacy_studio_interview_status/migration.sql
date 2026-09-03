-- Expand-contract phase 1: new application code no longer reads or writes this
-- column, while the default keeps old and new application replicas compatible
-- during a rolling deployment. Drop the column and its index in a later release
-- after every old replica has been retired.
ALTER TABLE "studio_interview"
ALTER COLUMN "status" SET DEFAULT 'draft';
