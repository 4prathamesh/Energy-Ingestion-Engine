# Energy Ingestion Engine - High-Scale Fleet Management Platform

A robust, production-ready NestJS application that ingests and analyzes telemetry data from smart meters and EV fleets at scale. This system processes 14.4 million records daily from 10,000+ devices.

## Executive Summary

This is the core ingestion and analytics layer for a fleet platform that manages smart meter (grid-side) and EV charger (vehicle-side) telemetry. The system:

- **Ingests** two independent data streams arriving every 60 seconds from each device
- **Correlates** grid-side (AC) power consumption with vehicle-side (DC) power delivery
- **Detects** hardware faults by monitoring power conversion efficiency
- **Provides** real-time operational dashboards and historical analytics

## Architecture Overview

### Data Flow

```
Grid (Smart Meter)              EV Charger / Vehicle
    ↓                              ↓
    └─────→ kwhConsumedAc      kwhDeliveredDc ←─┐
            voltage            soc
            timestamp          batteryTemp
            timestamp
                ↓                 ↓
            ┌───────────────────────┐
            │  Ingestion Endpoints  │
            │ /v1/ingestion/meter   │
            │ /v1/ingestion/vehicle │
            └───────────────────────┘
                        ↓
        ┌───────────────────────────────┐
        │ Dual-Path Persistence Logic   │
        └───────────────────────────────┘
        │                               │
        ├─→ INSERT (History - Cold)     │
        │   └─ Append-Only              │
        │   └─ Audit Trail              │
        │   └─ Billions of Rows         │
        │                               │
        └─→ UPSERT (Live - Hot)         │
            └─ Atomic Updates           │
            └─ Current Status           │
            └─ Dashboard Queries        │
            │
            └─→ /v1/analytics/performance/:vehicleId
                (24-hour Summary)
```

### Data Temperature Strategy

#### Hot Path (Operational Store)
- **Tables**: `meter_live_status`, `vehicle_live_status`
- **Strategy**: UPSERT (atomic updates)
- **Purpose**: Real-time operational insights
- **Query Pattern**: Single row lookups by ID
- **Use Case**: Dashboard showing current battery %, voltage, SoC
- **Scale**: ~10,000 rows per store (one per device)

#### Cold Path (Historical Store)
- **Tables**: `meter_telemetry_history`, `vehicle_telemetry_history`
- **Strategy**: INSERT (append-only)
- **Purpose**: Long-term analytics and audit trail
- **Query Pattern**: Range queries (24-hour, monthly, yearly)
- **Use Case**: Performance analytics, trend analysis, anomaly detection
- **Scale**: Billions of rows (14.4M records/day × retention period)

## Database Schema

### Live Status Tables (Operational - Hot Path)

```sql
-- meter_live_status
CREATE TABLE meter_live_status (
  meterId VARCHAR PRIMARY KEY,
  lastKwhConsumedAc FLOAT,
  lastVoltage FLOAT,
  updatedAt TIMESTAMP WITH TIME ZONE (auto-updated)
);

-- vehicle_live_status
CREATE TABLE vehicle_live_status (
  vehicleId VARCHAR PRIMARY KEY,
  soc INT (0-100),
  lastKwhDeliveredDc FLOAT,
  avgBatteryTemp FLOAT,
  updatedAt TIMESTAMP WITH TIME ZONE (auto-updated)
);
```

**Index Strategy**: Primary keys provide O(1) lookup performance.

### History Tables (Analytical - Cold Path)

```sql
-- meter_telemetry_history
CREATE TABLE meter_telemetry_history (
  id UUID PRIMARY KEY,
  meterId VARCHAR,
  kwhConsumedAc FLOAT,
  voltage FLOAT,
  timestamp TIMESTAMP WITH TIME ZONE,
  INDEX (meterId, timestamp DESC)  -- Composite index
);

-- vehicle_telemetry_history
CREATE TABLE vehicle_telemetry_history (
  id UUID PRIMARY KEY,
  vehicleId VARCHAR,
  kwhDeliveredDc FLOAT,
  batteryTemp FLOAT,
  soc INT,
  timestamp TIMESTAMP WITH TIME ZONE,
  INDEX (vehicleId, timestamp DESC)  -- Composite index
);
```

