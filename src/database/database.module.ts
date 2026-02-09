import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeterLiveStatus } from './entities/meter-live-status.entity';
import { MeterTelemetryHistory } from './entities/meter-telemetry-history.entity';
import { VehicleLiveStatus } from './entities/vehicle-live-status.entity';
import { VehicleTelemetryHistory } from './entities/vehicle-telemetry-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MeterTelemetryHistory,
      VehicleTelemetryHistory,
      MeterLiveStatus,
      VehicleLiveStatus,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
