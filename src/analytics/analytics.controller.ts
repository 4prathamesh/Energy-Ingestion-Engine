import { Controller, Get, Param } from '@nestjs/common';
import { AnalyticsService, PerformanceAnalytics } from './analytics.service';

@Controller('v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Get 24-hour performance analytics for a specific vehicle
   *
   * Returns:
   * - Total energy consumed (AC) from grid
   * - Total energy delivered (DC) to battery
   * - Efficiency ratio (DC/AC %)
   * - Average battery temperature
   * - Number of data points in the 24-hour window
   *
   * Example: GET /v1/analytics/performance/VEH-001
   */
  @Get('performance/:vehicleId')
  async getPerformance(
    @Param('vehicleId') vehicleId: string,
  ): Promise<PerformanceAnalytics> {
    return this.analyticsService.getPerformanceAnalytics(vehicleId);
  }
}
