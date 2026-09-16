/* SD 命名空间引导 —— 浏览器中第一个加载；测试中由加载器注入同构对象 */
var SD = (typeof window !== 'undefined' ? window : globalThis).SD = {
  DATA: {},
  state: null,      // {child, records, vaccineDone}
};
