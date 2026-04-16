import { Category } from '../types';

/** 全4科目 */
export const CATEGORIES: Category[] = ['kenri', 'takkengyoho', 'horei_seigen', 'tax_other'];

/** 本試験の科目別配点 */
export const EXAM_ALLOCATION: Record<Category, number> = {
  kenri: 14,
  takkengyoho: 20,
  horei_seigen: 8,
  tax_other: 8,
};

/** 本試験の合計問題数 */
export const EXAM_TOTAL = 50;

/** 合格ライン（問） - 令和6年度は36問 */
export const PASS_LINE = 36;
