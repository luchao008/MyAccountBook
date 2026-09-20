import type { RouteRecordRaw } from 'vue-router';

import { BasicLayout } from '#/layouts';
import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    component: BasicLayout,
    meta: {
      icon: 'lucide:users',
      order: 10,
      title: $t('page.user.title'),
    },
    name: 'UserManagement',
    path: '/user',
    children: [
      {
        name: 'UserList',
        path: 'list',
        component: () => import('#/views/user/list.vue'),
        meta: {
          icon: 'lucide:list',
          title: $t('page.user.list'),
        },
      },
    ],
  },
];

export default routes;
