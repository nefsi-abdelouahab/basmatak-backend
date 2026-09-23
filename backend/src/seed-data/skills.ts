/**
 * Default skill catalog for Basmatak (project document, confirmed session).
 *
 * Categories: the 7 confirmed volunteer-skill categories from the project
 *   document (bilingual Arabic + French). Slugs are canonical slugify outputs
 *   (ASCII transliteration) and are the upsert keys for the idempotent seed
 *   scripts. Skills: the confirmed starter set (>= 3 per category).
 * Re-seeding prunes rows whose slug is no longer in the catalog (see
 *   `pruneSkillCatalog` in seed.utils.ts).
 */

export interface SkillCategorySeed {
  slug: string;
  nameAr: string;
  nameFr: string;
  order: number;
}

export interface SkillSeed {
  categorySlug: string;
  slug: string;
  nameAr: string;
  nameFr: string;
  order: number;
}

export const SKILL_CATEGORY_SEEDS: SkillCategorySeed[] = [
  {
    slug: 'media-content',
    nameAr: 'الإعلام وصناعة المحتوى',
    nameFr: 'Médias & Production de Contenu',
    order: 1,
  },
  {
    slug: 'hosting-presenting',
    nameAr: 'التنشيط والتقديم',
    nameFr: 'Animation & Présentation',
    order: 2,
  },
  {
    slug: 'design',
    nameAr: 'التصميم',
    nameFr: 'Design',
    order: 3,
  },
  {
    slug: 'training-education',
    nameAr: 'التدريب والتعليم',
    nameFr: 'Formation & Éducation',
    order: 4,
  },
  {
    slug: 'organization-logistics',
    nameAr: 'التنظيم واللوجستيك',
    nameFr: 'Organisation & Logistique',
    order: 5,
  },
  {
    slug: 'environment-field',
    nameAr: 'البيئة والمبادرات الميدانية',
    nameFr: 'Environnement & Initiatives Terrain',
    order: 6,
  },
  {
    slug: 'other',
    nameAr: 'مهارات أخرى',
    nameFr: 'Autres Compétences',
    order: 7,
  },
];

export const SKILL_SEEDS: SkillSeed[] = [
  {
    categorySlug: 'media-content',
    slug: 'photographie',
    nameAr: 'تصوير',
    nameFr: 'Photographie',
    order: 1,
  },
  {
    categorySlug: 'media-content',
    slug: 'montage',
    nameAr: 'مونتاج',
    nameFr: 'Montage',
    order: 2,
  },
  {
    categorySlug: 'media-content',
    slug: 'redaction',
    nameAr: 'كتابة',
    nameFr: 'Rédaction',
    order: 3,
  },
  {
    categorySlug: 'media-content',
    slug: 'gestion-des-pages',
    nameAr: 'إدارة صفحات',
    nameFr: 'Gestion des pages',
    order: 4,
  },
  {
    categorySlug: 'hosting-presenting',
    slug: 'presentation',
    nameAr: 'تقديم',
    nameFr: 'Présentation',
    order: 1,
  },
  {
    categorySlug: 'hosting-presenting',
    slug: 'animation',
    nameAr: 'تنشيط',
    nameFr: 'Animation',
    order: 2,
  },
  {
    categorySlug: 'hosting-presenting',
    slug: 'communication',
    nameAr: 'تواصل',
    nameFr: 'Communication',
    order: 3,
  },
  {
    categorySlug: 'design',
    slug: 'design-daffiches',
    nameAr: 'ملصقات',
    nameFr: "Design d'affiches",
    order: 1,
  },
  {
    categorySlug: 'design',
    slug: 'identite-visuelle',
    nameAr: 'هوية بصرية',
    nameFr: 'Identité visuelle',
    order: 2,
  },
  {
    categorySlug: 'design',
    slug: 'conception-de-publications',
    nameAr: 'منشورات',
    nameFr: 'Conception de publications',
    order: 3,
  },
  {
    categorySlug: 'training-education',
    slug: 'encadrement',
    nameAr: 'تأطير',
    nameFr: 'Encadrement',
    order: 1,
  },
  {
    categorySlug: 'training-education',
    slug: 'soutien-scolaire',
    nameAr: 'دعم دراسي',
    nameFr: 'Soutien scolaire',
    order: 2,
  },
  {
    categorySlug: 'training-education',
    slug: 'ateliers',
    nameAr: 'ورشات',
    nameFr: 'Ateliers',
    order: 3,
  },
  {
    categorySlug: 'organization-logistics',
    slug: 'accueil',
    nameAr: 'استقبال',
    nameFr: 'Accueil',
    order: 1,
  },
  {
    categorySlug: 'organization-logistics',
    slug: 'organisation',
    nameAr: 'تنظيم',
    nameFr: 'Organisation',
    order: 2,
  },
  {
    categorySlug: 'organization-logistics',
    slug: 'coordination',
    nameAr: 'تنسيق',
    nameFr: 'Coordination',
    order: 3,
  },
  {
    categorySlug: 'environment-field',
    slug: 'reboisement',
    nameAr: 'تشجير',
    nameFr: 'Reboisement',
    order: 1,
  },
  {
    categorySlug: 'environment-field',
    slug: 'nettoyage',
    nameAr: 'نظافة',
    nameFr: 'Nettoyage',
    order: 2,
  },
  {
    categorySlug: 'environment-field',
    slug: 'campagnes-de-sensibilisation',
    nameAr: 'حملات توعوية',
    nameFr: 'Campagnes de sensibilisation',
    order: 3,
  },
  {
    categorySlug: 'other',
    slug: 'programmation',
    nameAr: 'برمجة',
    nameFr: 'Programmation',
    order: 1,
  },
  {
    categorySlug: 'other',
    slug: 'traduction',
    nameAr: 'ترجمة',
    nameFr: 'Traduction',
    order: 2,
  },
  {
    categorySlug: 'other',
    slug: 'sport',
    nameAr: 'رياضة',
    nameFr: 'Sport',
    order: 3,
  },
];
