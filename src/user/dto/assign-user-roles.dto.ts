import { ArrayUnique, IsArray, IsInt } from 'class-validator';

export class AssignUserRolesDto {
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  roleIds: number[];
}
