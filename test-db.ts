import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // 测试连接
    await prisma.$connect();
    console.log('✅ 数据库连接成功！');
    
    // 测试查询
    const count = await prisma.user.count();
    console.log(`📊 用户表中有 ${count} 条记录`);
    
    // 测试创建数据
    const user = await prisma.user.create({
      data: {
        name: '测试用户',
        email: 'test@example.com',
        password: '123456',
      },
    });
    console.log('✅ 测试数据创建成功:', user);
    
    // 清理测试数据
    await prisma.user.delete({
      where: { id: user.id },
    });
    console.log('✅ 测试数据已清理');
    
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
