import { reactive } from 'vue';

/* 全局 UI 状态：弹窗路由、预览载荷、确认框、Toast、横幅关闭状态 */
export const ui = reactive({
  modal: null,            // 'settings' | 'project-new' | 'project-edit' | 'preview' | 'confirm' | null
  projectDraft: null,     // {id?, name, goal, status}
  preview: null,          // {message, oldState, merged, diff, ai, errors, onApplied}
  confirm: null,          // {title, body, confirmLabel, danger, onOk}
  view: 'board',          // 'board' 待办总览 | 'project' 项目工作区
  toast: { text: '', type: 'info', seq: 0 },
  bannerClosed: { resume: false, backup: false },
  quickLogSeq: 0,         // 托盘「快速记录」触发计数（组件 watch）
});

export function openModal(name, payload) { ui.modal = name; if (payload) Object.assign(ui, payload); }
export function closeModal() { ui.modal = null; ui.preview = null; ui.confirm = null; ui.projectDraft = null; }

export function toast(text, type = 'info') {
  ui.toast = { text, type, seq: ui.toast.seq + 1 };
  if (type === 'error') console.error('[toast:error]', text);
}

export function askConfirm({ title, body, confirmLabel = '确认', danger = false, onOk }) {
  ui.confirm = { title, body, confirmLabel, danger, onOk };
  ui.modal = 'confirm';
}
