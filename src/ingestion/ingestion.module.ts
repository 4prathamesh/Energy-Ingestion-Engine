import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleTelemetryHistory } from '../database/entities/vehicle-telemetry-history.entity';
import { MeterTelemetryHistory } from '../database/entities/meter-telemetry-history.entity';
import { VehicleLiveStatus } from '../database/entities/vehicle-live-status.entity';
import { MeterLiveStatus } from '../database/entities/meter-live-status.entity';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VehicleTelemetryHistory,
      MeterTelemetryHistory,
      VehicleLiveStatus,
      MeterLiveStatus,
    ]),
  ],
  providers: [IngestionService],
  controllers: [IngestionController],
  exports: [IngestionService],
})
export class IngestionModule {}
