import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';
import {
  MEDIA_PURPOSES,
  MEDIA_VISIBILITIES,
  MediaPurpose,
  MediaVisibility,
} from '../media.constants';

/** Body of `POST /media/uploads` (inventory §2.11); `size` is advisory (F17). */
export class PostUploadMediaDto {
  @IsString()
  filename!: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  size!: number;

  @IsIn(MEDIA_PURPOSES)
  purpose!: MediaPurpose;

  @IsOptional()
  @IsIn(MEDIA_VISIBILITIES)
  visibility?: MediaVisibility;
}

/** Body of `POST /media/links` (external video/document references only). */
export class PostLinkMediaDto {
  @IsString()
  @IsUrl({
    require_protocol: true,
    protocols: ['http', 'https'],
  })
  url!: string;

  @IsIn(MEDIA_PURPOSES)
  purpose!: MediaPurpose;

  @IsOptional()
  @IsIn(MEDIA_VISIBILITIES)
  visibility?: MediaVisibility;
}
