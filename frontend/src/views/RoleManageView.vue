<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import type { TablePaginationConfig } from 'ant-design-vue';
import * as roleApi from '@/api/role';
import type { RoleItem } from '@/api/role';
import * as permApi from '@/api/permission';
import { useAuth } from '@/composables/useAuth';

const { accessToken, can } = useAuth();

const loading = ref(false);
const modalLoading = ref(false);
const keyword = ref('');
const list = ref<RoleItem[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(10);

const modalOpen = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({
  name: '',
  code: '',
  description: '',
});

const permModalOpen = ref(false);
const permLoading = ref(false);
const permSaving = ref(false);
const permRole = ref<RoleItem | null>(null);
const allPermissions = ref<permApi.PermissionItem[]>([]);
const selectedPermCodes = ref<string[]>([]);

const isEdit = computed(() => editingId.value !== null);

const columns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 72 },
  { title: '名称', dataIndex: 'name', key: 'name', ellipsis: true },
  { title: '编码', dataIndex: 'code', key: 'code', width: 140 },
  { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
  {
    title: '创建时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 180,
  },
  { title: '操作', key: 'actions', width: 220, fixed: 'right' as const },
];

async function fetchList() {
  const token = accessToken.value;
  if (!token) {
    return;
  }
  loading.value = true;
  try {
    const res = await roleApi.listRoles(token, {
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

onMounted(fetchList);

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

function openCreate() {
  editingId.value = null;
  form.name = '';
  form.code = '';
  form.description = '';
  modalOpen.value = true;
}

function openEdit(row: RoleItem) {
  editingId.value = row.id;
  form.name = row.name;
  form.code = row.code;
  form.description = row.description ?? '';
  modalOpen.value = true;
}

function closeModal() {
  modalOpen.value = false;
}

async function onSubmitModal() {
  const name = form.name.trim();
  const code = form.code.trim();
  if (!name || !code) {
    message.warning('请填写名称和编码');
    return Promise.reject();
  }
  const token = accessToken.value;
  if (!token) {
    return Promise.reject();
  }
  modalLoading.value = true;
  try {
    if (editingId.value === null) {
      await roleApi.createRole(token, {
        name,
        code,
        description: form.description.trim() || undefined,
      });
      message.success('创建成功');
    } else {
      await roleApi.updateRole(token, editingId.value, {
        name,
        code,
        description: form.description,
      });
      message.success('更新成功');
    }
    closeModal();
    await fetchList();
  } catch (e) {
    message.error((e as Error).message);
  } finally {
    modalLoading.value = false;
  }
}

function onDelete(row: RoleItem) {
  Modal.confirm({
    title: '确认删除该角色？',
    content: `「${row.name}」（${row.code}）`,
    okText: '删除',
    okType: 'danger',
    async onOk() {
      const token = accessToken.value;
      if (!token) {
        return;
      }
      await roleApi.deleteRole(token, row.id);
      message.success('已删除');
      await fetchList();
    },
  });
}

async function openPermModal(row: RoleItem) {
  const token = accessToken.value;
  if (!token) {
    return;
  }
  permRole.value = row;
  permModalOpen.value = true;
  permLoading.value = true;
  try {
    const [all, current] = await Promise.all([
      permApi.listPermissions(token),
      roleApi.getRolePermissions(token, row.id),
    ]);
    allPermissions.value = all;
    selectedPermCodes.value = current.map((p) => p.code);
  } catch (e) {
    message.error((e as Error).message);
    permModalOpen.value = false;
  } finally {
    permLoading.value = false;
  }
}

function closePermModal() {
  permModalOpen.value = false;
  permRole.value = null;
}

async function onSavePermissions() {
  const token = accessToken.value;
  const row = permRole.value;
  if (!token || !row) {
    return Promise.reject();
  }
  permSaving.value = true;
  try {
    await roleApi.setRolePermissions(token, row.id, selectedPermCodes.value);
    message.success('权限已保存');
    closePermModal();
  } catch (e) {
    message.error((e as Error).message);
    return Promise.reject(e);
  } finally {
    permSaving.value = false;
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const permCheckboxOptions = computed(() =>
  allPermissions.value.map((p) => ({
    label: `${p.name}（${p.code}）`,
    value: p.code,
  })),
);
</script>

<template>
  <div>
    <a-space direction="vertical" style="width: 100%" size="middle">
      <a-space wrap>
        <a-input
          v-model:value="keyword"
          allow-clear
          placeholder="搜索名称或编码"
          style="width: 220px"
          @press-enter="onSearch"
        />
        <a-button type="primary" @click="onSearch">查询</a-button>
        <a-button
          v-if="can('system:role:create')"
          type="primary"
          @click="openCreate"
        >
          新建角色
        </a-button>
      </a-space>

      <a-table
        row-key="id"
        :loading="loading"
        :columns="columns"
        :data-source="list"
        :pagination="pagination"
        :scroll="{ x: 1000 }"
        @change="onTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'createdAt'">
            {{ formatTime((record as RoleItem).createdAt) }}
          </template>
          <template v-else-if="column.key === 'description'">
            {{ (record as RoleItem).description ?? '—' }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <a-space wrap>
              <a-button
                v-if="can('system:role:update')"
                type="link"
                size="small"
                @click="openEdit(record as RoleItem)"
              >
                编辑
              </a-button>
              <a-button
                v-if="can('system:role:permissions')"
                type="link"
                size="small"
                @click="openPermModal(record as RoleItem)"
              >
                分配权限
              </a-button>
              <a-button
                v-if="can('system:role:delete')"
                type="link"
                size="small"
                danger
                @click="onDelete(record as RoleItem)"
              >
                删除
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-space>

    <a-modal
      v-model:open="modalOpen"
      :title="isEdit ? '编辑角色' : '新建角色'"
      :confirm-loading="modalLoading"
      ok-text="保存"
      destroy-on-close
      @ok="onSubmitModal"
      @cancel="closeModal"
    >
      <a-form layout="vertical">
        <a-form-item label="名称" required>
          <a-input v-model:value="form.name" placeholder="显示名称" />
        </a-form-item>
        <a-form-item label="编码" required>
          <a-input
            v-model:value="form.code"
            placeholder="字母开头，仅字母数字下划线"
          />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea
            v-model:value="form.description"
            :rows="3"
            placeholder="可选"
          />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal
      v-model:open="permModalOpen"
      :title="`分配权限 — ${permRole?.name ?? ''}`"
      :confirm-loading="permSaving"
      width="640px"
      ok-text="保存"
      destroy-on-close
      @ok="onSavePermissions"
      @cancel="closePermModal"
    >
      <a-spin :spinning="permLoading">
        <a-checkbox-group
          v-model:value="selectedPermCodes"
          style="width: 100%"
        >
          <a-row :gutter="[8, 8]">
            <a-col v-for="opt in permCheckboxOptions" :key="opt.value" :span="24">
              <a-checkbox :value="opt.value">{{ opt.label }}</a-checkbox>
            </a-col>
          </a-row>
        </a-checkbox-group>
      </a-spin>
    </a-modal>
  </div>
</template>
