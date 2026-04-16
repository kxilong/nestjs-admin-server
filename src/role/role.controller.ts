import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Authorize } from '../rbac/permissions.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { QueryRoleListDto } from './dto/query-role-list.dto';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto';
import { RoleService } from './role.service';

@ApiTags('角色')
@ApiBearerAuth('access-token')
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @Authorize('system:role:create')
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Get()
  @Authorize('system:role:list')
  findAll(@Query() query: QueryRoleListDto) {
    return this.roleService.findAll(query);
  }

  @Get(':id/permissions')
  @Authorize('system:role:permissions')
  getRolePermissions(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.getRolePermissions(id);
  }

  @Put(':id/permissions')
  @Authorize('system:role:permissions')
  setRolePermissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignRolePermissionsDto,
  ) {
    return this.roleService.setRolePermissions(id, dto.permissionCodes);
  }

  @Patch(':id')
  @Authorize('system:role:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
  @Authorize('system:role:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.remove(id);
  }
}
