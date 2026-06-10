import { resolve } from 'node:path';

import { Global, Module } from '@nestjs/common';

import { AppConfigService } from '../config';

import { LocalDiskStorage } from './local-disk.storage';
import { S3Storage } from './s3.storage';
import { StorageService } from './storage.types';

/** Driver chosen by STORAGE_DRIVER (s3 settings enforced by env validation). */
@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): StorageService => {
        const { driver, uploadDir, s3 } = config.storage;
        if (driver === 's3') {
          return new S3Storage({
            endpoint: s3.endpoint,
            bucket: s3.bucket!,
            region: s3.region,
            accessKeyId: s3.accessKeyId!,
            secretAccessKey: s3.secretAccessKey!,
          });
        }
        return new LocalDiskStorage(resolve(uploadDir));
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
