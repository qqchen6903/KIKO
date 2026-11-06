<script setup>
/* 待办总览（待办22）：跨项目汇总未完成待办，按 优先级→到期时间 排序；
 * 行内完成/跳转/删除，底部快速新增，全清时 KIKO 庆祝。 */
import { computed, ref } from 'vue';
import S from '../shared-bridge';
import { store, selectProject, toggleTodoIn, removeTodoIn, addTodoIn } from '../store/workspace';
import AppIcon from './AppIcon.vue';

const PW = { '高': 0, '普通': 1, '低': 2 };

const rows = computed(() => {
  const out = [];
  for (const p of store.db?.projects || []) {
    (p.state?.todos || []).forEach((t, i) => {
      if (!t.done) out.push({ pid: p.id, pname: p.name, i, t });
    });
  }
  const key = r => (r.t.due ? Date.parse(r.t.due) : Number.MAX_SAFE_INTEGER);
  out.sort((a, b) => (PW[a.t.priority] ?? 1) - (PW[b.t.priority] ?? 1) || key(a) - key(b));
  return out;
});
const overdue = computed(() => rows.value.filter(r => r.t.due && Date.parse(r.t.due) < Date.now()));
/* 待办39：阻塞中统计（未完成且带 blocked 属性） */
const blockedTotal = computed(() => rows.value.filter(r => r.t.blocked).length);
const today = computed(() => rows.value.filter(r => {
  if (!r.t.due) return false;
  const d = new Date(r.t.due), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}));
const recentDone = computed(() => {
  const all = [];
  for (const p of store.db?.projects || []) {
    (p.state?.todos || []).forEach((t, i) => { if (t.done) all.push({ pid: p.id, pname: p.name, i, t }); });
  }
  return all.sort((a, b) => String(b.t.doneAt || '').localeCompare(String(a.t.doneAt || ''))).slice(0, 3);
});
const isOver = t => t.due && Date.parse(t.due) < Date.now();

/* 待办44：待确认分区——待定池中跟进日期已过、仍未确认的条目 */
const pendNeed = computed(() => {
  const out = [];
  for (const p of store.db?.projects || []) {
    (p.state?.pending || []).forEach((x, i) => {
      if (x.state === 'open' && x.followUp && Date.parse(x.followUp) < Date.now()) out.push({ pid: p.id, pname: p.name, i, x });
    });
  }
  return out.sort((a, b) => Date.parse(a.x.followUp) - Date.parse(b.x.followUp));
});

/* 快速新增：到期用原生日期+时间选择器（待办19） */
const nPid = ref('');
const nTitle = ref('');
const nDate = ref('');
const nTime = ref('');
const nPri = ref('普通');
function submitAdd() {
  const pid = nPid.value || store.db?.projects[0]?.id;
  if (!pid || !nTitle.value.trim()) return;
  const dueRaw = nDate.value ? `${nDate.value} ${nTime.value || '09:00'}` : '';
  addTodoIn(pid, { title: nTitle.value, dueRaw, priority: nPri.value });
  nTitle.value = ''; nDate.value = ''; nTime.value = ''; nPri.value = '普通';
}
function goto(pid) { selectProject(pid); }
</script>

