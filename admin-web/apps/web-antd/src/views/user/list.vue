<script lang="ts" setup>
import type { VbenFormProps } from '@vben/common-ui';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { UserAdminItem, UserStatus } from '#/api';

import { Page } from '@vben/common-ui';

import { Button, message, Modal, Space, Tag } from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  approveUserApi,
  deleteUserApi,
  disableUserApi,
  enableUserApi,
  getUserDetailApi,
  getUserListApi,
  rejectUserApi,
} from '#/api';

const STATUS_META: Record<
  UserStatus,
  { color: string; label: string }
> = {
  active: { color: 'success', label: '正常' },
  disabled: { color: 'error', label: '已停用' },
  pending: { color: 'warning', label: '待审核' },
};

const formOptions: VbenFormProps = {
  collapsed: false,
  showCollapseButton: false,
  submitOnChange: true,
  submitButtonOptions: { content: '查询' },
  schema: [
    {
      component: 'Input',
      componentProps: {
        placeholder: '用户名',
      },
      fieldName: 'keyword',
      label: '用户名',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: [
          { label: '待审核', value: 'pending' },
          { label: '正常', value: 'active' },
          { label: '已停用', value: 'disabled' },
        ],
        placeholder: '全部状态',
      },
      fieldName: 'status',
      label: '状态',
    },
  ],
};

const gridOptions: VxeTableGridOptions<UserAdminItem> = {
  columns: [
    { field: 'username', minWidth: 140, title: '用户名' },
    {
      field: 'status',
      slots: { default: 'status' },
      title: '状态',
      width: 100,
    },
    { field: 'accountCount', title: '账本数', width: 90 },
    { field: 'transactionCount', title: '流水数', width: 90 },
    {
      field: 'createdAt',
      formatter: 'formatDateTime',
      title: '注册时间',
      width: 170,
    },
    { field: 'action', slots: { default: 'action' }, title: '操作', width: 260 },
  ],
  height: 'auto',
  keepSource: true,
  pagerConfig: {},
  proxyConfig: {
    ajax: {
      query: async ({ page }, formValues) => {
        return await getUserListApi({
          page: page.currentPage,
          pageSize: page.pageSize,
          keyword: formValues.keyword || '',
          status: formValues.status || '',
        });
      },
    },
  },
  toolbarConfig: {
    custom: true,
    export: false,
    refresh: true,
    search: true,
    zoom: true,
  },
};

const [Grid, gridApi] = useVbenVxeGrid({ formOptions, gridOptions });

function reload() {
  gridApi.query();
}

async function onApprove(row: UserAdminItem) {
  await approveUserApi(row.id);
  message.success('已通过');
  reload();
}

async function onEnable(row: UserAdminItem) {
  await enableUserApi(row.id);
  message.success('已启用');
  reload();
}

async function onDisable(row: UserAdminItem) {
  await disableUserApi(row.id);
  message.success('已停用');
  reload();
}

function onReject(row: UserAdminItem) {
  Modal.confirm({
    content: '确定驳回该注册申请？该用户的账号与预设数据将被物理删除。',
    okText: '驳回',
    okType: 'danger',
    title: '驳回注册申请',
    async onOk() {
      await rejectUserApi(row.id);
      message.success('已驳回');
      reload();
    },
  });
}

async function onDelete(row: UserAdminItem) {
  // 删除前拉一次详情，弹窗展示将连带删除的账本数/流水数
  const detail = await getUserDetailApi(row.id);
  Modal.confirm({
    content: `将连带删除 ${detail.accountCount} 个账本、${detail.transactionCount} 笔流水，且不可恢复。确定删除「${row.username}」？`,
    okText: '删除',
    okType: 'danger',
    title: '删除用户',
    async onOk() {
      await deleteUserApi(row.id);
      message.success('已删除');
      reload();
    },
  });
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #status="{ row }">
        <Tag :color="STATUS_META[row.status as UserStatus].color">
          {{ STATUS_META[row.status as UserStatus].label }}
        </Tag>
      </template>
      <template #action="{ row }">
        <Space :size="8">
          <template v-if="row.status === 'pending'">
            <Button size="small" type="primary" @click="onApprove(row)">
              通过
            </Button>
            <Button danger size="small" type="primary" @click="onReject(row)">
              驳回
            </Button>
          </template>
          <template v-else>
            <Button
              v-if="row.status === 'active'"
              size="small"
              style="
                background-color: hsl(42, 84%, 61%);
                border-color: hsl(42, 84%, 61%);
                color: #fff;
              "
              @click="onDisable(row)"
            >
              停用
            </Button>
            <Button v-else size="small" type="primary" @click="onEnable(row)">
              启用
            </Button>
            <Button danger size="small" type="primary" @click="onDelete(row)">
              删除
            </Button>
          </template>
        </Space>
      </template>
    </Grid>
  </Page>
</template>
