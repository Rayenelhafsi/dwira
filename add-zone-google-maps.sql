-- Add optional Google Maps URL for zones
ALTER TABLE zones
  ADD COLUMN IF NOT EXISTS google_maps_url VARCHAR(500) NULL AFTER description;
