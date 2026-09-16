/* 视图层 v0.5 —— 五 Tab 信息架构：首页/记录/成长/育儿/家庭 + 哄睡与设置独立页 */
SD.views = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const back = '<p><a href="#home" class="backlink">← 返回首页</a></p>'
  const child = () => SD.store.child

  /* 分段条：attr=dataset 键，items=[[seg,label]]，cur=当前段 */
  function segBar(attr, items, cur) {
    return `<div class="seg seg-main">${items.map(([s, l]) =>
      `<button class="seg-btn ${s === cur ? 'on' : ''}" data-${attr}="${s}">${l}</button>`).join('')}</div>`
  }
  function bindSeg(el, attr, rerender) {
    el.querySelectorAll(`[data-${attr}]`).forEach(b =>
      b.addEventListener('click', () => { el.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = b.dataset[attr]; rerender() }))
  }

  /* ══════════ 🏠 首页（每日多次） ══════════ */
  function home(el) {
    if (!child()) return onboard(el)
    const c = child()
    const p = SD.time.ageParts(c.birth)
    const s = SD.summary.summarizeDay(SD.store.recordsOf(), SD.time.todayStr())
    const vacList = SD.vaccine.scheduleFor(c.birth, SD.store.vaccineDone())
    const next = vacList.find(v => v.status === 'planned')
    const overdue = vacList.filter(v => v.status === 'overdue')
    const temps = SD.store.recordsOf().filter(r => r.type === 'temp' && r.date === SD.time.todayStr())
    const tempWarn = temps.length ? SD.features.tempStatus(p.totalMo, temps[temps.length - 1].val) : null

    el.innerHTML = `
      ${tempWarn && tempWarn !== 'ok' ? `<div class="card"><h3>${tempWarn === 'urgent' ? '🔴 <3月龄发热≥38℃：立即就医' : tempWarn === 'high' ? '🟠 高热 ≥38.5℃' : '🟡 低热'}</h3><p class="note">今日体温 ${temps[temps.length - 1].val}℃——见「育儿 · 护理」处理建议</p></div>` : ''}
      <div class="stat-grid">
        <div class="stat"><div class="k">今日喂奶</div><div class="v">${s.feedCount} 次${s.feedMl ? ` · ${s.feedMl}ml` : ''}</div></div>
        <div class="stat"><div class="k">今日睡眠</div><div class="v">${(s.sleepMinutes / 60).toFixed(1)} 小时</div></div>
        <div class="stat"><div class="k">尿 / 便</div><div class="v">${s.pee} / ${s.poop}</div></div>
        <div class="stat"><div class="k">维生素D</div><div class="v ${s.vitd ? 'done' : ''}">${s.vitd ? '✓ 已补' : '未补'}</div></div>
      </div>
      <div class="quick-row">
        <button class="quick-btn primary" data-act="feed">🍼 喂奶</button>
        <button class="quick-btn" data-act="sleep">😴 睡觉</button>
        <button class="quick-btn" data-act="temp">🌡️ 体温</button>
        <button class="quick-btn" data-act="pee">💧 尿</button>
        <button class="quick-btn" data-act="poop">💩 便</button>
        <button class="quick-btn" data-act="vitd">☀️ VD</button>
      </div>
      <div class="quick-row scene-row">
        <a class="quick-btn scene" href="#sound">🎧 哄睡白噪</a>
        <a class="quick-btn scene" href="#card">📋 交接卡</a>
      </div>
      ${overdue.length ? `<a class="card linkcard" href="#vaccine"><h3>⚠️ 待补疫苗 ${overdue.length} 剂</h3><p class="note">${esc(overdue.slice(0, 4).map(v => v.name).join('、'))}${overdue.length > 4 ? '…' : ''} → 去标记</p></a>` : ''}
      ${next ? `<a class="card linkcard" href="#vaccine"><h3>下一剂疫苗</h3><p>${esc(next.name)} 第${next.dose}剂 · ${next.sched}</p></a>` : ''}`

    el.querySelectorAll('.quick-btn[data-act]').forEach(b => b.addEventListener('click', () => {
      const act = b.dataset.act
      if (act === 'feed') return (location.hash = '#feed-form')
      if (act === 'sleep') return (location.hash = '#sleep-form')
      if (act === 'temp') return (location.hash = '#health')
      SD.store.addRecord({ type: act, date: SD.time.todayStr(), time: SD.time.nowTime() })
      b.classList.add('done-flash'); setTimeout(() => { b.classList.remove('done-flash'); home(el) }, 450)
    }))
  }

  function onboard(el) {
    el.innerHTML = `
      <div class="empty"><p>👋 欢迎使用超级奶爸工作台</p><p class="note">先建宝宝档案。所有数据只存在这台设备。</p></div>
      <div class="card">
        <label class="field">宝宝小名</label><input type="text" id="c-name" placeholder="例如：小柿子">
        <label class="field">出生日期</label><input type="date" id="c-birth">
        <label class="field">性别</label><select id="c-gender"><option value="">保密</option><option value="m">男</option><option value="f">女</option></select>
        <p></p><button class="btn" id="c-save">开始记录</button>
      </div>`
    el.querySelector('#c-birth').max = SD.time.todayStr()
    el.querySelector('#c-save').addEventListener('click', () => {
      const name = el.querySelector('#c-name').value.trim()
      const birth = el.querySelector('#c-birth').value
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return SD.ui.toast('小名和出生日期必填')
      SD.store.addChild({ name, birth, gender: el.querySelector('#c-gender').value })
      location.hash = '#home'; home(el)
    })
  }

  /* ══════════ 喂奶 / 睡觉表单（真路由 #feed-form / #sleep-form） ══════════ */
  function feedForm(el) {
    el.innerHTML = `<div class="sec-title">记录喂奶</div>
      <div class="card">
        <div class="seg">
          <button class="seg-btn on" data-mode="timer">⏱ 计时</button>
          <button class="seg-btn" data-mode="manual">✍️ 手动</button>
        </div>
        <div id="f-timer">
          <div class="seg" id="f-side-seg">
            <button class="seg-btn on" data-side="L">左</button>
            <button class="seg-btn" data-side="R">右</button>
            <button class="seg-btn" data-side="B">双侧</button>
          </div>
          <div class="timer-face" id="f-clock">00:00</div>
          <button class="btn primary-big" id="f-go">▶ 开始喂奶</button>
          <p class="note" id="f-note"></p>
        </div>
        <div id="f-manual" hidden>
          <label class="field">哪侧</label>
          <select id="f-side"><option value="L">左</option><option value="R">右</option><option value="B">双侧</option></select>
          <label class="field">时长（分钟）</label><input type="number" id="f-min" value="15" min="0" max="120">
          <label class="field">瓶喂量（ml，亲喂填 0）</label><input type="number" id="f-ml" value="0" min="0" max="500">
          <label class="field">时间</label><input type="time" id="f-time">
          <p></p><button class="btn" id="f-save">保存</button>
        </div>
      </div>`

    let side = 'L', running = false, startAt = 0, tick = null, seconds = 0
    el.querySelector('#f-time').value = SD.time.nowTime()
    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      if (running) return SD.ui.toast('计时中，请先停止或取消')
      el.querySelectorAll('[data-mode]').forEach(x => x.classList.remove('on')); b.classList.add('on')
      const timer = b.dataset.mode === 'timer'
      el.querySelector('#f-timer').hidden = !timer
      el.querySelector('#f-manual').hidden = timer
    }))
    el.querySelectorAll('#f-side-seg .seg-btn').forEach(b => b.addEventListener('click', () => {
      if (running) return
      el.querySelectorAll('#f-side-seg .seg-btn').forEach(x => x.classList.remove('on')); b.classList.add('on')
      side = b.dataset.side
    }))
    el.querySelector('#f-go').addEventListener('click', () => {
      const btn = el.querySelector('#f-go'), note = el.querySelector('#f-note')
      if (!running) {
        running = true; startAt = Date.now(); seconds = 0
        btn.textContent = '⏹ 停止并记录'; btn.classList.add('rec')
        note.innerHTML = '计时中… <a href="#home" id="f-cancel">取消计时</a>'
        el.querySelectorAll('#f-side-seg .seg-btn').forEach(x => (x.disabled = true))
        note.querySelector('#f-cancel').addEventListener('click', e => {
          e.preventDefault(); clearInterval(tick); location.hash = '#home'
        })
        tick = setInterval(() => {
          seconds = Math.floor((Date.now() - startAt) / 1000)
          el.querySelector('#f-clock').textContent = SD.time.fmtClock(seconds)
        }, 1000)
      } else {
        clearInterval(tick)
        const mins = SD.time.clockMinutes(seconds)
        if (mins < 1) return SD.ui.toast('不足 1 分钟，未记录（点「取消计时」放弃）')
        SD.store.addRecord({ type: 'feed', date: SD.time.todayStr(), time: SD.time.nowTime(), side, minutes: mins, ml: 0 })
        location.hash = '#feed'
      }
    })
    el.querySelector('#f-save').addEventListener('click', () => {
      SD.store.addRecord({
        type: 'feed', date: SD.time.todayStr(),
        time: el.querySelector('#f-time').value || SD.time.nowTime(),
        side: el.querySelector('#f-side').value,
        minutes: +el.querySelector('#f-min').value || 0, ml: +el.querySelector('#f-ml').value || 0,
      })
      location.hash = '#feed'
    })
  }

  function sleepForm(el) {
    el.innerHTML = `<div class="sec-title">记录睡眠</div>
      <div class="card">
        <label class="field">入睡时间</label><input type="time" id="s-start">
        <label class="field">醒来时间（跨午夜可小于入睡）</label><input type="time" id="s-end">
        <p></p><button class="btn" id="s-save">保存</button>
      </div>`
    el.querySelector('#s-start').value = SD.time.nowTime()
    el.querySelector('#s-end').value = SD.time.nowTime()
    el.querySelector('#s-save').addEventListener('click', () => {
      SD.store.addRecord({ type: 'sleep', date: SD.time.todayStr(), start: el.querySelector('#s-start').value, end: el.querySelector('#s-end').value })
      location.hash = '#feed'
    })
  }

  /* ══════════ 📝 记录（时间轴） ══════════ */
  const ICON = { feed: '🍼', sleep: '😴', pee: '💧', poop: '💩', vitd: '☀️', dha: '🐟', iron: '💊', temp: '🌡️', measure: '📏', food: '🥣', 'food-ok': '✅', 'food-react': '⚠️', diary: '📖', ms: '🏆' }
  const LABEL = r => ({
    feed: `喂奶（${({ L: '左', R: '右', B: '双侧' })[r.side] || ''}${r.minutes ? ' ' + r.minutes + 'min' : ''}${r.ml ? ' +' + r.ml + 'ml' : ''}）`,
    sleep: `睡眠 ${r.start}–${r.end}`, pee: '尿尿', poop: '便便', vitd: '维生素D', dha: 'DHA', iron: '铁剂',
    temp: `体温 ${r.val}℃（${r.part || ''}）`,
    measure: `测量 身高${r.height || '-'}cm 体重${r.weight || '-'}kg${r.head ? ' 头围' + r.head + 'cm' : ''}`,
    food: `新辅食：${r.name}`, 'food-ok': `${r.name} 观察 3 天无反应`,
    'food-react': `${r.name} 可疑反应：${r.symptom}`,
    diary: `${r.name}${r.note ? ' · ' + r.note : ''}`,
    ms: `达成里程碑：${(r.key || '').split('|').join(' · ')}`,
  }[r.type] || r.type)

  function feed(el) {
    if (!child()) return onboard(el)
    // 待产包/42天清单等勾选类不进时间轴
    const recs = SD.store.recordsOf().filter(r => !['bag', 'd42'].includes(r.type))
    const days = [...new Set(recs.map(r => r.date))].sort().reverse().slice(0, 5)
    el.innerHTML = days.length
      ? days.map(d => `<div class="sec-title">${d}</div>` + recs.filter(r => r.date === d).slice().reverse().map(r => `
          <div class="tl-item"><span class="icon">${ICON[r.type] || '·'}</span><span class="desc">${esc(LABEL(r))}</span>
          <span class="t">${r.time || r.start || ''}</span><button class="del" data-id="${r.id}">✕</button></div>`).join('')).join('')
      : `<div class="empty"><p>还没有记录</p><p class="note">回首页用快捷按钮打卡</p></div>`
    el.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { SD.store.removeRecord(b.dataset.id); feed(el) }))
  }

  /* ══════════ 📈 成长（曲线 ｜ 疫苗 ｜ 里程碑 ｜ 月历） ══════════ */
  function growth(el) {
    if (!child()) return onboard(el)
    const seg = el.dataset.gseg || 'curve'
    el.innerHTML = segBar('gseg', [['curve', '📈 曲线'], ['vac', '💉 疫苗'], ['ms', '🏆 里程碑'], ['cal', '📅 月历']], seg) + '<div id="seg-body"></div>'
    const body = el.querySelector('#seg-body')
    ;({ curve: renderCurve, vac: vaccine, ms: diary, cal: calendar })[seg](body)
    bindSeg(el, 'gseg', () => growth(el))
  }

  function renderCurve(el) {
    const c = child(), mo = SD.time.ageParts(c.birth).totalMo
    const measures = SD.store.recordsOf().filter(r => r.type === 'measure').sort((a, b) => a.date < b.date ? -1 : 1)
    const lastM = measures[measures.length - 1]
    const metricMeta = { weight: ['体重 (kg)', '体重'], height: ['身高 (cm)', '身高'], head: ['头围 (cm)', '头围'] }
    const metric = el.dataset.metric || 'weight'
    const evalCard = (met, val) => {
      if (!val) return ''
      const e = SD.growth.evalDesc(met, c.gender, mo, Number(val))
      const p = SD.growth.percentileNum(met, c.gender, mo, Number(val))
      return `<div class="stat"><div class="k">${metricMeta[met][1]}</div><div class="v">P${p}</div><div class="note">${e.desc}</div></div>`
    }

    el.innerHTML = `
      <div class="card">
        <div class="seg">
          ${Object.keys(metricMeta).map(m => `<button class="seg-btn ${m === metric ? 'on' : ''}" data-m="${m}">${metricMeta[m][1]}</button>`).join('')}
        </div>
        <canvas id="gc" width="640" height="400" style="width:100%"></canvas>
        <p class="note">曲线为 WHO 百分位参考线（P3-P97）；圆点为实测。仅供参考，发育评估请咨询儿保医生。</p>
      </div>
      ${lastM ? `<div class="stat-grid">${evalCard('weight', lastM.weight)}${evalCard('height', lastM.height)}${evalCard('head', lastM.head)}</div>` : ''}
      <div class="card">
        <b>📏 记录测量</b>（同日重复录入会覆盖）
        <label class="field">日期</label><input type="date" id="m-date">
        <label class="field">体重 (kg)</label><input type="number" id="m-w" step="0.01" min="0">
        <label class="field">身高 (cm)</label><input type="number" id="m-h" step="0.1" min="0">
        <label class="field">头围 (cm，可空)</label><input type="number" id="m-hc" step="0.1" min="0">
        <p></p><button class="btn" id="m-save">保存测量</button>
      </div>
      ${(() => {
        const days7 = SD.trends.last7Days(SD.store.recordsOf(), SD.time.todayStr())
        const maxF = Math.max(...days7.map(d => d.feedCount), 1)
        const maxS = Math.max(...days7.map(d => d.sleepMin), 60)
        const bars = (vals, max, fmt) => `<div class="bars">${vals.map(v => `
          <div class="bar-col"><div class="bar" style="height:${Math.max(4, Math.round((v.v / max) * 64))}px"></div>
          <span class="bar-v">${fmt(v.v)}</span><span class="bar-l">${v.l}</span></div>`).join('')}</div>`
        const si = SD.features.sleepInsight(days7, mo)
        const h = m => (m / 60).toFixed(1)
        const avgF = (days7.reduce((a, d) => a + d.feedCount, 0) / 7).toFixed(1)
        return `<details class="card fold">
        <summary><b>📈 近 7 日趋势</b><span class="note">喂奶日均 ${avgF} 次 · 睡眠日均 ${h(si.avgMin)}h${si.level === 'warn' ? ' ⚠️' : ''}</span></summary>
        <div style="margin-top:8px">
          <div class="card"><h3>喂奶次数</h3>${bars(days7.map(d => ({ v: d.feedCount, l: d.date.slice(5) })), maxF, v => v || '')}</div>
          <div class="card"><h3>睡眠（小时）</h3>${bars(days7.map(d => ({ v: +(d.sleepMin / 60).toFixed(1), l: d.date.slice(5) })), +(maxS / 60).toFixed(1), v => v || '')}</div>
        </div>
        <div class="card"><h3>睡眠洞察（月龄参考 ${si.band.age}：${si.band.total}）</h3>
          <p>本周日均 <b>${h(si.avgMin)}h</b> · 参考 ${h(si.refLo)}-${h(si.refHi)}h
          ${si.level === 'ok' ? ' <span class="vac-badge done">正常范围</span>' : ' <span class="vac-badge overdue">偏离参考带</span>'}</p>
          ${si.level === 'warn' ? '<p class="note">持续偏低/偏高时：核对月龄参考带、检查作息仪式与睡眠环境；必要时咨询儿保。</p>' : ''}</div>
      </details>`
      })()}
      <details class="card fold">
        <summary><b>🧰 参考工具</b><span class="note">奶量参考 · 遗传靶身高</span></summary>
        <div class="card" style="margin-top:8px"><h3>奶量参考（${mo} 月龄）</h3><p>${(() => { const r = SD.features.milkRef(mo); return `每日约 ${r.times} 次 · 每次 ${r.perMl}ml<br><span class="note">${esc(r.note)}</span>` })()}</p></div>
        <div class="card">
          <h3>遗传靶身高</h3>
          <label class="field">爸爸身高 (cm)</label><input type="number" id="th-dad" value="175">
          <label class="field">妈妈身高 (cm)</label><input type="number" id="th-mom" value="162">
          <p class="note" id="th-out"></p>
        </div>
      </details>`

    el.querySelector('#m-date').value = SD.time.todayStr()
    const th = () => {
      const d = +el.querySelector('#th-dad').value, m = +el.querySelector('#th-mom').value
      if (d && m) el.querySelector('#th-out').textContent = `靶身高：男孩 ≈ ${SD.growth.targetHeight(d, m).boy.toFixed(1)}cm · 女孩 ≈ ${SD.growth.targetHeight(d, m).girl.toFixed(1)}cm`
    }
    el.querySelector('#th-dad').addEventListener('input', th)
    el.querySelector('#th-mom').addEventListener('input', th)
    th()
    el.querySelector('#m-save').addEventListener('click', () => {
      const w = el.querySelector('#m-w').value, h = el.querySelector('#m-h').value, hc = el.querySelector('#m-hc').value
      if (!w && !h && !hc) return SD.ui.toast('至少填一项')
      const date = el.querySelector('#m-date').value
      const dup = SD.store.recordsOf().find(r => r.type === 'measure' && r.date === date)
      if (dup) SD.store.removeRecord(dup.id)
      SD.store.addRecord({ type: 'measure', date, weight: +w || null, height: +h || null, head: +hc || null })
      renderCurve(el)
    })
    el.querySelectorAll('.seg-btn[data-m]').forEach(b => b.addEventListener('click', () => { el.dataset.metric = b.dataset.m; renderCurve(el) }))
    drawGrowth(document.getElementById('gc'), metric, c.gender, measures)
  }

  function drawGrowth(cv, metric, gender, measures) {
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height
    const who = SD.DATA.who[metric][gender === 'f' ? 'girl' : 'boy']
    const months = Object.keys(who).map(Number).sort((a, b) => a - b)
    const maxM = months[months.length - 1]
    const vals = months.flatMap(m => who[m])
    const lo = Math.floor(Math.min(...vals) * 0.95), hi = Math.ceil(Math.max(...vals) * 1.02)
    const X = m => 40 + (m / maxM) * (W - 60), Y = v => H - 26 - ((v - lo) / (hi - lo)) * (H - 50)
    ctx.clearRect(0, 0, W, H)
    ctx.font = '18px sans-serif'; ctx.fillStyle = '#a39d93'
    for (let v = lo; v <= hi; v += Math.max(1, Math.round((hi - lo) / 6))) { ctx.fillText(String(v), 4, Y(v) + 5) }
    for (let m = 0; m <= maxM; m += 12) { ctx.fillText(m + '月', X(m) - 10, H - 4) }
    const colors = ['#e7e4df', '#d4d0c9', '#7d766c', '#d4d0c9', '#e7e4df']
    months.forEach((_, i) => { for (let j = 0; j < 5; j++) {
      if (i === months.length - 1) break
      const a = who[months[i]][j], b = who[months[i + 1]][j]
      ctx.strokeStyle = colors[j]; ctx.lineWidth = j === 2 ? 2.5 : 1.5
      ctx.beginPath(); ctx.moveTo(X(months[i]), Y(a)); ctx.lineTo(X(months[i + 1]), Y(b)); ctx.stroke()
    }})
    ctx.fillStyle = '#e8590c'
    for (const m of measures) {
      const v = metric === 'weight' ? m.weight : metric === 'height' ? m.height : m.head
      if (!v) continue
      const recMo = Math.max(0, SD.time.ageParts(child().birth, new Date(m.date + 'T00:00:00')).totalMo)
      ctx.beginPath(); ctx.arc(X(recMo), Y(Number(v)), 5, 0, 7); ctx.fill()
    }
  }

  function vaccine(el) {
    const c = child()
    const list = SD.vaccine.scheduleFor(c.birth, SD.store.vaccineDone())
    const badge = { overdue: '待补', planned: '未到', done: '已种' }
    el.innerHTML = `
      <div class="card"><h3>${esc(c.name)}的疫苗计划</h3><p class="note">按出生日期排程，点右侧状态切换。以社区医院通知为准。</p></div>
      ${['overdue', 'planned', 'done'].map(t => {
        const g = list.filter(v => v.status === t)
        return g.length ? `<div class="sec-title">${badge[t]}（${g.length}）</div>` + g.map(v => `
          <div class="tl-item vac-item"><span class="nm">${esc(v.name)} 第${v.dose}剂<span class="dose"> · ${v.sched} · ${v.free ? '免费' : '自费'}</span></span>
          <span class="vac-badge ${v.status}" data-key="${esc(v.name)}|${v.dose}">${badge[t]}</span></div>`).join('') : ''
      }).join('')}`
    el.querySelectorAll('.vac-badge').forEach(b => b.addEventListener('click', () => { SD.store.toggleVaccine(b.dataset.key); vaccine(el) }))
  }

  /* 里程碑打卡 + 第一次日记（成长 · 里程碑段） */
  const PRESETS = ['第一次笑出声', '第一次翻身', '第一次坐稳', '第一次叫爸爸/妈妈', '第一次长牙', '第一次爬', '第一次站', '第一次走', '第一次自主入睡']
  function diary(el) {
    const c = child(), mo = SD.time.ageParts(c.birth).totalMo
    const recs = SD.store.recordsOf()
    const logs = recs.filter(r => r.type === 'diary').slice().reverse()
    const msDone = new Set(recs.filter(r => r.type === 'ms').map(r => r.key))
    const domains = Object.entries(SD.DATA.milestone).map(([k, items]) => {
      const entries = Object.entries(items).map(([m, s]) => ({ m: Number(m), s, key: `${k}|${m}` })).sort((a, b) => a.m - b.m)
      // 可见 = 已到龄 + 未来 3 个月内（保证小月龄也有内容可看，未到龄可预先了解）
      let visible = entries.filter(e => e.m <= mo + 3)
      if (!visible.length) visible = entries.slice(0, 3)   // 兜底：极小月龄也显示前 3 项
      return { k, entries: visible, done: visible.filter(e => msDone.has(e.key)).length }
    })

    el.innerHTML = `
      <div class="card"><h3>📖 记录一个「第一次」</h3>
        <label class="field">时刻（点选或输入）</label>
        <input type="text" id="d-name" placeholder="如：第一次笑出声">
        <div class="chips" style="margin-top:6px">${PRESETS.map(p2 =>
          `<button class="chip" data-preset="${esc(p2)}">${esc(p2)}</button>`).join('')}</div>
        <label class="field">日期</label><input type="date" id="d-date">
        <label class="field">一句话（可空）</label><input type="text" id="d-note" placeholder="当时的场景…">
        <p></p><button class="btn" id="d-save">记下这一刻</button>
      </div>
      <div class="sec-title">里程碑打卡（点 ✅ 记录达成；⏳ 为即将到来）</div>
      ${domains.map(d => `
        <div class="card"><h3>${esc(d.k)} <span class="note">${d.done}/${d.entries.length}</span></h3>
          ${d.entries.map(e => `<p class="ms-row ${msDone.has(e.key) ? 'done' : ''} ${e.m > mo ? 'future' : ''}">
            <span data-ms="${esc(e.key)}" title="${e.m > mo ? '未到龄，可预先了解' : '点按打卡'}">${msDone.has(e.key) ? '✅' : e.m > mo ? '⏳' : '⬜'}</span>
            <b>${e.m}月</b> ${esc(e.s)}${e.m > mo && !msDone.has(e.key) ? '<span class="note">（未到龄）</span>' : ''}</p>`).join('') || '<p class="note">—</p>'}
        </div>`).join('')}
      <div class="sec-title">日记（${logs.length}）</div>
      ${logs.length ? logs.map(l => `
        <div class="tl-item"><span class="icon">📖</span><span class="desc"><b>${esc(l.name)}</b>${l.note ? ' · ' + esc(l.note) : ''}</span>
        <span class="t">${l.date}</span><button class="del" data-id="${l.id}">✕</button></div>`).join('')
        : '<div class="empty"><p class="note">还没有记录——宝宝的每个第一次都值得写下</p></div>'}`

    el.querySelector('#d-date').value = SD.time.todayStr()
    el.querySelectorAll('[data-preset]').forEach(c => c.addEventListener('click', () => {
      el.querySelector('#d-name').value = c.dataset.preset
    }))
    el.querySelector('#d-save').addEventListener('click', () => {
      const name = el.querySelector('#d-name').value.trim()
      if (!name) return SD.ui.toast('写下是什么时刻')
      SD.store.addRecord({ type: 'diary', name, date: el.querySelector('#d-date').value, note: el.querySelector('#d-note').value.trim() })
      diary(el)
    })
    el.querySelectorAll('[data-ms]').forEach(s => s.addEventListener('click', () => {
      const key = s.dataset.ms
      const hit = recs.find(r => r.type === 'ms' && r.key === key)
      if (hit) SD.store.removeRecord(hit.id)
      else SD.store.addRecord({ type: 'ms', key, date: SD.time.todayStr() })
      diary(el)
    }))
    el.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { SD.store.removeRecord(b.dataset.id); diary(el) }))
  }

  function calendar(el) {
    const now = new Date()
    let y = now.getFullYear(), m = now.getMonth(), selDate = null
    function renderCal() {
      const c = child()
      const cells = SD.cal.monthGrid(y, m, SD.time.todayStr())
      const vacMap = {}
      SD.vaccine.scheduleFor(c.birth, SD.store.vaccineDone()).forEach(v => {
        (vacMap[v.sched] = vacMap[v.sched] || []).push(v)
      })
      const recs = SD.store.recordsOf()
      el.innerHTML = `
        <div class="card cal-head">
          <button class="btn ghost" id="cal-prev">‹</button>
          <b>${y} 年 ${m + 1} 月</b>
          <button class="btn ghost" id="cal-next">›</button>
          <button class="btn ghost" id="cal-today">回今</button>
        </div>
        <div class="cal-grid">${['一', '二', '三', '四', '五', '六', '日'].map(w => `<span class="cal-w">${w}</span>`).join('')}
          ${cells.map(c2 => {
            const hasEv = vacMap[c2.d] || recs.some(r => (r.type === 'diary' || r.type === 'ms') && r.date === c2.d)
            return `<button class="cal-cell ${c2.inMonth ? '' : 'dim'} ${c2.today ? 'today' : ''} ${c2.d === selDate ? 'sel' : ''}" data-d="${c2.d}" ${hasEv ? '' : 'data-empty="1"'}>
              ${c2.day}
              <span class="dots-mini">
                ${vacMap[c2.d] ? '<i class="dm vac"></i>' : ''}
                ${recs.some(r => r.type === 'diary' && r.date === c2.d) ? '<i class="dm dia"></i>' : ''}
                ${recs.some(r => r.type === 'ms' && r.date === c2.d) ? '<i class="dm ms"></i>' : ''}
              </span>
            </button>`
          }).join('')}
        </div>
        <p class="note">点日期看当日事项 · ● 疫苗排期　● 日记　● 里程碑打卡</p>
        <div id="cal-detail"></div>`
      el.querySelector('#cal-prev').addEventListener('click', () => { m--; if (m < 0) { m = 11; y-- } renderCal() })
      el.querySelector('#cal-next').addEventListener('click', () => { m++; if (m > 11) { m = 0; y++ } renderCal() })
      el.querySelector('#cal-today').addEventListener('click', () => { const n = new Date(); y = n.getFullYear(); m = n.getMonth(); renderCal() })
      el.querySelectorAll('.cal-cell').forEach(c2 => c2.addEventListener('click', () => {
        selDate = c2.dataset.d
        const vacs = vacMap[selDate] || []
        const dias = recs.filter(r => r.type === 'diary' && r.date === selDate)
        const mss = recs.filter(r => r.type === 'ms' && r.date === selDate)
        const others = recs.filter(r => ['feed', 'sleep', 'pee', 'poop'].includes(r.type) && r.date === selDate)
        el.querySelector('#cal-detail').innerHTML = `
          <div class="card"><h3>📅 ${selDate} 当日事项</h3>
            ${vacs.length ? `<p>💉 疫苗：${vacs.map(v => `${esc(v.name)} 第${v.dose}剂（${v.status === 'done' ? '已种' : v.status === 'overdue' ? '待补' : '计划'}）`).join('；')}</p>` : ''}
            ${mss.length ? `<p>🏆 里程碑：${mss.map(r => esc((r.key || '').split('|').join(' '))).join('；')}</p>` : ''}
            ${dias.length ? `<p>📖 日记：${dias.map(r => esc(r.name)).join('；')}</p>` : ''}
            ${others.length ? (() => {
              const s = SD.summary.summarizeDay(recs, selDate)
              return `<p class="note">记录：喂奶 ${s.feedCount} 次 · 睡眠 ${(s.sleepMinutes / 60).toFixed(1)}h · 尿 ${s.pee} · 便 ${s.poop}</p>`
            })() : ''}
            ${!vacs.length && !dias.length && !mss.length && !others.length ? '<p class="note">当日暂无事项</p>' : ''}
          </div>`
        renderCalSel()
      }))
      function renderCalSel() {
        el.querySelectorAll('.cal-cell').forEach(x => x.classList.toggle('sel', x.dataset.d === selDate))
      }
    }
    renderCal()
  }

  /* ══════════ 📚 育儿（指南 ｜ 辅食 ｜ 补剂 ｜ 护理 ｜ 帮助） ══════════ */
  /* 待产包（孕产期准备清单，本地打卡） */
  function bagBody(el) {
    const doneSet = new Set(SD.store.recordsOf().filter(r => r.type === 'bag').map(r => r.key))
    const total = SD.DATA.bag.cats.reduce((a, c) => a + c.items.length, 0)
    const done = SD.DATA.bag.cats.reduce((a, c) => a + c.items.filter(([k]) => doneSet.has(k)).length, 0)
    el.innerHTML = `
      <div class="card"><h3>🎒 ${esc(SD.DATA.bag.title)}</h3>
        <div class="bag-progress"><div class="bag-bar"><i style="width:${Math.round((done / total) * 100)}%"></i></div>
        <span class="note">${done}/${total}</span></div>
        <p class="note">${esc(SD.DATA.bag.note)}</p></div>
      ${SD.DATA.bag.cats.map(cat => `
        <div class="card"><h3>${cat.label} <span class="note">${cat.items.filter(([k]) => doneSet.has(k)).length}/${cat.items.length}</span></h3>
          ${cat.items.map(([k, txt]) => `
          <p class="ms-row ${doneSet.has(k) ? 'done' : ''}"><span data-bag="${k}">${doneSet.has(k) ? '✅' : '⬜'}</span> ${esc(txt)}</p>`).join('')}
        </div>`).join('')}`
    el.querySelectorAll('[data-bag]').forEach(s => s.addEventListener('click', () => {
      const key = s.dataset.bag
      const recs = SD.store.recordsOf()
      const hit = recs.find(r => r.type === 'bag' && r.key === key)
      if (hit) SD.store.removeRecord(hit.id)
      else SD.store.addRecord({ type: 'bag', key, date: SD.time.todayStr() })
      bagBody(el)
    }))
  }

  /* 孕产段：待产包 ｜ 42 天手册（内部切换） */
  function birthBody(el) {
    if (!child()) return onboard(el)
    const days = SD.time.ageParts(child().birth).days
    const sub = el.dataset.birthsub ?? (Number.isFinite(days) && days <= 42 ? 'd42' : 'bag')
    delete el.dataset.birthsub   // 别名定向只生效一次
    el.innerHTML = `<div class="seg seg-main gfn-seg">
        <button class="seg-btn ${sub === 'bag' ? 'on' : ''}" data-birth="bag">🎒 待产包</button>
        <button class="seg-btn ${sub === 'd42' ? 'on' : ''}" data-birth="d42">📖 42 天手册</button>
      </div><div id="birth-body"></div>`
    const body = el.querySelector('#birth-body')
    ;({ bag: bagBody, d42: day42Body })[sub](body)
    el.querySelectorAll('[data-birth]').forEach(b => b.addEventListener('click', () => {
      el.dataset.birthsub = b.dataset.birth
      birthBody(el)
    }))
  }

  function guide(el) {
    guideMonth = null; gmOpen = false        // 每次进入默认回到本月
    day42Sel = null; d42Open = false         // 月子日默认回到当天
    const seg = el.dataset.useg || 'guide'
    el.innerHTML = segBar('useg', [['guide', '📚 指南'], ['birth', '🤱 孕产'], ['food', '🥣 喂养'], ['care', '🏥 护理']], seg) + '<div id="seg-body"></div>'
    const body = el.querySelector('#seg-body')
    ;({ guide: guideBody, birth: birthBody, food: foodBody, care: careBody })[seg](body)
    bindSeg(el, 'useg', () => guide(el))
  }

  /* 42 天手册（原创整理；按日龄定位 + 检查清单打卡） */
  /* 42 天月子餐：天粒度下拉（同指南月份下拉样式）+ 每日菜单 */
  let day42Sel = null, d42Open = false   // null = 跟随宝宝日龄
  function day42Body(el) {
    const days = child() ? SD.time.ageParts(child().birth).days : null
    const curDay = Number.isFinite(days) ? Math.min(Math.max(days, 1), 42) : 1
    const selDay = day42Sel ?? curDay
    const { stage, menu } = SD.features.day42Day(selDay)
    const doneSet = new Set(SD.store.recordsOf().filter(r => r.type === 'd42').map(r => r.key))
    const recs = SD.store.recordsOf()
    // d42 勾选走实时查询（见 bindD42List）

    el.innerHTML = `
      <div class="gm-top">
        <span class="k">月子日</span>
        <div class="gm-dd">
          <button class="gm-dd-btn" id="d42-btn">第 ${selDay} 天${selDay === curDay ? '（今日）' : ''}</button>
          ${d42Open ? `<div class="gm-dd-menu cols">${Array.from({ length: 42 }, (_, i) => i + 1).map(d =>
            `<button data-d42d="${d}" class="${d === selDay ? 'on' : ''}">第 ${d} 天${d === curDay ? '<span class="note">今日</span>' : ''}</button>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="card"><h3>${stage.label}</h3><p class="note">${esc(stage.focus)}</p></div>
      <div class="card meal-card">
        <h3>🍽 第 ${selDay} 天月子餐</h3>
        <div class="meal-row"><span class="mk">🌅 早餐</span><span>${esc(menu.b)}</span></div>
        <div class="meal-row"><span class="mk">☀️ 午餐</span><span>${esc(menu.l)}</span></div>
        <div class="meal-row"><span class="mk">🌙 晚餐</span><span>${esc(menu.d)}</span></div>
        <div class="meal-row"><span class="mk">🍵 加餐</span><span>${esc(menu.s)}</span></div>
        <p class="note" style="margin-top:8px">💡 ${esc(menu.tip)}</p>
      </div>
      <details class="card fold"><summary><b>🤱 本阶段护理要点</b><span class="note">恶露 · 哺乳 · 情绪 · 活动</span></summary>
        <ul class="list" style="margin-top:8px">${SD.DATA.day42.care.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </details>
      <details class="card fold"><summary><b>🚨 红线预警</b><span class="note">出现即就医</span></summary>
        <ul class="list" style="margin-top:8px">${SD.DATA.day42.red.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </details>
      <details class="card fold"><summary><b>✅ 第 42 天检查清单</b><span class="note" id="d42-cnt">${doneSet.size}/${SD.DATA.day42.checklist.length} 已完成</span></summary>
        <div style="margin-top:8px" id="d42-list">${d42ListHTML()}</div>
      </details>
      <p class="note">${esc(SD.DATA.day42.note)}</p>`

    function d42ListHTML() {
      const done = new Set(SD.store.recordsOf().filter(r => r.type === 'd42').map(r => r.key))
      return SD.DATA.day42.checklist.map(c => `
        <p class="ms-row ${done.has(c.key) ? 'done' : ''}">
          <span data-d42ck="${c.key}">${done.has(c.key) ? '✅' : '⬜'}</span> ${esc(c.txt)}
        </p>`).join('')
    }
    function bindD42List() {
      el.querySelectorAll('[data-d42ck]').forEach(span => span.addEventListener('click', () => {
        const key = span.dataset.d42ck
        const hit = SD.store.recordsOf().find(r => r.type === 'd42' && r.key === key)
        if (hit) SD.store.removeRecord(hit.id)
        else SD.store.addRecord({ type: 'd42', key, date: SD.time.todayStr() })
        // 直接改本行 DOM + 计数：零重渲染，消除卡顿
        const row = span.closest('.ms-row')
        const done = !hit
        row.classList.toggle('done', done)
        span.textContent = done ? '✅' : '⬜'
        const n = SD.store.recordsOf().filter(r => r.type === 'd42').length
        const cnt = el.querySelector('#d42-cnt')
        if (cnt) cnt.textContent = `${n}/${SD.DATA.day42.checklist.length} 已完成`
      }))
    }
    bindD42List()

    el.querySelector('#d42-btn').addEventListener('click', e => { e.stopPropagation(); d42Open = !d42Open; day42Body(el) })
    el.querySelectorAll('[data-d42d]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); d42Open = false; day42Sel = Number(b.dataset.d42d); day42Body(el)
    }))
  }

  /* 指南（对齐旧版双维度：月龄下拉 × 功能分段；喂养为特化富视图） */
  let guideMonth = null, guideFn = 'edu', gmOpen = false
  const GFNS = [['edu', '🎓 早教'], ['feed', '🍼 喂养'], ['sleep', '😴 睡眠'], ['soothe', '😢 安抚']]
  function guideBody(el) {
    if (!child()) return onboard(el)
    const c = child(), mo = SD.time.ageParts(c.birth).totalMo
    const keys = Object.keys(SD.DATA.guide).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    const curKey = Math.max(...keys.filter(k => k <= mo))
    const selKey = guideMonth ?? curKey
    const sec = SD.DATA.guide[selKey]
    const band = SD.DATA.sleep_ref.find(b => selKey >= b.min && selKey <= b.max)

    let fnHTML = ''
    if (guideFn === 'feed') {
      const mr = SD.features.milkRef(selKey)
      const stage = Object.values(SD.DATA.feed.food).find(f => selKey >= f.rng[0] && selKey <= f.rng[1])
      const reactNames = [...new Set(SD.store.recordsOf().filter(r => r.type === 'food-react').map(r => r.name))]
        .filter(n => SD.DATA.feed.allergen[n])
      fnHTML = `
        <div class="card"><h3>🍼 奶量计划（${selKey} 月龄）</h3>
          <div class="grid4">
            <div class="tile"><div class="v">${mr.times}</div><div class="l">次/天</div></div>
            <div class="tile"><div class="v">${mr.perMl}</div><div class="l">ml/次</div></div>
            <div class="tile"><div class="v">${mr.interval}</div><div class="l">小时间隔</div></div>
            <div class="tile"><div class="v">${mr.perDay}</div><div class="l">ml/天参考</div></div>
          </div>
          <p class="note">${esc(mr.note)}</p></div>
        ${stage ? `
        <div class="card"><h3>🥣 ${esc(stage.stage)} <span class="note">${esc(stage.tex)}</span></h3>
          <div class="kv"><span class="k">每日餐次</span><span>${esc(stage.freq)}</span></div>
          <div class="pills">${stage.kinds.map(k => `<span class="pill">${esc(k)}</span>`).join('')}</div></div>
        <div class="card"><h3>📅 一周参考食谱</h3>
          ${stage.menu.map(r => `<div class="menu-row"><span class="day">${esc(r[0])}</span><span>${esc(r.slice(1).join(' · '))}</span></div>`).join('')}</div>` : ''}
        ${reactNames.length ? `
        <div class="card redcard"><h3>⚠️ 过敏原替代（${esc(c.name)} 已登记）</h3>
          ${reactNames.map(n => { const a = SD.DATA.feed.allergen[n]; return `
          <p><b>【${esc(n)} 过敏】</b></p>
          <p class="note">❌ 避免：${a.risk.map(esc).join('、')}</p>
          <p class="note">✅ 替代：${esc(a.alt)}</p>
          <p class="note">💊 补充：${esc(a.sup)}</p>` }).join('')}</div>` : ''}
        <div class="card"><h3>💊 关键营养素</h3>
          ${SD.DATA.feed.nutri.map(n => `<div class="nutri"><b>${esc(n[0])}</b><span class="note">${esc(n[2])} · ${esc(n[3])}</span></div>`).join('')}</div>
        <details class="card"><summary><b>本月龄喂养要点（${selKey} 月）</b></summary>
          <ul class="list">${sec.feed.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`
    } else {
      const titles = { edu: '🎓 早教与发展', sleep: '😴 睡眠作息', soothe: '😢 哭声安抚' }
      fnHTML = `<div class="card"><h3>${titles[guideFn]}</h3>
        <ul class="check-list">${sec[guideFn].map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`
    }

    el.innerHTML = `
      <div class="seg seg-main gfn-seg">${GFNS.map(([k, l]) => `<button class="seg-btn ${k === guideFn ? 'on' : ''}" data-gfn="${k}">${l}</button>`).join('')}</div>
      <div class="gm-top">
        <span class="k">月龄</span>
        <div class="gm-dd">
          <button class="gm-dd-btn" id="gm-btn">${selKey} 月${selKey === curKey ? '（本月）' : ''}</button>
          ${gmOpen ? `<div class="gm-dd-menu cols">${keys.map(k =>
            `<button data-gmk="${k}" class="${k === selKey ? 'on' : ''}">${k} 月${k === curKey ? '<span class="note">本月</span>' : ''}</button>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="card"><h3>${esc(sec.title)}</h3></div>
      ${fnHTML}
      ${guideFn === 'sleep' && band ? `<div class="card"><h3>睡眠参考（${band.age}）</h3><p>总量 ${band.total} · 小睡 ${band.naps} · 夜间 ${band.night}<br><span class="note">清醒间隔约 ${band.wake}</span></p></div>` : ''}
      <p class="note">内容为育儿参考，不构成医疗建议。</p>`
    el.querySelector('#gm-btn').addEventListener('click', e => { e.stopPropagation(); gmOpen = !gmOpen; guideBody(el) })
    el.querySelectorAll('[data-gmk]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); gmOpen = false; guideMonth = Number(b.dataset.gmk); guideBody(el)
    }))
    el.querySelectorAll('[data-gfn]').forEach(b => b.addEventListener('click', () => {
      guideFn = b.dataset.gfn; guideBody(el)
    }))
  }

  const REACTIONS = ['皮疹/红疹', '呕吐', '腹泻', '口周红肿', '湿疹加重', '其他不适']
  /* 喂养段：页内 Tab（辅食观察 ｜ 过敏营养 ｜ 补剂） */
  function foodBody(el) {
    if (!child()) return onboard(el)
    const tab = el.dataset.fdtab || 'obs'
    el.innerHTML = segBar('fdtab', [['obs', '🥣 辅食观察'], ['alg', '🥛 过敏营养'], ['supp', '💊 补剂']], tab) + '<div id="seg-body2"></div>'
    const body = el.querySelector('#seg-body2')
    ;({ obs: foodObs, alg: foodAlg, supp: suppBody })[tab](body)
    bindSeg(el, 'fdtab', () => foodBody(el))
  }

  function foodObs(el) {
    const mo = SD.time.ageParts(child().birth).totalMo
    const foods = SD.store.recordsOf().filter(r => r.type === 'food').slice(-8).reverse()
    const stage = Object.values(SD.DATA.feed.food).find(f => mo >= f.rng[0] && mo <= f.rng[1])
    el.innerHTML = `
      <div class="card"><h3>🥣 辅食观察（3 天法）</h3>
        <b>添加新食物</b>
        <label class="field">食物名</label><input type="text" id="fd-name" placeholder="如：胡萝卜泥">
        <label class="field">开始日期</label><input type="date" id="fd-date">
        <p></p><button class="btn" id="fd-add">开始观察</button>
        <p class="note" style="margin-top:8px">每加一种连续观察 3 天，无反应再加下一种；出现可疑反应立即停喂并标记。</p>
      </div>
      ${stage ? `<div class="card"><h3>${esc(stage.stage)}（${stage.rng[0]}-${stage.rng[1]} 月）</h3>
        <p>质地：${esc(stage.tex)} · ${esc(stage.freq)}</p>
        <p class="note">可尝试：${stage.kinds.map(esc).join('、')}</p>
        ${stage.menu?.length ? `<details class="fold" style="margin-top:8px"><summary><b>📅 一周参考食谱</b></summary>
          <table class="menu" style="margin-top:8px"><tr><th></th><th>主食</th><th>搭配</th></tr>
          ${stage.menu.map(r => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</table></details>` : ''}
        </div>` : ''}
      ${foods.length ? `<div class="sec-title">观察中 / 近期</div>` + foods.map(f => {
        const w = SD.features.foodWindow(f.date, SD.time.todayStr())
        const reacts = SD.store.recordsOf().filter(r => r.type === 'food-react' && r.name === f.name)
        const done = SD.store.recordsOf().some(r => r.type === 'food-ok' && r.name === f.name)
        return `<div class="card">
          <h3>${esc(f.name)} ${done ? '✅ 已通过' : reacts.length ? '⚠️ 可疑过敏' : w.passed ? '观察期满' : `观察第 ${w.day}/3 天`}</h3>
          <p class="note">开始于 ${f.date}${reacts.length ? ' · 反应：' + reacts.map(r => esc(r.symptom)).join('、') : ''}</p>
          ${!done && !reacts.length ? `<p>
            <button class="btn ghost" data-ok="${esc(f.name)}">3 天无反应 ✓</button>
            <button class="btn ghost" data-react="${esc(f.name)}">标记反应 ⚠️</button></p>` : ''}
        </div>`
      }).join('') : '<div class="empty"><p class="note">还没有辅食记录</p></div>'}`

    el.querySelector('#fd-date').value = SD.time.todayStr()
    el.querySelector('#fd-add').addEventListener('click', () => {
      const name = el.querySelector('#fd-name').value.trim(), date = el.querySelector('#fd-date').value
      if (!name || !date) return SD.ui.toast('食物名与日期必填')
      if (SD.store.recordsOf().some(r => r.type === 'food' && r.name === name)) return SD.ui.toast('该食物已在观察列表')
      SD.store.addRecord({ type: 'food', name, date })
      foodObs(el)
    })
    el.querySelectorAll('[data-ok]').forEach(b => b.addEventListener('click', () => {
      SD.store.addRecord({ type: 'food-ok', name: b.dataset.ok, date: SD.time.todayStr() }); foodObs(el)
    }))
    el.querySelectorAll('[data-react]').forEach(b => b.addEventListener('click', () => {
      openReactModal(b.dataset.react, () => foodObs(el))
    }))
  }

  /* 反应选择弹窗（替代原生 prompt，选项直接点选） */
  function openReactModal(name, after) {
    document.getElementById('react-modal')?.remove()
    const ov = document.createElement('div')
    ov.className = 'overlay'; ov.id = 'react-modal'
    ov.innerHTML = `<div class="modal">
      <h3>「${esc(name)}」出现什么反应？</h3>
      <div class="react-grid">${REACTIONS.map(r =>
        `<button class="react-opt" data-sym="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      <p class="note">标记后自动停喂观察；对应过敏原的替代方案会在「过敏营养」页置顶。</p>
      <p></p>
      <div class="row">
        <button class="btn ghost" id="r-cancel">取消</button>
        <button class="btn danger" id="r-severe">反应严重 · 就医</button>
      </div>
    </div>`
    document.body.appendChild(ov)
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove() })
    ov.querySelector('#r-cancel').addEventListener('click', () => ov.remove())
    ov.querySelectorAll('[data-sym]').forEach(b => b.addEventListener('click', () => {
      SD.store.addRecord({ type: 'food-react', name, symptom: b.dataset.sym, date: SD.time.todayStr() })
      ov.remove(); after && after()
    }))
    ov.querySelector('#r-severe').addEventListener('click', () => {
      SD.store.addRecord({ type: 'food-react', name, symptom: '严重反应', date: SD.time.todayStr() })
      SD.ui.toast('呼吸急促/面部肿胀/精神差 → 立即就医，不要观察等待')
      ov.remove(); after && after()
    })
  }

  function foodAlg(el) {
    const reactNames = new Set(SD.store.recordsOf().filter(r => r.type === 'food-react').map(r => r.name))
    const entries = Object.entries(SD.DATA.feed.allergen)
    entries.sort((a, b) => (reactNames.has(b[0]) ? 1 : 0) - (reactNames.has(a[0]) ? 1 : 0))
    el.innerHTML = `
      ${reactNames.size ? `<div class="card redcard"><h3>⚠️ 宝宝已标记反应</h3><p>${[...reactNames].map(esc).join('、')}——对应替代方案已置顶并展开</p></div>` : ''}
      ${entries.map(([k, v]) => `
        <details class="card" ${reactNames.has(k) ? 'open' : ''}><summary>${reactNames.has(k) ? '⚠️' : '🥛'} <b>${esc(k)}</b>${reactNames.has(k) ? '（宝宝已标记反应）' : ''}</summary>
          <p class="note">含：${v.risk.map(esc).join('、')}</p>
          <p>替代：${esc(v.alt)}</p><p class="note">注意：${esc(v.sup)}</p></details>`).join('')}
      <div class="sec-title">关键营养素</div>
      ${SD.DATA.feed.nutri.map(n => `
        <details class="card"><summary>💊 <b>${esc(n[0])}</b> · ${esc(n[1])}</summary>
          <p class="note">来源：${esc(n[2])}</p>
          <p>每日参考：${esc(n[3])}</p><p class="note">${esc(n[4])}</p></details>`).join('')}`
  }

  const SUPPS = [
    { key: 'vitd', label: '维生素D₃', note: '出生数日后每日 400IU' },
    { key: 'dha', label: 'DHA', note: '按需，遵医嘱' },
    { key: 'iron', label: '铁剂', note: '早产/缺铁遵医嘱' },
  ]
  function suppBody(el) {
    if (!child()) return onboard(el)
    const recs = SD.store.recordsOf()
    const days = SD.trends.last7Days(recs, SD.time.todayStr())
    // 单卡收纳三补剂：每行 = 名称+状态 | 圆形打卡钮 | 近7日点阵
    el.innerHTML = `
      <div class="card"><h3>💊 补剂打卡</h3>
        ${SUPPS.map(s => {
          const taken = recs.some(r => r.type === s.key && r.date === SD.time.todayStr())
          return `
        <div class="supp-row">
          <span class="supp-name">${s.label}<i class="${taken ? 'on' : ''}">${taken ? '已补' : '未补'}</i></span>
          <button class="supp-tap ${taken ? 'on' : ''}" data-supp="${s.key}" title="${taken ? '点按撤销' : '点按打卡'}">${taken ? '✓' : '＋'}</button>
          <div class="dots">${days.map(d => {
            const hit = recs.some(r => r.type === s.key && r.date === d.date)
            return `<span class="dot ${hit ? 'on' : ''}" title="${d.date}">${d.date.slice(5)}</span>`
          }).join('')}</div>
        </div>`
        }).join('')}
        <p class="note" style="margin-top:8px">${SUPPS.map(s => `${s.label}：${s.note}`).join('　')}——剂量遵医嘱，这里只记「今天吃没吃」。</p>
      </div>`
    el.querySelectorAll('[data-supp]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.supp
      const today = recs.find(r => r.type === k && r.date === SD.time.todayStr())
      if (today) SD.store.removeRecord(today.id)
      else SD.store.addRecord({ type: k, date: SD.time.todayStr(), time: SD.time.nowTime() })
      suppBody(el)
    }))
  }

  /* 护理段：页内 Tab（体温 ｜ 宝宝健康 ｜ 妈妈） */
  function careBody(el) {
    if (!child()) return onboard(el)
    const tab = el.dataset.crtab || 'temp'
    el.innerHTML = segBar('crtab', [['temp', '🌡️ 体温'], ['health', '🏥 宝宝健康'], ['mom', '🤱 妈妈']], tab) + '<div id="seg-body2"></div>'
    const body = el.querySelector('#seg-body2')
    ;({ temp: tempTab, health: healthTab, mom: momTab })[tab](body)
    bindSeg(el, 'crtab', () => careBody(el))
  }

  function tempTab(el) {
    const mo = SD.time.ageParts(child().birth).totalMo
    const temps = SD.store.recordsOf().filter(r => r.type === 'temp').slice(-12).reverse()
    el.innerHTML = `
      ${mo < 3 ? '<div class="card"><h3>🔴 小月龄提醒</h3><p class="note">3 月龄内发热 ≥38℃ 属急症，立即就医，勿自行用药。</p></div>' : ''}
      <div class="card">
        <h3>🌡️ 记录体温</h3>
        <label class="field">时段</label><select id="t-part"><option>晨起</option><option>午后</option><option>晚间</option></select>
        <label class="field">体温 (℃)</label><input type="number" id="t-val" step="0.1" min="34" max="43">
        <p></p><button class="btn" id="t-save">保存</button>
      </div>
      ${temps.length ? `<div class="sec-title">近期体温</div>` + temps.map(t => {
        const st = SD.features.tempStatus(mo, t.val)
        const col = { ok: 'var(--ok)', low: 'var(--warn)', high: 'var(--danger)', urgent: 'var(--danger)' }[st]
        return `<div class="tl-item"><span class="icon">🌡️</span><span class="desc">${t.date} ${t.time || ''}（${t.part || ''}）</span><span style="color:${col};font-weight:600">${t.val}℃</span><button class="del" data-id="${t.id}">✕</button></div>`
      }).join('') : ''}`
    el.querySelector('#t-save').addEventListener('click', () => {
      const v = +el.querySelector('#t-val').value
      if (!v || v < 34 || v > 43) return SD.ui.toast('请输入 34-43 之间的体温值')
      SD.store.addRecord({ type: 'temp', date: SD.time.todayStr(), time: SD.time.nowTime(), part: el.querySelector('#t-part').value, val: v })
      const st = SD.features.tempStatus(mo, v)
      if (st === 'urgent') SD.ui.toast('⚠️ 3 月龄内 ≥38℃：请立即就医')
      else if (st === 'high') SD.ui.toast('高热 ≥38.5℃，参考「发热」护理要点，必要时就医')
      tempTab(el)
    })
    el.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { SD.store.removeRecord(b.dataset.id); tempTab(el) }))
  }

  function healthTab(el) {
    el.innerHTML = `
      ${SD.DATA.health.diseases.map(d => `
        <details class="card"><summary>${d.ic} <b>${esc(d.nm)}</b> · ${esc(d.sym)}</summary>
          <p><b>护理：</b></p><ul class="list">${d.care.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          ${d.see ? `<p class="note">⚠️ 就医信号：${esc(d.see)}</p>` : ''}</details>`).join('')}
      <div class="card"><h3>💊 家庭药箱</h3>${SD.DATA.health.medkit.map(m => `<p><b>${esc(m[0])}</b>：<span class="note">${esc(m[1])}</span></p>`).join('')}</div>
      <p class="note">仅供参考，不构成医疗建议；用药请遵医嘱与说明书。</p>`
  }

  function momTab(el) {
    el.innerHTML = momBodyHTML()
    bindMom(el)
  }

  const EPDS_OPTS = ['从不', '偶尔', '经常', '总是']
  function momBodyHTML() {
    return `
      <div class="card">
        <h3>EPDS 情绪自评（爱丁堡产后抑郁量表·简化版）</h3>
        ${SD.DATA.epds.map((q, i) => `
          <p class="q"><b>${i + 1}.</b> ${esc(q)}</p>
          <div class="opts">${EPDS_OPTS.map((o, j) => `
            <label class="opt"><input type="radio" name="epds${i}" value="${j}">${o}</label>`).join('')}</div>`).join('')}
        <p></p><button class="btn" id="epds-go">提交自评</button>
        <div id="epds-out"></div>
        <p class="note">⚠️ 本自评为简化版筛查提示，不构成诊断。总分≥13 或第 10 题任一非零，请及时寻求专业帮助。</p>
      </div>
      ${SD.state.epdsHistory.length ? `<div class="card"><h3>历史自评</h3>${SD.state.epdsHistory.slice(-5).reverse().map(h => `<p>${h.date} · ${h.score} 分${h.q10 ? ' · ⚠️第10题红旗' : ''}</p>`).join('')}</div>` : ''}
      <div class="card">
        <h3>哺乳期用药查询（L1-L5）</h3>
        <input type="text" id="med-q" placeholder="输入药名，如：布洛芬">
        <div id="med-out"></div>
        <p class="note">L1 最安全 → L5 禁用。以医生与说明书为准。</p>
      </div>
      <div class="sec-title">产后恢复参考</div>
      ${SD.DATA.mom.diet.map(w => `<details class="card"><summary><b>${esc(w.wk)}</b> · ${esc(w.goal)}</summary>
        <p class="ok-list">✅ ${w.good.map(esc).join('；')}</p><p class="bad-list">❌ ${w.bad.map(esc).join('；')}</p></details>`).join('')}
      ${SD.DATA.mom.wound.map(w => `<details class="card"><summary><b>${esc(w.t)}</b></summary><p>${w.care.map(esc).join('；')}</p></details>`).join('')}
      <div class="card"><h3>身体恢复</h3>${SD.DATA.mom.recover.map(r => `<p>💪 <b>${esc(r[0])}</b>：${esc(r[1])}</p>`).join('')}</div>
      <p class="note">仅供参考，不构成医疗建议；用药请遵医嘱与说明书。</p>`
  }
  function bindMom(scope) {
    scope.querySelector('#epds-go').addEventListener('click', () => {
      const ans = SD.DATA.epds.map((_, i) => {
        const r = scope.querySelector(`input[name=epds${i}]:checked`)
        return r ? +r.value : null
      })
      if (ans.some(a => a === null)) return SD.ui.toast('还有题目未作答')
      const r = SD.features.epdsScore(ans)
      SD.store.addEpds(r.total, r.q10Flag)
      const tips = { low: '状态不错，继续保持', mid: '关注情绪状态，多休息、多倾诉', high: '建议尽快咨询专业医生' }
      scope.querySelector('#epds-out').innerHTML = `
        <div class="stat"><div class="k">总分</div><div class="v">${r.total}</div><div class="note">${tips[r.level]}${r.q10Flag ? ' · 第10题有非零作答，请务必重视' : ''}</div></div>`
    })
    const medOut = scope.querySelector('#med-out')
    scope.querySelector('#med-q').addEventListener('input', () => {
      const q = scope.querySelector('#med-q').value.trim()
      if (!q) return (medOut.innerHTML = '')
      const hits = SD.DATA.bf_med.filter(m => m[0].includes(q))
      medOut.innerHTML = hits.length
        ? hits.map(m => `<p>💊 <b>${esc(m[0])}</b> <span class="vac-badge ${m[1] <= 'L2' ? 'done' : m[1] <= 'L3' ? 'planned' : 'overdue'}">${m[1]}</span><br><span class="note">${esc(m[2])}</span></p>`).join('')
        : '<p class="note">未收录，请咨询医生</p>'
    })
  }

  function helpBody(el) {
    el.innerHTML = `
      <div class="card"><h3>❓ 使用指南</h3>
        <p><b>1. 开始</b>：设置里建宝宝档案（生日用于日龄/疫苗/生长曲线计算）。</p>
        <p><b>2. 每天</b>：首页快捷按钮打卡——喂奶可计时（计时页开始/结束自动记时长）；睡觉填入睡/醒来；体温在「育儿·护理」记录并自动分级。</p>
        <p><b>3. 每周</b>：看「成长」的 7 日趋势与睡眠洞察；测量身高体重画 WHO 曲线。</p>
        <p><b>4. 新食物</b>：「育儿·辅食」添加后观察 3 天，无反应再换下一种；有反应一键标记并查看替代方案。</p>
        <p><b>5. 交接</b>：「家庭·交接卡」一键复制今日摘要，发给家人完成交接——这是无云版的夫妻协同。</p>
        <p><b>6. 数据</b>：一切只存在本设备浏览器；换手机/清缓存前请先「设置→导出备份」。</p>
      </div>
      <div class="card"><h3>隐私承诺</h3><p class="note">本工具零账号、零网络请求（部署版仅加载自身静态文件）。没有服务器，就没有泄露。</p></div>
      <div class="card"><h3>常用问题</h3>
        <p class="note">Q：换设备怎么迁移？——旧设备导出 JSON，新设备导入。</p>
        <p class="note">Q：能装到手机主屏吗？——部署版浏览器菜单里「添加到主屏幕」，像 App 一样离线用。</p>
        <p class="note">Q：为什么没有账号和云同步？——宝宝的数据不该存在别人的服务器上。这是本产品的第一原则。</p>
      </div>`
  }

  /* ══════════ 👨‍👩‍👧 家庭（任务 ｜ 交接卡） ══════════ */
  function family(el) {
    const seg = el.dataset.fseg || 'task'
    el.innerHTML = segBar('fseg', [['task', '📌 任务看板'], ['card', '📋 交接卡']], seg) + '<div id="seg-body"></div>'
    const body = el.querySelector('#seg-body')
    ;({ task: taskBody, card: cardBody })[seg](body)
    bindSeg(el, 'fseg', () => family(el))
  }

  let tkWho = '奶爸', tkPri = 'mid'
  function taskBody(el) {
    const COLS = { todo: ['待办', 'var(--gray-400)'], doing: ['进行中', 'var(--primary-500)'], done: ['已完成', 'var(--ok)'] }
    const PRI = { high: ['高', 'overdue'], mid: ['中', 'planned'], low: ['低', 'done'] }
    el.innerHTML = `
      <div class="task-add card">
        <input type="text" id="tk-title" placeholder="任务，如：夜奶轮值 / 买尿不湿 S 码">
        <div class="chips" style="margin-top:8px">
          ${['奶爸', '妈妈', '一起'].map(w => `<button class="chip ${w === tkWho ? 'on' : ''}" data-tkw="${w}">${w}</button>`).join('')}
        </div>
        <div class="chips" style="margin-top:6px">
          ${[['high', '高'], ['mid', '中'], ['low', '低']].map(([v, l]) => `<button class="chip ${v === tkPri ? 'on' : ''}" data-tkp="${v}">${l}</button>`).join('')}
        </div>
        <button class="btn" id="tk-add" style="width:100%;margin-top:10px">添加任务</button>
      </div>
      ${Object.entries(COLS).map(([k, [label, color]]) => {
        const all = SD.state.tasks.filter(t => t.status === k)
        let list = all, hidden = 0
        // 已完成：默认只显示最近 3 条，更早的折叠（查看更多展开）
        if (k === 'done' && all.length > 3 && el.dataset.doneOpen !== '1') {
          hidden = all.length - 3
          list = all.slice(-3)
        }
        return `<div class="task-col">
          <div class="task-col-head"><i class="dotc" style="background:${color}"></i>${label}<span class="cnt">${all.length}</span>
            ${k === 'done' && all.length ? '<button class="linklike" id="tk-clear-done">清空</button>' : ''}
          </div>
          ${list.map(t => `
            <div class="task-card" data-st="${t.status}" data-tk="${t.id}" title="点卡片流转状态">
              <button class="del" data-rm="${t.id}" title="删除">✕</button>
              <div class="meta">
                <button class="vac-badge ${PRI[t.pri][1]}" data-pri="${t.id}" title="点切换优先级">${PRI[t.pri][0]}</button>
                <span>${esc(t.who)} · ${t.doneAt ? '完成于 ' + t.doneAt.slice(5) : t.date.slice(5)}</span>
              </div>
              <b>${esc(t.title)}</b>
            </div>`).join('') || '<p class="note">— 空 —</p>'}
          ${hidden ? `<button class="more-btn" data-more="1">查看更早的 ${hidden} 条 ▾</button>` : ''}
          ${k === 'done' && el.dataset.doneOpen === '1' && all.length > 3 ? '<button class="more-btn" data-less="1">收起 ▴</button>' : ''}
        </div>`
      }).join('')}
      <p class="note" style="text-align:center">点卡片流转：待办 → 进行中 → 已完成 · 点优先级徽标可切换高/中/低</p>`
    const moreBtn = el.querySelector('[data-more]')
    if (moreBtn) moreBtn.addEventListener('click', () => { el.dataset.doneOpen = '1'; taskBody(el) })
    const lessBtn = el.querySelector('[data-less]')
    if (lessBtn) lessBtn.addEventListener('click', () => { delete el.dataset.doneOpen; taskBody(el) })
    el.querySelectorAll('[data-tkw]').forEach(b => b.addEventListener('click', () => {
      tkWho = b.dataset.tkw; taskBody(el)
    }))
    el.querySelectorAll('[data-tkp]').forEach(b => b.addEventListener('click', () => {
      tkPri = b.dataset.tkp; taskBody(el)
    }))
    el.querySelector('#tk-add').addEventListener('click', () => {
      const title = el.querySelector('#tk-title').value.trim()
      if (!title) return SD.ui.toast('写下任务内容')
      SD.store.addTask(title, tkWho, tkPri)
      taskBody(el)
    })
    const clearBtn = el.querySelector('#tk-clear-done')
    if (clearBtn) clearBtn.addEventListener('click', () => {
      SD.ui.confirm('清空全部已完成任务？', () => { SD.store.clearDoneTasks(); taskBody(el) }, { danger: true, okText: '清空' })
    })
    el.querySelectorAll('.task-card').forEach(c => c.addEventListener('click', e => {
      if (e.target.dataset.rm) { SD.store.removeTask(e.target.dataset.rm); taskBody(el); return }
      if (e.target.dataset.pri) { SD.store.cycleTaskPri(e.target.dataset.pri); taskBody(el); return }
      SD.store.advanceTask(c.dataset.tk); taskBody(el)
    }))
  }

  function cardBody(el) {
    if (!child()) return onboard(el)
    const c = child(), p = SD.time.ageParts(c.birth)
    const s = SD.summary.summarizeDay(SD.store.recordsOf(), SD.time.todayStr())
    const next = SD.vaccine.nextVaccine(c.birth, SD.store.vaccineDone())
    const watching = SD.store.recordsOf().filter(r => r.type === 'food' &&
      !SD.store.recordsOf().some(o => (o.type === 'food-ok' || o.type === 'food-react') && o.name === r.name))
    const text =
`【${c.name}的今日交接卡】${SD.time.todayStr()}
年龄：${SD.time.fmtAge(p)}（第 ${p.days} 天）
今日喂奶：${s.feedCount} 次${s.feedMl ? `（瓶喂共 ${s.feedMl}ml）` : ''}
今日睡眠：${(s.sleepMinutes / 60).toFixed(1)} 小时
尿 ${s.pee} 次 / 便 ${s.poop} 次 / 维生素D ${s.vitd ? '已补' : '❗未补'}
${watching.length ? `辅食观察中：${watching.map(f => f.name).join('、')}\n` : ''}${next ? `下一剂疫苗：${next.name} 第${next.dose}剂（${next.sched}）\n` : ''}
—— 由超级奶爸工作台本地生成，数据未上传`

    el.innerHTML = `
      <div class="card"><h3>📋 今日交接卡</h3>
        <p class="note">生成今日摘要文本，复制发给家人（妈妈/长辈/阿姨）完成交接。纯本地生成。</p>
        <pre class="card-text">${esc(text)}</pre>
        <p></p><button class="btn" id="copy">复制交接卡</button>
      </div>`
    el.querySelector('#copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(text); SD.ui.toast('已复制，去粘贴给家人吧') }
      catch {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta)
        ta.select(); document.execCommand('copy'); ta.remove(); SD.ui.toast('已复制')
      }
    })
  }

  /* ══════════ 🎧 哄睡（独立高频场景页） ══════════ */
  const NOISES = [
    { key: 'white', label: '白噪音', note: '吸尘器/雨声感，遮杂音' },
    { key: 'pink', label: '粉噪音', note: '更柔，像轻风/林间' },
    { key: 'brown', label: '棕噪音', note: '低沉，像 womb/深浪' },
    { key: 'heart', label: '心跳', note: '低频节拍，模拟怀抱' },
  ]
  let audioCtx = null, noiseNode = null, noiseStopTimer = null, heartTimer = null, autoStopMin = 0
  function stopNoise() {
    if (noiseStopTimer) { clearTimeout(noiseStopTimer); noiseStopTimer = null }
    if (heartTimer) { clearInterval(heartTimer); heartTimer = null }
    if (noiseNode) { try { noiseNode.stop() } catch {} noiseNode = null }
    if (audioCtx) { try { audioCtx.close() } catch {} audioCtx = null }
  }
  function thump() {
    if (!audioCtx) return
    const osc = audioCtx.createOscillator(), g = audioCtx.createGain()
    osc.frequency.value = 55
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.9, audioCtx.currentTime + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28)
    osc.connect(g).connect(audioCtx.destination)
    osc.start(); osc.stop(audioCtx.currentTime + 0.3)
  }
  let noiseKind = 'white'
  function sound(el) {
    const playing = !!noiseNode
    const cur = NOISES.find(n => n.key === noiseKind)
    el.innerHTML = `
      <div class="card"><h3>🎧 哄睡白噪音</h3>
        <p class="note">浏览器本地合成，无音频文件无网络。音量先调低再播放，设备离婴儿 1 米以上。</p>
        <div class="seg">
          ${NOISES.map(n => `<button class="seg-btn ${n.key === noiseKind ? 'on' : ''}" data-kind="${n.key}" ${playing ? 'disabled' : ''}>${n.label}</button>`).join('')}
        </div>
        ${playing
          ? `<button class="btn danger primary-big" id="n-toggle">■ 停止${cur ? '（' + cur.label + '）' : ''}</button>`
          : `<button class="btn primary-big" id="n-toggle">▶ 开始${cur ? '（' + cur.label + '）' : ''}</button>`}
        <div class="seg" style="margin-top:12px">
          <button class="seg-btn ${autoStopMin === 15 ? 'on' : ''}" data-min="15">定时 15 分</button>
          <button class="seg-btn ${autoStopMin === 30 ? 'on' : ''}" data-min="30">30 分</button>
          <button class="seg-btn ${autoStopMin === 60 ? 'on' : ''}" data-min="60">60 分</button>
          <button class="seg-btn ${autoStopMin === 0 ? 'on' : ''}" data-min="0">不定时</button>
        </div>
        <p class="note" id="n-state">${playing ? '播放中' : ''}</p>
      </div>
      <div class="card"><h3>5S 安抚法（Harvey Karp）</h3>
        <ul class="list">
          <li>🧣 <b>Swadding 襁褓</b>：包裹还原子宫安全感</li>
          <li>🤝 <b>Side/Stomach 侧抱</b>：安抚时侧卧位抱（睡觉仍仰卧）</li>
          <li>🤫 <b>Shushing 嘘声</b>：耳边持续轻「嘘」，可配合白噪音</li>
          <li>🌊 <b>Swinging 摇晃</b>：小幅而有节奏的头颈部轻晃</li>
          <li>🍬 <b>Sucking 吸吮</b>：亲喂/安抚奶嘴</li>
        </ul>
      </div>
      <div class="card"><h3>使用提示</h3><p class="note">音量以成人手臂长度处听感舒适为宜（≈50dB 内）；不放婴儿耳边；睡着即可停。</p></div>`

    el.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => {
      noiseKind = b.dataset.kind; sound(el)
    }))
    el.querySelectorAll('[data-min]').forEach(b => b.addEventListener('click', () => {
      autoStopMin = +b.dataset.min
      if (noiseNode) {
        if (noiseStopTimer) clearTimeout(noiseStopTimer)
        if (autoStopMin) noiseStopTimer = setTimeout(() => { stopNoise(); sound(el) }, autoStopMin * 60000)
      }
      sound(el)
    }))
    el.querySelector('#n-toggle').addEventListener('click', () => {
      if (noiseNode) { stopNoise(); sound(el); return }
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const kind = noiseKind
      if (kind === 'heart') {
        thump(); heartTimer = setInterval(() => { thump(); setTimeout(thump, 180) }, 850)
        noiseNode = { stop() {} }
      } else {
        const len = audioCtx.sampleRate * 2
        const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
        const data = buf.getChannelData(0)
        let lastOut = 0
        for (let i = 0; i < len; i++) {
          const w = Math.random() * 2 - 1
          if (kind === 'white') data[i] = w * 0.3
          else if (kind === 'pink') { lastOut = 0.86 * lastOut + w * 0.14; data[i] = lastOut * 2.2 }
          else { lastOut = (lastOut + 0.02 * w) / 1.02; data[i] = lastOut * 4.5 }
        }
        const src = audioCtx.createBufferSource()
        src.buffer = buf; src.loop = true
        const gain = audioCtx.createGain(); gain.gain.value = 0.5
        src.connect(gain).connect(audioCtx.destination)
        src.start()
        noiseNode = src
      }
      if (autoStopMin) noiseStopTimer = setTimeout(() => { stopNoise(); sound(el) }, autoStopMin * 60000)
      sound(el)
    })
    window.addEventListener('hashchange', stopNoise, { once: true })
  }

  /* ══════════ ⚙️ 设置（顶栏齿轮进入） ══════════ */
  /* 添加宝宝弹窗（设置页与顶栏下拉共用） */
  function openAddModal(after) {
    closeAddModal()
    const ov = document.createElement('div')
    ov.className = 'overlay' ; ov.id = 'add-modal'
    ov.innerHTML = `<div class="modal">
      <h3>添加宝宝</h3>
      <label class="field">小名</label><input type="text" id="am-name" placeholder="例如：小核桃">
      <label class="field">出生日期</label><input type="date" id="am-birth">
      <label class="field">性别</label><select id="am-gender"><option value="">保密</option><option value="m">男</option><option value="f">女</option></select>
      <p></p>
      <div class="row">
        <button class="btn ghost" id="am-cancel">取消</button>
        <button class="btn" id="am-save">添加</button>
      </div>
    </div>`
    document.body.appendChild(ov)
    const birth = ov.querySelector('#am-birth')
    birth.max = SD.time.todayStr()          // 生日不能晚于今天
    ov.addEventListener('click', e => { if (e.target === ov) closeAddModal() })
    ov.querySelector('#am-cancel').addEventListener('click', closeAddModal)
    ov.querySelector('#am-save').addEventListener('click', () => {
      const name = ov.querySelector('#am-name').value.trim()
      const b = birth.value
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return SD.ui.toast('小名与出生日期必填')
      if (b > SD.time.todayStr()) return SD.ui.toast('出生日期不能晚于今天')
      SD.store.addChild({ name, birth: b, gender: ov.querySelector('#am-gender').value })
      closeAddModal(); after && after()
    })
  }
  function closeAddModal() { document.getElementById('add-modal')?.remove() }

  function settings(el) {
    const st = SD.state
    el.innerHTML = `
      <div class="sec-title">宝宝档案（${st.children.length} 个）</div>
      ${st.children.map(c => `
        <div class="tl-item"><span class="desc"><b>${esc(c.name)}</b> · ${esc(c.birth)} · ${({ m: '男', f: '女' }[c.gender] || '—')}</span>
          ${c.id === st.activeId ? '<span class="vac-badge done">当前</span>' : `<button class="btn ghost" data-sw="${c.id}">切换</button>`}
          <button class="del" data-rm="${c.id}">✕</button></div>`).join('')}
      <p></p><button class="btn ghost" id="s-open-add">＋ 添加宝宝</button>
      <div class="sec-title">数据主权（核心承诺）</div>
      <div class="card">
        <p class="note">所有数据只存在这台设备的浏览器里，零上传。请定期导出备份。</p>
        <p></p><button class="btn" id="s-export">导出备份 JSON</button>
        <p></p><label class="field">从备份恢复</label><input type="file" id="s-import" accept=".json">
        <p></p><button class="btn danger" id="s-clear">清空全部数据</button>
      </div>
      <div class="card"><p class="note">免责：疫苗排程/生长曲线/健康与用药内容均为育儿辅助参考，不构成医疗建议；EPDS 为简化自评非诊断。健康问题请咨询专业医生。</p></div>
      <div class="sec-title">使用指南</div>
      <div id="help-slot"></div>`

    el.querySelector('#s-open-add').addEventListener('click', () =>
      openAddModal(() => { location.hash = '#settings'; SD.app.render() }))
    helpBody(el.querySelector('#help-slot'))   // 使用指南内嵌（自育儿页迁入）
    if (sessionStorage.getItem('sd-open-add') === '1') {   // 顶栏下拉触发的添加
      sessionStorage.removeItem('sd-open-add')
      setTimeout(() => openAddModal(() => SD.app.render()), 50)
    }
    el.querySelectorAll('[data-sw]').forEach(b => b.addEventListener('click', () => { SD.store.switchChild(b.dataset.sw); settings(el); SD.app.render() }))
    el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
      const c = st.children.find(x => x.id === b.dataset.rm)
      SD.ui.confirm(`删除「${c.name}」的全部记录？\n不可恢复，建议先导出备份`, () => { SD.store.removeChild(b.dataset.rm); settings(el) }, { danger: true, okText: '删除' })
    }))
    el.querySelector('#s-export').addEventListener('click', () => {
      const blob = new Blob([SD.store.exportJSON()], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = `superdaddy-backup-${SD.time.todayStr()}.json`
      a.click(); URL.revokeObjectURL(a.href)
    })
    el.querySelector('#s-import').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return
      const rd = new FileReader()
      rd.onload = () => { try { SD.store.importJSON(rd.result); SD.ui.toast('恢复成功'); location.hash = '#home' } catch (err) { SD.ui.toast('恢复失败：' + err.message) } }
      rd.readAsText(f)
    })
    el.querySelector('#s-clear').addEventListener('click', () => {
      SD.ui.confirm('确定清空全部数据？\n不可恢复（建议先导出）\n\n真的要清空吗？', () => {
        SD.store.clearAll(); location.hash = '#home'
      }, { danger: true, okText: '全部清空' })
    })
  }

  return { home, feed, growth, guide, family, sound, settings, feedform: feedForm, sleepform: sleepForm }
})()