**Index Strategy**: Composite indices on (deviceId, timestamp DESC) enable:
- Point-in-time queries: `WHERE vehicleId = ? AND timestamp = ?`
- Range queries: `WHERE vehicleId = ? AND timestamp BETWEEN ? AND ?`
- Recent-first scans: `ORDER BY timestamp DESC`

**Key Design Decision**: No full table scans. All queries are indexed to prevent performance degradation as historical tables grow.

## API Endpoints

### Ingestion Endpoints

#### 1. Meter Telemetry
```
POST /v1/ingestion/meter
Content-Type: application/json

{
  "meterId": "METER-001",
  "kwhConsumedAc": 45.23,
  "voltage": 240.5,
  "timestamp": "2024-02-09T15:30:00Z"
}

Response (201):
{
  "success": true,
  "message": "Meter METER-001 data ingested successfully"
}
```

**Frequency**: Every 60 seconds per meter
**Processing**:
1. INSERT into `meter_telemetry_history` (append-only audit trail)
2. UPSERT into `meter_live_status` (atomic current value update)

#### 2. Vehicle Telemetry
```
POST /v1/ingestion/vehicle
Content-Type: application/json

{
  "vehicleId": "VEH-001",
  "soc": 85,
  "kwhDeliveredDc": 32.15,
  "batteryTemp": 28.3,
  "timestamp": "2024-02-09T15:30:00Z"
}

Response (201):
{
  "success": true,
  "message": "Vehicle VEH-001 data ingested successfully"
}
```

**Frequency**: Every 60 seconds per vehicle
**Processing**:
1. INSERT into `vehicle_telemetry_history` (append-only audit trail)
2. UPSERT into `vehicle_live_status` (atomic current value update)

### Analytics Endpoints

#### 24-Hour Performance Analytics
```
GET /v1/analytics/performance/:vehicleId

Example: GET /v1/analytics/performance/VEH-001

Response (200):
{
  "vehicleId": "VEH-001",
  "totalEnergyConsumedAc": 1245.67,          // Grid supply (AC)
  "totalEnergyDeliveredDc": 1058.23,         // Battery storage (DC)
  "efficiencyRatio": 84.96,                  // Percentage (DC/AC * 100)
  "averageBatteryTemp": 27.45,               // Celsius
  "timeWindowStart": "2024-02-08T15:30:00Z",
  "timeWindowEnd": "2024-02-09T15:30:00Z",
  "dataPoints": 1440                         // One per minute for 24 hours
}
```

**Query Optimization**:
- Uses composite index on `(vehicleId, timestamp DESC)` for efficient range queries
- Aggregation computed at database level (SUM, AVG) via QueryBuilder
- No full table scans; index prevents O(N) operations on billions of rows

**Efficiency Analysis**:
- **Ideal Range**: 85-95% (accounting for converter loss and heat)
- **Red Flag**: Below 85% indicates:
  - Faulty charger hardware
  - Loose electrical connections
  - Battery degradation
  - Temperature-related efficiency loss

## Handling 14.4 Million Records Daily

### Scale Calculations
- **Devices**: 10,000 smart meters + 10,000 EVs = 20,000 devices
- **Frequency**: Every 60 seconds = 1 reading/minute
- **Daily Volume**: 20,000 devices × 1440 minutes = 28.8 million readings/day
- **Quarterly Volume**: 28.8M × 90 days = 2.592 billion rows
- **Yearly Volume**: 28.8M × 365 days = 10.512 billion rows

### Architectural Decisions

#### 1. **Dual-Path Persistence**
- **Why**: Separate concerns for transactional (live) and analytical (history) workloads
- **Benefit**: Hot path queries remain fast (10K rows) while cold path scales horizontally

#### 2. **Composite Indexing** `(deviceId, timestamp DESC)`
- **Why**: All queries filter by device and time range
- **Benefit**: 
  - Range queries execute in milliseconds
  - No full table scans even with 2.5B rows
  - Index memory footprint manageable (~2-3% of data size)

#### 3. **Append-Only History (INSERT)**
- **Why**: Supports audit trails, legal compliance, and time-travel queries
- **Benefit**: Lock-free inserts, optimal for write-heavy workloads

