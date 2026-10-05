import * as fs from 'fs';
import * as path from 'path';
import * as PDFDocument from 'pdfkit';
import { AttestationLang } from './attestation-query.dto';

/**
 * Certificate data assembled read-only from the enriched experience payload
 * (Session 15) plus label lookups. No stored-shape change: every field here
 * already exists on `volunteer_experiences`, `volunteer_profiles`,
 * `organizations`, `opportunities`, or `skills`.
 *
 * This interface is the API contract for the certificate: the rebuild below
 * only changes PDF presentation, never this shape.
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
  platformTagline: string;
  issued: (isoDate: string) => string;
  documentReference: string;
  intro: (platform: string) => string;
  recordDetails: string;
  standardFormat: string;
  volunteer: string;
  experience: string;
  organization: string;
  position: string;
  deliverables: string;
  skills: string;
  duration: string;
  hours: string;
  minutesDocumented: string;
  verifiedOn: string;
  signedOff: string;
  experienceDescription: string;
  attestingOrganization: string;
  verificationCode: string;
  verifyHint: string;
  digitalRecord: string;
  footerNote: (platform: string) => string;
  verifiedBy: (organization: string, date: string, code: string) => string;
}

const STRINGS: Record<AttestationLang, AttestationStrings> = {
  en: {
    title: 'Certificate of Verified Experience',
    platformTagline: 'Volunteer Platform · Verification Services',
    issued: (isoDate) => `Issued: ${isoDate}`,
    documentReference: 'Document Reference:',
    intro: (platform) =>
      `This document certifies that the voluntary service outlined below has been formally completed and verified on the ${platform} platform.`,
    recordDetails: 'Verification Record Details',
    standardFormat: 'Standard Registry Format',
    volunteer: 'Volunteer',
    experience: 'Experience',
    organization: 'Organization',
    position: 'Position',
    deliverables: 'Deliverables',
    skills: 'Skills',
    duration: 'Duration',
    hours: 'hours',
    minutesDocumented: 'minutes documented',
    verifiedOn: 'Verified On',
    signedOff: 'Signed off by Organization',
    experienceDescription: 'Experience Description',
    attestingOrganization: 'Attesting Organization',
    verificationCode: 'Verification Code',
    verifyHint: 'Visit the platform to inspect',
    digitalRecord: 'Digital Verification Record Authenticated',
    footerNote: (platform) =>
      `This certificate confirms a volunteer contribution verified on the ${platform} platform.`,
    verifiedBy: (organization, date, code) =>
      `Verified by ${organization} on ${date} — code: ${code}`,
  },
  ar: {
    title: 'شهادة خبرة موثقة',
    platformTagline: 'منصة التطوع · خدمات التوثيق',
    issued: (isoDate) => `صدرت بتاريخ: ${isoDate}`,
    documentReference: 'مرجع الوثيقة:',
    intro: (platform) =>
      `تشهد هذه الوثيقة بأن الخدمة التطوعية الموضحة أدناه قد اكتملت وتم توثيقها رسميا على منصة ${platform}.`,
    recordDetails: 'تفاصيل سجل التوثيق',
    standardFormat: 'صيغة السجل المعيارية',
    volunteer: 'المتطوع',
    experience: 'الخبرة',
    organization: 'المنظمة',
    position: 'المنصب',
    deliverables: 'المنجزات',
    skills: 'المهارات',
    duration: 'المدة',
    hours: 'ساعة',
    minutesDocumented: 'دقيقة موثقة',
    verifiedOn: 'تم التوثيق بتاريخ',
    signedOff: 'اعتُمدت من المنظمة',
    experienceDescription: 'وصف الخبرة',
    attestingOrganization: 'المنظمة الموثقة',
    verificationCode: 'رمز التحقق',
    verifyHint: 'تفضل بزيارة المنصة للتحقق',
    digitalRecord: 'سجل توثيق رقمي معتمد',
    footerNote: (platform) =>
      `تؤكد هذه الشهادة مساهمة تطوعية تم توثيقها على منصة ${platform}.`,
    verifiedBy: (organization, date, code) =>
      `تم التحقق بواسطة ${organization} بتاريخ ${date} — الرمز: ${code}`,
  },
};

/**
 * Palette mirrors the reference (`design/Certificate of Verified Experience/`)
 * and the frontend token source (`frontend/src/theme/tokens.ts`):
 * primary #6D28D9, ink #111827, muted #64748B, border #E2E8F0,
 * card #F8FAFC, pill #F1F5F9, success #16A34A. No other hues are introduced.
 */
