import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('meter_live_status')
export class MeterLiveStatus {
  @PrimaryColumn()
  meterId: string;

  @Column('float')
  lastVoltage: number;

  @Column('float')
  lastKwhConsumedAc: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
