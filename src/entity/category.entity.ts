import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

/**
 * 记账分类，支持**两级**结构。
 *
 * 层级约束（应用层保证，见 CategoryService）：
 *   - parent_id 为 NULL → 一级分类
 *   - parent_id 指向某个一级分类 → 二级分类
 *   - **二级分类下不允许再挂子分类**（最多两级），创建/更新时都会校验
 *
 * 唯一键说明：用的是 (user_id, name) 全局唯一，而不是 (user_id, parent_id, name)。
 * 原因：MySQL 的唯一索引不约束 NULL，若把 parent_id 纳入唯一键，
 * 一级分类（parent_id 为 NULL）的重名反而拦不住。当前分类体系里
 * 各二级分类名互不重复，因此全局唯一既够用又更严格。
 */
@Entity('categories')
@Index('uk_user_name', ['userId', 'name'], { unique: true })
@Index('idx_user_parent', ['userId', 'parentId'])
export class Category {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: string;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: string;

  @Column({ length: 64 })
  name: string;

  @Column({ type: 'enum', enum: ['income', 'expense'] })
  type: 'income' | 'expense';

  @Column({ length: 64, default: '' })
  icon: string;

  @Column({ type: 'int', default: 0 })
  sort: number;

  /** 父分类 ID；NULL 表示这是一级分类 */
  @Column({ name: 'parent_id', type: 'bigint', unsigned: true, nullable: true })
  parentId: string | null;

  /**
   * 是否隐藏。
   *
   * 语义（已与产品确认）：隐藏的分类**不出现在「记一笔」的分类选择器里**，
   * 目的是把不常用的分类收起来；分类管理页仍可见、可取消隐藏，
   * 历史交易 / 明细 / 统计**完全不受影响**。
   *
   * 一级分类隐藏时，其下二级分类也一并选不到 —— 这个判断放在查询侧做
   * （父隐藏 ⇒ 子不可选），**不给二级分类冗余写 is_hidden**：
   * 否则取消隐藏时还要回滚所有子分类，极易漏掉而留下不一致的数据。
   */
  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden: boolean;

  /** 父分类。删除一级分类时，其下二级分类一并删除（CASCADE） */
  @ManyToOne(() => Category, (category) => category.children, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent: Category | null;

  @OneToMany(() => Category, (category) => category.parent)
  children: Category[];

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
