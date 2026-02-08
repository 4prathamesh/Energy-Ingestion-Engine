import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleTelemetryHistory } from '../database/entities/vehicle-telemetry-history.entity';
import { MeterTelemetryHistory } from '../database/entities/meter-telemetry-history.entity';
import { VehicleLiveStatus } from '../database/entities/vehicle-live-status.entity';
import { MeterLiveStatus } from '../database/entities/meter-live-status.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VehicleTelemetryHistory,
      MeterTelemetryHistory,
      VehicleLiveStatus,
      MeterLiveStatus,
    ]),
  ],
})
export class IngestionModule {}
