import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Authorize } from '../rbac/permissions.decorator';
import { PermissionService } from './permission.service';

@ApiTags('权限')
@ApiBearerAuth('access-token')
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @Authorize('system:permission:list')
  findAll() {
    return this.permissionService.findAll();
  }
}
