-- Preserve chain provenance for derived graph features.
-- Earlier Phase 6 code derived feature.chain from the first relationship. An
-- empty stored graph therefore produced empty-chain rows despite a chain-known
-- investigation. Repair only values that can be deterministically recovered
-- from the investigation; never invent a chain for an orphaned legacy record.

UPDATE graph_features AS feature
SET chain = investigation.chain
FROM investigations AS investigation
WHERE feature.investigation_id = investigation.id
  AND btrim(feature.chain) = ''
  AND investigation.chain IS NOT NULL
  AND btrim(investigation.chain) <> '';

-- Enforce the invariant for future writes while preserving any historical row
-- whose chain cannot be recovered automatically. Such rows remain visible for
-- explicit operator remediation rather than being silently relabelled.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'graph_features_chain_not_blank'
      AND conrelid = 'graph_features'::regclass
  ) THEN
    ALTER TABLE graph_features
      ADD CONSTRAINT graph_features_chain_not_blank
      CHECK (btrim(chain) <> '') NOT VALID;
  END IF;
END $$;
