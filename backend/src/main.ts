import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet, { HelmetOptions } from 'helmet';
import { AppModule } from './app.module';
import { buildCorsOptions, parseCorsOrigins } from './common/cors/cors-options';

/** Swagger interests before it except when `NODE_ENV=production` (S19). */
function isSwaggerEnabled(): boolean {
  return (
    String(process.env.SWAGGER_ENABLED).toLowerCase() === 'true' &&
    process.env.NODE_ENV !== 'production'
  );
}

/** Helmet CSP: strict defaults, relaxed only for the Swagger UI assets (S19). */
function helmetOptions(): HelmetOptions | undefined {
  if (!isSwaggerEnabled()) {
    return undefined;
  }
  return {
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
      },
    },
  };
}

/** Shared app wiring so e2e tests exercise the real Swagger/CSP behaviour. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api/v1');
  const corsRaw = process.env.CORS_ORIGIN;
  const corsParsed = parseCorsOrigins(corsRaw);
  app.enableCors(buildCorsOptions(corsParsed.origins));
  app.use(helmet(helmetOptions()));

  if (isSwaggerEnabled()) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Basmatak Tatatoua API')
      .setDescription('Volunteer marketplace backend (بصمتك تطوع)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
  return app;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const allowedOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);
  if (allowedOrigins.droppedWildcard) {
    Logger.warn(
      'CORS_ORIGIN contained a bare "*" entry, which is not an explicit allowlist and was dropped',
      'Bootstrap',
    );
  }
  const allowlistSummary =
    allowedOrigins.origins.length > 0
      ? allowedOrigins.origins.join(', ')
      : '(empty — cross-origin requests will be denied)';
  Logger.log(`CORS allowlist: ${allowlistSummary}`, 'Bootstrap');

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}

if (require.main === module) {
  void bootstrap();
}
