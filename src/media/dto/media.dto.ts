import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MEDIA_PURPOSES,
  MEDIA_VISIBILITIES,
  MediaPurpose,
  MediaVisibility,
} from '../media.constants';

/** Body of `POST /media/uploads` (inventory §2.11); `size` is advisory (F17). */
export class PostUploadMediaDto {
  @ApiProperty({ example: 'avatar.jpg', description: 'Original file name' })
  @IsString()
  filename!: string;

  @ApiProperty({
    description: 'Upload intent type',
    example: 'image/jpeg',
    enum: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  })
  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  mimeType!: string;

  @ApiProperty({
    description: 'Advisory size in bytes (server re-verifies on confirm)',
    example: 1048576,
    minimum: 1,
    maximum: 5 * 1024 * 1024,
  })
  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  size!: number;

  @ApiProperty({ enum: MEDIA_PURPOSES })
  @IsIn(MEDIA_PURPOSES)
  purpose!: MediaPurpose;

  @ApiPropertyOptional({ enum: MEDIA_VISIBILITIES, default: 'private' })
  @IsOptional()
  @IsIn(MEDIA_VISIBILITIES)
  visibility?: MediaVisibility;
}

/** Body of `POST /media/links` (external video/document references only). */
export class PostLinkMediaDto {
  @ApiProperty({
    description: 'External URL (video link, e.g. unlisted YouTube)',
    example: 'https://www.youtube.com/watch?v=abc123',
  })
  @IsString()
  @IsUrl({
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  url!: string;

  @ApiProperty({ enum: MEDIA_PURPOSES })
  @IsIn(MEDIA_PURPOSES)
  purpose!: MediaPurpose;

  @ApiPropertyOptional({ enum: MEDIA_VISIBILITIES, default: 'private' })
  @IsOptional()
  @IsIn(MEDIA_VISIBILITIES)
  visibility?: MediaVisibility;
}
