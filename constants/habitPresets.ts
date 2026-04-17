// ============================================================
// 宅建士 完全対策 - 習慣スタッキング プリセット
// ============================================================

import type { HabitStack } from '../types';

export const HABIT_PRESETS: HabitStack[] = [
  { id: 'morning', trigger: '朝コーヒーを淹れたら', action: '一問一答を5問解く', icon: '☕', enabled: false },
  { id: 'commute', trigger: '電車に乗ったら', action: '過去問を3問解く', icon: '🚃', enabled: false },
  { id: 'lunch', trigger: '昼休みに', action: '苦手分野を5問復習', icon: '🍽️', enabled: false },
  { id: 'bath', trigger: 'お風呂に入る前に', action: '模擬試験の復習をする', icon: '🛁', enabled: false },
  { id: 'bed', trigger: '寝る前に', action: '今日の間違いを復習', icon: '🌙', enabled: false },
];