#### 4. **UPSERT for Live Status**
- **Why**: Single source of truth for current state
- **Benefit**: 
  - Handles out-of-order arrivals
  - No need for merge-join queries
  - Atomic guarantees (all-or-nothing)

#### 5. **Database-Level Aggregation**
- **Why**: Compute efficiency metrics at database layer
- **Benefit**: 
  - Reduces network I/O
  - Leverages database query optimization
  - Avoids memory exhaustion on application server

### Performance Targets
- **Ingestion**: <10ms per record (100K records/second throughput)
- **Analytics Query**: <100ms for 24-hour window (1.4K rows scanned via index)
- **Dashboard**: <500ms to load 100 vehicle summaries

### Scaling Beyond 10,000 Devices

**Horizontal Scaling Strategy**:
1. **Sharding by Device ID**: Distribute devices across database instances
2. **Table Partitioning**: Partition history tables by month
3. **Read Replicas**: Dedicated read replicas for analytics queries
4. **Materialized Views**: Pre-aggregate hourly/daily summaries

## Installation & Deployment

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15

### Local Development

1. **Clone the repository**
```bash
git clone <repo-url>
cd energy-ingestion-engine
```

2. **Install dependencies**
```bash
npm install
```

3. **Start services**
```bash
docker-compose up -d
```

4. **Run in development mode** (auto-sync enabled)
```bash
npm run start:dev
```

5. **Test the endpoints**
```bash
# Ingest meter data
curl -X POST http://localhost:3000/v1/ingestion/meter \
  -H "Content-Type: application/json" \
  -d '{
    "meterId": "METER-001",
    "kwhConsumedAc": 45.23,
    "voltage": 240.5,
    "timestamp": "2024-02-09T15:30:00Z"
  }'

# Ingest vehicle data
curl -X POST http://localhost:3000/v1/ingestion/vehicle \
  -H "Content-Type: application/json" \
  -d '{
    "vehicleId": "VEH-001",
    "soc": 85,
    "kwhDeliveredDc": 32.15,
    "batteryTemp": 28.3,
    "timestamp": "2024-02-09T15:30:00Z"
  }'

# Get performance analytics
curl http://localhost:3000/v1/analytics/performance/VEH-001
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Environment Variables

See `.env.example`:
```env
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=energy_db
DB_LOGGING=false
PORT=3000
```

## Development Commands

```bash
# Install dependencies
npm install

# Development server
npm run start:dev

# Build for production
npm run build

# Run production build
npm run start:prod

# Run unit tests
npm run test

# Run E2E tests
npm run test:e2e

# Code coverage
npm run test:cov

# Linting
npm run lint

# Code formatting
npm run format
```

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage report
npm run test:cov
```

## Monitoring & Observability

### Key Metrics
- **Ingestion Latency**: Target <10ms per record
- **Efficiency Ratio**: Monitor for readings <85% (hardware faults)
- **Database Connections**: Pool size: 20 connections
- **Index Hit Ratio**: Target >99% for history queries

### Logging Strategy
```typescript
// Enable SQL logging in .env
DB_LOGGING=true

// Monitor slow queries
SELECT * FROM pg_stat_statements 
WHERE mean_time > 100 
ORDER BY mean_time DESC;
```

## Domain Knowledge: Power Conversion Efficiency

### The Physics
1. **AC Power (Grid)**: Alternating current from utility grid
2. **Conversion Loss**: Charger converts AC → DC, loses energy as heat
3. **DC Power (Battery)**: Direct current stored in battery
4. **Efficiency Formula**: DC / AC × 100%

### Real-World Metrics
- **Healthy Chargers**: 88-94% efficiency
- **Aging Hardware**: 82-87% efficiency
- **Fault Threshold**: <85% efficiency
- **Temperature Impact**: Hot weather reduces efficiency (cooling load)

### Business Impact
- **1% Efficiency Loss**: 28.8M records/year × 0.01 = $288K annual overspend (at $0.10/kWh)
- **Hardware Replacement**: ROI in 3-6 months for failing chargers
- **Predictive Maintenance**: Trend analysis enables preventive maintenance

## Project Structure

