import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentAccount, Roles } from '../../common/decorators/auth.decorators';
import { AccountToken } from '../../common/interfaces/account-token.interface';
import { buildAttestationDocument } from './attestation-document';
import { AttestationQueryDto } from './attestation-query.dto';
import { AttestationService } from './attestation.service';

/**
 * Attestation download (Session 18, RP Part 7 verifications row): the
 * volunteer's own verified experience rendered as a streamed PDF. The PDF is
 * generated in-process with pdfkit and piped to the response — never written
 * to disk (Render free tier has no persistent disk).
 */
@ApiBearerAuth()
@ApiTags('experiences')
@Controller()
export class AttestationController {
  constructor(private readonly attestation: AttestationService) {}

  @ApiParam({
    name: 'experienceId',
    description: 'The verified experience id',
    type: String,
    format: 'ObjectId',
  })
  @Get('experiences/:experienceId/attestation')
  @Roles('volunteer', 'organization', 'admin')
  @ApiOperation({
    summary: 'Download the verified-experience attestation PDF',
  })
  async download(
    @CurrentAccount() account: AccountToken,
    @Param('experienceId') experienceId: string,
    @Query() query: AttestationQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.attestation.assemble(
      account,
      experienceId,
      query.lang ?? 'en',
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attestation-${data.experienceRegistryId}.pdf"`,
    );
    const document = buildAttestationDocument(data);
    await new Promise<void>((resolve, reject) => {
      res.on('finish', () => resolve());
      res.on('error', (error: unknown) => reject(error));
      document.on('error', (error: unknown) => reject(error));
      document.pipe(res);
      document.end();
    });
  }
}
