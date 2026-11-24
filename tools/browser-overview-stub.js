/* 非 AI 专项使用替身隔离自动生成；真实协议与模型由 browser-overview.js 单独验证。 */
module.exports = async context => {
  await context.route('**/api/organization-overview', async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      factsHash: body.factsHash, requestId: body.requestId, model: 'browser-test-stub',
      promptVersion: 'test', paragraphs: [{ runs: [{ text: '组织调整概览测试文稿。' }] }], reviewNotes: []
    }) });
  });
};
