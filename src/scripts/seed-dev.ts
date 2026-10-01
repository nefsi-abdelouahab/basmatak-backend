import * as bcrypt from 'bcrypt';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AdminOrganizationsService } from '../admin/organizations.service';
import { AccountToken } from '../common/interfaces/account-token.interface';
import { AppModule } from '../app.module';
import {
  ApplicationsCollection,
  ApplicationModel,
} from '../applications/schemas/application.schema';
import { ApplicationsService } from '../applications/applications.service';
import {
  FavoritesCollection,
  FavoriteModel,
} from '../favorites/schemas/favorite.schema';
import { FavoritesService } from '../favorites/favorites.service';
import {
  LocationsCollection,
  LocationModel,
} from '../locations/schemas/location.schema';
import { MediaCollection, MediaModel } from '../media/schemas/media.schema';
import { MediaPurpose } from '../media/media.constants';
import {
  OpportunitiesCollection,
  OpportunityModel,
} from '../opportunities/schemas/opportunity.schema';
import { OpportunitiesService } from '../opportunities/opportunities.service';
import { UpdateOrganizationDto } from '../organizations/dto/organization.dto';
import { OrganizationRegistrationExtrasService } from '../organizations/organization-registration-extras.service';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  OrganizationModel,
  OrganizationsCollection,
} from '../organizations/schemas/organization.schema';
import {
  OrganizationVerificationModel,
  OrganizationVerificationsCollection,
} from '../organizations/schemas/organization-verification.schema';
import {
  PortfolioItemsCollection,
  PortfolioItemModel,
} from '../portfolio/schemas/portfolio-item.schema';
import { PortfolioService } from '../portfolio/portfolio.service';
import {
  ReviewModel,
  ReviewsCollection,
} from '../reviews/review.schema';
import {
  SkillCategoriesCollection,
  SkillCategoryModel,
} from '../skills/schemas/skill-category.schema';
import { SkillModel, SkillsCollection } from '../skills/schemas/skill.schema';
import {
  SubmissionModel,
  SubmissionsCollection,
} from '../submissions/schemas/submission.schema';
import { SubmissionsService } from '../submissions/submissions.service';
import {
  TaskParticipantModel,
  TaskParticipantsCollection,
} from '../participations/schemas/task-participant.schema';
import { UsersService } from '../users/users.service';
import { UserModel } from '../users/schemas/user.schema';
import { UpdateVolunteerProfileDto } from '../volunteers/dto/volunteer-profile.dto';
import {
  VolunteerProfileModel,
  VolunteerProfilesCollection,
} from '../volunteers/schemas/volunteer-profile.schema';
import { WeeklySchedule } from '../volunteers/schemas/volunteer-availability.schema';
import {
  VolunteerSkillModel,
  VolunteerSkillsCollection,
} from '../volunteers/schemas/volunteer-skill.schema';
import { VolunteerRegistrationExtrasService } from '../volunteers/volunteer-registration-extras.service';
import { VolunteersService } from '../volunteers/volunteers.service';
import {
  VerificationModel,
  VerificationsCollection,
} from '../verifications/schemas/verification.schema';
import { VerificationsService } from '../verifications/verifications.service';
import {
  VolunteerExperienceModel,
  VolunteerExperiencesCollection,
} from '../verifications/schemas/volunteer-experience.schema';
import { ExperiencesService } from '../verifications/experiences.service';
import { adminSeedEnv, upsertAdmin } from './seed-admin';

/**
 * Comprehensive development seed (dev-*@basmatak.test).
 *
 * Every row is created through the REAL service paths used by the
 * application (registration extras, submitVerification/admin approve,
 * updateOwn/updateProfile, addSkill/setAvailability, create/publish/close,
 * apply/startReview/accept/reject/withdraw, createForParticipation/
 * updateDraft/submit, verify, saveOpportunity/saveTalent, portfolio.create).
 * The only direct model writes are `media` metadata rows (there is no
 * service path for seeding remote-URL media), following the seed-demo
 * convention. Remote image URLs are real, publicly reachable files; PDF
 * evidence/verification rows are fictional dev placeholders like the demo
 * seed's own verification PDF.
 *
 * Idempotent: every creation is guarded by a stable-key lookup (email,
 * userId, title, position+volunteer, participantId, submissionId, media
 * owner+purpose+url/filename), and every status transition is guarded by the
 * current status. Re-running changes nothing.
 */

export const DEV_PASSWORD = 'DevSeed123!';

/* ------------------------------------------------------------------ media */

const AVATARS: Record<string, string> = {
  yasmine: 'https://randomuser.me/api/portraits/women/44.jpg',
  amine: 'https://randomuser.me/api/portraits/men/32.jpg',
  sara: 'https://randomuser.me/api/portraits/women/68.jpg',
  karim: 'https://randomuser.me/api/portraits/men/75.jpg',
  lina: 'https://randomuser.me/api/portraits/women/12.jpg',
  omar: 'https://randomuser.me/api/portraits/men/52.jpg',
  nadia: 'https://randomuser.me/api/portraits/women/29.jpg',
  riad: 'https://randomuser.me/api/portraits/men/18.jpg',
};

