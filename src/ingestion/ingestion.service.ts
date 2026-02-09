import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeterTelemetryHistory } from '../database/entities/meter-telemetry-history.entity';
import { VehicleTelemetryHistory } from '../database/entities/vehicle-telemetry-history.entity';
import { MeterLiveStatus } from '../database/entities/meter-live-status.entity';
import { VehicleLiveStatus } from '../database/entities/vehicle-live-status.entity';
import { MeterTelemetryDto } from './dto/meter-telemetry.dto';
import { VehicleTelemetryDto } from './dto/vehicle-telemetry.dto';

@Injectable()
export class IngestionService {
  constructor(
    @InjectRepository(MeterTelemetryHistory)
    private readonly meterHistoryRepo: Repository<MeterTelemetryHistory>,
    @InjectRepository(VehicleTelemetryHistory)
    private readonly vehicleHistoryRepo: Repository<VehicleTelemetryHistory>,
    @InjectRepository(MeterLiveStatus)
    private readonly meterLiveRepo: Repository<MeterLiveStatus>,
    @InjectRepository(VehicleLiveStatus)
    private readonly vehicleLiveRepo: Repository<VehicleLiveStatus>,
  ) {}

  /**
   * Ingest meter telemetry data
   * 1. INSERT into historical store (append-only for audit trail)
   * 2. UPSERT into live status (atomic update for current values)
   */
  async ingestMeterTelemetry(
    meterData: MeterTelemetryDto,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const timestamp = new Date(meterData.timestamp);

      // 1. INSERT into history (append-only)
      await this.meterHistoryRepo.insert({
        meterId: meterData.meterId,
        kwhConsumedAc: meterData.kwhConsumedAc,
        voltage: meterData.voltage,
        timestamp,
      });

      // 2. UPSERT into live status (atomic update)
      await this.meterLiveRepo.upsert(
        {
          meterId: meterData.meterId,
          lastKwhConsumedAc: meterData.kwhConsumedAc,
          lastVoltage: meterData.voltage,
        },
        ['meterId'],
      );

      return {
        success: true,
        message: `Meter ${meterData.meterId} data ingested successfully`,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to ingest meter data: ${error.message}`,
      );
    }
  }

  /**
   * Ingest vehicle telemetry data
   * 1. INSERT into historical store (append-only for audit trail)
   * 2. UPSERT into live status (atomic update for current values)
   */
  async ingestVehicleTelemetry(
    vehicleData: VehicleTelemetryDto,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const timestamp = new Date(vehicleData.timestamp);

      // 1. INSERT into history (append-only)
      await this.vehicleHistoryRepo.insert({
        vehicleId: vehicleData.vehicleId,
        soc: vehicleData.soc,
        kwhDeliveredDc: vehicleData.kwhDeliveredDc,
        batteryTemp: vehicleData.batteryTemp,
        timestamp,
      });

      // 2. UPSERT into live status (atomic update)
      await this.vehicleLiveRepo.upsert(
        {
          vehicleId: vehicleData.vehicleId,
          soc: vehicleData.soc,
          lastKwhDeliveredDc: vehicleData.kwhDeliveredDc,
          avgBatteryTemp: vehicleData.batteryTemp,
        },
        ['vehicleId'],
      );

      return {
        success: true,
        message: `Vehicle ${vehicleData.vehicleId} data ingested successfully`,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to ingest vehicle data: ${error.message}`,
      );
    }
  }
}