const VIOLET = '#6D28D9';
const VIOLET_TINT = '#F5F3FF';
const INK = '#111827';
const BODY = '#334155';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const CARD_BG = '#F8FAFC';

/**
 * Corner rounding for every card/container (~8px at 96dpi = 6pt): subtle,
 * minimal, and uniform. No pills or chips exist anywhere in the document —
 * statuses, metadata, and registry ids render as plain text.
 */
const CARD_RADIUS = 6;
const INNER_RADIUS = 4;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 48;
const MR = 48;
const CONTENT_W = PAGE_W - ML - MR;
const BOTTOM_LIMIT = PAGE_H - 40;

const SANS = 'Helvetica';
const SANS_BOLD = 'Helvetica-Bold';
const SERIF_ITALIC = 'Times-Italic';
const MONO = 'Courier';
const MONO_BOLD = 'Courier-Bold';

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Long display date for the reference "September 29, 2026" style rows.
 * The raw ISO value (`verifiedOn`) is still rendered verbatim in the header
 * "Issued" line, so machine-readable assertions keep working. Arabic keeps
 * the ISO form: Arabic-script fidelity is a flagged follow-up, not built here.
 */
function formatLongDate(isoDate: string, lang: AttestationLang): string {
  if (lang === 'ar') {
    return isoDate;
  }
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return isoDate;
  }
  const [year, month, day] = parts;
  if (month < 1 || month > 12) {
    return isoDate;
  }
  return `${MONTHS_EN[month - 1]} ${day}, ${year}`;
}

/**
 * Reference duration style: hours first ("6 hours (360 minutes documented)").
 * Pure presentation of the real `durationMinutes` value — no new data.
 */
function formatDurationLead(
  minutes: number,
  strings: AttestationStrings,
): { lead: string; rest: string } {
  const wholeHours = Math.floor(minutes / 60);
  if (wholeHours <= 0) {
    return { lead: `${minutes} ${strings.minutesDocumented}`, rest: '' };
  }
  return {
    lead: `${wholeHours} ${strings.hours}`,
    rest: ` (${minutes} ${strings.minutesDocumented})`,
  };
}

/** Public deep-link path backing the verification box (same as frontend). */
function verifyPath(code: string): string {
  return `/verify/${code}`;
}

/**
 * Bundled platform logo: `frontend/public/logo.png` copied to
 * `verifications/attestation/assets/logo.png` and shipped to `dist` via the
 * `assets` entry in `nest-cli.json` (production runs `node dist/main`, so
 * `__dirname` resolves under `dist/.../attestation`). Loaded lazily once and
 * cached; `null` when the file is absent so the header falls back to the
 * monogram box instead of throwing. Reads a static bundled asset only — no
 * PDF bytes are ever written to disk.
 */
