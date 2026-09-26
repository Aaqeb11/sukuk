import { Module } from '@nestjs/common';

import { CustodyController } from './custody.controller.js';
import { CustodyService } from './custody.service.js';
import { VaultCustodyProvider } from './vault-custody.provider.js';
import { CUSTODY_PROVIDER } from './custody.types.js';

/**
 * The custody boundary, wired.
 *
 * `CUSTODY_PROVIDER` is bound to a concrete implementation here and nowhere
 * else. CustodyService injects the interface, so swapping Vault for a Luna
 * HSM is a change to the `useClass` line below — no consumer is touched.
 *
 * That is not an abstraction for its own sake. The architecture claims
 * custody is a boundary rather than a vendor, and this is where that claim
 * is either true or isn't.
 */
@Module({
  controllers: [CustodyController],
  providers: [
    {
      provide: CUSTODY_PROVIDER,
      useClass: VaultCustodyProvider,
      // Production:
      //   useClass: LunaCustodyProvider,
      //
      // Or chosen at runtime:
      //   useClass: process.env.CUSTODY_PROVIDER === 'luna'
      //     ? LunaCustodyProvider
      //     : VaultCustodyProvider,
    },
    CustodyService,
  ],
  exports: [CustodyService],
})
export class CustodyModule {}
