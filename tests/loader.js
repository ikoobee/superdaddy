/* 测试加载器：按浏览器相同顺序执行经典脚本，注入 SD 命名空间（同源双端） */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadSD() {
  globalThis.window = globalThis;          // boot.js 挂 window/SD
  const files = [
    'src/boot.js',
    'src/data/vaccine.data.js',
    'src/data/who.data.js',
    'src/data/guide.data.js',
    'src/data/feed.data.js',
    'src/utils/time.js',
    'src/utils/vaccine.js',
    'src/utils/summary.js',
    'src/utils/growth.js',
    'src/utils/features.js',
    'src/utils/trends.js',
    'src/data/day42.data.js', 'src/data/bag.data.js',
    'src/utils/tasks.js',
    'src/utils/cal.js',
    'src/utils/preg.js',
    'src/data/sleep_ref.data.js',
  ];
  let code = ''
  for (const f of files) code += readFileSync(join(root, f), 'utf8') + '\n'
  new Function(code)()                      // 同一作用域顺序执行
  return globalThis.SD
}