const LOGO_PATH = path.join(__dirname, 'assets', 'logo.png');
let cachedLogo: Buffer | null | undefined;
function loadLogoImage(): Buffer | null {
  if (cachedLogo !== undefined) {
    return cachedLogo;
  }
  try {
    cachedLogo = fs.readFileSync(LOGO_PATH);
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

/**
 * Builds the attestation PDF as a pdfkit document stream. Pure function of
 * the assembled data — takes no response object and writes nothing to disk
 * (the bundled logo asset is read, never written), so unit tests assert
 * content without HTTP.
 *
 * Layout structurally mirrors the reference `code.html` top to bottom:
 * violet top bar → header band (platform logo + identity + verification
 * pill) → centered title + document-reference chip + intro →
 * "Verification Record Details" card → quoted experience description →
 * deliverables/skills cards → attesting-organization sign-off +
 * verification-code box → platform footer.
 *
 * Deliberate deviations (no invented data, pdfkit constraints):
 * - Platform logo comes from the bundled `assets/logo.png`; when the file
 *   is absent (or unreadable) the header falls back to a tinted monogram
 *   box with the platform initial instead of throwing.
 * - No QR graphic: no QR library is available and a decorative code-looking
 *   graphic would imply scannability; the real `verificationCode` plus the
 *   real `/verify/:code` path are rendered instead.
 * - No legal/statutory, registry-seal, hash, or statistics content — the
 *   reference carries none and the spec forbids inventing any.
 * - An "Experience" row is added to the record card: the reference mock
 *   omits it, but the experience title is a contracted payload field and
 *   must be carried by the document.
 * - Vector check/dots only (no icon font): pdfkit built-ins are WinAnsi, so
 *   glyphs outside Latin-1 are drawn as shapes, never as font characters.
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
    margins: { top: 40, bottom: 40, left: ML, right: MR },
    compress: false,
    info: { Title: 'Certificate of Verified Experience' },
  });

  const hasVolunteerId = data.volunteerRegistryId.trim().length > 0;
  const hasOrgId = data.organizationRegistryId.trim().length > 0;
  const hasSlug = data.organizationSlug.trim().length > 0;
  const description = (data.experienceDescription ?? '').trim();
  const deliverables = data.deliverables.filter((item) => item.trim());
  const skillNames = data.skillNames.filter((item) => item.trim());

  const drawTopBar = (): void => {
    doc.rect(0, 0, PAGE_W, 6).fill(VIOLET);
  };

  const ensureSpace = (needed: number): void => {
    if (doc.y + needed > BOTTOM_LIMIT) {
      doc.addPage();
      drawTopBar();
      doc.y = 28;
    }
  };

  const rule = (
    x1: number,
    x2: number,
    y: number,
    color: string,
    width: number,
  ): void => {
    doc
      .moveTo(x1, y)
      .lineTo(x2, y)
      .lineWidth(width)
      .strokeColor(color)
      .stroke();
    doc.lineWidth(1);
  };

  drawTopBar();

  // ---- Header band (reference <header>): platform identity + issued line.
  // No status pills: the right side carries only the plain-text issue date.
  doc.y = 28;
  const headerY = doc.y;
  const logoSize = 34;
  doc
    .roundedRect(ML, headerY, logoSize, logoSize, CARD_RADIUS)
    .fillAndStroke(VIOLET_TINT, BORDER);
  const drawMonogramFallback = (): void => {
    const initial = (data.platformName.trim().charAt(0) || 'B').toUpperCase();
    doc
      .font(SANS_BOLD)
      .fontSize(16)
      .fillColor(VIOLET)
      .text(initial, ML, headerY + 8, { width: logoSize, align: 'center' });
  };
  const logoImage = loadLogoImage();
  if (logoImage === null) {
    drawMonogramFallback();
  } else {
    try {
      // Portrait mark (299x444): fit centered inside the box with padding.
      doc.image(logoImage, ML + 4, headerY + 4, {
        fit: [logoSize - 8, logoSize - 8],
        align: 'center',
        valign: 'center',
      });
    } catch {
      drawMonogramFallback();
    }
  }

  const identityX = ML + logoSize + 10;
  doc
    .font(SANS_BOLD)
    .fontSize(13)
    .fillColor(INK)
    .text(data.platformName, identityX, headerY + 1, {
      width: 280,
      align: 'left',
      ellipsis: true,
    });
  doc
    .font(SANS)
    .fontSize(7)
    .fillColor(MUTED)
    .text(strings.platformTagline.toUpperCase(), identityX, headerY + 19, {
      width: 280,
      align: 'left',
    });

  doc
    .font(MONO)
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(strings.issued(data.verifiedOn), PAGE_W - MR - 220, headerY + 14, {
      width: 220,
      align: 'right',
    });

  rule(ML, PAGE_W - MR, headerY + 46, VIOLET, 1.5);
  doc.y = headerY + 60;

  // ---- Title block: H1 + plain-text document reference + intro paragraph.
  doc
    .font(SANS_BOLD)
    .fontSize(20)
    .fillColor(INK)
    .text(strings.title, ML, doc.y, { width: CONTENT_W, align: 'center' });
  const refY = doc.y + 8;
  doc.font(SANS).fontSize(7.5);
  const refLabel = strings.documentReference.toUpperCase();
  const refLabelW = doc.widthOfString(refLabel);
  doc.font(MONO_BOLD).fontSize(8);
  const refCodeW = doc.widthOfString(data.experienceRegistryId);
  const refRowW = refLabelW + 6 + refCodeW;
  const refRowX = ML + (CONTENT_W - refRowW) / 2;
  doc
    .font(SANS)
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(refLabel, refRowX, refY + 4, { width: refLabelW, align: 'left' });
  doc
    .font(MONO_BOLD)
    .fontSize(8)
    .fillColor(INK)
    .text(data.experienceRegistryId, refRowX + refLabelW + 6, refY + 3.5, {
      width: refCodeW,
      align: 'left',
    });
  doc.y = refY + 26;
  doc
    .font(SANS)
    .fontSize(9)
    .fillColor(MUTED)
    .text(strings.intro(data.platformName), ML + 40, doc.y, {
      width: CONTENT_W - 80,
      align: 'center',
    });
  doc.y += 18;

  // ---- Verification Record Details card (reference facts table).
  type CardRow = {
    label: string;
    measure: () => number;
    draw: (x: number, y: number, valueX: number, valueW: number) => number;
  };
  const labelW = 120;
  const valueX = ML + 16 + labelW + 12;
  const valueW = ML + CONTENT_W - 16 - valueX;

  const measure = (
    text: string,
    font: string,
    size: number,
    width: number,
  ): number => {
    doc.font(font).fontSize(size);
    return doc.heightOfString(text, { width });
  };
  const rows: CardRow[] = [];
  // Volunteer row: name + VOL registry id as plain text (no chips).
  const volunteerLine = hasVolunteerId
    ? `${data.volunteerName}  ${data.volunteerRegistryId}`
    : data.volunteerName;
  rows.push({
    label: strings.volunteer,
    measure: () => measure(volunteerLine, SANS_BOLD, 10.5, valueW),
    draw: (x, y, vx, vw) => {
      doc
        .font(SANS_BOLD)
        .fontSize(10.5)
        .fillColor(INK)
        .text(data.volunteerName, vx, y, {
          width: vw,
          align: 'left',
          continued: hasVolunteerId,
        });
      if (hasVolunteerId) {
        doc
          .font(MONO)
          .fontSize(8)
          .fillColor(MUTED)
          .text(`  ${data.volunteerRegistryId}`);
      }
      return doc.y - y;
    },
  });

  // Experience row: contracted title field the reference mock omits.
  rows.push({
    label: strings.experience,
    measure: () => measure(data.experienceTitle, SANS_BOLD, 9.5, valueW),
    draw: (x, y, vx, vw) => {
      const h = measure(data.experienceTitle, SANS_BOLD, 9.5, vw);
      doc
        .font(SANS_BOLD)
        .fontSize(9.5)
        .fillColor(INK)
        .text(data.experienceTitle, vx, y, { width: vw, align: 'left' });
      return h;
    },
  });

  // Organization row: name + ORG registry id as plain text + slug line.
  const orgLine = hasOrgId
    ? `${data.organizationName}  ${data.organizationRegistryId}`
    : data.organizationName;
  rows.push({
    label: strings.organization,
    measure: () => {
      let h = measure(orgLine, SANS_BOLD, 9.5, valueW);
      if (hasSlug) {
        h += 2 + measure(data.organizationSlug, MONO, 7.5, valueW);
      }
      return h;
    },
    draw: (x, y, vx, vw) => {
      doc
        .font(SANS_BOLD)
        .fontSize(9.5)
        .fillColor(INK)
        .text(data.organizationName, vx, y, {
          width: vw,
          align: 'left',
          continued: hasOrgId,
        });
      if (hasOrgId) {
        doc
          .font(MONO)
          .fontSize(7.5)
          .fillColor(MUTED)
          .text(`  ${data.organizationRegistryId}`);
      }
      if (hasSlug) {
        doc
          .font(MONO)
          .fontSize(7.5)
          .fillColor(MUTED)
          .text(data.organizationSlug, vx, doc.y + 2, {
            width: vw,
            align: 'left',
          });
      }
      return doc.y - y;
    },
  });

  // Position row: omitted when the payload carries no position title.
  if (data.positionTitle && data.positionTitle.trim().length > 0) {
    const positionTitle = data.positionTitle.trim();
    rows.push({
      label: strings.position,
      measure: () => measure(positionTitle, SANS, 9, valueW),
      draw: (x, y, vx, vw) => {
        const h = measure(positionTitle, SANS, 9, vw);
        doc
          .font(SANS)
          .fontSize(9)
          .fillColor(INK)
          .text(positionTitle, vx, y, { width: vw, align: 'left' });
        return h;
      },
    });
  }

  // Duration row: hours-first reference style over the real minute value.
  rows.push({
    label: strings.duration,
    measure: () => {
      const { lead, rest } = formatDurationLead(data.durationMinutes, strings);
      return Math.max(measure(`${lead}${rest}`, SANS, 9, valueW), 12);
    },
    draw: (x, y, vx, vw) => {
      const { lead, rest } = formatDurationLead(data.durationMinutes, strings);
      const full = `${lead}${rest}`;
      const h = measure(full, SANS, 9, vw);
      doc
        .font(SANS_BOLD)
        .fontSize(9.5)
        .fillColor(INK)
        .text(lead, vx, y, {
          width: vw,
          align: 'left',
          continued: rest.length > 0,
        });
      if (rest.length > 0) {
        doc.font(SANS).fontSize(8.5).fillColor(MUTED).text(rest);
      }
      return Math.max(h, 12);
    },
  });

  // Verified-on row: long date + plain sign-off note (no badge).
  const signedOffFits = (width: number): boolean => {
    doc.font(SANS_BOLD).fontSize(9.5);
    const dateW = doc.widthOfString(formatLongDate(data.verifiedOn, data.lang));
    doc.font(SANS).fontSize(7.5);
    const signW = doc.widthOfString(strings.signedOff);
    return dateW + 6 + signW <= width;
  };
  rows.push({
    label: strings.verifiedOn,
    measure: () => {
      const dateH = measure(
        formatLongDate(data.verifiedOn, data.lang),
        SANS_BOLD,
        9.5,
        valueW,
      );
      if (signedOffFits(valueW)) {
        return Math.max(dateH, 12);
      }
      return dateH + 3 + measure(strings.signedOff, SANS, 7.5, valueW);
    },
    draw: (x, y, vx, vw) => {
      const longDate = formatLongDate(data.verifiedOn, data.lang);
      const sameLine = signedOffFits(vw);
      doc.font(SANS_BOLD).fontSize(9.5).fillColor(INK).text(longDate, vx, y, {
        width: vw,
        align: 'left',
        continued: sameLine,
      });
      if (sameLine) {
        doc
          .font(SANS)
          .fontSize(7.5)
          .fillColor(MUTED)
          .text(`      ${strings.signedOff}`);
      } else {
        doc
          .font(SANS)
          .fontSize(7.5)
          .fillColor(MUTED)
          .text(strings.signedOff, vx, doc.y + 3, {
            width: vw,
            align: 'left',
          });
      }
      return doc.y - y;
    },
  });

  const rowPadTop = 8;
  const rowPadBottom = 8;
  const cardHeaderH = 28;
  const rowHeights = rows.map((row) => row.measure());
  const cardH =
    cardHeaderH +
    rowHeights.reduce((sum, h) => sum + rowPadTop + h + rowPadBottom, 0) +
    6;
  ensureSpace(cardH + 24);
  const cardY = doc.y;
  doc
    .roundedRect(ML, cardY, CONTENT_W, cardH, CARD_RADIUS)
    .fillAndStroke(CARD_BG, BORDER);
  doc
    .font(SANS_BOLD)
    .fontSize(7)
    .fillColor(MUTED)
    .text(strings.recordDetails.toUpperCase(), ML + 16, cardY + 10, {
      width: 260,
      align: 'left',
    });
  doc
    .font(SANS)
    .fontSize(7)
    .fillColor(MUTED)
    .text(strings.standardFormat, ML + CONTENT_W - 216, cardY + 10, {
      width: 200,
      align: 'right',
    });
  rule(ML, ML + CONTENT_W, cardY + cardHeaderH, BORDER, 0.75);

  let rowY = cardY + cardHeaderH;
  rows.forEach((row, index) => {
    const contentY = rowY + rowPadTop;
    doc
      .font(SANS)
      .fontSize(7)
      .fillColor(MUTED)
      .text(row.label.toUpperCase(), ML + 16, contentY + 2, {
        width: labelW,
        align: 'left',
      });
    const used = row.draw(ML, contentY, valueX, valueW);
    const rowBottom =
      contentY + Math.max(used, rowHeights[index]) + rowPadBottom;
    if (index < rows.length - 1) {
      rule(ML + 16, ML + CONTENT_W - 16, rowBottom, BORDER, 0.5);
    }
    rowY = rowBottom;
  });
  doc.y = cardY + cardH + 18;

  // ---- Experience description: quoted excerpt card (reference narrative).
  if (description.length > 0) {
    doc.font(SERIF_ITALIC).fontSize(9.5);
    const bodyH = doc.heightOfString(`"${description}"`, {
      width: CONTENT_W - 58,
    });
    const quoteH = 30 + bodyH + 16;
    ensureSpace(quoteH + 18);
    const quoteY = doc.y;
    doc
      .roundedRect(ML, quoteY, CONTENT_W, quoteH, CARD_RADIUS)
      .fillAndStroke('#FFFFFF', BORDER);
    doc
      .font(SANS_BOLD)
      .fontSize(7)
      .fillColor(MUTED)
      .text(strings.experienceDescription.toUpperCase(), ML + 16, quoteY + 12, {
        width: CONTENT_W - 32,
        align: 'left',
      });
    const textY = quoteY + 30;
    doc.rect(ML + 16, textY, 2.5, bodyH).fill(VIOLET);
    doc
      .font(SERIF_ITALIC)
      .fontSize(9.5)
      .fillColor(BODY)
      .text(`"${description}"`, ML + 26, textY, {
        width: CONTENT_W - 58,
        align: 'left',
      });
    doc.y = quoteY + quoteH + 18;
  }

  // ---- Deliverables / Skills two-column cards (plain text lines, no chips).
  if (deliverables.length > 0 || skillNames.length > 0) {
    const gap = 12;
    const twoCol = deliverables.length > 0 && skillNames.length > 0;
    const colW = twoCol ? (CONTENT_W - gap) / 2 : CONTENT_W;

    const innerW = colW - 32;
    const measureItems = (
      items: string[],
    ): { heights: number[]; total: number } => {
      const heights = items.map((item) =>
        measure(`– ${item}`, SANS, 8, innerW),
      );
      return {
        heights,
        total: heights.reduce((sum, h) => sum + h, 0) + 4 * (items.length - 1),
      };
    };

    const left =
      deliverables.length > 0
        ? {
            title: strings.deliverables,
            items: deliverables,
            ...measureItems(deliverables),
          }
        : null;
    const right =
      skillNames.length > 0
        ? {
            title: strings.skills,
            items: skillNames,
            ...measureItems(skillNames),
          }
        : null;
    const cards = [left, right].filter(
      (card): card is NonNullable<typeof card> => card !== null,
    );
    const gridH = Math.max(...cards.map((card) => card.total)) + 44;
    ensureSpace(gridH + 18);
    const gridY = doc.y;

    const drawGroup = (gx: number, card: (typeof cards)[number]): void => {
      doc
        .roundedRect(gx, gridY, colW, gridH, CARD_RADIUS)
        .fillAndStroke('#FFFFFF', BORDER);
      doc
        .font(SANS)
        .fontSize(7)
        .fillColor(MUTED)
        .text(card.title.toUpperCase(), gx + 16, gridY + 12, {
          width: colW - 32,
          align: 'left',
        });
      let lineY = gridY + 32;
      card.items.forEach((item, index) => {
        doc
          .font(SANS)
          .fontSize(8)
          .fillColor(BODY)
          .text(`– ${item}`, gx + 16, lineY, {
            width: colW - 32,
            align: 'left',
          });
        lineY += card.heights[index] + 4;
      });
    };

    if (twoCol && left && right) {
      drawGroup(ML, left);
      drawGroup(ML + colW + gap, right);
    } else {
      drawGroup(ML, cards[0]);
    }
    doc.y = gridY + gridH + 18;
  }

  // ---- Bottom section: sign-off + verification-code box, then footer.
  const leftW = CONTENT_W * 0.56;
  const boxW = CONTENT_W - leftW - 16;
  const boxX = ML + leftW + 16;
  const verifiedByLine = strings.verifiedBy(
    data.organizationName,
    formatLongDate(data.verifiedOn, data.lang),
    data.verificationCode,
  );
  const boxH = 108;
  const leftH =
    9 +
    16 +
    measure(data.organizationName, SANS_BOLD, 11, leftW) +
    4 +
    measure(verifiedByLine, SANS, 8, leftW) +
    10 +
    14 +
    4;
  // Footer needs ~40pt after the block; the whole tail moves as one unit so
  // long names never clip past the page edge.
  ensureSpace(Math.max(leftH, boxH) + 14 + 40);
  rule(ML, ML + CONTENT_W, doc.y, BORDER, 0.75);
  doc.y += 14;
  const bottomY = doc.y;

  doc
    .font(SANS_BOLD)
    .fontSize(7)
    .fillColor(MUTED)
    .text(strings.attestingOrganization.toUpperCase(), ML, bottomY, {
      width: leftW,
      align: 'left',
    });
  doc
    .font(SANS_BOLD)
    .fontSize(11)
    .fillColor(INK)
    .text(data.organizationName, ML, bottomY + 16, {
      width: leftW,
      align: 'left',
    });
  doc
    .font(SANS)
    .fontSize(8)
    .fillColor(MUTED)
    .text(verifiedByLine, ML, doc.y + 4, { width: leftW, align: 'left' });
  const dashY = doc.y + 10;
  doc.save();
  doc.dash(4, { space: 3 });
  doc
    .moveTo(ML, dashY)
    .lineTo(ML + leftW, dashY)
    .lineWidth(0.5)
    .strokeColor(BORDER)
    .stroke();
  doc.undash();
  doc.restore();
  doc
    .font(SANS)
    .fontSize(7.5)
    .fillColor(BODY)
    .text(strings.digitalRecord, ML, dashY + 8, {
      width: leftW,
      align: 'left',
    });
  const leftBottom = doc.y + 4;

  const path = verifyPath(data.verificationCode);
  doc.font(MONO_BOLD).fontSize(11);
  const codeW = doc.widthOfString(data.verificationCode) + 32;
  const innerW = Math.min(Math.max(codeW, 150), boxW - 32);
  doc
    .roundedRect(boxX, bottomY, boxW, boxH, CARD_RADIUS)
    .fillAndStroke(CARD_BG, BORDER);
  doc
    .font(SANS_BOLD)
    .fontSize(7)
    .fillColor(MUTED)
    .text(strings.verificationCode.toUpperCase(), boxX + 16, bottomY + 12, {
      width: boxW - 32,
      align: 'left',
    });
  const innerX = boxX + (boxW - innerW) / 2;
  const innerY = bottomY + 30;
  doc
    .roundedRect(innerX, innerY, innerW, 24, INNER_RADIUS)
    .fillAndStroke('#FFFFFF', BORDER);
  doc
    .font(MONO_BOLD)
    .fontSize(11)
    .fillColor(INK)
    .text(data.verificationCode, innerX, innerY + 6, {
      width: innerW,
      align: 'center',
      characterSpacing: 1,
    });
  doc
    .font(MONO)
    .fontSize(7.5)
    .fillColor(BODY)
    .text(path, boxX + 16, innerY + 30, {
      width: boxW - 32,
      align: 'center',
    });
  doc
    .font(SANS)
    .fontSize(7)
    .fillColor(MUTED)
    .text(strings.verifyHint, boxX + 16, innerY + 42, {
      width: boxW - 32,
      align: 'center',
    });

  doc.y = Math.max(leftBottom, bottomY + boxH) + 14;
  rule(ML, ML + CONTENT_W, doc.y, BORDER, 0.5);
  doc
    .font(SANS)
    .fontSize(7.5)
    .fillColor(MUTED)
    .text(strings.footerNote(data.platformName), ML, doc.y + 8, {
      width: CONTENT_W,
      align: 'center',
    });

  // Keep the cursor honest for any downstream piping.
  doc.y += 4;

  return doc;
}