function picsum(seed: string, w: number, h: number): string {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

/* ------------------------------------------------------------------ orgs */

interface DevOrgSpec {
  key: string;
  email: string;
  phone: string;
  nameAr: string;
  nameFr: string;
  description: string;
  type: string;
  registrationNumber: string;
  wilayaId: string;
  municipalityId: string;
  address: string;
  website: string;
  foundedYear: number;
  contactPhone: string;
  focusCategories: string[];
  operatingScope: string;
  verified: boolean;
  annualReport: boolean;
}

const ORG_SPECS: DevOrgSpec[] = [
  {
    key: 'nour',
    email: 'dev-org-nour@basmatak.test',
    phone: '+213770000101',
    nameAr: 'جمعية نور للتضامن',
    nameFr: 'Association Nour de Solidarité',
    description:
      'Association caritative algéroise : distributions alimentaires, vestiaires solidaires et actions de proximité pendant le Ramadan et l’hiver.',
    type: 'Association caritative',
    registrationNumber: 'W16-2012-0042',
    wilayaId: '16',
    municipalityId: '1601',
    address: '12 rue des Frères Bouadou, Alger Centre',
    website: 'https://nour-solidarite-dev.example.org',
    foundedYear: 2012,
    contactPhone: '+213234567801',
    focusCategories: ['organization-logistics', 'environment-field'],
    operatingScope: 'Alger et environs',
    verified: true,
    annualReport: true,
  },
  {
    key: 'amal',
    email: 'dev-org-amal@basmatak.test',
    phone: '+213770000102',
    nameAr: 'جمعية الأمل للشباب',
    nameFr: 'Association Amal des Jeunes',
    description:
      'Association de jeunesse oranaise : mentorat, culture urbaine et grands événements solidaires portés par des bénévoles de 18 à 30 ans.',
    type: 'Association de jeunesse',
    registrationNumber: 'W31-2015-0117',
    wilayaId: '31',
    municipalityId: '3101',
    address: '8 boulevard de l’ALN, Oran',
    website: 'https://amal-jeunes-dev.example.org',
    foundedYear: 2015,
    contactPhone: '+213234567802',
    focusCategories: ['hosting-presenting', 'design', 'other'],
    operatingScope: 'Oranie',
    verified: true,
    annualReport: false,
  },
  {
    key: 'green',
    email: 'dev-org-green@basmatak.test',
    phone: '+213770000103',
    nameAr: 'مبادرة خضراء للبيئة',
    nameFr: 'Initiative Green Environnement',
    description:
      'Initiative environnementale sétifienne : reboisement urbain, nettoyage des quartiers et ateliers de sensibilisation au tri.',
    type: 'Initiative environnementale',
    registrationNumber: 'W19-2018-0233',
    wilayaId: '19',
    municipalityId: '1901',
    address: 'Cité Maabouda, Sétif',
    website: 'https://green-env-dev.example.org',
    foundedYear: 2018,
    contactPhone: '+213234567803',
    focusCategories: ['environment-field', 'training-education'],
    operatingScope: 'Hauts Plateaux',
    verified: true,
    annualReport: false,
  },
  {
    key: 'tutor',
    email: 'dev-org-tutor@basmatak.test',
    phone: '+213770000104',
    nameAr: 'أكاديمية المعرفة للتطوع',
    nameFr: 'Académie du Savoir Bénévole',
    description:
      'Organisation éducative constantinoise : soutien scolaire gratuit, aide aux examens et production de contenus pédagogiques en arabe et en français.',
    type: 'Organisation éducative',
    registrationNumber: 'W25-2010-0089',
    wilayaId: '25',
    municipalityId: '2501',
    address: 'Rue Larbi Ben M’hidi, Constantine',
    website: 'https://savoir-benevole-dev.example.org',
    foundedYear: 2010,
    contactPhone: '+213234567804',
    focusCategories: ['training-education', 'media-content', 'other'],
    operatingScope: 'Est algérien',
    verified: true,
    annualReport: true,
  },
  {
    key: 'sante',
    email: 'dev-org-sante@basmatak.test',
    phone: '+213770000105',
    nameAr: 'جمعية الصحة للجميع',
    nameFr: 'Association Santé Pour Tous',
    description:
      'Jeune association de santé communautaire à Béjaïa : journées de dépistage, accueil des patients et caravanes de prévention.',
    type: 'Association de santé communautaire',
    registrationNumber: 'W06-2023-0007',
    wilayaId: '06',
    municipalityId: '0601',
    address: 'Rue Sidi Ahmed, Béjaïa',
    website: 'https://sante-pour-tous-dev.example.org',
    foundedYear: 2023,
    contactPhone: '+213234567805',
    focusCategories: ['organization-logistics'],
    operatingScope: 'Kabylie',
    verified: false,
    annualReport: false,
  },
];

/* -------------------------------------------------------------- volunteers */

interface DevVolunteerSpec {
  key: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  bio: string;
  birthDate: string;
  wilayaId: string;
  municipalityId: string;
  headline: string;
  availabilityNote: string;
  preferredDomains: string[];
  geographicBase: string;
  skills: Array<{ slug: string; level: number; years: number; primary: boolean }>;
  schedule: WeeklySchedule;
  publicProfile: {
    enabled?: boolean;
    showAvatar?: boolean;
    showBiography?: boolean;
    showLocation?: boolean;
    showSkills?: boolean;
    showExperiences?: boolean;
    showAvailability?: boolean;
    showPortfolio?: boolean;
    showStats?: boolean;
  };
}

function scheduleOf(
  days: Array<keyof WeeklySchedule>,
  from: string,
  to: string,
): WeeklySchedule {
  const base: WeeklySchedule = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
  for (const day of days) {
    base[day] = [{ from, to }];
  }
  return base;
}

const VOLUNTEER_SPECS: DevVolunteerSpec[] = [
  {
    key: 'yasmine',
    email: 'dev-yasmine@basmatak.test',
    phone: '+213660000101',
    firstName: 'Yasmine',
    lastName: 'Benali',
    bio: 'Étudiante en communication à Alger. J’aime photographier les actions solidaires et raconter les histoires des bénévoles.',
    birthDate: '2001-04-12',
    wilayaId: '16',
    municipalityId: '1601',
    headline: 'Photographe bénévole & storyteller',
    availabilityNote: 'Disponible les week-ends et deux soirs par semaine.',
    preferredDomains: ['solidarité', 'médias', 'événementiel'],
    geographicBase: 'Alger Centre',
    skills: [
      { slug: 'photographie', level: 4, years: 3, primary: true },
      { slug: 'redaction', level: 3, years: 2, primary: false },
      { slug: 'accueil', level: 3, years: 2, primary: false },
    ],
    schedule: scheduleOf(['tuesday', 'thursday'], '18:00', '21:00'),
    publicProfile: { showAvatar: true, showLocation: true, showAvailability: true },
  },
  {
    key: 'amine',
    email: 'dev-amine@basmatak.test',
    phone: '+213660000102',
    firstName: 'Amine',
    lastName: 'Kaci',
    bio: 'Développeur web à Oran. Je donne de mon temps pour initier les jeunes à la programmation et aux outils numériques.',
    birthDate: '1997-09-03',
    wilayaId: '31',
    municipalityId: '3101',
    headline: 'Mentor programmation & numérique',
    availabilityNote: 'Remote de préférence, soirs et week-ends.',
    preferredDomains: ['numérique', 'éducation', 'jeunesse'],
    geographicBase: 'Oran',
    skills: [
      { slug: 'programmation', level: 5, years: 5, primary: true },
      { slug: 'montage', level: 2, years: 1, primary: false },
    ],
    schedule: scheduleOf(['monday', 'wednesday', 'saturday'], '17:00', '20:00'),
    publicProfile: { showAvatar: true, showLocation: true },
  },
  {
    key: 'sara',
    email: 'dev-sara@basmatak.test',
    phone: '+213660000103',
    firstName: 'Sara',
    lastName: 'Boumediene',
    bio: 'Éducatrice à Sétif. J’anime des ateliers pour enfants et je participe aux campagnes de nettoyage de mon quartier.',
    birthDate: '1999-01-27',
    wilayaId: '19',
    municipalityId: '1901',
    headline: 'Animatrice d’ateliers & éco-bénévole',
    availabilityNote: 'Disponible samedis toute la journée.',
    preferredDomains: ['enfance', 'environnement'],
    geographicBase: 'Sétif',
    skills: [
      { slug: 'animation', level: 4, years: 4, primary: true },
      { slug: 'nettoyage', level: 3, years: 2, primary: false },
    ],
    schedule: scheduleOf(['saturday'], '09:00', '17:00'),
    publicProfile: { showAvatar: true, showLocation: true },
  },
  {
    key: 'karim',
    email: 'dev-karim@basmatak.test',
    phone: '+213660000104',
    firstName: 'Karim',
    lastName: 'Zerouki',
    bio: 'Professeur de mathématiques à Constantine. Je propose du soutien scolaire gratuit aux collégiens en difficulté.',
    birthDate: '1990-11-15',
    wilayaId: '25',
    municipalityId: '2501',
    headline: 'Prof de maths, soutien scolaire',
    availabilityNote: 'Soirs de semaine, présentiel ou visio.',
    preferredDomains: ['éducation', 'soutien scolaire'],
    geographicBase: 'Constantine',
    skills: [
      { slug: 'soutien-scolaire', level: 5, years: 8, primary: true },
      { slug: 'encadrement', level: 4, years: 6, primary: false },
    ],
    schedule: scheduleOf(['monday', 'tuesday', 'wednesday', 'thursday'], '18:00', '20:00'),
    publicProfile: { showLocation: true },
  },
  {
    key: 'lina',
    email: 'dev-lina@basmatak.test',
    phone: '+213660000105',
    firstName: 'Lina',
    lastName: 'Haddad',
    bio: 'Designer graphique à Béjaïa. Je crée des affiches et identités visuelles pour les associations locales.',
    birthDate: '2000-06-08',
    wilayaId: '06',
    municipalityId: '0601',
    headline: 'Designer bénévole',
    availabilityNote: 'Missions courtes, travail à distance.',
    preferredDomains: ['design', 'culture'],
    geographicBase: 'Béjaïa',
    skills: [
      { slug: 'design-daffiches', level: 4, years: 3, primary: true },
      { slug: 'identite-visuelle', level: 3, years: 2, primary: false },
      { slug: 'gestion-des-pages', level: 3, years: 2, primary: false },
    ],
    schedule: scheduleOf(['friday', 'sunday'], '10:00', '16:00'),
    publicProfile: { showAvatar: true },
  },
  {
    key: 'omar',
    email: 'dev-omar@basmatak.test',
    phone: '+213660000106',
    firstName: 'Omar',
    lastName: 'Belkacem',
    bio: 'Agent logistique à Annaba. J’aide à organiser les distributions et j’aime le travail d’équipe sur le terrain.',
    birthDate: '1995-02-20',
    wilayaId: '23',
    municipalityId: '2301',
    headline: 'Bénévole logistique terrain',
    availabilityNote: 'Disponible sur appel pour les urgences.',
    preferredDomains: ['logistique', 'terrain'],
    geographicBase: 'Annaba',
    skills: [
      { slug: 'organisation', level: 4, years: 4, primary: true },
      { slug: 'coordination', level: 3, years: 3, primary: false },
    ],
    schedule: scheduleOf([], '09:00', '18:00'),
    publicProfile: { showStats: false },
  },
  {
    key: 'nadia',
    email: 'dev-nadia@basmatak.test',
    phone: '+213660000107',
    firstName: 'Nadia',
    lastName: 'Cherif',
    bio: 'Traductrice à Blida. Je traduis les documents associatifs entre l’arabe et le français.',
    birthDate: '1993-08-30',
    wilayaId: '09',
    municipalityId: '0901',
    headline: 'Traductrice arabe-français',
    availabilityNote: 'Remote uniquement.',
    preferredDomains: ['traduction', 'éducation'],
    geographicBase: 'Blida',
    skills: [
      { slug: 'traduction', level: 5, years: 6, primary: true },
      { slug: 'redaction', level: 4, years: 4, primary: false },
    ],
    schedule: scheduleOf(['sunday'], '14:00', '18:00'),
    publicProfile: {},
  },
  {
    key: 'riad',
    email: 'dev-riad@basmatak.test',
    phone: '+213660000108',
    firstName: 'Riad',
    lastName: 'Mansouri',
    bio: 'Coach sportif à Tizi-Ouzou. J’anime des séances de sport pour les jeunes de mon village.',
    birthDate: '1998-12-05',
    wilayaId: '15',
    municipalityId: '1501',
    headline: 'Coach sportif bénévole',
    availabilityNote: 'Week-ends, plein air.',
    preferredDomains: ['sport', 'jeunesse'],
    geographicBase: 'Tizi-Ouzou',
    skills: [
      { slug: 'sport', level: 4, years: 5, primary: true },
      { slug: 'presentation', level: 2, years: 1, primary: false },
    ],
    schedule: scheduleOf([], '09:00', '18:00'),
    publicProfile: { enabled: false },
  },
];

/* ------------------------------------------------------------ opportunities */

interface DevPositionSpec {
  title: string;
  description: string;
  requiredCount: number;
  requiredSkillSlugs: string[];
  deliverables: string[];
  startOffsetDays?: number;
}

interface DevOpportunitySpec {
  key: string;
  orgKey: string;
  title: string;
  description: string;
  categorySlug: string;
  mode: 'onsite' | 'remote' | 'hybrid';
  wilayaId?: string;
  municipalityId?: string;
  coordinates?: [number, number];
  startOffsetDays: number;
  endOffsetDays: number;
  durationMinutes: number;
  prerequisites: string[];
  deadlineOffsetDays: number;
  positions: DevPositionSpec[];
  target: 'published' | 'closed' | 'draft' | 'completed';
}

const OPPORTUNITY_SPECS: DevOpportunitySpec[] = [
  {
    key: 'ramadan',
    orgKey: 'nour',
    title: 'Distribution de couffins Ramadan — Alger Centre',
    description:
      'Préparation et distribution de 400 couffins alimentaires aux familles démunies d’Alger Centre pendant le mois de Ramadan. Repas d’équipe offert chaque soir de distribution.',
    categorySlug: 'organization-logistics',
    mode: 'onsite',
    wilayaId: '16',
    municipalityId: '1601',
    coordinates: [3.0588, 36.7538],
    startOffsetDays: 21,
    endOffsetDays: 30,
    durationMinutes: 540,
    prerequisites: ['Être disponible au moins 3 soirs', 'Tenue de terrain'],
    deadlineOffsetDays: 60,
    positions: [
      {
        title: 'Distributeur bénévole',
        description: 'Accueil des familles et remise des couffins au point de distribution.',
        requiredCount: 6,
        requiredSkillSlugs: ['accueil', 'organisation'],
        deliverables: ['Distribution de 60 couffins par volontaire'],
        startOffsetDays: 21,
      },
      {
        title: 'Coordinateur logistique',
        description: 'Gestion des stocks, du planning des équipes et des tournées.',
        requiredCount: 2,
        requiredSkillSlugs: ['coordination'],
        deliverables: ['Planning des équipes', 'Inventaire final des stocks'],
        startOffsetDays: 19,
      },
    ],
    target: 'published',
  },
  {
    key: 'cleanup',
    orgKey: 'nour',
    title: 'Grand nettoyage de la promenade des Sablettes',
    description:
      'Journée citoyenne de nettoyage de la promenade des Sablettes : collecte des déchets, tri et sensibilisation des promeneurs.',
    categorySlug: 'environment-field',
    mode: 'onsite',
    wilayaId: '16',
    municipalityId: '1612',
    startOffsetDays: 35,
    endOffsetDays: 35,
    durationMinutes: 360,
    prerequisites: ['Gants et sacs fournis sur place'],
    deadlineOffsetDays: 60,
    positions: [
      {
        title: 'Éco-volontaire',
        description: 'Collecte et tri des déchets sur le parcours balisé.',
        requiredCount: 8,
        requiredSkillSlugs: ['nettoyage'],
        deliverables: ['Zone nettoyée et triée'],
        startOffsetDays: 35,
      },
      {
        title: 'Chef d’équipe',
        description: 'Encadrement d’un groupe de 8 volontaires et point de contact org.',
        requiredCount: 2,
        requiredSkillSlugs: ['coordination', 'encadrement'],
        deliverables: ['Rapport photo de la zone'],
        startOffsetDays: 35,
      },
    ],
    target: 'published',
  },
  {
    key: 'tutoring',
    orgKey: 'nour',
    title: 'Soutien scolaire gratuit — collégiens d’Alger',
    description:
      'Cours de soutien en mathématiques et en français pour collégiens, deux fois par semaine au centre de l’association ou en visio.',
    categorySlug: 'training-education',
    mode: 'hybrid',
    wilayaId: '16',
    municipalityId: '1602',
    startOffsetDays: 28,
    endOffsetDays: 120,
    durationMinutes: 2880,
    prerequisites: ['Niveau licence ou expérience d’enseignement'],
    deadlineOffsetDays: 75,
    positions: [
      {
        title: 'Tuteur bénévole',
        description: 'Accompagnement d’un groupe de 5 élèves en maths ou en français.',
        requiredCount: 5,
        requiredSkillSlugs: ['soutien-scolaire'],
        deliverables: ['Fiches de suivi des élèves'],
        startOffsetDays: 28,
      },
    ],
    target: 'published',
  },
  {
    key: 'coding',
    orgKey: 'amal',
    title: 'Mentorat bootcamp code pour jeunes — Oran',
    description:
      'Bootcamp intensif de 6 semaines : HTML, CSS et JavaScript pour 20 jeunes oranais. Les mentors animent les ateliers et corrigent les projets.',
    categorySlug: 'other',
    mode: 'remote',
    startOffsetDays: 42,
    endOffsetDays: 84,
    durationMinutes: 3600,
    prerequisites: ['2 ans d’expérience en développement web', 'Connexion stable'],
    deadlineOffsetDays: 90,
    positions: [
      {
        title: 'Mentor code',
        description: 'Animation de 2 ateliers par semaine et revue des projets.',
        requiredCount: 4,
        requiredSkillSlugs: ['programmation'],
        deliverables: ['Projets étudiants évalués'],
        startOffsetDays: 42,
      },
    ],
    target: 'published',
  },
  {
    key: 'mural',
    orgKey: 'amal',
    title: 'Fresque murale participative — quartier USTO',
    description:
      'Réalisation d’une fresque murale de 40 mètres avec les habitants du quartier USTO : dessin, peinture et vernissage festif.',
    categorySlug: 'design',
    mode: 'onsite',
    wilayaId: '31',
    municipalityId: '3101',
    startOffsetDays: 49,
    endOffsetDays: 52,
    durationMinutes: 960,
    prerequisites: ['Aucune expérience requise, tablier fourni'],
    deadlineOffsetDays: 90,
    positions: [
      {
        title: 'Peintre muraliste bénévole',
        description: 'Peinture de la fresque d’après la maquette collective.',
        requiredCount: 2,
        requiredSkillSlugs: ['design-daffiches'],
        deliverables: ['Panneau de fresque terminé'],
        startOffsetDays: 49,
      },
    ],
    target: 'published',
  },
  {
    key: 'gala',
    orgKey: 'amal',
    title: 'Soirée de gala caritative — animateurs',
    description:
      'Animation de la soirée de gala annuelle : accueil des invités, présentation des lots de la tombola et ambiance musicale.',
    categorySlug: 'hosting-presenting',
    mode: 'onsite',
    wilayaId: '31',
    municipalityId: '3101',
    startOffsetDays: 70,
    endOffsetDays: 70,
    durationMinutes: 300,
    prerequisites: ['Aisance à l’oral'],
    deadlineOffsetDays: 100,
    positions: [
      {
        title: 'Animateur de soirée',
        description: 'Présentation des séquences et interaction avec le public.',
        requiredCount: 3,
        requiredSkillSlugs: ['presentation', 'animation'],
        deliverables: ['Déroulé animé de la soirée'],
        startOffsetDays: 70,
      },
    ],
    target: 'closed',
  },
  {
    key: 'planting',
    orgKey: 'green',
    title: 'Campagne de reboisement urbain — Sétif',
    description:
      'Plantation de 500 arbres dans les nouveaux quartiers de Sétif avec arrosage de suivi pendant un mois.',
    categorySlug: 'environment-field',
    mode: 'onsite',
    wilayaId: '19',
    municipalityId: '1901',
    startOffsetDays: 56,
    endOffsetDays: 86,
    durationMinutes: 1440,
    prerequisites: ['Bonne condition physique'],
    deadlineOffsetDays: 90,
    positions: [
      {
        title: 'Planteur bénévole',
        description: 'Plantation et paillage des jeunes arbres.',
        requiredCount: 6,
        requiredSkillSlugs: ['reboisement'],
        deliverables: ['Parcelle plantée'],
        startOffsetDays: 56,
      },
      {
        title: 'Chauffeur arrosage',
        description: 'Tournées d’arrosage avec le camion-citerne de l’association.',
        requiredCount: 2,
        requiredSkillSlugs: ['coordination'],
        deliverables: ['Carnet de tournées'],
        startOffsetDays: 60,
      },
    ],
    target: 'published',
  },
  {
    key: 'recycling',
    orgKey: 'green',
    title: 'Ateliers tri et recyclage dans les écoles',
    description:
      'Tournée de 10 écoles primaires pour animer des ateliers ludiques sur le tri des déchets et le recyclage.',
    categorySlug: 'training-education',
    mode: 'hybrid',
    wilayaId: '19',
    municipalityId: '1901',
    startOffsetDays: 63,
    endOffsetDays: 100,
    durationMinutes: 1200,
    prerequisites: ['Goût du contact avec les enfants'],
    deadlineOffsetDays: 90,
    positions: [
      {
        title: 'Animateur atelier tri',
        description: 'Animation d’ateliers de 45 minutes par classe.',
        requiredCount: 4,
        requiredSkillSlugs: ['ateliers', 'campagnes-de-sensibilisation'],
        deliverables: ['10 ateliers animés'],
        startOffsetDays: 63,
      },
    ],
    target: 'published',
  },
  {
    key: 'park',
    orgKey: 'green',
    title: 'Restauration du jardin public du 8 Mai',
    description:
      'Week-end de restauration du jardin public : taille, peinture des bancs et installation de poubelles de tri.',
    categorySlug: 'environment-field',
    mode: 'onsite',
    wilayaId: '19',
    municipalityId: '1901',
    startOffsetDays: 90,
    endOffsetDays: 91,
    durationMinutes: 720,
    prerequisites: [],
    deadlineOffsetDays: 120,
    positions: [
      {
        title: 'Jardinier bénévole',
        description: 'Taille, désherbage et nouvelles plantations.',
        requiredCount: 5,
        requiredSkillSlugs: ['reboisement', 'nettoyage'],
        deliverables: ['Carré de jardin restauré'],
        startOffsetDays: 90,
      },
    ],
    target: 'draft',
  },
  {
    key: 'examprep',
    orgKey: 'tutor',
    title: 'Préparation aux examens — terminales scientifiques',
    description:
      'Révisions intensives du baccalauréat (maths, physique) pour 30 lycéens, en visio chaque soir pendant 5 semaines.',
    categorySlug: 'training-education',
    mode: 'remote',
    startOffsetDays: 32,
    endOffsetDays: 67,
    durationMinutes: 2100,
    prerequisites: ['Niveau master ou enseignant'],
    deadlineOffsetDays: 75,
    positions: [
      {
        title: 'Réviseur bac',
        description: 'Séances de révision et corrections d’annales.',
        requiredCount: 5,
        requiredSkillSlugs: ['soutien-scolaire', 'encadrement'],
        deliverables: ['Annales corrigées'],
        startOffsetDays: 32,
      },
    ],
    target: 'published',
  },
  {
    key: 'translation',
    orgKey: 'tutor',
    title: 'Sprint traduction de manuels — arabe/français',
    description:
      'Traduction bénévole de 6 manuels pédagogiques (arabe ↔ français) pour les écoles rurales partenaires.',
    categorySlug: 'other',
    mode: 'remote',
    startOffsetDays: 25,
    endOffsetDays: 80,
    durationMinutes: 2400,
    prerequisites: ['Bilinguisme arabe-français'],
    deadlineOffsetDays: 75,
    positions: [
      {
        title: 'Traducteur bénévole',
        description: 'Traduction d’un chapitre par semaine avec relecture croisée.',
        requiredCount: 3,
        requiredSkillSlugs: ['traduction'],
        deliverables: ['Chapitres traduits et relus'],
        startOffsetDays: 25,
      },
      {
        title: 'Relecteur',
        description: 'Relecture et harmonisation terminologique.',
        requiredCount: 2,
        requiredSkillSlugs: ['redaction', 'traduction'],
        deliverables: ['Glossaire harmonisé'],
        startOffsetDays: 30,
      },
    ],
    target: 'published',
  },
  {
    key: 'storytelling',
    orgKey: 'tutor',
    title: 'Récits photo des écoles rurales partenaires',
    description:
      'Reportage photo et rédactionnel dans 5 écoles rurales pour valoriser le travail des enseignants bénévoles.',
    categorySlug: 'media-content',
    mode: 'remote',
    startOffsetDays: 40,
    endOffsetDays: 75,
    durationMinutes: 1500,
    prerequisites: ['Appareil photo ou bon smartphone'],
    deadlineOffsetDays: 90,
    positions: [
      {
        title: 'Reporter bénévole',
        description: 'Reportage photo + article de 800 mots par école.',
        requiredCount: 3,
        requiredSkillSlugs: ['photographie', 'redaction'],
        deliverables: ['5 récits publiés'],
        startOffsetDays: 40,
      },
    ],
    target: 'published',
  },
  {
    key: 'blankets',
    orgKey: 'nour',
    title: 'Collecte hivernale de couvertures — Alger',
    description:
      'Collecte, lavage et redistribution de couvertures chaudes aux sans-abri d’Alger pendant la vague de froid.',
    categorySlug: 'organization-logistics',
    mode: 'onsite',
    wilayaId: '16',
    municipalityId: '1601',
    coordinates: [3.0588, 36.7538],
    startOffsetDays: 100,
    endOffsetDays: 130,
    durationMinutes: 1800,
    prerequisites: [],
    deadlineOffsetDays: 120,
    positions: [
      {
        title: 'Collecteur bénévole',
        description: 'Permanences de collecte et tri des dons.',
        requiredCount: 4,
        requiredSkillSlugs: ['accueil', 'organisation'],
        deliverables: ['Points de collecte tenus'],
        startOffsetDays: 100,
      },
    ],
    target: 'published',
  },
  {
    key: 'healthcamp',
    orgKey: 'sante',
    title: 'Journée de dépistage communautaire — Béjaïa',
    description:
      'Journée portes ouvertes de dépistage (tension, glycémie) avec orientation vers les centres de santé partenaires.',
    categorySlug: 'organization-logistics',
    mode: 'onsite',
    wilayaId: '06',
    municipalityId: '0601',
    startOffsetDays: 45,
    endOffsetDays: 45,
    durationMinutes: 420,
    prerequisites: ['Formation d’accueil de 2h'],
    deadlineOffsetDays: 75,
    positions: [
      {
        title: 'Agent d’accueil santé',
        description: 'Accueil, enregistrement et orientation des visiteurs.',
        requiredCount: 4,
        requiredSkillSlugs: ['accueil'],
        deliverables: ['Registre d’accueil tenu'],
        startOffsetDays: 45,
      },
    ],
    target: 'draft',
  },
  {
    key: 'summercamp',
    orgKey: 'amal',
    title: 'Colonie d’été — encadrement des 10-14 ans',
    description:
      'Colonie d’été de 10 jours à Oran pour 40 enfants : jeux, sorties plage et veillées. Mission déjà réalisée avec succès.',
    categorySlug: 'hosting-presenting',
    mode: 'onsite',
    wilayaId: '31',
    municipalityId: '3101',
    coordinates: [-0.6406, 35.6969],
    startOffsetDays: -12,
    endOffsetDays: -2,
    durationMinutes: 3600,
    prerequisites: ['BAFA ou équivalent apprécié'],
    deadlineOffsetDays: 90,
    positions: [
      {
        title: 'Animateur colonie',
        description: 'Encadrement d’un groupe de 10 enfants, jour et nuit.',
        requiredCount: 4,
        requiredSkillSlugs: ['animation', 'encadrement'],
        deliverables: ['Programme d’activités réalisé'],
        startOffsetDays: -12,
      },
    ],
    target: 'completed',
  },
];

/* ------------------------------------------------------------- applications */

interface DevApplicationSpec {
  volunteerKey: string;
  opportunityKey: string;
  positionIndex: number;
  message: string;
  outcome: 'pending' | 'under_review' | 'accepted' | 'rejected' | 'withdrawn';
  reason?: string;
}

const APPLICATION_SPECS: DevApplicationSpec[] = [
  { volunteerKey: 'yasmine', opportunityKey: 'ramadan', positionIndex: 0, message: 'Je souhaite aider aux distributions du soir après mes cours.', outcome: 'accepted' },
  { volunteerKey: 'yasmine', opportunityKey: 'mural', positionIndex: 0, message: 'Je peux documenter la fresque en photo en plus de peindre.', outcome: 'accepted' },
  { volunteerKey: 'yasmine', opportunityKey: 'storytelling', positionIndex: 0, message: 'Photographe amateur, ce reportage est fait pour moi.', outcome: 'pending' },
  { volunteerKey: 'amine', opportunityKey: 'coding', positionIndex: 0, message: 'Développeur depuis 5 ans, je veux transmettre aux jeunes d’Oran.', outcome: 'accepted' },
  { volunteerKey: 'amine', opportunityKey: 'translation', positionIndex: 0, message: 'Je peux aussi aider sur les outils numériques du projet.', outcome: 'accepted' },
  { volunteerKey: 'amine', opportunityKey: 'mural', positionIndex: 0, message: 'Disponible le week-end du vernissage.', outcome: 'accepted' },
  { volunteerKey: 'sara', opportunityKey: 'cleanup', positionIndex: 0, message: 'J’habite près des Sablettes et je viens avec des amies.', outcome: 'accepted' },
  { volunteerKey: 'sara', opportunityKey: 'storytelling', positionIndex: 0, message: 'Je peux photographier les écoles de ma région pour les récits.', outcome: 'pending' },
  { volunteerKey: 'karim', opportunityKey: 'tutoring', positionIndex: 0, message: 'Prof de maths, je prends un groupe de 5 élèves.', outcome: 'accepted' },
  { volunteerKey: 'karim', opportunityKey: 'examprep', positionIndex: 0, message: 'Je peux assurer les révisions de physique aussi.', outcome: 'pending' },
  { volunteerKey: 'lina', opportunityKey: 'planting', positionIndex: 0, message: 'Je veux troquer ma tablette contre une pelle le temps d’un mois.', outcome: 'accepted' },
  { volunteerKey: 'lina', opportunityKey: 'ramadan', positionIndex: 1, message: 'Je peux mettre en page le planning des équipes.', outcome: 'rejected', reason: 'Poste déjà pourvu par un bénévole confirmé.' },
  { volunteerKey: 'omar', opportunityKey: 'recycling', positionIndex: 0, message: 'Habitué des tournées, je connais les écoles du secteur.', outcome: 'accepted' },
  { volunteerKey: 'omar', opportunityKey: 'cleanup', positionIndex: 1, message: 'Je peux encadrer une équipe de 8 volontaires.', outcome: 'withdrawn' },
  { volunteerKey: 'nadia', opportunityKey: 'examprep', positionIndex: 0, message: 'Je peux relire les supports de cours avant diffusion.', outcome: 'under_review' },
  { volunteerKey: 'nadia', opportunityKey: 'translation', positionIndex: 1, message: 'Traductrice professionnelle, relecture dans mes cordes.', outcome: 'pending' },
  { volunteerKey: 'nadia', opportunityKey: 'summercamp', positionIndex: 0, message: 'Je peux animer les veillées contes du soir.', outcome: 'accepted' },
  { volunteerKey: 'riad', opportunityKey: 'blankets', positionIndex: 0, message: 'Je peux tenir les permanences du week-end.', outcome: 'pending' },
  { volunteerKey: 'riad', opportunityKey: 'planting', positionIndex: 1, message: 'J’ai le permis et je suis disponible en semaine.', outcome: 'rejected', reason: 'Le poste exige une expérience de conduite d’utilitaire.' },
];

/* ------------------------------------------------------------------ types */

export interface SeedDevSummary {
  organizations: number;
  organizationsVerified: number;
  volunteers: number;
  opportunities: number;
  opportunitiesOpen: number;
  opportunitiesByStatus: Record<string, number>;
  volunteerSkills: number;
  applications: number;
  applicationsByStatus: Record<string, number>;
  participants: number;
  submissions: number;
  submissionsByStatus: Record<string, number>;
  experiences: number;
  reviews: number;
  verifications: number;
  favorites: number;
  portfolioItems: number;
  media: number;
  credentials: Array<{ email: string; password: string; role: string }>;
}

function makeAccount(id: string, role: AccountToken['role']): AccountToken {
  return { sub: id, role, sessionId: new Types.ObjectId().toString() };
}

/**
 * Minimal structural refs stored across seed steps. Service methods return
 * the plain model classes while `find*` returns hydrated documents — both
 * satisfy these shapes, so every step re-reads the row it needs instead of
 * threading driver-specific types through the script.
 */
interface OrgSeedRef {
  _id: Types.ObjectId;
  verificationStatus: string;
}

interface OppSeedRef {
  _id: Types.ObjectId;
  title: string;
  status: string;
  positions: Array<{ _id: Types.ObjectId }>;
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/* ------------------------------------------------------------------- seed */

export async function seedDev(
  app: INestApplicationContext,
): Promise<SeedDevSummary> {
  const users = app.get(UsersService);
  const organizations = app.get(OrganizationsService);
  const adminOrganizations = app.get(AdminOrganizationsService);
  const organizationExtras = app.get(OrganizationRegistrationExtrasService);
  const volunteerExtras = app.get(VolunteerRegistrationExtrasService);
  const volunteers = app.get(VolunteersService);
  const opportunities = app.get(OpportunitiesService);
  const applications = app.get(ApplicationsService);
  const submissions = app.get(SubmissionsService);
  const verifications = app.get(VerificationsService);
  const experiences = app.get(ExperiencesService);
  const favorites = app.get(FavoritesService);
  const portfolio = app.get(PortfolioService);

  const organizationModel = app.get(
    getModelToken(OrganizationsCollection),
  ) as Model<OrganizationModel>;
  const organizationVerificationModel = app.get(
    getModelToken(OrganizationVerificationsCollection),
  ) as Model<OrganizationVerificationModel>;
  const mediaModel = app.get(
    getModelToken(MediaCollection),
  ) as Model<MediaModel>;
  const skillModel = app.get(
    getModelToken(SkillsCollection),
  ) as Model<SkillModel>;
  const skillCategoryModel = app.get(
    getModelToken(SkillCategoriesCollection),
  ) as Model<SkillCategoryModel>;
  const locationModel = app.get(
    getModelToken(LocationsCollection),
  ) as Model<LocationModel>;
  const profileModel = app.get(
    getModelToken(VolunteerProfilesCollection),
  ) as Model<VolunteerProfileModel>;
  const volunteerSkillModel = app.get(
    getModelToken(VolunteerSkillsCollection),
  ) as Model<VolunteerSkillModel>;
  const opportunityModel = app.get(
    getModelToken(OpportunitiesCollection),
  ) as Model<OpportunityModel>;
  const applicationModel = app.get(
    getModelToken(ApplicationsCollection),
  ) as Model<ApplicationModel>;
  const participantModel = app.get(
    getModelToken(TaskParticipantsCollection),
  ) as Model<TaskParticipantModel>;
  const submissionModel = app.get(
    getModelToken(SubmissionsCollection),
  ) as Model<SubmissionModel>;
  const experienceModel = app.get(
    getModelToken(VolunteerExperiencesCollection),
  ) as Model<VolunteerExperienceModel>;
  const verificationModel = app.get(
    getModelToken(VerificationsCollection),
  ) as Model<VerificationModel>;
  const reviewModel = app.get(
    getModelToken(ReviewsCollection),
  ) as Model<ReviewModel>;
  const favoriteModel = app.get(
    getModelToken(FavoritesCollection),
  ) as Model<FavoriteModel>;
  const portfolioModel = app.get(
    getModelToken(PortfolioItemsCollection),
  ) as Model<PortfolioItemModel>;

  /* Reference data (must already be seeded via seed:all). */
  const skills = await skillModel.find({ active: true }).exec();
  const skillBySlug = new Map(skills.map((s) => [s.slug, s]));
  const categories = await skillCategoryModel.find({}).exec();
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
  const skillIdOf = (slug: string): string => {
    const row = skillBySlug.get(slug);
    if (!row) {
      throw new Error(
        `seed-dev: skill "${slug}" missing or inactive — run seed:all first`,
      );
    }
    return row._id.toString();
  };
  const categoryIdOf = (slug: string): string => {
    const row = categoryBySlug.get(slug);
    if (!row) {
      throw new Error(
        `seed-dev: skill category "${slug}" missing — run seed:all first`,
      );
    }
    return row._id.toString();
  };
  const resolvePlace = async (
    wilayaId: string,
    municipalityId: string,
  ): Promise<{ wilayaId: string; municipalityId: string }> => {
    const wilaya = await locationModel
      .findOne({ code: wilayaId, type: 'wilaya' })
      .lean()
      .exec();
    if (!wilaya) {
      throw new Error(`seed-dev: wilaya ${wilayaId} not found`);
    }
    const municipality = await locationModel
      .findOne({
        code: municipalityId,
        type: 'municipality',
        parentCode: wilayaId,
      })
      .lean()
      .exec();
    if (!municipality) {
      throw new Error(
        `seed-dev: municipality ${municipalityId} not found under wilaya ${wilayaId}`,
      );
    }
    return { wilayaId, municipalityId };
  };

  /* Users + media helpers (idempotent by stable keys). */
  const ensureUser = async (
    email: string,
    phone: string,
    role: 'organization' | 'volunteer',
  ): Promise<UserModel> => {
    const normalized = email.toLowerCase().trim();
    let user = await users.findByEmail(normalized);
    if (!user) {
      user = await users.create({
        email: normalized,
        phone,
        passwordHash: await bcrypt.hash(DEV_PASSWORD, 10),
        role,
      });
    }
    await users.setEmailVerified(user._id.toString());
    return (await users.findById(user._id.toString())) ?? user;
  };

  const ensureMediaLink = async (
    ownerId: Types.ObjectId,
    purpose: MediaPurpose,
    url: string,
    filename: string,
  ): Promise<MediaModel> => {
    const existing = await mediaModel
      .findOne({ ownerId, purpose, url })
      .exec();
    if (existing) {
      return existing;
    }
    return mediaModel.create({
      ownerId,
      purpose,
      visibility: 'public',
      type: 'link',
      url,
      filename,
    });
  };

  const ensureMediaFile = async (
    ownerId: Types.ObjectId,
    purpose: MediaPurpose,
    filename: string,
    storageKey: string,
    mimeType: string,
  ): Promise<MediaModel> => {
    const existing = await mediaModel
      .findOne({ ownerId, purpose, filename })
      .exec();
    if (existing) {
      return existing;
    }
    return mediaModel.create({
      ownerId,
      purpose,
      visibility: 'private',
      type: 'file',
      storageKey,
      filename,
      mimeType,
      size: 128 * 1024,
    });
  };

  /* Admin account for the approve path (same convention as seed-demo). */
  const adminOptions = adminSeedEnv();
  let adminUser = await users.findByEmail(adminOptions.email);
  if (!adminUser) {
    await upsertAdmin(users, adminOptions);
    adminUser = await users.findByEmail(adminOptions.email);
  }
  if (!adminUser) {
    throw new Error('seed-dev: admin upsert did not create the admin account');
  }
  const adminAccount = makeAccount(adminUser._id.toString(), 'admin');

  /* Organizations through the real registration → verify → approve path. */
  const orgByKey = new Map<string, OrgSeedRef>();
  const orgAccountByKey = new Map<string, AccountToken>();
  for (const spec of ORG_SPECS) {
    const user = await ensureUser(spec.email, spec.phone, 'organization');
    const account = makeAccount(user._id.toString(), 'organization');
    let organization = await organizationModel
      .findOne({ userId: user._id })
      .exec();
    if (!organization) {
      await organizationExtras.createExtras(
        { id: user._id.toString(), role: 'organization' },
        { email: spec.email },
      );
      organization = await organizationModel
        .findOne({ userId: user._id })
        .exec();
    }
    if (!organization) {
      throw new Error(`seed-dev: organization row missing for ${spec.email}`);
    }

    const logo = await ensureMediaLink(
      user._id,
      'organization_logo',
      picsum(`basmatak-org-logo-${spec.key}`, 400, 400),
      `logo-${spec.key}.jpg`,
    );
    const cover = await ensureMediaLink(
      user._id,
      'organization_cover',
      picsum(`basmatak-org-cover-${spec.key}`, 1200, 600),
      `cover-${spec.key}.jpg`,
    );
    const dto: UpdateOrganizationDto = {
      nameAr: spec.nameAr,
      nameFr: spec.nameFr,
      description: spec.description,
      logoMediaId: logo._id.toString(),
      coverMediaId: cover._id.toString(),
      type: spec.type,
      registrationNumber: spec.registrationNumber,
      location: {
        ...(await resolvePlace(spec.wilayaId, spec.municipalityId)),
        address: spec.address,
      },
      website: spec.website,
      foundedYear: spec.foundedYear,
      contact: { email: `contact-${spec.key}@example.org`, phone: spec.contactPhone },
      focusDisciplines: spec.focusCategories.map((slug) => categoryIdOf(slug)),
      operatingScope: spec.operatingScope,
      publicProfile: { enabled: true },
    };
    if (spec.annualReport) {
      const report = await ensureMediaLink(
        user._id,
        'organization_document',
        picsum(`basmatak-org-report-${spec.key}`, 800, 600),
        `rapport-annuel-${spec.key}.jpg`,
      );
      dto.annualReportMediaId = report._id.toString();
    }
    await organizations.updateOwn(account, dto);
    const orgDoc = await organizationModel.findById(organization._id).exec();
    if (!orgDoc) {
      throw new Error(`seed-dev: organization row missing for ${spec.email}`);
    }

    if (orgDoc.verificationStatus !== 'verified') {
      const pending = await organizationVerificationModel
        .findOne({ organizationId: orgDoc._id, status: 'pending' })
        .exec();
      if (!pending) {
        const document = await ensureMediaFile(
          user._id,
          'verification_document',
          `verification-${spec.key}.pdf`,
          `verification_document/dev/${user._id.toString()}/id.pdf`,
          'application/pdf',
        );
        await organizations.submitVerification(account, [document._id.toString()]);
      }
      if (spec.verified) {
        await adminOrganizations.approve(adminAccount, orgDoc._id.toString());
        const approved = await organizationModel.findById(orgDoc._id).exec();
        if (!approved) {
          throw new Error(`seed-dev: organization row missing for ${spec.email}`);
        }
        orgByKey.set(spec.key, approved);
      } else {
        orgByKey.set(spec.key, orgDoc);
      }
    } else {
      orgByKey.set(spec.key, orgDoc);
    }
    orgAccountByKey.set(spec.key, account);
  }

  /* Volunteers through the real registration path + profile/skills/schedule. */
  const volUserByKey = new Map<string, UserModel>();
  const volAccountByKey = new Map<string, AccountToken>();
  for (const spec of VOLUNTEER_SPECS) {
    const user = await ensureUser(spec.email, spec.phone, 'volunteer');
    const account = makeAccount(user._id.toString(), 'volunteer');
    const existingProfile = await profileModel
      .findOne({ userId: user._id })
      .exec();
    if (!existingProfile) {
      await volunteerExtras.createExtras(
        { id: user._id.toString(), role: 'volunteer' },
        { email: spec.email },
      );
    }
    const avatar = await ensureMediaLink(
      user._id,
      'avatar',
      AVATARS[spec.key],
      `avatar-${spec.key}.jpg`,
    );
    const banner = await ensureMediaLink(
      user._id,
      'avatar',
      picsum(`basmatak-vol-banner-${spec.key}`, 1200, 400),
      `banner-${spec.key}.jpg`,
    );
    const profileDto: UpdateVolunteerProfileDto = {
      firstName: spec.firstName,
      lastName: spec.lastName,
      bio: spec.bio,
      birthDate: spec.birthDate,
      location: await resolvePlace(spec.wilayaId, spec.municipalityId),
      avatar: avatar._id.toString(),
      banner: banner._id.toString(),
      headline: spec.headline,
      availabilityNote: spec.availabilityNote,
      preferredDomains: spec.preferredDomains,
      geographicBase: spec.geographicBase,
    };
    await volunteers.updateProfile(user._id.toString(), profileDto);
    for (const skill of spec.skills) {
      const skillId = skillIdOf(skill.slug);
      const exists = await volunteerSkillModel
        .exists({ volunteerId: user._id, skillId })
        .exec();
      if (!exists) {
        await volunteers.addSkill(user._id.toString(), {
          skillId,
          level: skill.level,
          yearsOfExperience: skill.years,
          isPrimary: skill.primary,
        });
      }
    }
    await volunteers.setAvailability(user._id.toString(), spec.schedule);
    const flags = spec.publicProfile;
    if (Object.keys(flags).length > 0) {
      await volunteers.updatePublicSettings(user._id.toString(), {
        publicProfile: flags,
      });
    }
    volUserByKey.set(spec.key, user);
    volAccountByKey.set(spec.key, account);
  }

  /* Opportunities: create, then drive to the target status. */
  const oppByKey = new Map<string, OppSeedRef>();
  const oppOrgKey = new Map(OPPORTUNITY_SPECS.map((s) => [s.key, s.orgKey]));
  const readOpportunity = async (
    organizationId: Types.ObjectId,
    title: string,
  ): Promise<OppSeedRef> => {
    const row = await opportunityModel
      .findOne({ organizationId, title })
      .exec();
    if (!row) {
      throw new Error(`seed-dev: opportunity "${title}" missing`);
    }
    return row;
  };
  for (const spec of OPPORTUNITY_SPECS) {
    const organization = orgByKey.get(spec.orgKey);
    const account = orgAccountByKey.get(spec.orgKey);
    if (!organization || !account) {
      throw new Error(`seed-dev: unknown org ${spec.orgKey}`);
    }
    const existingOpportunity = await opportunityModel
      .findOne({ organizationId: organization._id, title: spec.title })
      .exec();
    if (!existingOpportunity) {
      const ownerId = new Types.ObjectId(account.sub);
      const cover = await ensureMediaLink(
        ownerId,
        'opportunity_cover',
        picsum(`basmatak-opp-${spec.key}`, 1200, 630),
        `cover-opp-${spec.key}.jpg`,
      );
      await opportunities.createOpportunity(account, {
        title: spec.title,
        description: spec.description,
        categoryId: categoryIdOf(spec.categorySlug),
        mode: spec.mode,
        coverMediaId: cover._id.toString(),
        startDate: daysFromNow(spec.startOffsetDays).toISOString(),
        endDate: daysFromNow(spec.endOffsetDays).toISOString(),
        durationMinutes: spec.durationMinutes,
        prerequisites: spec.prerequisites,
        applicationDeadline: daysFromNow(spec.deadlineOffsetDays).toISOString(),
        location:
          spec.wilayaId && spec.municipalityId
            ? {
                ...(await resolvePlace(spec.wilayaId, spec.municipalityId)),
                ...(spec.coordinates
                  ? { coordinates: spec.coordinates }
                  : {}),
              }
            : undefined,
        positions: spec.positions.map((position) => ({
          title: position.title,
          description: position.description,
          requiredCount: position.requiredCount,
          requiredSkills: position.requiredSkillSlugs.map((slug) => skillIdOf(slug)),
          deliverables: position.deliverables,
          startAt: daysFromNow(
            position.startOffsetDays ?? spec.startOffsetDays,
          ).toISOString(),
        })),
      });
    }
    let opportunity = await readOpportunity(organization._id, spec.title);
    // `closed` opportunities are published here and closed only after the
    // applications below are filed (apply requires `published`). `completed`
    // ones are published here too; the ticker + completion run later so the
    // accept flow still sees a `published` row.
    if (
      (spec.target === 'published' ||
        spec.target === 'closed' ||
        spec.target === 'completed') &&
      opportunity.status === 'draft'
    ) {
      await opportunities.publishOpportunity(
        account,
        opportunity._id.toString(),
      );
      opportunity = await readOpportunity(organization._id, spec.title);
    }
    oppByKey.set(spec.key, opportunity);
  }

  /* Applications through apply → startReview/accept/reject/withdraw. */
  const positionIdOf = (
    opportunity: OppSeedRef,
    index: number,
  ): string => {
    const position = opportunity.positions[index];
    if (!position) {
      throw new Error(
        `seed-dev: position ${index} missing on "${opportunity.title}"`,
      );
    }
    return position._id.toString();
  };
  const readApplication = async (
    positionId: string,
    volunteerId: Types.ObjectId,
  ) => {
    const row = await applicationModel
      .findOne({ positionId: new Types.ObjectId(positionId), volunteerId })
      .exec();
    if (!row) {
      throw new Error('seed-dev: application row missing');
    }
    return row;
  };
  for (const spec of APPLICATION_SPECS) {
    const user = volUserByKey.get(spec.volunteerKey);
    const volAccount = volAccountByKey.get(spec.volunteerKey);
    const opportunity = oppByKey.get(spec.opportunityKey);
    if (!user || !volAccount || !opportunity) {
      throw new Error(`seed-dev: unknown application ref ${spec.volunteerKey}`);
    }
    const positionId = positionIdOf(opportunity, spec.positionIndex);
    const existingApplication = await applicationModel
      .findOne({ positionId: new Types.ObjectId(positionId), volunteerId: user._id })
      .exec();
    if (!existingApplication) {
      await applications.apply(
        volAccount,
        opportunity._id.toString(),
        positionId,
        spec.message,
      );
    }
    const orgAccount = orgAccountByKey.get(oppOrgKey.get(spec.opportunityKey) ?? '');
    if (!orgAccount) {
      throw new Error(`seed-dev: org account missing for ${spec.opportunityKey}`);
    }
    let application = await readApplication(positionId, user._id);
    if (spec.outcome === 'under_review' && application.status === 'pending') {
      await applications.startReview(orgAccount, application._id.toString());
      application = await readApplication(positionId, user._id);
    }
    if (spec.outcome === 'accepted' && application.status !== 'accepted') {
      await applications.acceptApplication(orgAccount, application._id.toString());
      application = await readApplication(positionId, user._id);
    }
    if (
      spec.outcome === 'rejected' &&
      (application.status === 'pending' || application.status === 'under_review')
    ) {
      await applications.rejectApplication(
        orgAccount,
        application._id.toString(),
        spec.reason ?? 'Profil ne correspondant pas au besoin.',
      );
      application = await readApplication(positionId, user._id);
    }
    if (
      spec.outcome === 'withdrawn' &&
      (application.status === 'pending' || application.status === 'under_review')
    ) {
      await applications.withdrawApplication(
        volAccount,
        application._id.toString(),
      );
      application = await readApplication(positionId, user._id);
    }
  }

  /* Close `closed`-target opportunities after applications were filed. */
  for (const spec of OPPORTUNITY_SPECS.filter((s) => s.target === 'closed')) {
    const organization = orgByKey.get(spec.orgKey);
    const account = orgAccountByKey.get(spec.orgKey);
    if (!organization || !account) {
      throw new Error(`seed-dev: unknown org ${spec.orgKey}`);
    }
    let opportunity = await readOpportunity(organization._id, spec.title);
    if (opportunity.status === 'published') {
      await opportunities.closeOpportunity(account, opportunity._id.toString());
      opportunity = await readOpportunity(organization._id, spec.title);
    }
    oppByKey.set(spec.key, opportunity);
  }

  /* Completed lifecycle for the summer-camp opportunity (past start). The
     row was created + published with the others so applications could be
     filed; the ticker + completion run here, after the accepts. */
  const completedSpec = OPPORTUNITY_SPECS.find((s) => s.target === 'completed');
  if (completedSpec) {
    const organization = orgByKey.get(completedSpec.orgKey);
    const account = orgAccountByKey.get(completedSpec.orgKey);
    if (!organization || !account) {
      throw new Error('seed-dev: unknown org for completed opportunity');
    }
    let completed = await readOpportunity(organization._id, completedSpec.title);
    if (completed.status === 'draft') {
      await opportunities.publishOpportunity(
        account,
        completed._id.toString(),
      );
      completed = await readOpportunity(organization._id, completedSpec.title);
    }
    if (completed.status === 'published') {
      await opportunities.runStartTicker();
      completed = await readOpportunity(organization._id, completedSpec.title);
    }
    if (completed.status === 'in_progress') {
      await opportunities.completeOpportunity(
        account,
        completed._id.toString(),
      );
      completed = await readOpportunity(organization._id, completedSpec.title);
    }
    oppByKey.set(completedSpec.key, completed);
  }

  /* Submissions + verification through the real S10/S11 flow. */
  const SUBMISSION_SPECS: Array<{
    volunteerKey: string;
    opportunityKey: string;
    positionIndex: number;
    title: string;
    description: string;
    verify: null | { notes: string; review?: { rating: number; comment: string } };
  }> = [
    {
      volunteerKey: 'yasmine',
      opportunityKey: 'ramadan',
      positionIndex: 0,
      title: 'Distribution des couffins — semaine 2',
      description:
        'J’ai participé à trois soirées de distribution : accueil de 60 familles par soir, remise des couffins et rangement du point de distribution avec l’équipe.',
      verify: {
        notes: 'Présence confirmée sur les trois soirs.',
        review: { rating: 5, comment: 'Bénévole ponctuelle et très investie.' },
      },
    },
    {
      volunteerKey: 'amine',
      opportunityKey: 'coding',
      positionIndex: 0,
      title: 'Mentorat bootcamp — cohorte 1',
      description:
        'Animation de 8 ateliers JavaScript et revue des projets de 5 jeunes. Tous ont présenté un site vitrine fonctionnel en fin de bootcamp.',
      verify: {
        notes: 'Ateliers assurés en visio, supports fournis.',
        review: { rating: 5, comment: 'Excellent mentor, pédagogie remarquable.' },
      },
    },
    {
      volunteerKey: 'sara',
      opportunityKey: 'cleanup',
      positionIndex: 0,
      title: 'Nettoyage des Sablettes — samedi',
      description:
        'Collecte et tri sur le secteur central de la promenade avec un groupe de 8 volontaires. 22 sacs triés et évacués.',
      verify: {
        notes: 'Photos de zone reçues.',
        review: { rating: 4, comment: 'Très bon travail d’équipe.' },
      },
    },
    {
      volunteerKey: 'karim',
      opportunityKey: 'tutoring',
      positionIndex: 0,
      title: 'Soutien maths — groupe B',
      description:
        'Six séances de soutien en mathématiques pour un groupe de 5 collégiens. Fiches de suivi remises au coordinateur.',
      verify: null,
    },
    {
      volunteerKey: 'nadia',
      opportunityKey: 'summercamp',
      positionIndex: 0,
      title: 'Veillées contes — colonie d’été',
      description:
        'Animation de 6 veillées contes bilingues pour les enfants de la colonie, avec préparation des supports et gestion du coucher.',
      verify: { notes: 'Mission réalisée l’été dernier, attestée par la direction.' },
    },
  ];
  for (const spec of SUBMISSION_SPECS) {
    const user = volUserByKey.get(spec.volunteerKey);
    const volAccount = volAccountByKey.get(spec.volunteerKey);
    const opportunity = oppByKey.get(spec.opportunityKey);
    if (!user || !volAccount || !opportunity) {
      throw new Error(`seed-dev: unknown submission ref ${spec.volunteerKey}`);
    }
    const positionId = positionIdOf(opportunity, spec.positionIndex);
    const acceptedApp = await applicationModel
      .findOne({
        positionId: new Types.ObjectId(positionId),
        volunteerId: user._id,
        status: 'accepted',
      })
      .exec();
    if (!acceptedApp) {
      throw new Error(
        `seed-dev: accepted application missing for ${spec.volunteerKey} on ${spec.opportunityKey}`,
      );
    }
    const participant = await participantModel
      .findOne({ applicationId: acceptedApp._id })
      .exec();
    if (!participant) {
      throw new Error('seed-dev: participant missing after accept');
    }
    const readSubmission = async () => {
      const row = await submissionModel
        .findOne({ participantId: participant._id })
        .exec();
      if (!row) {
        throw new Error('seed-dev: submission row missing');
      }
      return row;
    };
    const existingSubmission = await submissionModel
      .findOne({ participantId: participant._id })
      .exec();
    if (!existingSubmission) {
      await submissions.createForParticipation(
        volAccount,
        participant._id.toString(),
        spec.title,
      );
    }
    let submission = await readSubmission();
    if (submission.status === 'draft' || submission.status === 'rejected') {
      const evidence = await ensureMediaFile(
        user._id,
        'submission_evidence',
        `preuve-${spec.volunteerKey}-${spec.opportunityKey}.pdf`,
        `submission_evidence/dev/${user._id.toString()}/${spec.opportunityKey}.pdf`,
        'application/pdf',
      );
      await submissions.updateDraft(volAccount, submission._id.toString(), {
        title: spec.title,
        description: spec.description,
        evidence: [evidence._id.toString()],
      });
      submission = await readSubmission();
    }
    if (submission.status === 'draft') {
      await submissions.submit(volAccount, submission._id.toString(), {});
      submission = await readSubmission();
    }
    if (
      spec.verify &&
      (submission.status === 'submitted' || submission.status === 'under_review')
    ) {
      const orgAccount = orgAccountByKey.get(oppOrgKey.get(spec.opportunityKey) ?? '');
      if (!orgAccount) {
        throw new Error('seed-dev: org account missing for verify');
      }
      await verifications.verify(
        orgAccount,
        submission._id.toString(),
        spec.verify,
      );
      submission = await readSubmission();
    }
  }
  /* One private experience to exercise visibility filtering. */
  const saraUser = volUserByKey.get('sara');
  const saraAccount = volAccountByKey.get('sara');
  if (saraUser && saraAccount) {
    const saraExperience = await experienceModel
      .findOne({ volunteerId: saraUser._id })
      .exec();
    if (saraExperience && saraExperience.publicVisibility !== 'private') {
      await experiences.updateVisibility(saraAccount, saraExperience._id.toString(), {
        publicVisibility: 'private',
      });
    }
  }

  /* Portfolio items (real create path with owned link media). */
  const PORTFOLIO_SPECS: Array<{
    volunteerKey: string;
    title: string;
    description: string;
    typeLabel: string;
    tags: string[];
    seed: string;
  }> = [
    {
      volunteerKey: 'yasmine',
      title: 'Reportage — Ramadan solidaire',
      description: 'Série photo des distributions de couffins à Alger Centre.',
      typeLabel: 'Photographie',
      tags: ['photo', 'solidarité'],
      seed: 'basmatak-portfolio-yasmine-1',
    },
    {
      volunteerKey: 'yasmine',
      title: 'Affiches — collecte hivernale',
      description: 'Visuels réalisés pour la collecte de couvertures.',
      typeLabel: 'Design',
      tags: ['design', 'hiver'],
      seed: 'basmatak-portfolio-yasmine-2',
    },
    {
      volunteerKey: 'amine',
      title: 'Sites vitrines du bootcamp',
      description: 'Projets encadrés pendant le bootcamp code d’Oran.',
      typeLabel: 'Code',
      tags: ['web', 'mentorat'],
      seed: 'basmatak-portfolio-amine-1',
    },
  ];
  for (const spec of PORTFOLIO_SPECS) {
    const user = volUserByKey.get(spec.volunteerKey);
    const account = volAccountByKey.get(spec.volunteerKey);
    if (!user || !account) {
      throw new Error('seed-dev: unknown portfolio volunteer');
    }
    const existing = await portfolioModel
      .findOne({ volunteerId: user._id, title: spec.title })
      .exec();
    if (existing) {
      continue;
    }
    const media = await ensureMediaLink(
      user._id,
      'portfolio_item',
      picsum(spec.seed, 800, 600),
      `${spec.seed}.jpg`,
    );
    await portfolio.create(account, {
      title: spec.title,
      description: spec.description,
      mediaIds: [media._id.toString()],
      visibility: 'public',
      typeLabel: spec.typeLabel,
      tags: spec.tags,
    });
  }

  /* Favorites through the idempotent service path. */
  const FAVORITE_SPECS: Array<{
    volunteerKey: string;
    opportunityKey?: string;
    talentKey?: string;
  }> = [
    { volunteerKey: 'yasmine', opportunityKey: 'coding' },
    { volunteerKey: 'yasmine', opportunityKey: 'planting' },
    { volunteerKey: 'amine', opportunityKey: 'ramadan' },
    { volunteerKey: 'sara', opportunityKey: 'storytelling' },
    { volunteerKey: 'karim', opportunityKey: 'tutoring' },
    { volunteerKey: 'lina', opportunityKey: 'cleanup' },
    { volunteerKey: 'yasmine', talentKey: 'amine' },
    { volunteerKey: 'amine', talentKey: 'sara' },
    { volunteerKey: 'sara', talentKey: 'yasmine' },
  ];
  for (const spec of FAVORITE_SPECS) {
    const user = volUserByKey.get(spec.volunteerKey);
    if (!user) {
      throw new Error('seed-dev: unknown favorite volunteer');
    }
    if (spec.opportunityKey) {
      const opportunity = oppByKey.get(spec.opportunityKey);
      if (!opportunity) {
        throw new Error('seed-dev: unknown favorite opportunity');
      }
      await favorites.saveOpportunity(
        user._id.toString(),
        opportunity._id.toString(),
      );
    }
    if (spec.talentKey) {
      const talent = await profileModel
        .findOne({ userId: volUserByKey.get(spec.talentKey)?._id })
        .exec();
      if (!talent) {
        throw new Error('seed-dev: unknown favorite talent');
      }
      await favorites.saveTalent(user._id.toString(), talent.username);
    }
  }

  /* Summary scoped to dev rows only. */
  const orgUsers = await Promise.all(
    ORG_SPECS.map((spec) => users.findByEmail(spec.email)),
  );
  const orgIds = orgByKey;
  const allDevUserIds = [
    ...[...volUserByKey.values()].map((u) => u._id),
    ...orgUsers.filter((u): u is UserModel => Boolean(u)).map((u) => u._id),
  ];
  const allDevOrgIds = [...orgIds.values()].map((o) => o._id);
  const devOppIds = (
    await opportunityModel.find({ organizationId: { $in: allDevOrgIds } }).select('_id').exec()
  ).map((o) => o._id);
  const countBy = async (
    model: Model<any>,
    filter: Record<string, unknown>,
    group: string,
  ): Promise<Record<string, number>> => {
    const rows = await model.aggregate([
      { $match: filter },
      { $group: { _id: `$${group}`, n: { $sum: 1 } } },
    ]);
    const out: Record<string, number> = {};
    for (const row of rows as Array<{ _id: string; n: number }>) {
      out[String(row._id)] = row.n;
    }
    return out;
  };
  const oppStatus = await countBy(opportunityModel, { _id: { $in: devOppIds } }, 'status');
  const appStatus = await countBy(
    applicationModel,
    { opportunityId: { $in: devOppIds } },
    'status',
  );
  const submissionStatus = await countBy(
    submissionModel,
    { opportunityId: { $in: devOppIds } },
    'status',
  );
  const openCount = await opportunityModel.countDocuments({
    _id: { $in: devOppIds },
    status: 'published',
    $expr: {
      $gt: [
        {
          $size: {
            $filter: {
              input: '$positions',
              as: 'position',
              cond: { $lt: ['$$position.filledCount', '$$position.requiredCount'] },
            },
          },
        },
        0,
      ],
    },
  });
  const credentials = [
    ...ORG_SPECS.map((spec) => ({
      email: spec.email,
      password: DEV_PASSWORD,
      role: 'organization',
    })),
    ...VOLUNTEER_SPECS.map((spec) => ({
      email: spec.email,
      password: DEV_PASSWORD,
      role: 'volunteer',
    })),
  ];
  return {
    organizations: await organizationModel.countDocuments({ _id: { $in: allDevOrgIds } }),
    organizationsVerified: await organizationModel.countDocuments({
      _id: { $in: allDevOrgIds },
      verificationStatus: 'verified',
    }),
    volunteers: await profileModel.countDocuments({
      userId: { $in: [...volUserByKey.values()].map((u) => u._id) },
    }),
    opportunities: devOppIds.length,
    opportunitiesOpen: openCount,
    opportunitiesByStatus: oppStatus,
    volunteerSkills: await volunteerSkillModel.countDocuments({
      volunteerId: { $in: [...volUserByKey.values()].map((u) => u._id) },
    }),
    applications: await applicationModel.countDocuments({
      opportunityId: { $in: devOppIds },
    }),
    applicationsByStatus: appStatus,
    participants: await participantModel.countDocuments({
      opportunityId: { $in: devOppIds } },
    ),
    submissions: await submissionModel.countDocuments({
      opportunityId: { $in: devOppIds } },
    ),
    submissionsByStatus: submissionStatus,
    experiences: await experienceModel.countDocuments({
      opportunityId: { $in: devOppIds } },
    ),
    reviews: await reviewModel.countDocuments({
      organizationId: { $in: allDevOrgIds } },
    ),
    verifications: await verificationModel.countDocuments({
      organizationId: { $in: allDevOrgIds } },
    ),
    favorites: await favoriteModel.countDocuments({
      userId: { $in: allDevUserIds } },
    ),
    portfolioItems: await portfolioModel.countDocuments({
      volunteerId: { $in: [...volUserByKey.values()].map((u) => u._id) } },
    ),
    media: await mediaModel.countDocuments({ ownerId: { $in: allDevUserIds } }),
    credentials,
  };
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const result = await seedDev(app);
    console.log(`Dev seed: ${JSON.stringify(result, null, 2)}`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error('Dev seed failed:', error);
    process.exit(1);
  });
}
