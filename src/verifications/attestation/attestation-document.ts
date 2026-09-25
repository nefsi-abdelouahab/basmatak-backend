import * as PDFDocument from 'pdfkit';
import { AttestationLang } from './attestation-query.dto';

/**
 * Certificate data assembled read-only from the enriched experience payload
 * (Session 15) plus label lookups. No stored-shape change: every field here
 * already exists on `volunteer_experiences`, `volunteer_profiles`,
 * `organizations`, `opportunities`, or `skills`.
 */
export interface AttestationData {
  lang: AttestationLang;
  platformName: string;
  volunteerName: string;
  volunteerRegistryId: string;
  experienceTitle: string;
  experienceDescription: string | null;
  experienceRegistryId: string;
  verificationCode: string;
  /** Real minted duration, minutes (the `duration` snapshot). */
  durationMinutes: number;
  /** Neutral calendar date (YYYY-MM-DD) derived from `verifiedAt`. */
  verifiedOn: string;
  organizationName: string;
  organizationSlug: string;
  organizationRegistryId: string;
  positionTitle: string | null;
  deliverables: string[];
  skillNames: string[];
}

interface AttestationStrings {
  title: string;
  reference: string;
  volunteer: string;
  experience: string;
  organization: string;
  position: string;
  deliverables: string;
  skills: string;
  duration: string;
  minutes: string;
  hours: string;
  verifiedOn: string;
  verificationCode: string;
  verifiedBy: (organization: string, date: string, code: string) => string;
}

const STRINGS: Record<AttestationLang, AttestationStrings> = {
  en: {
    title: 'Certificate of Verified Experience',
    reference: 'Reference',
    volunteer: 'Volunteer',
    experience: 'Experience',
    organization: 'Organization',
    position: 'Position',
    deliverables: 'Deliverables',
    skills: 'Skills',
    duration: 'Duration',
    minutes: 'minutes',
    hours: 'hours',
    verifiedOn: 'Verified on',
    verificationCode: 'Verification code',
    verifiedBy: (organization, date, code) =>
      `Verified by ${organization} on ${date} — code: ${code}`,
  },
  ar: {
    title: 'شهادة خبرة موثقة',
    reference: 'المرجع',
    volunteer: 'المتطوع',
    experience: 'الخبرة',
    organization: 'المنظمة',
    position: 'المنصب',
    deliverables: 'المنجزات',
    skills: 'المهارات',
    duration: 'المدة',
    minutes: 'دقيقة',
    hours: 'ساعة',
    verifiedOn: 'تم التحقق بتاريخ',
    verificationCode: 'رمز التحقق',
    verifiedBy: (organization, date, code) =>
      `تم التحقق بواسطة ${organization} بتاريخ ${date} — الرمز: ${code}`,
  },
};

function formatDuration(minutes: number, strings: AttestationStrings): string {
  const wholeHours = Math.floor(minutes / 60);
  const base = `${minutes} ${strings.minutes}`;
  if (wholeHours <= 0) {
    return base;
  }
  return `${base} (${wholeHours} ${strings.hours})`;
}

/**
 * Builds the attestation PDF as a pdfkit document stream. Pure function of
 * the assembled data — takes no response object, writes nothing to disk, and
 * performs no I/O, so unit tests assert content without HTTP.
 *
 * `compress: false` keeps the single-page bytes greppable for content
 * assertions at negligible size cost.
 *
 * Font note (flagged TODO, not built here): pdfkit's built-in fonts are
 * Latin-only and pdfkit performs no Arabic glyph shaping (RTL joining), so
 * full Arabic-script fidelity needs a bundled unicode TTF (e.g. Amiri or
 * Noto Sans Arabic under `backend/src/assets/fonts/`) plus reshaping/bidi
 * support before `doc.font()` can switch per `lang`.
 */
export function buildAttestationDocument(
  data: AttestationData,
): PDFKit.PDFDocument {
  const strings = STRINGS[data.lang];
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    compress: false,
    info: { Title: 'Certificate of Verified Experience' },
  });

  doc
    .font('Helvetica')
    .fontSize(13)
    .fillColor('#444444')
    .text(data.platformName, { align: 'center' });
  doc.moveDown(0.5);
  doc
    .font('Helvetica-Bold')
    .fontSize(22)
    .fillColor('#111111')
    .text(strings.title, { align: 'center' });
  doc.moveDown(0.5);
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#555555')
    .text(`${strings.reference}: ${data.experienceRegistryId}`, {
      align: 'center',
    });
  doc.moveDown(1);

  const row = (label: string, value: string): void => {
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#111111')
      .text(`${label}: `, { continued: true });
    doc.font('Helvetica').text(value);
    doc.moveDown(0.25);
  };

  row(strings.volunteer, `${data.volunteerName} (${data.volunteerRegistryId})`);
  row(strings.experience, data.experienceTitle);
  if (data.experienceDescription) {
    row(strings.experience, data.experienceDescription);
  }
  row(
    strings.organization,
    `${data.organizationName} (${data.organizationSlug}, ${data.organizationRegistryId})`,
  );
  if (data.positionTitle) {
    row(strings.position, data.positionTitle);
  }
  if (data.deliverables.length > 0) {
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#111111')
      .text(`${strings.deliverables}:`);
    for (const deliverable of data.deliverables) {
      doc.font('Helvetica').text(`- ${deliverable}`);
    }
    doc.moveDown(0.25);
  }
  if (data.skillNames.length > 0) {
    row(strings.skills, data.skillNames.join(', '));
  }
  row(strings.duration, formatDuration(data.durationMinutes, strings));
  row(strings.verifiedOn, data.verifiedOn);
  row(strings.verificationCode, data.verificationCode);

  doc.moveDown(1);
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#222222')
    .text(
      strings.verifiedBy(
        data.organizationName,
        data.verifiedOn,
        data.verificationCode,
      ),
    );

  return doc;
}
