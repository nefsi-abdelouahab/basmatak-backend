import {
  ValidationPipe,
  ValidationPipeOptions,
  ValidationError,
} from '@nestjs/common';
import { BusinessException } from '../exceptions/business.exception';

/**
 * Global validation pipe with whitelist + forbidNonWhitelisted + transform
 * (inventory §0). Rejects unknown properties and serializes class-validator
 * failures as a 400 `VALIDATION_ERROR` with per-field details.
 */
export class AppValidationPipe extends ValidationPipe {
  constructor(options?: ValidationPipeOptions) {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      ...options,
    });
  }

  override createExceptionFactory(): (
    validationErrors?: ValidationError[],
  ) => unknown {
    return (validationErrors: ValidationError[] = []) => {
      const details = validationErrors.map((error) => ({
        field: error.property,
        errors: error.constraints ? Object.values(error.constraints) : [],
        children: error.children?.length
          ? error.children.map((child) => ({
              field: child.property,
              errors: child.constraints ? Object.values(child.constraints) : [],
            }))
          : undefined,
      }));
      return new BusinessException(
        'VALIDATION_ERROR',
        'Request validation failed',
        400,
        details,
      );
    };
  }
}
