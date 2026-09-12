import { ApiProperty } from '@midwayjs/swagger';

/**
 * 账本相关的 Swagger 响应模型。
 * 与 response.vo.ts 一致：显式声明 code/data/message 三个字段，不用继承。
 */

export class AccountVO {
  @ApiProperty({ description: '账本 ID', example: '1' })
  id: string;

  @ApiProperty({ description: '所属用户 ID', example: '1' })
  userId: string;

  @ApiProperty({ description: '账本名称', example: '默认账本' })
  name: string;

  @ApiProperty({ description: '图标标识', example: 'wallet' })
  icon: string;

  @ApiProperty({ description: '排序值，升序', example: 0 })
  sort: number;

  @ApiProperty({ description: '是否为默认账本（每个用户有且仅有一个）', example: true })
  isDefault: boolean;

  @ApiProperty({ description: '创建时间', example: '2026-09-11T14:30:00.000Z' })
  createdAt: string;
}

export class AccountListResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: AccountVO, isArray: true })
  data: AccountVO[];

  @ApiProperty({ example: 'success' })
  message: string;
}

export class AccountDetailResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: AccountVO })
  data: AccountVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

export class DeletePreviewDataVO {
  @ApiProperty({
    description: '该账本下的交易笔数（删除时会一并删除）',
    example: 42,
  })
  transactionCount: number;
}

export class DeletePreviewResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: DeletePreviewDataVO })
  data: DeletePreviewDataVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

export class DeleteAccountDataVO {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ description: '连带删除的交易笔数', example: 42 })
  deletedTransactions: number;
}

export class DeleteAccountResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: DeleteAccountDataVO })
  data: DeleteAccountDataVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

export class MergePreviewDataVO {
  @ApiProperty({ description: '源账本的交易总数', example: 30 })
  sourceTotal: number;

  @ApiProperty({ description: '会迁入目标账本的笔数', example: 28 })
  willMove: number;

  @ApiProperty({
    description: '因与目标账本存在完全相同记录而被丢弃的笔数',
    example: 2,
  })
  willSkip: number;
}

export class MergePreviewResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: MergePreviewDataVO })
  data: MergePreviewDataVO;

  @ApiProperty({ example: 'success' })
  message: string;
}

export class MergeResultDataVO extends MergePreviewDataVO {
  @ApiProperty({ description: '合并后的目标账本 ID', example: '1' })
  targetId: string;

  @ApiProperty({ description: '已被删除的源账本 ID', example: '2' })
  sourceId: string;

  @ApiProperty({ description: '被删除的源账本名称', example: '旧账本' })
  sourceName: string;
}

export class MergeResponseVO {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({ type: MergeResultDataVO })
  data: MergeResultDataVO;

  @ApiProperty({ example: 'success' })
  message: string;
}
