import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Tailwindクラス名をマージするユーティリティ関数
 * clsxで条件付きクラス名を処理し、tailwind-mergeで重複を解決する
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
