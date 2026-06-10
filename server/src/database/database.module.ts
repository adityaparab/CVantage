import { Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

import { AppConfigService } from '../config';

import { MODEL_DEFINITIONS } from './schemas';

/**
 * MongoDB integration (issue #12 / 1.3).
 * - URI from validated config
 * - autoIndex only outside production (prod indexes via `yarn db:indexes`, #20)
 * - connection lifecycle logged
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        uri: config.mongo.uri,
        autoIndex: !config.core.isProd,
        serverSelectionTimeoutMS: 10_000,
        connectionFactory: (connection: Connection): Connection => {
          const logger = new Logger('Mongoose');
          connection.on('connected', () => logger.log('MongoDB connected'));
          connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
          connection.on('reconnected', () => logger.log('MongoDB reconnected'));
          connection.on('error', (err: Error) => logger.error(`MongoDB error: ${err.message}`));
          return connection;
        },
      }),
    }),
    MongooseModule.forFeature(MODEL_DEFINITIONS),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