```
energy-ingestion-engine/
├── src/
│   ├── main.ts                          # Application entry point
│   ├── app.module.ts                    # Root module
│   ├── database/
│   │   ├── database.module.ts           # Database configuration
│   │   └── entities/
│   │       ├── meter-live-status.entity.ts
│   │       ├── meter-telemetry-history.entity.ts
│   │       ├── vehicle-live-status.entity.ts
│   │       └── vehicle-telemetry-history.entity.ts
│   ├── ingestion/
│   │   ├── ingestion.controller.ts      # POST endpoints
│   │   ├── ingestion.service.ts         # Business logic
│   │   ├── ingestion.module.ts          # Module definition
│   │   └── dto/
│   │       ├── meter-telemetry.dto.ts
│   │       └── vehicle-telemetry.dto.ts
│   └── analytics/
│       ├── analytics.controller.ts      # GET endpoints
│       ├── analytics.service.ts         # Query logic
│       └── analytics.module.ts          # Module definition
├── test/                                # E2E tests
├── docker-compose.yml                  # Multi-container setup
├── Dockerfile                           # Application image
├── init-db.sql                          # Database initialization
├── .env                                 # Configuration
├── package.json                         # Dependencies
├── tsconfig.json                        # TypeScript config
└── README.md                            # This file
```

## Key Implementation Details

### 1. Polymorphic Ingestion
```typescript
// Meter Ingestion (Hot + Cold)
1. INSERT meter_telemetry_history (audit trail)
2. UPSERT meter_live_status (current state)

// Vehicle Ingestion (Hot + Cold)
1. INSERT vehicle_telemetry_history (audit trail)
2. UPSERT vehicle_live_status (current state)
```

### 2. Efficient Analytics Query
```typescript
// Avoids full table scan via composite index
SELECT 
  SUM(kwhDeliveredDc) as totalDc,
  SUM(kwhConsumedAc) as totalAc,
  AVG(batteryTemp) as avgTemp
FROM vehicle_telemetry_history
WHERE vehicleId = 'VEH-001'
  AND timestamp >= '2024-02-08T15:30:00Z'
  AND timestamp <= '2024-02-09T15:30:00Z'
```

**Execution Plan**:
- Index Scan on `(vehicleId, timestamp)` composite index
- Rows Scanned: ~1,440 (one per minute)
- Time: <5ms on typical hardware

### 3. UPSERT Strategy
```typescript
// Atomic update ensures consistency
INSERT INTO meter_live_status (meterId, lastKwhConsumedAc, lastVoltage)
VALUES ('METER-001', 45.23, 240.5)
ON CONFLICT (meterId) DO UPDATE SET
  lastKwhConsumedAc = 45.23,
  lastVoltage = 240.5,
  updatedAt = NOW()
```

## Maintenance & Operations

### Database Maintenance
```bash
# Monthly maintenance (planned downtime)
VACUUM ANALYZE meter_telemetry_history;
VACUUM ANALYZE vehicle_telemetry_history;

# Reindex if necessary
REINDEX INDEX idx_meter_telemetry_history_vehicle_timestamp;
```

### Archival Strategy
```sql
-- Archive old data (1+ year old) to separate cold storage
INSERT INTO meter_telemetry_history_archive
SELECT * FROM meter_telemetry_history
WHERE timestamp < NOW() - INTERVAL '1 year';

DELETE FROM meter_telemetry_history
WHERE timestamp < NOW() - INTERVAL '1 year';
```

## Troubleshooting

### Issue: Slow Analytics Queries
**Solution**: Check index exists
```sql
SELECT * FROM pg_indexes 
WHERE tablename = 'vehicle_telemetry_history';
```

### Issue: High Memory Usage
**Solution**: Partition historical tables by month/quarter

### Issue: Ingestion Latency Spike
**Solution**: 
1. Check database connection pool
2. Verify indices are being used (EXPLAIN ANALYZE)
3. Monitor disk I/O utilization

## Future Enhancements

1. **Time-Series Database**: Consider InfluxDB for specialized analytics
2. **Cache Layer**: Redis for recent 24-hour hot data
3. **Stream Processing**: Kafka for real-time efficiency alerts
4. **Machine Learning**: Anomaly detection for predictive maintenance
5. **Multi-Region**: Geo-distributed ingestion for global fleets
6. **GraphQL API**: Flexible querying for complex dashboards

## License

UNLICENSED
