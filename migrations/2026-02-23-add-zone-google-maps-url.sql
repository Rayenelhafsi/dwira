-- Add optional Google Maps URL for zones
SET @zone_google_maps_column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'zones'
    AND COLUMN_NAME = 'google_maps_url'
);

SET @zone_google_maps_sql := IF(
  @zone_google_maps_column_exists = 0,
  'ALTER TABLE zones ADD COLUMN google_maps_url VARCHAR(500) NULL AFTER description',
  'SELECT 1'
);

PREPARE stmt FROM @zone_google_maps_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
