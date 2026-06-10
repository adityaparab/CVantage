import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { Types } from 'mongoose';

/** Validates :id route params into ObjectId (clean 400 instead of CastError). */
@Injectable()
export class ObjectIdPipe implements PipeTransform<string, Types.ObjectId> {
  transform(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Malformed identifier');
    }
    return new Types.ObjectId(value);
  }
}
