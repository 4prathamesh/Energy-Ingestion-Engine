import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeterTelemetryHistory } from '../database/entities/meter-telemetry-history.entity';
import { VehicleTelemetryHistory } from '../database/entities/vehicle-telemetry-history.entity';
import { VehicleLiveStatus } from '../database/entities/vehicle-live-status.entity';

export interface PerformanceAnalytics {
  vehicleId: string;
  totalEnergyConsumedAc: number;
  totalEnergyDeliveredDc: number;
  efficiencyRatio: number;
  averageBatteryTemp: number;
  timeWindowStart: Date;
  timeWindowEnd: Date;
  dataPoints: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(MeterTelemetryHistory)
    private readonly meterHistoryRepo: Repository<MeterTelemetryHistory>,
    @InjectRepository(VehicleTelemetryHistory)
    private readonly vehicleHistoryRepo: Repository<VehicleTelemetryHistory>,
    @InjectRepository(VehicleLiveStatus)
    private readonly vehicleLiveRepo: Repository<VehicleLiveStatus>,
  ) {}

  /**
   * Get 24-hour performance analytics for a vehicle
   * 
   * Optimization Strategy:
   * - Uses indexed queries on (vehicleId, timestamp) to avoid full table scans
   * - Correlates meter and vehicle data to calculate efficiency metrics
   * - Calculates efficiency ratio (DC/AC) to detect hardware faults (<85% indicates issues)
   * - Uses database aggregation for compute-intensive operations
   * 
   * @param vehicleId The vehicle identifier
   * @returns Performance metrics for the 24-hour window
   */
  async getPerformanceAnalytics(
    vehicleId: string,
  ): Promise<PerformanceAnalytics> {
    // Verify vehicle exists in live status
    const vehicleExists = await this.vehicleLiveRepo.findOne({
      where: { vehicleId },
    });

    if (!vehicleExists) {
      throw new NotFoundException(`Vehicle ${vehicleId} not found in system`);
    }

    // Calculate 24-hour window
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

    try {
      // Query vehicle history using indexed columns (vehicleId, timestamp)
      const vehicleData = await this.vehicleHistoryRepo.find({
        where: {
          vehicleId,
          timestamp: {
            // TypeORM supports comparison operators
          },
        },
        order: { timestamp: 'DESC' },
      });

      // Use database query for better performance on large datasets
      const vehicleQuery = await this.vehicleHistoryRepo
        .createQueryBuilder('vh')
        .select('SUM(vh.kwhDeliveredDc)', 'totalKwhDc')
        .addSelect('AVG(vh.batteryTemp)', 'avgBatteryTemp')
        .addSelect('COUNT(vh.id)', 'dataPoints')
        .where('vh.vehicleId = :vehicleId', { vehicleId })
        .andWhere('vh.timestamp >= :startTime', { startTime })
        .andWhere('vh.timestamp <= :endTime', { endTime })
        .getRawOne();

      // Get corresponding meter data for the same 24-hour window
      // Note: In a real system, we'd need to correlate vehicle<->meter via charger_id or location
      // For this assignment, we'll assume a 1:1 mapping via vehicleId (in production, use charger mapping table)
      const meterQuery = await this.meterHistoryRepo
        .createQueryBuilder('mh')
        .select('SUM(mh.kwhConsumedAc)', 'totalKwhAc')
        .where('mh.meterId = :vehicleId', { vehicleId })
        .andWhere('mh.timestamp >= :startTime', { startTime })
        .andWhere('mh.timestamp <= :endTime', { endTime })
        .getRawOne();

      const totalDc =
        parseFloat(vehicleQuery?.totalKwhDc || 0) || 0;
      const totalAc = parseFloat(meterQuery?.totalKwhAc || 0) || 0;
      const avgBatteryTemp =
        parseFloat(vehicleQuery?.avgBatteryTemp || 0) || 0;
      const dataPoints = parseInt(vehicleQuery?.dataPoints || 0, 10) || 0;

      // Calculate efficiency ratio
      // Efficiency = DC Delivered / AC Consumed
      // Typical range: 85-95% (loss due to conversion and heat)
      // Below 85% indicates potential hardware fault
      const efficiencyRatio = totalAc > 0 ? (totalDc / totalAc) * 100 : 0;

      return {
        vehicleId,
        totalEnergyConsumedAc: parseFloat(totalAc.toFixed(2)),
        totalEnergyDeliveredDc: parseFloat(totalDc.toFixed(2)),
        efficiencyRatio: parseFloat(efficiencyRatio.toFixed(2)),
        averageBatteryTemp: parseFloat(avgBatteryTemp.toFixed(2)),
        timeWindowStart: startTime,
        timeWindowEnd: endTime,
        dataPoints,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to retrieve analytics: ${error.message}`,
      );
    }
  }
}