<template>
  <main class="main board">
    <div class="crumb">工作空间　/　待办总览</div>
    <div class="heading">
      <div>
        <h1>待办总览</h1>
        <div class="chips">
          <span class="chip">共 {{ rows.length }} 项待办</span>
          <span class="chip red" v-if="overdue.length">{{ overdue.length }} 项已过期</span>
          <span class="chip blue" v-if="today.length">{{ today.length }} 项今天到期</span>
          <span class="chip red" v-if="blockedTotal">{{ blockedTotal }} 项阻塞中</span>
        </div>
      </div>
    </div>

    <section class="card list-card" v-if="rows.length">
      <TransitionGroup name="rows" tag="div">
        <div v-for="r in rows" :key="r.pid + ':' + r.i" class="trow" :class="{ over: isOver(r.t) }">
          <input type="checkbox" class="chk" :checked="false" @change="toggleTodoIn(r.pid, r.i)" />
          <div class="grow">
            <div class="title">{{ r.t.title }}</div>
            <div class="sub">
              <button class="pj" @click="goto(r.pid)">{{ r.pname }} ↗</button>
              <span class="tag" :class="{ hi: r.t.priority === '高', lo: r.t.priority === '低' }" v-if="r.t.priority !== '普通'">{{ r.t.priority }}</span>
              <span class="due" :class="{ over: isOver(r.t) }" v-if="r.t.due">{{ isOver(r.t) ? '已过期 · ' : '' }}{{ S.dueLabel(r.t.due) }}</span>
              <span class="tag blocked" v-if="r.t.blocked" :title="'阻塞点：' + r.t.blocked">阻塞</span>
              <span class="next" v-if="r.t.next" :title="'下一步：' + r.t.next">下一步：{{ r.t.next }}</span>
            </div>
          </div>
          <button class="mini danger" title="删除" @click="removeTodoIn(r.pid, r.i)"><AppIcon name="x" :size="12" /></button>
        </div>
      </TransitionGroup>
    </section>

    <section class="card pend-card" v-if="pendNeed.length">
      <div class="cardhead"><h3><AppIcon name="target" :size="14" /> 待确认 <span class="sub2">待定池跟进时间已到、还没确认的事项</span></h3></div>
      <div v-for="r in pendNeed" :key="'p' + r.pid + r.i" class="trow">
        <span class="pdot"></span>
        <div class="grow">
          <div class="title">{{ r.x.text }}</div>
          <div class="sub">
            <button class="pj" @click="goto(r.pid)">{{ r.pname }} ↗</button>
            <span class="due over">该跟进 · {{ S.dueLabel(r.x.followUp) }}</span>
            <span class="pw" v-if="r.x.waiting">在等：{{ r.x.waiting }}</span>
          </div>
        </div>
      </div>
    </section>

    <section class="card celebrate" v-if="!rows.length">
      <div class="celeb-inner">
        <img class="kiko-img" :src="'kiko/' + (store.db?.projects?.length ? 'done.png' : 'mascot.png')" alt="KIKO" />
        <p>{{ store.db?.projects?.length ? '待办全部完成，KIKO 替你开心！' : '还没有待办。在项目里让 KIKO 整理进展，或在下方快速记一条。' }}</p>
      </div>
    </section>

    <section class="card add-card">
      <div class="cardhead"><h3>快速记一条</h3></div>
      <div class="addrow">
        <select v-model="nPid">
          <option value="" disabled selected>选择项目</option>
          <option v-for="p in store.db?.projects || []" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <input class="t" v-model="nTitle" placeholder="要做什么，回车保存" @keyup.enter="submitAdd" />
        <input class="dt" v-model="nDate" type="date" title="到期日期（可选）" />
        <input class="dt" v-model="nTime" type="time" title="到期时间（选日期后默认 09:00）" />
        <select v-model="nPri"><option v-for="p in S.PRIORITIES" :key="p">{{ p }}</option></select>
        <button class="btn primary" @click="submitAdd" :disabled="!nTitle.trim() || !(nPid || store.db?.projects?.length)">添加</button>
      </div>
    </section>

    <section class="card done-card" v-if="recentDone.length">
      <div class="cardhead"><h3>最近完成</h3></div>
      <div v-for="r in recentDone" :key="'d' + r.pid + r.i" class="trow done">
        <span class="ddot">✓</span>
        <div class="grow">
          <div class="title">{{ r.t.title }}</div>
          <div class="sub"><span class="pj2">{{ r.pname }}</span><span class="due2" v-if="r.t.doneAt">{{ S.fmtShort(r.t.doneAt) }}</span></div>
        </div>
        <button class="mini" title="重新打开" @click="toggleTodoIn(r.pid, r.i)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9.5a8.5 8.5 0 1 1 2.4 8.1"/><path d="M3.5 4.5v5h5"/></svg></button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.main { padding: 6px 34px 44px; overflow: auto; min-width: 0; flex: 1; min-height: 0; }
