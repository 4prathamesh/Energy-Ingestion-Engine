import { Controller, Post, Body } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import { MeterTelemetryDto } from './dto/meter-telemetry.dto';
import { VehicleTelemetryDto } from './dto/vehicle-telemetry.dto';

@Controller('v1/ingestion')
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * Ingest meter telemetry from grid side
   * Expected frequency: Every 60 seconds per device
   * Payload: { meterId, kwhConsumedAc, voltage, timestamp }
   */
  @Post('meter')
  async ingestMeter(@Body() meterData: MeterTelemetryDto) {
    return this.ingestionService.ingestMeterTelemetry(meterData);
  }

  /**
   * Ingest vehicle telemetry from vehicle/charger side
   * Expected frequency: Every 60 seconds per device
   * Payload: { vehicleId, soc, kwhDeliveredDc, batteryTemp, timestamp }
   */
  @Post('vehicle')
  async ingestVehicle(@Body() vehicleData: VehicleTelemetryDto) {
    return this.ingestionService.ingestVehicleTelemetry(vehicleData);
  }
}
