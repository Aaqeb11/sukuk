import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Without this, the class-validator decorators on the DTOs are inert.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false, // assets carry arbitrary nested fields
    }),
  );

  // The dashboard runs on a different origin during development.
  app.enableCors({ origin: true });

  const config = new DocumentBuilder()
    .setTitle('Sukuk Compliance Engine')
    .setDescription(
      'Screens assets against Shariah templates certified once by a board. ' +
        'The board defines the conditions; this service applies and audits them. ' +
        'Nothing here decides what is or is not compliant.',
    )
    .setVersion('0.1.0')
    .addTag('compliance')
    .build();

  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  new Logger('Bootstrap').log(`Compliance engine on http://localhost:${port} — docs at /docs`);
}

void bootstrap();
