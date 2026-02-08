import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('vehicle_live_status')
export class VehicleLiveStatus {
  @PrimaryColumn()
  vehicleId: string;

  @Column('int')
  soc: number;

  @Column('float')
  lastKwhDeliveredDc: number;

  @Column('float')
  avgBatteryTemp: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
