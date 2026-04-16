import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Authorize } from '../rbac/permissions.decorator';
import { QueryUserListDto } from './dto/query-user-list.dto';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto';
import { UserService } from './user.service';

@ApiTags('用户')
@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @Authorize('system:user:list')
  findAll(@Query() query: QueryUserListDto) {
    return this.userService.findAll(query);
  }

  @Patch(':id/roles')
  @Authorize('system:user:roles')
  setRoles(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignUserRolesDto,
  ) {
    return this.userService.setUserRoles(id, dto);
  }
}
