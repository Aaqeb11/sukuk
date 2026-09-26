import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsObject, IsString, Max, Min, NotEquals } from 'class-validator';

import type { Asset } from '../../assets/asset.types.js';

export class IssueSukukDto {
  @ApiProperty({
    example: 'ijara-real-estate-v1',
    description: 'The board-certified template to screen against.',
  })
  @IsString()
  templateId!: string;

  @ApiProperty({
    example: 1000,
    description:
      'Total ownership units. Indivisible — the mint has 0 decimals, so this ' +
      'is also the finest granularity any investor can hold.',
  })
  @IsInt()
  @Min(1)
  // u64 on-chain, but JavaScript integers are exact only to 2^53. Anything
  // larger would be silently rounded here before it ever reached the program.
  @Max(Number.MAX_SAFE_INTEGER)
  totalUnits!: number;

  @ApiProperty({
    description:
      'The asset document. Its shape is deliberately open — templates address ' +
      'fields by dot-path, so the engine screens assets whose structure it was ' +
      'never compiled against.',
    example: {
      asset_id: 'AST-001',
      title: { registered: true, encumbered: false },
      tenant: { activity: 'retail-grocery' },
    },
  })
  @IsObject()
  @NotEquals(null)
  asset!: Asset;
}
