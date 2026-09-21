import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  });
  app.use(helmet());

  if (String(process.env.SWAGGER_ENABLED).toLowerCase() === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Basmatak Tatatoua API')
      .setDescription('Volunteer marketplace backend (بصمتك تطوع)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}
void bootstrap();
