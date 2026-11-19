-- Keep the sole trader's legal identity with the trading name on future exports.
UPDATE operating_entities
SET legal_name = 'Luke Nathan Hayes trading as Strange But True'
WHERE id = 'sbt';
