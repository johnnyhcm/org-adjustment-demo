/* 对比页概览组件：首次自动生成，已有文稿由用户更新，编辑与业务数据分离。 */
(function (root) {
  const O = root.OA.Overview, S = root.OA.store;
  root.OA.OverviewComponent = {
    props: { planId: { type: String, required: true } },
    template: `<section class="oa-overview" aria-label="组织调整概览" :aria-busy="generating">
      <div class="oa-overview-heading">
        <span class="basic-title">组织调整概览</span>
        <span class="oa-overview-actions" v-if="editable">
          <a-button size="small" :disabled="generating || editing" @click="generate">✦ AI 生成</a-button>
          <a-button size="small" type="link" :disabled="editing" @click="edit">编辑</a-button>
        </span>
      </div>
      <div v-if="generating" class="oa-overview-loading" role="status"><span class="oa-overview-spinner" aria-hidden="true"></span>AI 正在梳理组织调整及人员、编制安排</div>
      <div v-if="error" class="oa-overview-error" role="alert">{{ error }} <a v-if="configError" href="/ai-settings" target="_blank" rel="noopener">模型配置</a></div>
      <div v-if="stale && doc.revision > 0 && !generating" class="oa-overview-notice">方案已调整，可重新生成或编辑概览。</div>
      <div v-show="!editing && hasText && !generating" ref="viewer" class="oa-overview-text"></div>
      <div v-if="!hasText && !editing && !generating" class="muted oa-overview-empty">{{ editable ? '根据最新调整生成概览，也可直接编辑。' : '该版本未填写组织调整概览。' }}</div>
      <div v-if="doc.reviewNotes && doc.reviewNotes.length && !editing && !generating" class="oa-overview-notice"><div v-for="(note, i) in doc.reviewNotes" :key="i">需核对：{{ note }}</div></div>
      <div v-show="editing" class="oa-overview-edit">
        <!-- 已确认选用 Quill 2；目录无富文本业务组件，格式限 PRD CMP-61。 -->
        <div ref="toolbar" class="oa-overview-toolbar">
          <select class="ql-size" aria-label="字号"><option value="12px" selected>12</option><option value="14px">14</option><option value="16px">16</option><option value="18px">18</option></select>
          <button class="ql-bold" type="button" aria-label="加粗"></button>
          <select class="ql-color" aria-label="文字颜色"><option value="#333333" selected></option><option value="#0e66fb"></option><option value="#ff4d4f"></option><option value="#00b259"></option><option value="#d48806"></option></select>
          <button class="ql-clean" type="button" aria-label="清除格式"></button>
        </div>
        <div ref="editor" class="oa-overview-editor" aria-label="编辑组织调整概览"></div>
        <div class="oa-overview-edit-actions"><a-button size="small" @click="cancelEdit">取消</a-button><a-button size="small" type="primary" @click="saveEdit">保存</a-button></div>
      </div>
    </section>`,
    data() {
      const plan = S.getPlan(this.planId), pd = S.getPlanData(this.planId);
      const editable = !!plan && S.EDITABLE_STATUS.includes(plan.status);
      let doc, loadError = '';
      try { doc = editable ? O.read(this.planId) : pd.versions.length ? pd.versions[pd.versions.length - 1].overview : null; }
      catch (e) { loadError = e.message; }
      return { doc: doc || { revision: 0, delta: { ops: [{ insert: '\n' }] } }, editable, generating: false, editing: false,
        error: loadError, configError: false, currentHash: '', requestSerial: 0, draftChanged: false };
    },
    computed: {
      hasText() { return !!O.plainText(this.doc.delta); },
      stale() { return this.editable && this.doc.sourceFactsHash && this.currentHash && this.doc.sourceFactsHash !== this.currentHash; },
      factsSignature() { return this.editable ? O.canonical(O.buildFacts(this.planId)) : ''; }
    },
    watch: {
      factsSignature() { this.refreshHash(); },
      'doc.revision'() { this.$nextTick(this.paint); }
    },
    mounted() {
      this._alive = true;
      root.oaOverviewCanClose = () => !this.editing || !this.draftChanged;
      this._onStorage = e => {
        if (e.key === S.STORAGE_PREFIX + 'overview.' + this.planId) {
          if (this.editing || this.generating) this.error = '概览已在其他窗口修改，请重新打开后继续';
          else { try { this.doc = O.read(this.planId); this.$nextTick(this.paint); } catch (err) { this.error = err.message; } }
        }
        if (e.key === S.STORAGE_PREFIX + 'plan.' + this.planId) { this.error = '方案已在其他窗口更新，请重新打开对比页'; this.requestSerial++; if (this._controller) this._controller.abort(); this.generating = false; }
      };
      root.addEventListener('storage', this._onStorage);
      this.paint(); this.refreshHash().then(() => this.autoGenerate());
    },
    beforeUnmount() {
      this._alive = false; this.requestSerial++;
      delete root.oaOverviewCanClose;
      if (this._controller) this._controller.abort();
      root.removeEventListener('storage', this._onStorage);
      if (this._editor) { this._editor.off('text-change', this._onEdit); this._editor = null; }
    },
    methods: {
      paint() {
        if (this.$refs.viewer) O.render(this.$refs.viewer, this.doc.delta);
      },
      async refreshHash() {
        const serial = this._hashSerial = (this._hashSerial || 0) + 1;
        try { const hash = await O.fingerprint(O.buildFacts(this.planId)); if (this._alive && serial === this._hashSerial) this.currentHash = hash; }
        catch (e) { if (this._alive) this.error = e.message; }
      },
      async autoGenerate() {
        if (!this._alive || !this.editable || this.error || this.editing || this.generating || !this.currentHash) return;
        try {
          const latest = O.read(this.planId);
          if (latest.revision !== this.doc.revision) { this.doc = latest; this.$nextTick(this.paint); }
          if (latest.revision !== 0 || O.plainText(latest.delta)) return;
          const facts = O.buildFacts(this.planId);
          if (!Object.values(facts.changes).some(rows => rows.length)) return;
          await this.generate();
        } catch (e) { if (this._alive) this.error = e.message; }
      },
      async edit() {
        this.error = ''; this.editing = true;
        await this.$nextTick();
        if (!this._editor) {
          const Size = root.Quill.import('attributors/style/size'); Size.whitelist = O.sizes; root.Quill.register(Size, true);
          const Color = root.Quill.import('attributors/style/color'); Color.whitelist = O.colors.flatMap(color => { const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)); return [color, 'rgb(' + rgb.join(', ') + ')']; }); root.Quill.register(Color, true);
          this._editor = new root.Quill(this.$refs.editor, { theme: 'snow', formats: ['bold', 'size', 'color'], modules: { toolbar: this.$refs.toolbar } });
          this._onEdit = () => { this.draftChanged = true; };
          this._editor.on('text-change', this._onEdit);
        }
        this._editor.setContents(O.cleanDelta(this.doc.delta), 'silent'); this.draftChanged = false;
        this._editRevision = this.doc.revision;
        this._editHash = this.doc.sourceFactsHash || this.currentHash;
        this._editor.focus();
      },
      cancelEdit() { this.editing = false; this.draftChanged = false; this.error = ''; },
      saveEdit() {
        try {
          this.doc = O.save(this.planId, { ...this.doc, delta: this._editor.getContents(), source: this.doc.source === 'ai' ? 'ai-edited' : this.doc.source || 'manual', sourceFactsHash: this._editHash }, this._editRevision);
          this.editing = false; this.draftChanged = false; this.error = ''; this.$nextTick(this.paint);
        } catch (e) { this.error = e.message + '；编辑内容已保留'; }
      },
      async generate() {
        if (this.generating || this.editing || !this.editable) return;
        this.error = ''; this.configError = false;
        if (root.location.protocol !== 'http:' && root.location.protocol !== 'https:') { this.error = '真实AI生成需要通过本机HTTP预览服务打开；当前文稿仍可编辑。不同地址的方案数据独立，请先保留当前方案。'; return; }
        const serial = ++this.requestSerial;
        this.generating = true;
        this._controller = new AbortController();
        try {
          O.checkBusinessRevision(this.planId);
          const docRevision = O.read(this.planId).revision;
          const facts = O.buildFacts(this.planId), factsHash = await O.fingerprint(facts);
          if (!this._alive || serial !== this.requestSerial) return;
          if (this.editing || O.read(this.planId).revision !== docRevision || this.doc.revision !== docRevision) throw new Error('生成期间概览已修改，请重新生成');
          const requestId = String(Date.now()) + '-' + serial;
          const res = await fetch('/api/organization-overview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts, factsHash, requestId }), signal: this._controller.signal });
          let result;
          try { result = await res.json(); } catch (e) { throw new Error('当前预览服务未接入AI接口，请使用 overview-server.py 启动本机服务'); }
          if (!res.ok) { this.configError = result.code === 'NOT_CONFIGURED' || result.code === 'MODEL_HTTP_ERROR'; throw new Error(result.error || 'AI生成未完成，请重试'); }
          if (!this._alive || serial !== this.requestSerial) return;
          O.checkBusinessRevision(this.planId);
          const latestHash = await O.fingerprint(O.buildFacts(this.planId));
          if (!this._alive || serial !== this.requestSerial) return;
          this.currentHash = latestHash;
          if (result.factsHash !== factsHash || result.requestId !== requestId || latestHash !== factsHash) throw new Error('生成期间方案已调整，请基于最新变化重新生成');
          if (this.editing || O.read(this.planId).revision !== docRevision || this.doc.revision !== docRevision) throw new Error('生成期间概览已修改，请重新生成');
          const generated = { delta: O.paragraphsToDelta(result.paragraphs), source: 'ai', sourceFactsHash: factsHash,
            generatedAt: new Date().toISOString(), model: result.model, promptVersion: result.promptVersion,
            reviewNotes: result.reviewNotes || [], evidenceIds: result.paragraphs.flatMap(p => p.evidenceIds || []) };
          this.doc = O.save(this.planId, generated, docRevision);
          this.$nextTick(this.paint);
        } catch (e) { if (this._alive && serial === this.requestSerial && e.name !== 'AbortError') this.error = e.message; }
        finally { if (this._alive && serial === this.requestSerial) this.generating = false; }
      },
      prepareSubmit() {
        if (this.editing) { this.error = '请先保存或取消概览编辑，再提交方案'; return false; }
        if (this.generating) { this.error = '概览正在生成，请等待结束后再提交'; return false; }
        return true;
      }
    }
  };
})(window);
