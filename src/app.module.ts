import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from './analytics/analytics.module';
import { IngestionModule } from './ingestion/ingestion.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: 'postgres',
      database: 'energy_db',
      autoLoadEntities: true,
      synchronize: true, // OK for assignment
    }),
    AnalyticsModule,
    IngestionModule,
  ],
})
export class AppModule {}
