import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 64)
  name: string;

  /** 唯一标识，字母开头，仅字母数字下划线 */
  @IsString()
  @IsNotEmpty()
  @Length(1, 64)
  @Matches(/^[a-zA-Z][a-zA-Z0-9_]*$/, {
    message: 'code 须以字母开头，仅含字母、数字、下划线',
  })
  code: string;

  @IsOptional()
  @IsString()
  @Length(0, 255)
  description?: string;
}