.crumb { font-size: 11.5px; color: var(--text-3); margin-bottom: 8px; }
.heading { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; }
.heading h1 { font-size: 22px; margin: 0 0 8px; font-weight: 700; letter-spacing: -.02em; }
.chips { display: flex; gap: 7px; flex-wrap: wrap; }
.chip { font-size: 11px; color: var(--text-2); background: rgba(255,255,255,.6); border: 1px solid rgba(255,255,255,.7); border-radius: 980px; padding: 2px 10px; box-shadow: inset 0 1px 0 rgba(255,255,255,.8); }
.chip.red { color: var(--red); }
.chip.blue { color: var(--accent); }
.card { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--radius); box-shadow: var(--shadow-card); padding: 16px 18px; margin-bottom: 16px; max-width: 760px; }
.list-card { padding: 8px 18px; }
.trow { display: flex; align-items: center; gap: 12px; padding: 11px 2px; border-bottom: 1px solid rgba(11,18,32,.05); }
.trow:last-child { border-bottom: 0; }
.trow.over .title { color: #b02a31; }
.grow { flex: 1; min-width: 0; }
.title { font-size: 13.5px; line-height: 1.5; word-break: break-word; }
.sub { display: flex; align-items: center; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.pj { border: 0; background: transparent; color: var(--accent); font-size: 11.5px; cursor: pointer; padding: 1px 8px 1px 0; font-family: inherit; border-radius: 6px; }
.pj:hover { text-decoration: underline; }
.pj2 { font-size: 11.5px; color: var(--text-3); }
.due { font-size: 11px; color: var(--text-2); }
.due.over { color: var(--red); font-weight: 600; }
.due2 { font-size: 11px; color: var(--text-3); }
.tag { font-size: 10px; border-radius: 980px; padding: 1px 8px; border: 1px solid rgba(255,255,255,.6); box-shadow: inset 0 1px 0 rgba(255,255,255,.7); }
.tag.hi { background: rgba(255,214,210,.65); color: #b02a31; }
.tag.lo { background: rgba(228,232,241,.7); color: var(--text-2); }
.tag.blocked { background: rgba(255,214,210,.8); color: #b02a31; font-weight: 600; }
/* 待办44：待确认分区 */
.pend-card h3 { display: flex; align-items: center; gap: 6px; }
.sub2 { font-size: 11px; color: var(--text-3); font-weight: 400; }
.pdot { width: 8px; height: 8px; border-radius: 50%; background: var(--orange); flex-shrink: 0; box-shadow: inset 0 -1px 1px rgba(0,0,0,.12), inset 0 1px 1px rgba(255,255,255,.7); }
.pw { font-size: 11px; color: #1c5aa8; }
.next { font-size: 11px; color: #1c5aa8; max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.chk { appearance: none; -webkit-appearance: none; width: 19px; height: 19px; border-radius: 50%; margin: 0; flex-shrink: 0; cursor: pointer; border: 1.5px solid rgba(11,18,32,.22); background: rgba(255,255,255,.75); box-shadow: inset 0 1px 2px rgba(14,38,86,.08); transition: all .22s var(--spring); }
.chk:hover { border-color: rgba(29,158,90,.6); background: #fff; }
.celebrate { text-align: center; padding: 26px 18px; }
.celebrate .kiko-img { width: 132px; border-radius: 22px; box-shadow: 0 10px 28px rgba(14,38,86,.14); animation: breathe 4s var(--ease) infinite; }
.celebrate p { font-size: 13px; color: var(--text-2); margin: 14px 0 0; }
@keyframes breathe { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.addrow { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.addrow select, .addrow input { border: 1px solid rgba(11,18,32,.12); border-radius: 10px; padding: 7px 10px; font-size: 12.5px; outline: none; background: rgba(255,255,255,.62); }
.addrow select:focus, .addrow input:focus { background: rgba(255,255,255,.88); border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0,113,227,.14); }
.addrow .t { flex: 2; min-width: 150px; }
.addrow .dt { flex: 0 0 auto; width: 128px; }
.cardhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
h3 { font-size: 13px; margin: 0; color: var(--text-2); font-weight: 600; }
.trow.done { opacity: .62; }
.trow.done .title { text-decoration: line-through; color: var(--text-3); }
.ddot { width: 19px; height: 19px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-size: 11px; color: #fff; background: linear-gradient(180deg,#3fcf75,var(--green)); box-shadow: 0 2px 6px rgba(29,158,90,.35); }
.done-card .mini { margin-left: auto; }
.rows-enter-active { transition: all .24s var(--ease); }
.rows-leave-active { transition: all .16s ease-in; }
.rows-enter-from { opacity: 0; transform: translateY(5px); }
.rows-leave-to { opacity: 0; }
.rows-move { transition: transform .24s var(--ease); }
</style>
