import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

/**
 * ESLint 10 flat config（ESLint 9 起不再用 .eslintrc）。
 *
 * 规则取舍的原则：这是个人项目，配 lint 是为了挡住真会出事的问题
 * （未使用变量、错误的类型断言、Promise 没 await），
 * 而不是为了把代码管成教科书。所以显式 any、console 一律放行。
 */
export default tseslint.config(
  {
    // frontend/ 是独立的 uni-app 项目，有自己的依赖与工具链，交给它自己管
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'frontend/**', '*.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // 必须放最后：关掉与 Prettier 冲突的格式化类规则
  prettierConfig,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        // 项目大量使用装饰器（Midway IoC / TypeORM 实体），
        // 需要在 tsconfig 中开启 experimentalDecorators
        project: './tsconfig.json',
      },
    },
    rules: {
      // any 在对接第三方库（Koa ctx、TypeORM raw 结果）时很难避免，降级为不报
      '@typescript-eslint/no-explicit-any': 'off',
      // 未使用变量要报，但允许用 _ 前缀显式表达"故意不用"
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // TypeORM 实体字段大量使用非空断言/可选属性，放宽
      '@typescript-eslint/no-non-null-assertion': 'off',
      // 服务日志与 seed 脚本需要 console
      'no-console': 'off',
    },
  },
  {
    // 测试文件放宽：断言里常用 any、未使用参数很常见
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // scripts/ 下是 Node 脚本（如配色校验器 check-contrast.mjs）
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        // Node 全局，脚本里用 new URL('../x', import.meta.url) 拼路径
        URL: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
);
