<script setup>
import { reactive, ref, watch } from 'vue';
import { store, saveSettings, testProvider, openDataDir } from '../store/workspace';
import { ui, closeModal, toast } from '../store/ui';

const PRESETS = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', providerType: 'openai' },
  { name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', providerType: 'openai' },
  { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', providerType: 'openai' },
  { name: '百炼 Token Plan', baseUrl: 'https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic', model: 'claude-sonnet-5-5', providerType: 'anthropic' },
];

const f = reactive({ baseUrl: '', model: '', apiKey: '', providerType: 'openai', shortcut: '', autostart: false, remindersOn: true, petEnabled: true });
const testBusy = ref(false);
const testResult = ref(null);
const dirInfo = reactive({ root: '', custom: false, busy: false });

async function refreshDir() {
  try { Object.assign(dirInfo, await window.assistant.getDataDirInfo(), { busy: false }); } catch {}
}
async function changeDir() {
  dirInfo.busy = true;
  try {
    const r = await window.assistant.chooseDataDir();
    if (r.ok) { toast('存储位置已迁移到 ' + r.root, 'success'); refreshDir(); }
    else if (!r.cancelled && r.message) toast(r.message, 'warn');
  } finally { dirInfo.busy = false; }
}
async function resetDir() {
  dirInfo.busy = true;
  try {
    const r = await window.assistant.resetDataDir();
    if (r.ok) { toast('已恢复默认存储位置', 'success'); refreshDir(); }
  } finally { dirInfo.busy = false; }
}

watch(() => ui.modal, (v) => {
  if (v === 'settings') {
    const s = store.db.settings;
    f.baseUrl = s.baseUrl || '';
    f.model = s.model || '';
    f.apiKey = '';
    f.providerType = s.providerType === 'anthropic' ? 'anthropic' : 'openai';
    f.shortcut = s.shortcut || store.meta.defaultShortcut;
    f.autostart = !!store.meta.autostart;
    f.remindersOn = s.remindersOn !== false;
    f.petEnabled = s.petEnabled !== false;
    testResult.value = null;
    refreshDir();
  }
}, { immediate: true });

function usePreset(p) {
  f.baseUrl = p.baseUrl;
  f.model = p.model;
  f.providerType = p.providerType;
}

async function runTest() {
  testBusy.value = true;
  testResult.value = null;
  try {
    const r = await testProvider({ baseUrl: f.baseUrl.trim(), model: f.model.trim(), providerType: f.providerType });
    testResult.value = r.ok ? { kind: 'ok', text: `连接成功（${r.ms}ms）` } : { kind: 'err', text: r.message };
  } finally {
    testBusy.value = false;
  }
}

async function save() {
  if (!f.baseUrl.trim().startsWith('http')) return toast('API 地址需以 http(s):// 开头', 'warn');
  if (!f.model.trim()) return toast('请填写模型名称', 'warn');
  await saveSettings({
    settings: {
      baseUrl: f.baseUrl.trim().replace(/\/$/, ''),
      model: f.model.trim(),
      providerType: f.providerType,
      shortcut: f.shortcut.trim(),
      autostart: f.autostart,
      remindersOn: f.remindersOn,
      petEnabled: f.petEnabled,
    },
    apiKey: f.apiKey,
  });
  store.meta.autostart = f.autostart;
  closeModal();
  toast('设置已保存', 'success');
}
</script>

<template>
  <div class="dialog">
    <h2>设置</h2>

    <div class="label">模型服务商预设</div>
    <div class="presets">
      <button class="pchip" v-for="p in PRESETS" :key="p.name" @click="usePreset(p)">{{ p.name }}</button>
    </div>

    <label class="field">接口协议
      <select v-model="f.providerType">
        <option value="openai">OpenAI 兼容</option>
        <option value="anthropic">Anthropic 兼容</option>
      </select>
    </label>
    <label class="field">API 地址<input v-model="f.baseUrl" :placeholder="f.providerType === 'anthropic' ? 'https://…/apps/anthropic' : 'https://api.deepseek.com'" /></label>
    <label class="field">模型名称<input v-model="f.model" :placeholder="f.providerType === 'anthropic' ? 'claude-sonnet-5-5' : 'deepseek-chat'" /></label>
    <label class="field">API Key<input v-model="f.apiKey" type="password" :placeholder="store.hasKey ? '已保存，留空则不修改' : '填写 API Key'" /></label>

    <div class="testrow">
      <button class="btn" :disabled="testBusy" @click="runTest">{{ testBusy ? '测试中…' : '测试连接' }}</button>
      <span v-if="testResult" class="tr" :class="testResult.kind">{{ testResult.text }}</span>
    </div>

    <div class="sep"></div>

    <label class="field">全局唤起快捷键<input v-model="f.shortcut" :placeholder="store.meta.defaultShortcut" /></label>
    <label class="check"><input type="checkbox" v-model="f.autostart" />开机自动启动</label>
    <label class="check"><input type="checkbox" v-model="f.remindersOn" />待办到期通知</label>
    <label class="check"><input type="checkbox" v-model="f.petEnabled" />桌面显示 KIKO 桌宠</label>

    <div class="sep"></div>

    <div class="label">数据存储位置</div>
    <div class="dirbox">
      <code :title="dirInfo.root">{{ dirInfo.root || '…' }}</code>
      <span class="tag2" v-if="dirInfo.custom">自定义</span>
    </div>
    <div class="dirbtns">
      <button class="btn" :disabled="dirInfo.busy" @click="changeDir">更改位置…</button>
      <button class="btn" v-if="dirInfo.custom" :disabled="dirInfo.busy" @click="resetDir">恢复默认</button>
      <button class="btn" @click="openDataDir()">打开目录</button>
    </div>

    <div class="dialogfoot">
      <button class="btn" @click="closeModal()">取消</button>
      <button class="btn primary" @click="save">保存</button>
    </div>
  </div>
</template>

<style scoped>
.label { font-size: 12px; color: var(--text-2); margin-bottom: 6px; }
.presets { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 4px; }
.pchip { border: 1px solid rgba(255, 255, 255, .7); background: rgba(255, 255, 255, .45); border-radius: 980px; font-size: 12px; padding: 5px 13px; cursor: pointer; color: var(--text-2); transition: all .16s var(--spring); font-family: inherit; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .8); }
.pchip:hover { border-color: rgba(0, 113, 227, .45); color: var(--accent); background: rgba(255, 255, 255, .85); transform: translateY(-1px); }
.field .muted { display: block; margin-top: 5px; }
.testrow { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.tr { font-size: 12px; }
.tr.ok { color: #1d7a4f; }
.tr.err { color: var(--red); }
.sep { height: 1px; background: linear-gradient(90deg, transparent, rgba(11, 18, 32, .1), transparent); margin: 16px 0; }
.dirbox { display: flex; align-items: center; gap: 8px; margin: 4px 0 8px; }
.dirbox code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; font-size: 11.5px; background: rgba(11, 18, 32, .05); border-radius: 8px; padding: 5px 9px; color: var(--text-2); }
.tag2 { font-size: 10px; color: var(--accent); background: rgba(0, 113, 227, .1); border-radius: 980px; padding: 2px 8px; flex-shrink: 0; }
.dirbtns { display: flex; gap: 8px; flex-wrap: wrap; }
.check .muted { font-size: 11px; }
.petnote { font-size: 11.5px; color: var(--text-3); margin: 4px 0 0; line-height: 1.7; }
.adv { display: flex; flex-direction: column; gap: 6px; }
.adv .muted { line-height: 1.7; font-size: 11.5px; }
</style>
