import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, IsNotEmpty } from 'class-validator';

export class ScreenRequestDto {
  @ApiProperty({
    example: 'ijara-real-estate-v1',
    description: 'The certified template to screen against.',
  })
  @IsString()
  @IsNotEmpty()
  template_id!: string;

  @ApiProperty({
    description:
      'The asset document. Only asset_id, asset_type and name are required — conditions address fields by path, so the shape stays open.',
    example: {
      asset_id: 'AST-999',
      asset_type: 'real_estate',
      name: 'Example Property',
      ownership: { title_reference: 'DLD-2026-00001', clear_title: true, encumbered: false },
      income: { type: 'rent', impure_proportion: 0 },
      tenant: { activity: 'professional_services' },
      structure: {
        tangible_proportion: 0.9,
        ownership_risk_retained: true,
        buyback_at_par: false,
      },
    },
  })
  @IsObject()
  asset!: Record<string, unknown>;
}
