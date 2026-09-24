/* 应用入口 —— 五 Tab 信息架构 + 旧路由别名兼容 + 表单真路由 + 顶栏返回 */
SD.app = (() => {
  const TABS = ['home', 'feed', 'growth', 'guide', 'family']
  // 旧顶级路由 → [新视图, 页内分段, 孕产子段]（保留肌肉记忆与深链）
  const ALIAS = {
    vaccine: ['growth', 'vac'], diary: ['growth', 'ms'], calendar: ['growth', 'cal'],
    food: ['guide', 'food'], supp: ['guide', 'food'], mom: ['guide', 'care'], health: ['guide', 'care'],
    day42: ['guide', 'birth', 'd42'], bag: ['guide', 'birth', 'bag'],
    temp: ['growth', 'temp'],
    help: ['settings', null], task: ['family', 'task'], card: ['family', 'card'],
  }
  const SEG_KEY = { growth: 'gseg', guide: 'useg', family: 'fseg' }
  const STANDALONE = ['settings', 'sound', 'feed-form', 'sleep-form', 'temp-form']
  const VIEW_FN = { 'feed-form': 'feedform', 'sleep-form': 'sleepform', 'temp-form': 'tempform' }

  function resolve() {
    const h = (location.hash || '#home').slice(1)
    if (TABS.includes(h)) return { view: h, seg: null, sub: null }
    if (STANDALONE.includes(h)) return { view: VIEW_FN[h] || h, seg: null, sub: null }
    const a = ALIAS[h]
    return a ? { view: a[0], seg: a[1], sub: a[2] || null } : { view: 'home', seg: null, sub: null }
  }

  function updateChip() {
    const chip = document.getElementById('age-chip')
    const c = SD.store.child
    if (!c) { chip.hidden = true; return }
    const multi = SD.state.children.length > 1
    chip.hidden = false
    const label = c.birth
      ? `第 ${SD.time.ageParts(c.birth).days} 天`
      : (() => { const p = SD.preg.pregParts(c.due); return `孕 ${p.week}周+${p.day}` })()
    chip.innerHTML = `${esc(c.name)} · ${label}${multi ? ' <b class="chip-arrow">›</b>' : ''}`
    chip.dataset.multi = multi ? '1' : ''
  }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  function render() {
    const { view, seg, sub } = resolve()
    const el = document.getElementById('view')
    if (SEG_KEY[view]) {
      if (seg) el.dataset[SEG_KEY[view]] = seg
      else if (location.hash.slice(1) === view) delete el.dataset[SEG_KEY[view]]
    }
    if (sub) el.dataset.birthsub = sub
    document.querySelectorAll('nav.tabs a').forEach(a =>
      a.classList.toggle('active', a.dataset.view === view))
    // 顶栏返回：非 Tab 页显示
    document.getElementById('back-btn').hidden = TABS.includes(view)

    updateChip()
    if (SD.noiseCtrl) SD.noiseCtrl.refresh()
    SD.views[view](el)
    if (view !== 'growth') { delete el.dataset.gseg; delete el.dataset.metric }
    if (view !== 'guide') { delete el.dataset.useg; delete el.dataset.birthsub }
    if (view !== 'family') delete el.dataset.fseg
  }

  function start() {
    SD.store.load()
    window.addEventListener('hashchange', render)
    document.getElementById('back-btn').addEventListener('click', () => (location.hash = '#home'))
    // 顶栏白噪音指示器：后台播放中显示 ♪，点击停止
    document.getElementById('noise-ind')?.addEventListener('click', () => {
      SD.noiseCtrl && SD.noiseCtrl.stop()
    })
    // 顶栏 chip：点击弹出下拉（切换宝宝 / 添加宝宝）
    document.getElementById('age-chip').addEventListener('click', e => {
      e.stopPropagation()
      const menu = document.getElementById('child-menu')
      if (menu && !menu.hidden) { menu.hidden = true; return }
      buildChildMenu()
    })
    document.addEventListener('click', () => { const m = document.getElementById('child-menu'); if (m) m.hidden = true })
    // 日期框整框可点弹出日历（原生 showPicker）
    document.addEventListener('click', e => {
      if (e.target.matches('input[type="date"]')) { try { e.target.showPicker() } catch {} }
    })
    render()
    // PWA：仅网络协议下启用（manifest 动态注入 + SW 仅 https），file:// 双击完全不受影响
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      const l = document.createElement('link')
      l.rel = 'manifest'; l.href = 'manifest.webmanifest'
      document.head.appendChild(l)
      if ('serviceWorker' in navigator && location.protocol === 'https:') {
        navigator.serviceWorker.register('sw.js').catch(() => {})
      }
    }
  }

  function buildChildMenu() {
    let menu = document.getElementById('child-menu')
    if (!menu) {
      menu = document.createElement('div')
      menu.id = 'child-menu'
      document.querySelector('header.top').appendChild(menu)
      menu.addEventListener('click', e => e.stopPropagation())
    }
    menu.innerHTML = SD.state.children.map(c => `
      <button data-cid="${c.id}" class="${c.id === SD.state.activeId ? 'on' : ''}">
        <span>${esc(c.name)}</span><span class="note">${c.birth ? '第 ' + SD.time.ageParts(c.birth).days + ' 天' : '孕 ' + SD.preg.pregParts(c.due).week + ' 周'}</span>
      </button>`).join('') +
      `<button data-add="1"><span>＋ 添加宝宝</span></button>`
    menu.hidden = false
    menu.querySelectorAll('[data-cid]').forEach(b => b.addEventListener('click', () => {
      SD.store.switchChild(b.dataset.cid)
      menu.hidden = true
      render()
    }))
    menu.querySelector('[data-add]').addEventListener('click', () => {
      menu.hidden = true
      sessionStorage.setItem('sd-open-add', '1')
      location.hash = '#settings'
      if (location.hash === '#settings') render()   // 已在设置页时 hash 不变，手动渲染
    })
  }
  return { start, render }
})()

document.addEventListener('DOMContentLoaded', () => SD.app.start())
