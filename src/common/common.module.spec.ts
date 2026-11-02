import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { getConnectionToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection } from 'mongoose';
import {
  MemoryConnectionHandle,
  startMemoryConnection,
  stopMemoryConnection,
} from '../../test/utils/memory-connection';
import { CoreModule } from '../core/core.module';
import { OrganizationRegistrationExtrasService } from '../organizations/organization-registration-extras.service';
import { CommonModule } from './common.module';

/**
 * Exposes the in-memory connection under the token `MongooseModule.forFeature`
 * injects, so the real modules below build their real model bindings.
 */
function connectionModule(connection: Connection) {
  const token = getConnectionToken();

  @Global()
  @Module({
    providers: [{ provide: token, useValue: connection }],
    exports: [token],
  })
  class TestConnectionModule {}

  return TestConnectionModule;
}

/**
 * Compiles the real `CommonModule` against a live (in-memory) Mongoose
 * connection so every `@InjectModel` token must actually be registered. This
 * catches the class of wiring break that otherwise only shows up at boot.
 */
describe('CommonModule', () => {
  let memory: MemoryConnectionHandle;

  beforeAll(async () => {
    memory = await startMemoryConnection();
  });

  afterAll(async () => {
    await stopMemoryConnection(memory);
  });

  it('resolves the organization registration extras provider', async () => {
    let moduleRef: TestingModule | undefined;
    try {
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          EventEmitterModule.forRoot({ global: true }),
          CoreModule,
          connectionModule(memory.connection),
          CommonModule,
        ],
      }).compile();

      expect(
        moduleRef.get(OrganizationRegistrationExtrasService),
      ).toBeInstanceOf(OrganizationRegistrationExtrasService);
    } finally {
      await moduleRef?.close();
    }
  });
});
