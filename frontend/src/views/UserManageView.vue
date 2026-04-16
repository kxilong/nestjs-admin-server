<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import type { TablePaginationConfig } from 'ant-design-vue';
import * as usersApi from '@/api/users';
import type { UserListItem } from '@/api/users';
import * as roleApi from '@/api/role';
import { useAuth } from '@/composables/useAuth';

const { accessToken, can } = useAuth();

const loading = ref(false);
const keyword = ref('');
const list = ref<UserListItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const roleOptions = ref<{ label: string; value: number }[]>([]);
const rolesLoaded = ref(false);

const modalOpen = ref(false);
const modalLoading = ref(false);
const editingUser = ref<UserListItem | null>(null);
const selectedRoleIds = ref<number[]>([]);

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 72 },
  { title: '用户名', dataIndex: 'username', key: 'username' },
  {
    title: '角色',
    dataIndex: 'roles',
    key: 'roles',
    ellipsis: true,
  },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 180,
  },
  { title: '操作', key: 'actions', width: 100, fixed: 'right' as const },
];

async function loadRoleOptions() {
  const token = accessToken.value;
  if (!token || !can('system:role:list')) {
    roleOptions.value = [];
    rolesLoaded.value = true;
    return;
  }
  try {
    const res = await roleApi.listRoles(token, { page: 1, pageSize: 200 });
    roleOptions.value = res.list.map((r) => ({
      label: `${r.name} (${r.code})`,
      value: r.id,
    }));
  } catch {
    roleOptions.value = [];
  } finally {
    rolesLoaded.value = true;
  }
}

async function fetchList() {
  const token = accessToken.value;
  if (!token) {
    return;
  }
  loading.value = true;
  try {
    const res = await usersApi.listUsers(token, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value,
    });
    list.value = res.list;
    total.value = res.total;
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadRoleOptions();
  void fetchList();
});

watch([page, pageSize], () => {
  void fetchList();
});

const pagination = computed<TablePaginationConfig>(() => ({
  current: page.value,
  pageSize: pageSize.value,
  total: total.value,
  showSizeChanger: true,
  showTotal: (t) => `共 ${t} 条`,
}));

function onTableChange(pag: TablePaginationConfig) {
  page.value = pag.current ?? 1;
  pageSize.value = pag.pageSize ?? 10;
}

function onSearch() {
  page.value = 1;
  void fetchList();
}

function openRoles(row: UserListItem) {
  editingUser.value = row;
  selectedRoleIds.value = row.roles.map((r) => r.id);
  modalOpen.value = true;
}

function closeModal() {
  modalOpen.value = false;
}

async function onSaveRoles() {
  const token = accessToken.value;
  const u = editingUser.value;
  if (!token || !u) {
    return Promise.reject();
  }
  modalLoading.value = true;
  try {
    await usersApi.assignUserRoles(token, u.id, selectedRoleIds.value);
    message.success('角色已更新');
    closeModal();
    await fetchList();
  } catch (e) {
    message.error((e as Error).message);
    return Promise.reject(e);
  } finally {
    modalLoading.value = false;
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function roleNames(row: UserListItem) {
  if (!row.roles.length) {
    return '—';
  }
  return row.roles.map((r) => r.name).join('、');
}
</script>

<template>
  <div>
    <a-space direction="vertical" style="width: 100%" size="middle">
      <a-space wrap>
        <a-input
          v-model:value="keyword"
          allow-clear
          placeholder="搜索用户名"
          style="width: 220px"
          @press-enter="onSearch"
        />
        <a-button type="primary" @click="onSearch">查询</a-button>
      </a-space>

      <a-alert
        v-if="can('system:user:roles') && !can('system:role:list')"
        type="warning"
        show-icon
        message="当前账号无「查询角色」权限，分配角色时无法加载角色下拉列表，请同时授予 system:role:list 或为超级管理员。"
      />

      <a-table
        row-key="id"
        :loading="loading"
        :columns="columns"
        :data-source="list"
        :pagination="pagination"
        :scroll="{ x: 800 }"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'createdAt'">
            {{ formatTime((record as UserListItem).createdAt) }}
          </template>
          <template v-else-if="column.key === 'roles'">
            {{ roleNames(record as UserListItem) }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-button
              v-if="can('system:user:roles')"
              type="link"
              size="small"
              @click="openRoles(record as UserListItem)"
            >
              分配角色
            </a-button>
            <span v-else>—</span>
          </template>
        </template>
      </a-table>
    </a-space>

    <a-modal
      v-model:open="modalOpen"
      title="分配角色"
      :confirm-loading="modalLoading"
      ok-text="保存"
      destroy-on-close
      @ok="onSaveRoles"
      @cancel="closeModal"
    >
      <a-select
        v-model:value="selectedRoleIds"
        mode="multiple"
        style="width: 100%"
        placeholder="选择角色"
        :options="roleOptions"
        :loading="!rolesLoaded"
        allow-clear
      />
    </a-modal>
  </div>
</template>
