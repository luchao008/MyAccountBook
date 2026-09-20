import type { RouteRecordRaw } from 'vue-router';

import { BasicLayout } from '#/layouts';
import { $t } from '#/locales';

const routes: RouteRecordRaw[] = [
  {
    component: BasicLayout,
    meta: {
      icon: 'lucide:layout-dashboard',
      order: -1,
      title: $t('page.home.title'),
    },
    name: 'Home',
    path: '/',
    children: [
      {
        name: 'Welcome',
        path: '/analytics',
        component: () => import('#/views/dashboard/analytics/index.vue'),
        meta: {
          affixTab: true,
          icon: 'lucide:home',
          title: $t('page.home.welcome'),
        },
      },
    ],
  },
];

export default routes;
