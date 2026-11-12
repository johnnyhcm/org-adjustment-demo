/* Node 自测入口：以 localStorage 垫片运行与浏览器完全相同的断言。
 * 用法：node tools/run-tests.js   （退出码 0=全绿）
 */
global.localStorage = {
  _m: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; }
};
require('../原型/组织调整/shared/seed-data.js');
require('../原型/组织调整/shared/store.js');
require('../原型/组织调整/tests/selftest-runner.js');

const results = globalThis.OA.selftest.runAll();
results.push(...require('./workbench-regression.js')());
let fail = 0;
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '\n      └ ' + r.error}`);
  if (!r.pass) fail++;
}
console.log(`\n共 ${results.length} 项，通过 ${results.length - fail}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
