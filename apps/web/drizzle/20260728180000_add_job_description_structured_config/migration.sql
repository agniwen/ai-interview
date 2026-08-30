ALTER TABLE "job_description"
ADD COLUMN "structured_config" jsonb
DEFAULT '{"version":1,"hardGates":{"education":"","workExperience":"","requiredSkills":"","workLocation":"","languageAbility":"","requiredCertificates":"","other":""},"weights":{"skillMatch":35,"experienceRelevance":25,"projectMatch":15,"educationBackground":10,"potential":8,"stability":7},"priorityConditions":[],"exclusionConditions":[]}'::jsonb
NOT NULL;
