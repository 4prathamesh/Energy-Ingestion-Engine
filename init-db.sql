-- Energy Ingestion Engine - Database Initialization Script
-- This script creates optimized indices for high-scale ingestion

-- Create indices for history tables to avoid full table scans
CREATE INDEX IF NOT EXISTS idx_meter_telemetry_history_vehicle_timestamp
  ON meter_telemetry_history (meterId, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_history_vehicle_timestamp
  ON vehicle_telemetry_history (vehicleId, timestamp DESC);

-- Create composite index for efficient range queries
CREATE INDEX IF NOT EXISTS idx_meter_telemetry_history_timestamp
  ON meter_telemetry_history (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_telemetry_history_timestamp
  ON vehicle_telemetry_history (timestamp DESC);

-- Note: Live status tables (meter_live_status, vehicle_live_status) 
-- use primary keys which are automatically indexed
