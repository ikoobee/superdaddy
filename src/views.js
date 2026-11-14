/* 视图层 v0.5 —— 五 Tab 信息架构：首页/记录/成长/育儿/家庭 + 哄睡与设置独立页 */
SD.views = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const back = '<p><a href="#home" class="backlink">← 返回首页</a></p>'
  const child = () => SD.store.child
  const moOf = c => (c && c.birth) ? SD.time.ageParts(c.birth).totalMo : 0
  const backupBanner = () => {
    if (sessionStorage.getItem('sd-bk-off') === '1') return ''
    const hasData = SD.state.records.length > 0 || SD.state.children.length > 0
    if (!hasData) return ''
    const last = SD.state.lastBackup
    const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : Infinity
    if (days <= 7) return ''
    return `<a class="card linkcard" href="#settings" id="bk-banner"><h3>💾 ${last ? '已 ' + days + ' 天未备份' : '还没有备份过'}</h3><p class="note">数据只存在本设备——去「设置 → 导出备份」一键保存 JSON</p></a>`
  }
  const bornGuard = el => `<div class="card"><h3>👶 出生后解锁</h3><p class="note">这一页用到宝宝生日（疫苗/生长/月龄计算）。</p></div><a class="card linkcard" href="#bag"><h3>🎒 先去准备待产包</h3></a><a class="card linkcard" href="#day42"><h3>📖 预习 42 天月子餐</h3></a>`

  /* 分段条：attr=dataset 键，items=[[seg,label]]，cur=当前段 */
  function segBar(attr, items, cur) {
    return `<div class="seg seg-main">${items.map(([s, l]) =>
      `<button class="seg-btn ${s === cur ? 'on' : ''}" data-${attr}="${s}">${l}</button>`).join('')}</div>`
  }
  function bindSeg(el, attr, rerender) {
    el.querySelectorAll(`[data-${attr}]`).forEach(b =>
      b.addEventListener('click', () => { el.dataset[attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = b.dataset[attr]; rerender() }))
  }

  /* ══════════ 🍼 待喂养提醒（BA6）：月龄参考表 → 下次喂养推算 ══════════ */
  const feedCardInner = fp => {
    const t = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
    if (fp.status === 'none')
      return `<h3>🍼 待喂养提醒</h3><p class="note">记录第一次喂养后开始提醒 · 参考每次 ${fp.ref.perMl}ml / 间隔约 ${fp.ref.interval}h</p>`
    if (fp.status === 'due')
      return `<h3>🍼 该喂奶啦 · 已到时 ${-fp.remainMin} 分钟</h3><p class="note">参考每次 ${fp.ref.perMl}ml · 今日 ${fp.todayCount}/${fp.ref.times} 次 · 亲喂按需，奶粉参考间隔</p>`
    const mark = fp.status === 'soon' ? '🟡' : '🍼'
    return `<h3>${mark} 下次喂养 ${t(fp.nextAt)} · 还有 ${fp.remainMin} 分钟</h3><p class="note">参考每次 ${fp.ref.perMl}ml · 间隔约 ${fp.ref.interval}h · 今日 ${fp.todayCount}/${fp.ref.times} 次</p>`
  }
  /* 全局 30s 心跳：卡内倒计时刷新 + 到时提示/通知（仅应用打开期间——本地优先无推送服务） */
  let feedTick = null, feedToastAt = null, feedVisArmed = false
  function feedTickOnce() {
    /* 首页计时指示卡顺带刷新（30s 粒度；表单内表盘由 armFormClock 秒级刷） */
    for (const k of ['sleep', 'feed']) {
      const span = document.getElementById('tm-' + k)
      const t = SD.timers.get(k)
      if (span && t) span.textContent = SD.time.fmtClock(SD.timers.elapsed(t))
    }
    const c = SD.store.child
    if (!c || !c.birth || !SD.state.feedRemind) return
    const fp = SD.feedPlan.feedPlan(c.birth, Date.now(), SD.store.recordsOf())
    const el = document.getElementById('feed-next-card')
    if (el && el.isConnected) el.innerHTML = feedCardInner(fp)
    if (fp.status === 'due' && fp.nextAt !== feedToastAt) {
      feedToastAt = fp.nextAt
      SD.ui.toast(`🍼 该喂奶啦 · 参考每次 ${fp.ref.perMl}ml（亲喂按需）`)
      if (SD.state.feedNotify && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('该喂奶啦', { body: `距上次已 ${Math.round((Date.now() - fp.lastMs) / 60000)} 分钟 · 参考每次 ${fp.ref.perMl}ml`, tag: 'sd-feed' }) } catch { /* file:// 或权限拒绝时静默降级 */ }
      }
    }
  }
  function armFeedTicker() {
    clearInterval(feedTick)
    feedTick = setInterval(feedTickOnce, 30000)
    /* 后台定时器被浏览器节流：回前台立即补一次刷新/到时检测（监听只挂一次） */
    if (!feedVisArmed) {
      feedVisArmed = true
      document.addEventListener('visibilitychange', () => { if (!document.hidden) feedTickOnce() })
    }
  }

  /* 表单计时表盘共用秒级心跳（计时器单例驱动，表单不在页面上时空转无害） */
  let formClock = null
  function armFormClock() {
    clearInterval(formClock)
    formClock = setInterval(() => {
      const f = SD.timers.get('feed'), fc = document.getElementById('f-clock')
      if (f && fc && fc.isConnected) fc.textContent = SD.time.fmtClock(SD.timers.elapsed(f))
      const s = SD.timers.get('sleep'), sc = document.getElementById('sl-clock')
      if (s && sc && sc.isConnected) sc.textContent = SD.time.fmtClock(SD.timers.elapsed(s))
    }, 1000)
  }

  /* ══════════ 🏠 首页（每日多次） ══════════ */
  function home(el) {
    if (!child()) return onboard(el)
    const c = child()
    if (!c.birth) return pregHome(el)
    const p = SD.time.ageParts(c.birth)
    const s = SD.summary.summarizeDay(SD.store.recordsOf(), SD.time.todayStr())
    const vacList = SD.vaccine.scheduleFor(c.birth, SD.store.vaccineDone())
    const next = vacList.find(v => v.status === 'planned')
    const overdue = vacList.filter(v => v.status === 'overdue')
    const temps = SD.store.recordsOf().filter(r => r.type === 'temp' && r.date === SD.time.todayStr())
    const tempWarn = temps.length ? SD.features.tempStatus(p.totalMo, temps[temps.length - 1].val) : null
    const suppTaken = SUPPS.filter(x => SD.store.recordsOf().some(r => r.type === x.key && r.date === SD.time.todayStr())).length
    /* 喂养副行：方式拆分小字（图标与时间轴一致），主值保持与其他卡同量级 */
    const feedSub = s.feedCount
      ? [s.nurseCount ? `🤱${s.nurseCount}` : '', s.formulaCount ? `🍼${s.formulaCount}` : '', s.formulaMl ? `${s.formulaMl}ml` : ''].filter(Boolean).join(' · ')
      : ''

    el.innerHTML = `
      ${backupBanner()}
      ${tempWarn && tempWarn !== 'ok' ? `<div class="card"><h3>${tempWarn === 'urgent' ? '🔴 <3月龄发热≥38℃：立即就医' : tempWarn === 'high' ? '🟠 高热 ≥38.5℃' : '🟡 低热'}</h3><p class="note">今日体温 ${temps[temps.length - 1].val}℃——记录可回看；处理见「育儿 · 护理」</p></div>` : ''}
      ${SD.timers.any().map(k => {
        const t = SD.timers.get(k)
        const label = k === 'sleep' ? '😴 睡眠计时中' : `🍼 亲喂计时中（${({ L: '左', R: '右', B: '双侧' })[t.side] || ''}）`
        return `<a class="card linkcard" href="#${k === 'sleep' ? 'sleep-form' : 'feed-form'}"><h3>${label} · <span id="tm-${k}">${SD.time.fmtClock(SD.timers.elapsed(t))}</span></h3><p class="note">点击进入停止或取消——切页不影响计时</p></a>`
      }).join('')}
      <div class="stat-grid">
        <div class="stat"><div class="k">今日喂养</div><div class="v">${s.feedCount} 次</div>${feedSub ? `<div class="sub">${feedSub}</div>` : ''}</div>
        <div class="stat"><div class="k">今日睡眠</div><div class="v">${(s.sleepMinutes / 60).toFixed(1)} 小时</div></div>
        <div class="stat"><div class="k">尿 / 便</div><div class="v">${s.pee} / ${s.poop}</div></div>
        <div class="stat"><div class="k">补剂</div><div class="v ${suppTaken === SUPPS.length ? 'done' : ''}">${suppTaken}/${SUPPS.length}</div></div>
      </div>
      ${SD.state.feedRemind ? `<a class="card linkcard" id="feed-next-card" href="#feed-form">${feedCardInner(SD.feedPlan.feedPlan(c.birth, Date.now(), SD.store.recordsOf()))}</a>` : ''}
      <div class="quick-row">
        <button class="quick-btn primary" data-act="feed">🍼 喂养</button>
        <button class="quick-btn" data-act="sleep">😴 睡觉</button>
        <button class="quick-btn" data-act="temp">🌡️ 体温</button>
        <button class="quick-btn" data-act="pee">💧 尿</button>
        <button class="quick-btn" data-act="poop">💩 便</button>
        <button class="quick-btn" data-act="vitd">💊 补剂</button>
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
      if (act === 'temp') return (location.hash = '#temp-form')
      if (act === 'vitd') return (location.hash = '#supp-form')
      SD.store.addRecord({ type: act, date: SD.time.todayStr(), time: SD.time.nowTime() })
      b.classList.add('done-flash'); setTimeout(() => { b.classList.remove('done-flash'); home(el) }, 450)
    }))
    armFeedTicker()
  }

  /* ══════════ 🤰 孕期首页与工具（未出生模式） ══════════ */
  function pregHome(el) {
    const c = child(), preg = SD.preg.pregParts(c.due)
    const recs = SD.store.recordsOf()
    const checkups = recs.filter(r => r.type === 'checkup').slice(-3).reverse()
    const bagDone = recs.filter(r => r.type === 'bag').length
    const bagTotal = SD.DATA.bag.cats.reduce((a, x) => a + x.items.length, 0)
    el.innerHTML = `
      ${backupBanner()}
      <div class="hero-age">
        <div class="days">孕 ${preg.week}<small style="font-size:1.3rem">周+${preg.day}</small></div>
        <div class="sub">距预产期 ${preg.daysLeft} 天 · ${esc(c.name)} · ${c.due}</div>
      </div>
      <div class="quick-row">
        <a class="quick-btn primary" href="#birth">🏥 产检</a>
        <a class="quick-btn" href="#birth">⚖️ 体重</a>
        <a class="quick-btn" href="#birth">👶 胎动</a>
        <a class="quick-btn" href="#birth">⏱️ 宫缩</a>
      </div>
      <a class="card linkcard" href="#bag"><h3>🎒 待产包 ${bagDone}/${bagTotal}</h3><p class="note">孕 34-37 周备好 → 去勾选</p></a>
      <a class="card linkcard" href="#day42"><h3>📖 42 天月子餐预习</h3><p class="note">产后每天吃什么，现在就能看</p></a>
      ${checkups.length ? `<div class="sec-title">近期产检</div>` + checkups.map(r =>
        `<div class="tl-item"><span class="icon">🏥</span><span class="desc">${r.date} ${esc(r.item)}${r.note ? ' · ' + esc(r.note) : ''}</span></div>`).join('') : ''}
      <p class="note" style="text-align:center">宝宝出生后：设置 → 档案 →「🎉 出生了」一键转正</p>`
  }

  function pregnancyBody(el) {
    const c = child(), preg = SD.preg.pregParts(c.due)
    const recs = SD.store.recordsOf()
    // A2 恢复近 1 小时宫缩记录（刷新/切页不丢）
    ct = { start: null, marks: recs.filter(r => r.type === 'ctmark' && r.t >= Date.now() - 3600e3).sort((a, b) => a.t - b.t) }
    const checkups = recs.filter(r => r.type === 'checkup').slice(-6).reverse()
    const weights = recs.filter(r => r.type === 'pweight').slice(-8).reverse()
    el.innerHTML = `
      <div class="card"><h3>🤰 孕 ${preg.week} 周+${preg.day} · 距预产期 ${preg.daysLeft} 天</h3><p class="note">预产期 ${c.due}（按 280 天推算，以产检为准）</p></div>

      <div class="card"><h3>🏥 产检记录</h3>
        <label class="field">日期</label><input type="date" id="cp-date">
        <label class="field">项目</label>
        <select id="cp-item"><option>常规产检</option><option>NT（11-13 周）</option><option>唐筛/无创</option><option>大排畸（20-24 周）</option><option>糖耐（24-28 周）</option><option>B 超</option><option>胎心监护</option><option>其他</option></select>
        <label class="field">备注（可空）</label><input type="text" id="cp-note" placeholder="结果/医生嘱咐">
        <p></p><button class="btn" id="cp-save">记录产检</button>
        ${checkups.length ? `<div class="sec-title">近期</div>` + checkups.map(r =>
          `<div class="tl-item"><span class="icon">🏥</span><span class="desc">${r.date} ${esc(r.item)}${r.note ? ' · ' + esc(r.note) : ''}</span><button class="del" data-id="${r.id}">✕</button></div>`).join('') : ''}
      </div>

      <div class="card"><h3>⚖️ 孕期体重 (kg)</h3>
        <div style="display:flex;gap:8px">
          <input type="date" id="pw-date" style="flex:1.3">
          <input type="number" id="pw-val" step="0.1" placeholder="kg" style="flex:1">
          <button class="btn" id="pw-save">记</button>
        </div>
        ${weights.length ? weights.map((r, i) => {
          const prev = weights[i + 1]
          const d = prev ? (r.val - prev.val).toFixed(1) : null
          return `<div class="tl-item"><span class="icon">⚖️</span><span class="desc">${r.date}</span><b>${r.val}kg</b>${d !== null ? `<span class="note" style="color:${d > 0 ? 'var(--warn)' : 'var(--ok)'}">${d > 0 ? '+' : ''}${d}</span>` : ''}<button class="del" data-id="${r.id}">✕</button></div>`
        }).join('') : '<p class="note">整孕期增重参考：孕前 BMI 正常约 11.5-16kg（以医生意见为准）</p>'}
      </div>

      <div class="card"><h3>👶 胎动计数（10 次法）</h3>
        <p class="note">孕 28 周后每天固定时段：2 小时内数满 10 次为正常。</p>
        <div class="timer-face" id="k-count">0<small style="font-size:1.2rem;color:var(--gray-400)">/10</small></div>
        <button class="btn primary-big" id="k-tap">踢了一下 +1</button>
        <p class="note" id="k-state">点第一次时自动开始计时</p>
        <button class="btn ghost" id="k-reset" style="margin-top:8px">重置</button>
      </div>

      <div class="card"><h3>⏱️ 宫缩计时（5-1-1 规则）</h3>
        <p class="note">宫缩来了点「开始」，过去了点「结束」；凑够次数自动评估。</p>
        <button class="btn primary-big" id="ct-btn">▶ 宫缩开始</button>
        <p class="note" id="ct-state"></p>
        <div id="ct-list"></div>
        <div id="ct-advice"></div>
      </div>

      <div class="card redcard"><h3>🚨 不等 5-1-1，立即就医</h3>
        <ul class="list"><li>破水：平躺垫高臀部，勿走动</li><li>出血如月经量</li><li>剧烈腹痛 / 胎动明显减少</li><li>头痛眼花、视物模糊、水肿骤增</li></ul>
      </div>`

    el.querySelector('#cp-date').value = SD.time.todayStr()
    el.querySelector('#pw-date').value = SD.time.todayStr()
    el.querySelector('#cp-save').addEventListener('click', () => {
      const item = el.querySelector('#cp-item').value, date = el.querySelector('#cp-date').value
      if (!date) return SD.ui.toast('选日期')
      SD.store.addRecord({ type: 'checkup', date, item, note: el.querySelector('#cp-note').value.trim() })
      pregnancyBody(el)
    })
    el.querySelector('#pw-save').addEventListener('click', () => {
      const v = +el.querySelector('#pw-val').value, date = el.querySelector('#pw-date').value
      if (!v || v < 30 || v > 200) return SD.ui.toast('体重 30-200kg')
      SD.store.addRecord({ type: 'pweight', date, val: v })
      pregnancyBody(el)
    })
    el.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { SD.store.removeRecord(b.dataset.id); pregnancyBody(el) }))

    // 胎动（会话态，10 次自动存档）
    const kCount = el.querySelector('#k-count'), kState = el.querySelector('#k-state')
    const paint = () => { kCount.innerHTML = `${kick.count}<small style="font-size:1.2rem;color:var(--gray-400)">/10</small>` }
    paint()
    el.querySelector('#k-tap').addEventListener('click', () => {
      if (!kick.start) { kick.start = Date.now(); kState.textContent = '计时中…' }
      kick.count++
      if (kick.count >= 10) {
        const mins = Math.max(1, Math.round((Date.now() - kick.start) / 60000))
        const fmt = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') }
        SD.store.addRecord({ type: 'kick', date: SD.time.todayStr(), start: fmt(kick.start), end: fmt(Date.now()), minutes: mins, count: 10 })
        kState.textContent = `✅ 10 次用时 ${mins} 分钟${mins <= 60 ? '（正常）' : '（偏慢，换个时段再数；持续异常就医）'}`
        kick = { start: null, count: 0 }
        paint()
        return
      }
      paint()
    })
    el.querySelector('#k-reset').addEventListener('click', () => { kick = { start: null, count: 0 }; kState.textContent = '已重置'; paint() })

    // 宫缩（会话态，自动 5-1-1 评估近 1 小时）
    const ctBtn = el.querySelector('#ct-btn'), ctState = el.querySelector('#ct-state'), ctList = el.querySelector('#ct-list'), ctAdvice = el.querySelector('#ct-advice')
    const renderCt = () => {
      const hourAgo = Date.now() - 3600e3
      const recent = ct.marks.filter(m => m.t >= hourAgo)
      ctList.innerHTML = ct.marks.slice(-6).reverse().map(m =>
        `<div class="tl-item"><span class="icon">⏱️</span><span class="desc">间隔约 ${m.gap} 分</span><b>${m.dur} 秒</b></div>`).join('')
      if (recent.length >= 2) {
        const r = SD.preg.contractionAdvice(recent.map(m => ({ gap: m.gap, dur: m.dur })))
        ctAdvice.innerHTML = `<div class="card ${r.level === 'go' ? 'redcard' : ''}" style="margin-top:8px"><h3>${r.level === 'go' ? '🚑' : '👀'} ${r.text}</h3></div>`
      }
    }
    renderCt()
    ctBtn.addEventListener('click', () => {
      if (!ct.start) { ct.start = Date.now(); ctBtn.textContent = '⏹ 宫缩结束'; ctBtn.classList.add('rec'); ctState.textContent = '计时中…' }
      else {
        const dur = Math.round((Date.now() - ct.start) / 1000)
        const last = ct.marks[ct.marks.length - 1]
        const gap = last ? Math.round((ct.start - last.t) / 60000) : 0
        ct.marks.push({ t: ct.start, dur, gap })
        SD.store.addRecord({ type: 'ctmark', date: SD.time.todayStr(), time: SD.time.nowTime(), t: ct.start, dur, gap })
        ct.start = null; ctBtn.textContent = '▶ 宫缩开始'; ctBtn.classList.remove('rec')
        ctState.textContent = '已记录，继续观察下一次'
        renderCt()
      }
    })
  }
  let kick = { start: null, count: 0 }
  let ct = { start: null, marks: [] }

  let obMode = 'born'   // born=已出生 wait=待出生
  function onboard(el) {
    el.innerHTML = `
      <div class="empty"><p>👋 欢迎使用超级奶爸工作台</p><p class="note">先建宝宝档案。所有数据只存在这台设备。</p></div>
      <div class="card">
        <div class="seg">
          <button class="seg-btn ${obMode === 'born' ? 'on' : ''}" data-ob="born">👶 已出生</button>
          <button class="seg-btn ${obMode === 'wait' ? 'on' : ''}" data-ob="wait">🤰 还没出生</button>
        </div>
        <label class="field">宝宝小名</label><input type="text" id="c-name" placeholder="例如：小柿子">
        ${obMode === 'born'
          ? '<label class="field">出生日期</label><input type="date" id="c-birth">'
          : '<label class="field">预产期</label><input type="date" id="c-due">'}
        <label class="field">性别</label><select id="c-gender"><option value="">保密</option><option value="m">男</option><option value="f">女</option></select>
        <p></p><button class="btn" id="c-save">${obMode === 'born' ? '开始记录' : '开始孕期记录'}</button>
        ${obMode === 'wait' ? '<p class="note" style="margin-top:8px">孕期可用：产检/体重/胎动/宫缩记录、待产包、月子餐预习；出生后一键转正。</p>' : ''}
      </div>`
    const birthEl = el.querySelector('#c-birth')
    if (birthEl) birthEl.max = SD.time.todayStr()
    el.querySelectorAll('[data-ob]').forEach(b => b.addEventListener('click', () => { obMode = b.dataset.ob; onboard(el) }))
    el.querySelector('#c-save').addEventListener('click', () => {
      const name = el.querySelector('#c-name').value.trim()
      if (!name) return SD.ui.toast('小名必填')
      if (obMode === 'born') {
        const birth = el.querySelector('#c-birth').value
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return SD.ui.toast('出生日期必填')
        SD.store.addChild({ name, birth, gender: el.querySelector('#c-gender').value })
      } else {
        const due = el.querySelector('#c-due').value
        if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return SD.ui.toast('预产期必填')
        SD.store.addChild({ name, due, gender: el.querySelector('#c-gender').value })
      }
      location.hash = '#home'; SD.app.render()
    })
  }

  /* ══════════ 喂养 / 睡觉表单（真路由 #feed-form / #sleep-form） ══════════ */
  function feedForm(el) {
    /* 奶粉默认奶量按月龄预填（milkRef 与待喂养卡同源；未出生/无档案回落 120） */
    const ref = (() => { const c = SD.store.child; return c && c.birth ? SD.features.milkRef(SD.time.ageParts(c.birth).totalMo) : null })()
    el.innerHTML = `<div class="sec-title">记录喂养</div>
      <div class="card">
        <div class="seg" id="f-method-seg">
          <button class="seg-btn on" data-method="nurse">🤱 亲喂</button>
          <button class="seg-btn" data-method="formula">🍼 奶粉</button>
        </div>
        <div id="f-nurse">
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
            <div class="timer-face idle" id="f-face"><span class="timer-dot" aria-hidden="true"></span><span id="f-clock">00:00</span></div>
            <button class="btn primary-big" id="f-go">▶ 开始亲喂</button>
            <button class="secondary-big" id="f-cancel-btn" hidden>取消计时</button>
            <p class="note" id="f-note"></p>
          </div>
          <div id="f-manual" hidden>
            <label class="field">哪侧</label>
            <select id="f-side"><option value="L">左</option><option value="R">右</option><option value="B">双侧</option></select>
            <label class="field">时长（分钟）</label><input type="number" id="f-min" value="15" min="0" max="120">
            <label class="field">时间</label><input type="time" id="f-time">
            <p></p><button class="btn" id="f-save">保存</button>
          </div>
        </div>
        <div id="f-formula" hidden>
          <label class="field">奶量（ml）</label><input type="number" id="f-fml" value="${ref ? ref.perMl : 120}" min="1" max="500">
          ${ref ? `<p class="note">月龄参考：每次约 ${ref.perMl}ml · 间隔约 ${ref.interval}h（可按需调整）</p>` : ''}
          <label class="field">时间</label><input type="time" id="f-ftime">
          <p></p><button class="btn" id="f-fsave">保存奶粉记录</button>
        </div>
      </div>`

    /* 计时状态走 SD.timers 单例：切视图再回来不丢，可停止可取消；秒数由 startAt 推算 */
    let side = 'L'
    el.querySelector('#f-time').value = SD.time.nowTime()
    el.querySelector('#f-ftime').value = SD.time.nowTime()
    const isRunning = () => !!SD.timers.get('feed')

    const paintRunning = t => {
      el.querySelectorAll('[data-mode], #f-method-seg .seg-btn').forEach(x => (x.disabled = true))
      el.querySelectorAll('#f-side-seg .seg-btn').forEach(x => { x.classList.remove('on'); x.disabled = true })
      el.querySelector(`#f-side-seg [data-side="${t.side}"]`)?.classList.add('on')
      el.querySelector('#f-timer').hidden = false
      el.querySelector('#f-manual').hidden = true
      const face = el.querySelector('#f-face')
      face.classList.remove('idle'); face.classList.add('running')
      const btn = el.querySelector('#f-go')
      btn.textContent = '⏹ 停止并记录'; btn.classList.add('rec')
      el.querySelector('#f-cancel-btn').hidden = false
      el.querySelector('#f-note').textContent = '计时中 · 切页不影响，随时回来停止'
      el.querySelector('#f-clock').textContent = SD.time.fmtClock(SD.timers.elapsed(t))
    }
    const resume = SD.timers.get('feed')   // 切走再回来：恢复运行中状态
    if (resume) paintRunning(resume)
    armFormClock()
    /* 取消：安静次级按钮；≥3 分钟二次确认防误触（长时间睡眠计时误触损失大） */
    el.querySelector('#f-cancel-btn').addEventListener('click', () => {
      const t = SD.timers.get('feed')
      const mins = t ? SD.time.clockMinutes(SD.timers.elapsed(t)) : 0
      const doCancel = () => { SD.timers.stop('feed'); SD.ui.toast('已取消计时'); feedForm(el) }
      if (mins >= 3) SD.ui.confirm(`已计时 ${mins} 分钟，取消将不保存这段记录——确定取消？`, doCancel, { danger: true, okText: '取消计时' })
      else doCancel()
    })

    el.querySelectorAll('#f-method-seg .seg-btn').forEach(b => b.addEventListener('click', () => {
      if (isRunning()) return SD.ui.toast('计时中，请先停止或取消')
      el.querySelectorAll('#f-method-seg .seg-btn').forEach(x => x.classList.remove('on')); b.classList.add('on')
      const nurse = b.dataset.method === 'nurse'
      el.querySelector('#f-nurse').hidden = !nurse
      el.querySelector('#f-formula').hidden = nurse
    }))
    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      if (isRunning()) return SD.ui.toast('计时中，请先停止或取消')
      el.querySelectorAll('[data-mode]').forEach(x => x.classList.remove('on')); b.classList.add('on')
      const timer = b.dataset.mode === 'timer'
      el.querySelector('#f-timer').hidden = !timer
      el.querySelector('#f-manual').hidden = timer
    }))
    el.querySelectorAll('#f-side-seg .seg-btn').forEach(b => b.addEventListener('click', () => {
      if (isRunning()) return
      el.querySelectorAll('#f-side-seg .seg-btn').forEach(x => x.classList.remove('on')); b.classList.add('on')
      side = b.dataset.side
    }))
    el.querySelector('#f-go').addEventListener('click', () => {
      const t = SD.timers.get('feed')
      if (!t) {
        paintRunning(SD.timers.start('feed', { side, startStr: SD.time.nowTime(), startDate: SD.time.todayStr() }))
      } else {
        SD.timers.stop('feed')
        const mins = SD.time.clockMinutes(SD.timers.elapsed(t))
        if (mins < 1) { SD.ui.toast('不足 1 分钟，未记录（点「取消计时」放弃）'); return feedForm(el) }
        SD.store.addRecord({ type: 'feed', method: 'nurse', date: t.startDate, time: t.startStr, side: t.side, minutes: mins })
        location.hash = '#feed'
      }
    })
    el.querySelector('#f-save').addEventListener('click', () => {
      SD.store.addRecord({
        type: 'feed', method: 'nurse', date: SD.time.todayStr(),
        time: el.querySelector('#f-time').value || SD.time.nowTime(),
        side: el.querySelector('#f-side').value,
        minutes: +el.querySelector('#f-min').value || 0,
      })
      location.hash = '#feed'
    })
    el.querySelector('#f-fsave').addEventListener('click', () => {
      const ml = +el.querySelector('#f-fml').value
      if (!ml || ml < 1 || ml > 500) return SD.ui.toast('请输入 1-500 之间的奶量')
      SD.store.addRecord({ type: 'feed', method: 'formula', date: SD.time.todayStr(), time: el.querySelector('#f-ftime').value || SD.time.nowTime(), ml })
      SD.ui.toast(`已记录奶粉 ${ml}ml`)
      location.hash = '#feed'
    })
  }

  /* 体温快速表单（喂奶同款模式：首页直达，保存跳成长·体温） */
  function tempForm(el) {
    if (!child() || !child().birth) { el.innerHTML = bornGuard(); return }
    const mo = SD.time.ageParts(child().birth).totalMo
    el.innerHTML = `<div class="sec-title">记录体温</div>
      <div class="card">
        <label class="field">时段</label><select id="tf-part"><option>晨起</option><option>午后</option><option>晚间</option></select>
        <label class="field">体温 (℃)</label><input type="number" id="tf-val" step="0.1" min="34" max="43">
        <p></p><button class="btn" id="tf-save">保存</button>
      </div>`
    el.querySelector('#tf-save').addEventListener('click', () => {
      const v = +el.querySelector('#tf-val').value
      if (!v || v < 34 || v > 43) return SD.ui.toast('请输入 34-43 之间的体温值')
      SD.store.addRecord({ type: 'temp', date: SD.time.todayStr(), time: SD.time.nowTime(), part: el.querySelector('#tf-part').value, val: v })
      const st = SD.features.tempStatus(mo, v)
      if (st === 'urgent') SD.ui.toast('⚠️ 3 月龄内 ≥38℃：请立即就医', 'danger')
      else if (st === 'high') SD.ui.toast('高热 ≥38.5℃，必要时就医', 'warn')
      location.hash = '#feed'
    })
  }

  function sleepForm(el) {
    el.innerHTML = `<div class="sec-title">记录睡眠</div>
      <div class="card">
        <div class="seg">
          <button class="seg-btn on" data-mode="timer">⏱ 计时</button>
          <button class="seg-btn" data-mode="manual">✍️ 手动</button>
        </div>
        <div id="sl-timer">
          <div class="timer-face idle" id="sl-face"><span class="timer-dot" aria-hidden="true"></span><span id="sl-clock">00:00</span></div>
          <button class="btn primary-big" id="sl-go">🌙 开始睡觉</button>
          <button class="secondary-big" id="sl-cancel-btn" hidden>取消计时</button>
          <p class="note" id="sl-note"></p>
        </div>
        <div id="sl-manual" hidden>
          <label class="field">入睡时间</label><input type="time" id="s-start">
          <label class="field">醒来时间（跨午夜可小于入睡）</label><input type="time" id="s-end">
          <p></p><button class="btn" id="s-save">保存</button>
        </div>
      </div>`

    /* 计时状态走 SD.timers 单例：切视图再回来不丢；跨午夜按入睡日计（开始时锁定） */
    const isRunning = () => !!SD.timers.get('sleep')
    const paintRunning = t => {
      el.querySelectorAll('[data-mode]').forEach(x => (x.disabled = true))
      const face = el.querySelector('#sl-face')
      face.classList.remove('idle'); face.classList.add('running')
      const btn = el.querySelector('#sl-go')
      btn.textContent = '☀️ 醒来了，停止记录'; btn.classList.add('rec')
      el.querySelector('#sl-cancel-btn').hidden = false
      el.querySelector('#sl-note').textContent = '睡觉中 · 切页不影响，随时回来停止'
      el.querySelector('#sl-clock').textContent = SD.time.fmtClock(SD.timers.elapsed(t))
    }
    const resume = SD.timers.get('sleep')
    if (resume) paintRunning(resume)
    armFormClock()
    el.querySelector('#sl-cancel-btn').addEventListener('click', () => {
      const t = SD.timers.get('sleep')
      const mins = t ? SD.time.clockMinutes(SD.timers.elapsed(t)) : 0
      const doCancel = () => { SD.timers.stop('sleep'); SD.ui.toast('已取消计时'); sleepForm(el) }
      if (mins >= 3) SD.ui.confirm(`已计时 ${mins} 分钟，取消将不保存这段记录——确定取消？`, doCancel, { danger: true, okText: '取消计时' })
      else doCancel()
    })

    el.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      if (isRunning()) return SD.ui.toast('计时中，请先停止或取消')
      el.querySelectorAll('[data-mode]').forEach(x => x.classList.remove('on')); b.classList.add('on')
      const timer = b.dataset.mode === 'timer'
      el.querySelector('#sl-timer').hidden = !timer
      el.querySelector('#sl-manual').hidden = timer
    }))
    el.querySelector('#s-start').value = SD.time.nowTime()
    el.querySelector('#s-end').value = SD.time.nowTime()
    el.querySelector('#sl-go').addEventListener('click', () => {
      const t = SD.timers.get('sleep')
      if (!t) {
        paintRunning(SD.timers.start('sleep', { startStr: SD.time.nowTime(), startDate: SD.time.todayStr() }))
      } else {
        SD.timers.stop('sleep')
        const mins = SD.time.clockMinutes(SD.timers.elapsed(t))
        if (mins < 1) { SD.ui.toast('不足 1 分钟，未记录（点「取消计时」放弃）'); return sleepForm(el) }
        SD.store.addRecord({ type: 'sleep', date: t.startDate, start: t.startStr, end: SD.time.nowTime() })
        SD.ui.toast(`本次睡眠 ${(mins / 60).toFixed(1)} 小时已记录`)
        location.hash = '#feed'
      }
    })
    el.querySelector('#s-save').addEventListener('click', () => {
      const start = el.querySelector('#s-start').value, end = el.querySelector('#s-end').value
      if (!start || !end) return SD.ui.toast('请填入睡与醒来时间')
      if (start === end) return SD.ui.toast('入睡与醒来相同——跨午夜请把醒来填为较小时间（如 23:00 → 01:30）')
      SD.store.addRecord({ type: 'sleep', date: SD.time.todayStr(), start, end })
      location.hash = '#feed'
    })
  }

  /* ══════════ 📝 记录（时间轴） ══════════ */
  const ICON = { sleep: '😴', pee: '💧', poop: '💩', vitd: '☀️', dha: '🐟', iron: '💊', temp: '🌡️', measure: '📏', food: '🥣', 'food-ok': '✅', 'food-react': '⚠️', diary: '📖', ms: '🏆', checkup: '🏥', pweight: '⚖️', kick: '👶', contraction: '⏱️' }
  /* 喂养图标按方式区分：亲喂 🤱 / 奶粉 🍼（旧记录按 feedMethod 推断） */
  const iconOf = r => r.type === 'feed' ? (SD.summary.feedMethod(r) === 'nurse' ? '🤱' : '🍼') : (ICON[r.type] || '·')
  const LABEL = r => ({
    feed: SD.summary.feedMethod(r) === 'nurse'
      ? `亲喂（${({ L: '左', R: '右', B: '双侧' })[r.side] || ''}${r.minutes ? ' ' + r.minutes + 'min' : ''}）`
      : `奶粉 ${r.ml || 0}ml`,
    sleep: `睡眠 ${r.start}–${r.end}${r.start && r.end ? `（${(SD.summary.sleepMin(r.start, r.end) / 60).toFixed(1)}h）` : ''}`, pee: '尿尿', poop: '便便', vitd: '维生素D', dha: 'DHA', iron: '铁剂',
    temp: `体温 ${r.val}℃（${r.part || ''}）`,
    measure: `测量 身高${r.height || '-'}cm 体重${r.weight || '-'}kg${r.head ? ' 头围' + r.head + 'cm' : ''}`,
    food: `新辅食：${r.name}`, 'food-ok': `${r.name} 观察 3 天无反应`,
    'food-react': `${r.name} 可疑反应：${r.symptom}`,
    diary: `${r.name}${r.note ? ' · ' + r.note : ''}`,
    ms: `达成里程碑：${(r.key || '').split('|').join(' · ')}`,
    checkup: `产检：${r.item}${r.note ? ' · ' + r.note : ''}`,
    pweight: `孕期体重 ${r.val}kg`,
    kick: `胎动 10 次用时 ${r.minutes} 分钟`,
    contraction: `宫缩 1 小时：${r.count} 次 · 间隔 ${r.gap} 分 · 持续 ${r.dur} 秒`,
  }[r.type] || r.type)

  function feed(el) {
    if (!child()) return onboard(el)
    // 待产包/42天清单等勾选类不进时间轴；日内按记录时间倒序（timelineDays：补录早时点落到时间位置）
    const recs = SD.store.recordsOf().filter(r => !['bag', 'd42', 'ctmark'].includes(r.type))
    const days = SD.summary.timelineDays(recs, 5)
    el.innerHTML = days.length
      ? days.map(d => `<div class="sec-title">${d.date}</div>` + d.items.map(r => `
          <div class="tl-item"><span class="icon">${iconOf(r)}</span><span class="desc">${esc(LABEL(r))}${(() => { const an = SD.summary.authorName(r, SD.state.family); return an ? `<span class="note"> · ${esc(an)}</span>` : '' })()}</span>
          <span class="t">${r.time || r.start || ''}</span><button class="del" data-id="${r.id}">✕</button></div>`).join('')).join('')
      : `<div class="empty"><p>还没有记录</p><p class="note">回首页用快捷按钮打卡</p></div>`
    el.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => { SD.store.removeRecord(b.dataset.id); feed(el) }))
  }

  /* ══════════ 📈 成长（曲线 ｜ 疫苗 ｜ 里程碑 ｜ 月历） ══════════ */
  function growth(el) {
    if (!child()) return onboard(el)
    if (!child().birth) { el.innerHTML = bornGuard(); return }
    const seg = el.dataset.gseg || 'curve'
    el.innerHTML = segBar('gseg', [['curve', '📈 曲线'], ['vac', '💉 疫苗'], ['ms', '🏆 里程碑'], ['cal', '📅 月历']], seg) + '<div id="seg-body"></div>'
    const body = el.querySelector('#seg-body')
    ;({ curve: renderCurve, vac: vaccine, ms: diary, cal: calendar })[seg](body)
    bindSeg(el, 'gseg', () => growth(el))
  }

  function renderCurve(el) {
    if (!child().birth) { el.innerHTML = bornGuard(); return }
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
        <div class="card" style="margin-top:8px"><h3>奶量参考（${mo} 月龄）</h3><p>${(() => { const r = SD.features.milkRef(mo); return `每日约 ${r.times} 次 · 每次 ${r.perMl}ml · 间隔约 ${r.interval} 小时<br><span class="note">${esc(r.note)} · 亲喂按需，奶粉参考间隔</span>` })()}</p></div>
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
    const c = child(), mo = moOf(c)
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
              return `<p class="note">记录：喂养 ${s.feedCount} 次（亲${s.nurseCount}·粉${s.formulaCount}） · 睡眠 ${(s.sleepMinutes / 60).toFixed(1)}h · 尿 ${s.pee} · 便 ${s.poop}</p>`
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
    const sub = el.dataset.birthsub ?? (!child().birth ? 'preg' : (Number.isFinite(days) && days <= 42 ? 'd42' : 'bag'))
    delete el.dataset.birthsub   // 别名定向只生效一次
    el.innerHTML = `<div class="seg seg-main gfn-seg">
        <button class="seg-btn ${sub === 'preg' ? 'on' : ''}" data-birth="preg">🤰 孕期</button>
        <button class="seg-btn ${sub === 'bag' ? 'on' : ''}" data-birth="bag">🎒 待产包</button>
        <button class="seg-btn ${sub === 'd42' ? 'on' : ''}" data-birth="d42">📖 42 天手册</button>
      </div><div id="birth-body"></div>`
    const body = el.querySelector('#birth-body')
    ;({ preg: pregnancyBody, bag: bagBody, d42: day42Body })[sub](body)
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
  let day42Sel = null, d42Open = false, d42Offset = 0   // offset = 手动跳过菜单套数
  function day42Body(el) {
    const days = child() ? SD.time.ageParts(child().birth).days : null
    const curDay = Number.isFinite(days) ? Math.min(Math.max(days, 1), 42) : 1
    const selDay = day42Sel ?? curDay
    const { stage, menu, total, index } = SD.features.day42Day(selDay, d42Offset)
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
        <h3>🍽 第 ${selDay} 天月子餐 <span class="note">${index + 1}/${total} 套</span>
          <button class="btn ghost" id="d42-swap" style="float:right;padding:2px 12px;font-size:.8125rem">换一套 →</button></h3>
        <div class="meal-row"><span class="mk">🌅 早餐</span><span>${esc(menu.b)}</span></div>
        <div class="meal-row"><span class="mk">☀️ 午餐</span><span>${esc(menu.l)}</span></div>
        <div class="meal-row"><span class="mk">🌙 晚餐</span><span>${esc(menu.d)}</span></div>
        <div class="meal-row"><span class="mk">🍵 加餐</span><span>${esc(menu.s)}</span></div>
        <p class="note" style="margin-top:8px">💡 ${esc(menu.tip)}</p>
      </div>
      <details class="card fold" open><summary><b>🤱 本阶段护理要点</b><span class="note">恶露 · 哺乳 · 情绪 · 活动</span></summary>
        <ul class="list" style="margin-top:8px">${SD.DATA.day42.care.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </details>
      <details class="card fold" open><summary><b>🚨 红线预警</b><span class="note">出现即就医</span></summary>
        <ul class="list" style="margin-top:8px">${SD.DATA.day42.red.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </details>
      <details class="card fold" open><summary><b>✅ 第 42 天检查清单</b><span class="note" id="d42-cnt">${doneSet.size}/${SD.DATA.day42.checklist.length} 已完成</span></summary>
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
      e.stopPropagation(); d42Open = false; day42Sel = Number(b.dataset.d42d); d42Offset = 0; day42Body(el)
    }))
    el.querySelector('#d42-swap')?.addEventListener('click', () => { d42Offset++; day42Body(el) })
  }

  /* 指南（对齐旧版双维度：月龄下拉 × 功能分段；喂养为特化富视图） */
  let guideMonth = null, guideFn = 'edu', gmOpen = false
  const GFNS = [['edu', '🎓 早教'], ['feed', '🍼 喂养'], ['sleep', '😴 睡眠'], ['soothe', '😢 安抚']]
  function guideBody(el) {
    if (!child()) return onboard(el)
    const c = child(), mo = moOf(c)
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
      ${!c.birth ? '<div class="card"><h3>🤰 孕期预览模式</h3><p class="note">显示 0 月龄内容供预习，出生后自动按宝宝月龄定位。</p></div>' : ''}
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
    el.innerHTML = segBar('fdtab', [['obs', '🥣 辅食观察'], ['alg', '🥛 过敏营养']], tab) + '<div id="seg-body2"></div>'
    const body = el.querySelector('#seg-body2')
    ;({ obs: foodObs, alg: foodAlg })[tab](body)
    bindSeg(el, 'fdtab', () => foodBody(el))
  }

  function foodObs(el) {
    const mo = moOf(child())
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

  /* 补剂页（喂奶同款：首页直达，打卡后返首页） */
  function suppForm(el) {
    if (!child()) return onboard(el)
    const recs = SD.store.recordsOf()
    const days = SD.trends.last7Days(recs, SD.time.todayStr())
    const taken = SUPPS.filter(x => recs.some(r => r.type === x.key && r.date === SD.time.todayStr())).length
    el.innerHTML = `<div class="sec-title">补剂打卡</div>
      <div class="card">
        <h3>💊 今日 ${taken}/${SUPPS.length}</h3>
        ${SUPPS.map(s2 => {
          const tk = recs.some(r => r.type === s2.key && r.date === SD.time.todayStr())
          return `
        <div class="supp-row">
          <span class="supp-name">${s2.label}<i class="${tk ? 'on' : ''}">${tk ? '已补' : '未补'}</i></span>
          <button class="supp-tap ${tk ? 'on' : ''}" data-supp="${s2.key}" title="${tk ? '点按撤销' : '点按打卡'}">${tk ? '✓' : '＋'}</button>
        </div>
        <div class="dots" style="margin:2px 0 8px">${days.map(d => {
          const hit = recs.some(r => r.type === s2.key && r.date === d.date)
          return `<span class="dot ${hit ? 'on' : ''}" title="${d.date}">${d.date.slice(5)}</span>`
        }).join('')}</div>`
        }).join('')}
        <p class="note">${SUPPS.map(x => x.note).join('；')}——剂量遵医嘱。</p>
        <p></p><button class="btn" id="supp-done">保存并回首页</button>
      </div>`
    el.querySelectorAll('[data-supp]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.supp
      const today = SD.store.recordsOf().find(r => r.type === k && r.date === SD.time.todayStr())
      if (today) SD.store.removeRecord(today.id)
      else SD.store.addRecord({ type: k, date: SD.time.todayStr(), time: SD.time.nowTime() })
      suppForm(el)
    }))
    el.querySelector('#supp-done').addEventListener('click', () => (location.hash = '#home'))
  }

  /* 护理段：页内 Tab（体温 ｜ 宝宝健康 ｜ 妈妈） */
  function careBody(el) {
    if (!child()) return onboard(el)
    const tab = el.dataset.crtab === 'temp' ? 'health' : (el.dataset.crtab || 'health')   // 体温已迁成长；旧值兼容
    el.innerHTML = segBar('crtab', [['health', '🏥 宝宝健康'], ['mom', '🤱 妈妈']], tab) + '<div id="seg-body2"></div>'
    const body = el.querySelector('#seg-body2')
    ;({ health: healthTab, mom: momTab })[tab](body)
    bindSeg(el, 'crtab', () => careBody(el))
  }

  function healthTab(el) {
    const FA = SD.DATA.care.firstaid
    el.innerHTML = `
      <div class="card redcard fa-card">
        <h3>🚨 ${FA.title}</h3>
        <p><b>识别：</b>${FA.identify}</p>
        <p class="note">${FA.canCough}</p>
        <p><b>婴儿拍背压胸法（<1 岁）：</b></p>
        <ol class="fa-steps">${FA.steps.map(x => `<li>${x}</li>`).join('')}</ol>
        <p style="margin:10px 0 4px"><a class="btn danger2" href="tel:${FA.dial}" style="text-decoration:none;display:inline-block">📞 拨打 ${FA.dial}</a></p>
        <p class="note">${FA.note}</p>
      </div>
      <div class="card redcard">
        <h3>${SD.DATA.care.shake.title}</h3>
        <p>${SD.DATA.care.shake.body}</p>
        <p class="note">💪 ${SD.DATA.care.shake.outlet}</p>
      </div>
      <details class="card fold"><summary><b>🧤 常用照护技巧</b><span class="note">拍嗝 · 溢奶鉴别 · 抱姿 · 哄睡 · 脐部 · 红屁屁</span></summary>
        <div style="margin-top:8px">
        ${SD.DATA.care.tips.map(t => `
          <details class="card"><summary>${t.icon} <b>${t.title}</b></summary>
            <ul class="list" style="margin-top:8px">${t.body.map(x => `<li>${x}</li>`).join('')}</ul>
            <p class="note" style="color:var(--danger)">⚠️ 红旗：${t.red.map(x => x).join('；')}</p>
          </details>`).join('')}
        </div>
      </details>
      <div class="sec-title">常见病自查</div>
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
      <details class="card fold"><summary><b>🥣 产后月子餐参考</b><span class="note">按周 · 宜忌对照</span></summary>
        <div style="margin-top:8px">
        ${SD.DATA.mom.diet.map(w => `<details class="card"><summary><b>${esc(w.wk)}</b> · ${esc(w.goal)}</summary>
          <p class="ok-list">✅ ${w.good.map(esc).join('；')}</p><p class="bad-list">❌ ${w.bad.map(esc).join('；')}</p></details>`).join('')}
        </div>
      </details>
      <details class="card fold"><summary><b>🩹 伤口与恢复</b><span class="note">时间线 · 身体恢复</span></summary>
        <div style="margin-top:8px">
        ${SD.DATA.mom.wound.map(w => `<details class="card"><summary><b>${esc(w.t)}</b></summary><p>${w.care.map(esc).join('；')}</p></details>`).join('')}
        <div class="card"><h3>💪 身体恢复</h3>${SD.DATA.mom.recover.map(r => `<p><b>${esc(r[0])}</b>：${esc(r[1])}</p>`).join('')}</div>
        </div>
      </details>
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
    if (!child().birth) { el.innerHTML = bornGuard(); return }
    const c = child(), p = SD.time.ageParts(c.birth)
    const s = SD.summary.summarizeDay(SD.store.recordsOf(), SD.time.todayStr())
    const next = SD.vaccine.nextVaccine(c.birth, SD.store.vaccineDone())
    const watching = SD.store.recordsOf().filter(r => r.type === 'food' &&
      !SD.store.recordsOf().some(o => (o.type === 'food-ok' || o.type === 'food-react') && o.name === r.name))
    const text =
`【${c.name}的今日交接卡】${SD.time.todayStr()}
年龄：${SD.time.fmtAge(p)}（第 ${p.days} 天）
今日喂养：共 ${s.feedCount} 次（亲喂 ${s.nurseCount} · 奶粉 ${s.formulaCount}${s.formulaMl ? ` · 奶粉共 ${s.formulaMl}ml` : ''}）
今日睡眠：${(s.sleepMinutes / 60).toFixed(1)} 小时
尿 ${s.pee} 次 / 便 ${s.poop} 次 / 维生素D ${s.vitd ? '已补' : '❗未补'}
${(() => {   // 家庭模式：按成员署名统计今日记录（孤儿署名归入「家人」）
  if (!SD.state.family) return ''
  const today = SD.time.todayStr(), recs = SD.store.recordsOf().filter(r => r.date === today)
  const known = new Set(SD.state.family.members.map(m => m.id))
  const orphan = recs.filter(r => r.by && !known.has(r.by)).length
  const parts = SD.state.family.members.map(m => `${m.name} ${recs.filter(r => r.by === m.id).length}`).filter(x => !/\s0$/.test(x))
  if (orphan) parts.push(`家人 ${orphan}`)
  return parts.length ? `今日记录（按人）：${parts.join(' · ')}\n` : ''
})()}${watching.length ? `辅食观察中：${watching.map(f => f.name).join('、')}\n` : ''}${next ? `下一剂疫苗：${next.name} 第${next.dose}剂（${next.sched}）\n` : ''}
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
    { key: 'womb', label: '羊水·子宫', note: '血流澎湃+心跳，最接近胎内环境（Karp 首推）' },
    { key: 'white', label: '白噪音', note: '吸尘器感，遮杂音' },
    { key: 'pink', label: '粉噪音', note: '更柔，像轻风' },
    { key: 'brown', label: '棕噪音', note: '低沉，像深浪' },
    { key: 'heart', label: '心跳', note: '低频节拍，模拟怀抱' },
    { key: 'wave', label: '海浪', note: '缓慢涌退，助深睡' },
    { key: 'rain', label: '雨声', note: '细雨打窗，遮环境噪声' },
    { key: 'dryer', label: '吹风机', note: '很多宝宝一听就静' },
    { key: 'lullaby', label: '摇篮曲', note: '音乐盒风铃，程序生成' },
  ]
  let audioCtx = null, noiseNode = null, noiseStopTimer = null, heartTimer = null, autoStopMin = 0
  let kindTimers = []   // 雨/摇篮曲等事件调度器，stopNoise 统一清理
  function stopNoise() {
    if (noiseStopTimer) { clearTimeout(noiseStopTimer); noiseStopTimer = null }
    if (heartTimer) { clearInterval(heartTimer); heartTimer = null }
    kindTimers.forEach(t => clearInterval(t)); kindTimers = []
    if (noiseNode) { try { noiseNode.stop() } catch {} noiseNode = null }
    if (audioCtx) { try { audioCtx.close() } catch {} audioCtx = null }
  }
  function thump(vol = 0.9) {
    if (!audioCtx) return
    const osc = audioCtx.createOscillator(), g = audioCtx.createGain()
    osc.frequency.value = 55
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime)
    g.gain.exponentialRampToValueAtTime(vol, audioCtx.currentTime + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.28)
    osc.connect(g).connect(audioCtx.destination)
    osc.start(); osc.stop(audioCtx.currentTime + 0.3)
  }
  /* 通用噪声源：type 决定频谱着色 */
  function noiseBuffer(kind) {
    const len = audioCtx.sampleRate * 2
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
    const data = buf.getChannelData(0)
    let lastOut = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'white') data[i] = w * 0.3
      else if (kind === 'pink') { lastOut = 0.86 * lastOut + w * 0.14; data[i] = lastOut * 2.2 }
      else { lastOut = (lastOut + 0.02 * w) / 1.02; data[i] = lastOut * 4.5 }   // brown
    }
    return buf
  }
  /* 起一个循环噪声 + 可选低通/幅度 LFO，返回 source */
  function loopNoise(kind, { lp = 0, lfoHz = 0, lfoDepth = 0, gain = 0.5 } = {}) {
    const src = audioCtx.createBufferSource()
    src.buffer = noiseBuffer(kind); src.loop = true
    let node = src
    if (lp) { const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f }
    const g = audioCtx.createGain(); g.gain.value = gain
    node.connect(g)
    if (lfoHz) {   // 幅度呼吸（海浪涌退/子宫血流澎湃）
      const lfo = audioCtx.createOscillator(), lg = audioCtx.createGain()
      lfo.frequency.value = lfoHz; lg.gain.value = gain * lfoDepth
      lfo.connect(lg).connect(g.gain); lfo.start()
    }
    g.connect(audioCtx.destination)
    src.start()
    return src
  }
  let noiseKind = 'womb'
  function sound(el) {
    const playing = !!noiseNode
    const cur = NOISES.find(n => n.key === noiseKind)
    el.innerHTML = `
      <div class="card"><h3>🎧 哄睡白噪音</h3>
        <p class="note">浏览器本地合成，无音频文件无网络。音量先调低再播放，设备离婴儿 1 米以上。</p>
        <div class="noise-grid">
          ${NOISES.map(n => `<button class="noise-cell ${n.key === noiseKind ? 'on' : ''}" data-kind="${n.key}" ${playing ? 'disabled' : ''}>${n.label}</button>`).join('')}
        </div>
        <p class="note" style="margin:6px 0 0">${cur ? cur.note : ''}</p>
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
        if (autoStopMin) noiseStopTimer = setTimeout(() => { stopNoise(); SD.noiseCtrl.refresh() }, autoStopMin * 60000)
      }
      sound(el)
    }))
    el.querySelector('#n-toggle').addEventListener('click', () => {
      if (noiseNode) { stopNoise(); sound(el); SD.noiseCtrl.refresh(); return }
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const kind = noiseKind
      if (kind === 'heart') {
        thump(); heartTimer = setInterval(() => { thump(); setTimeout(thump, 180) }, 850)
        noiseNode = { stop() {} }
      } else if (kind === 'womb') {
        // 羊水/子宫：低通棕噪（血流澎湃 LFO）+ 底层心跳
        noiseNode = loopNoise('brown', { lp: 420, lfoHz: 0.75, lfoDepth: 0.5, gain: 0.55 })
        thump(0.5); heartTimer = setInterval(() => { thump(0.5); setTimeout(() => thump(0.35), 170) }, 830)
      } else if (kind === 'wave') {
        noiseNode = loopNoise('brown', { lp: 900, lfoHz: 0.11, lfoDepth: 0.75, gain: 0.5 })
      } else if (kind === 'rain') {
        // 雨声：轻高通粉噪 + 随机雨滴（短促带通脉冲）
        noiseNode = loopNoise('pink', { gain: 0.32 })
        const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900
        const drop = () => {
          if (!audioCtx) return
          const src = audioCtx.createBufferSource()
          src.buffer = noiseBuffer('white')
          const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'
          bp.frequency.value = 1200 + Math.random() * 2800; bp.Q.value = 6
          const g = audioCtx.createGain()
          const t0 = audioCtx.currentTime
          g.gain.setValueAtTime(0.12 + Math.random() * 0.1, t0)
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04 + Math.random() * 0.05)
          src.connect(bp).connect(g).connect(audioCtx.destination)
          const off = Math.floor(Math.random() * (audioCtx.sampleRate * 1.5))
          src.start(t0, off, 0.12)
        }
        kindTimers.push(setInterval(drop, 90 + Math.random() * 120))
      } else if (kind === 'dryer') {
        // 吹风机：棕噪主体 + 马达低频嗡鸣 + 少量白噪气流
        noiseNode = loopNoise('brown', { lp: 700, gain: 0.42 })
        const hum = audioCtx.createOscillator(), hg = audioCtx.createGain()
        hum.type = 'sawtooth'; hum.frequency.value = 95; hg.gain.value = 0.05
        const hum2 = audioCtx.createOscillator(), hg2 = audioCtx.createGain()
        hum2.type = 'sine'; hum2.frequency.value = 190; hg2.gain.value = 0.04
        hum.connect(hg).connect(audioCtx.destination); hum2.connect(hg2).connect(audioCtx.destination)
        hum.start(); hum2.start()
        const hiss = audioCtx.createBufferSource()
        hiss.buffer = noiseBuffer('white'); hiss.loop = true
        const hgn = audioCtx.createGain(); hgn.gain.value = 0.08
        hiss.connect(hgn).connect(audioCtx.destination); hiss.start()
      } else if (kind === 'lullaby') {
        // 摇篮曲：五声音阶音乐盒（三角波+指数衰减+回声），随机柔和旋律
        noiseNode = { stop() {} }
        const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]   // C 大调五声
        const delay = audioCtx.createDelay(1.2); delay.delayTime.value = 0.42
        const fb = audioCtx.createGain(); fb.gain.value = 0.38
        const wet = audioCtx.createGain(); wet.gain.value = 0.5
        delay.connect(fb).connect(delay); delay.connect(wet).connect(audioCtx.destination)
        const note = () => {
          if (!audioCtx) return
          const osc = audioCtx.createOscillator(), g = audioCtx.createGain()
          osc.type = 'triangle'
          osc.frequency.value = SCALE[Math.floor(Math.random() * SCALE.length)] * (Math.random() < 0.25 ? 2 : 1)
          const t0 = audioCtx.currentTime, v = 0.14 + Math.random() * 0.12
          g.gain.setValueAtTime(0.0001, t0)
          g.gain.exponentialRampToValueAtTime(v, t0 + 0.012)
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.9)
          osc.connect(g); g.connect(audioCtx.destination); g.connect(delay)
          osc.start(t0); osc.stop(t0 + 2)
        }
        note()
        kindTimers.push(setInterval(() => { if (Math.random() < 0.82) note() }, 640))
      } else {
        noiseNode = loopNoise(kind, { gain: 0.5 })
      }
      if (autoStopMin) noiseStopTimer = setTimeout(() => { stopNoise(); SD.noiseCtrl.refresh() }, autoStopMin * 60000)
      sound(el)
    })
    SD.noiseCtrl.refresh()
  }

  /* ══════════ ⚙️ 设置（顶栏齿轮进入） ══════════ */
  /* 添加宝宝弹窗（设置页与顶栏下拉共用） */
  let amMode = 'born'
  function openAddModal(after) {
    closeAddModal()
    const ov = document.createElement('div')
    ov.className = 'overlay' ; ov.id = 'add-modal'
    ov.innerHTML = `<div class="modal">
      <h3>添加宝宝</h3>
      <div class="seg">
        <button class="seg-btn ${amMode === 'born' ? 'on' : ''}" data-am="born">👶 已出生</button>
        <button class="seg-btn ${amMode === 'wait' ? 'on' : ''}" data-am="wait">🤰 还没出生</button>
      </div>
      <label class="field">小名</label><input type="text" id="am-name" placeholder="例如：小核桃">
      ${amMode === 'born'
        ? '<label class="field">出生日期</label><input type="date" id="am-birth">'
        : '<label class="field">预产期</label><input type="date" id="am-due">'}
      <label class="field">性别</label><select id="am-gender"><option value="">保密</option><option value="m">男</option><option value="f">女</option></select>
      <p></p>
      <div class="row">
        <button class="btn ghost" id="am-cancel">取消</button>
        <button class="btn" id="am-save">添加</button>
      </div>
    </div>`
    document.body.appendChild(ov)
    const birth = ov.querySelector('#am-birth')
    if (birth) birth.max = SD.time.todayStr()          // 生日不能晚于今天
    ov.addEventListener('click', e => { if (e.target === ov) closeAddModal() })
    ov.querySelector('#am-cancel').addEventListener('click', closeAddModal)
    ov.querySelectorAll('[data-am]').forEach(b => b.addEventListener('click', () => {
      amMode = b.dataset.am; closeAddModal(); openAddModal(after)
    }))
    ov.querySelector('#am-save').addEventListener('click', () => {
      const name = ov.querySelector('#am-name').value.trim()
      if (!name) return SD.ui.toast('小名必填')
      if (amMode === 'born') {
        const b = ov.querySelector('#am-birth').value
        if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return SD.ui.toast('出生日期必填')
        if (b > SD.time.todayStr()) return SD.ui.toast('出生日期不能晚于今天')
        SD.store.addChild({ name, birth: b, gender: ov.querySelector('#am-gender').value })
      } else {
        const due = ov.querySelector('#am-due').value
        if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return SD.ui.toast('预产期必填')
        SD.store.addChild({ name, due, gender: ov.querySelector('#am-gender').value })
      }
      closeAddModal(); after && after()
    })
  }
  function closeAddModal() { document.getElementById('add-modal')?.remove() }

  function settings(el) {
    const st = SD.state
    el.innerHTML = `
      <div class="sec-title">宝宝档案（${st.children.length} 个）</div>
      ${st.children.map(c => `
        <div class="tl-item"><span class="desc"><b>${esc(c.name)}</b> · ${c.birth ? esc(c.birth) : '预产期 ' + esc(c.due)} · ${({ m: '男', f: '女' }[c.gender] || '—')}</span>
          ${!c.birth ? `<button class="btn ghost" data-born="${c.id}">🎉 出生了</button>` : ''}
          ${c.id === st.activeId ? '<span class="vac-badge done">当前</span>' : `<button class="btn ghost" data-sw="${c.id}">切换</button>`}
          <button class="del" data-rm="${c.id}">✕</button></div>`).join('')}
      <p></p><button class="btn ghost" id="s-open-add">＋ 添加宝宝</button>
      <div class="sec-title">家庭协作</div>
      <div class="card">
        ${st.family ? `
          <label class="field">本机是谁（新记录将署名；仅可切换本机创建的身份）</label>
          ${(() => {
            const own = st.family.members.filter(m => (st.family.localIds || []).includes(m.id))
            return own.length
              ? `<div class="row"><select id="fam-self" style="flex:1">${own.map(m => `<option value="${m.id}" ${m.id === st.family.selfId ? 'selected' : ''}>${esc(m.name)}（${esc(m.role || '成员')}）</option>`).join('')}</select><button class="btn ghost" id="fam-newid">＋ 新身份</button></div>`
              : `<p class="note">本机身份已被家庭创建者移除——<button class="btn ghost" id="fam-newid">重新设置本机身份</button></p>`
          })()}
          <p class="note">共用一台设备换人记录时，切换本机身份或新增身份；成员随家人设备加入自动出现。</p>
          <p></p>
          ${st.family.members.map(m => {
            const isOwn = (st.family.localIds || []).includes(m.id)
            return `<div class="tl-item"><span class="desc"><b>${esc(m.name)}</b> · ${esc(m.role || '成员')}${m.id === st.family.selfId ? ' · 本机' : ''}${isOwn ? '' : ' · 家人设备'}</span>${isOwn ? `<button class="btn ghost" data-mrn="${m.id}">改名</button>` : ''}${st.family.creator ? `<button class="del" data-mrm="${m.id}">✕</button>` : ''}</div>`
          }).join('')}
          <p class="note">权限：改名仅限本机创建的身份；移除成员仅创建家庭的设备可操作（可移除任何成员）。</p>
          ${st.family.creator ? (() => {
            const me = st.family.members.find(m => m.id === st.family.selfId)
            if (!me) return ''
            const orphans = SD.state.records.filter(r => { const an = SD.summary.authorName(r, st.family); return an === null || an === '家人' }).length
            return orphans ? `<p></p><button class="btn ghost" id="fam-claimorph">把 ${orphans} 条未署名/失效署名的历史记录归入我（${esc(me.name)}）</button>` : ''
          })() : ''}
          ${st.family.creator === undefined ? `<p class="note">本家庭创建于旧版本——若这台设备是<b>创建家庭</b>的那台，请认领创建者权限：<button class="btn ghost" id="fam-claim">认领创建者</button></p>` : ''}
          <p class="note">不用云同步也可协作：导出备份发给对方 → 对方「从备份恢复」选<b>合并导入</b>（自动去重，删除 30 天内不复活）。</p>
          <p></p>
          <label class="field" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="fam-cloud" ${st.sync ? 'checked' : ''}> ☁️ 云同步（端到端加密中转）</label>
          ${st.sync ? (st.sync.room ? `
            <p class="note">开启中：数据以<b>密文</b>上传 Cloudflare 中转与家人共享——服务器无法解密（零知识），密钥只在本机。</p>
            <label class="field">家庭同步码（发给家人，在其设备「加入家庭」处粘贴）</label>
            <div class="row"><input type="text" readonly value="${st.sync.room}/${st.sync.pass}" style="flex:1" onfocus="this.select()"><button class="btn ghost" id="fam-copycode">复制</button></div>
            <p class="note">上次同步：${st.sync.lastPull ? SD.time.fmtAgo(st.sync.lastPull) : '从未'}${st.sync.lastPush ? ' · 推送 ' + SD.time.fmtAgo(st.sync.lastPush) : ''}</p>
            <p></p><button class="btn" id="fam-sync">🔄 立即同步</button>
            <p class="note">要换到别的家庭：退出家庭模式后重新「加入家庭」即可。</p>
          ` : `
            <p></p>
            <div class="row"><button class="btn ghost" id="fam-gencode" style="flex:1">创建新的家庭同步码</button><button class="btn ghost" id="fam-joinbtn" style="flex:1">🔗 加入（粘贴同步码）</button></div>
          `) : `<p class="note">需与家人自动共享？开启后经 Cloudflare 中转上传<b>加密</b>数据（端到端，服务器零知识）。</p>`}
          <p></p><button class="btn ghost" data-fam="single">退出家庭模式（回到单人，数据保留）</button>
        ` : `
          <p class="note">多位家人各自手机记录？创建或加入家庭：记录署名 + 端到端加密同步（或纯本地备份合并）。</p>
          <p></p>
          <div class="row">
            <button class="btn ghost" id="fam-create" style="flex:1">＋ 创建家庭</button>
            <button class="btn ghost" id="fam-joinbtn" style="flex:1">🔗 加入家庭（有同步码）</button>
          </div>
        `}
      </div>
      <div class="sec-title">提醒</div>
      <div class="card">
        <label class="field" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="s-feedremind" ${st.feedRemind ? 'checked' : ''}> 待喂养提醒（首页倒计时卡 + 到时应用内提示）</label>
        <p></p>
        <label class="field" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="s-feednotify" ${st.feedNotify ? 'checked' : ''}> 到时浏览器通知<span class="note">（仅应用打开期间有效——本地优先，无推送服务）</span></label>
        <p class="note">推荐量与间隔按月龄参考表自动更新：亲喂按需，奶粉参考间隔；提醒为育儿辅助参考，以宝宝实际饥饱信号为准。</p>
      </div>
      <div class="sec-title">数据主权（核心承诺）</div>
      <div class="card">
        <p class="note">所有数据只存在这台设备的浏览器里，零上传。上次备份：<b>${SD.state.lastBackup ? SD.time.fmtAgo(SD.state.lastBackup) : '从未'}</b>——请定期导出。</p>
        <p></p><button class="btn" id="s-export">导出备份 JSON</button>
        <p></p><label class="field">从备份恢复</label><input type="file" id="s-import" accept=".json">
        <p></p><button class="btn danger" id="s-clear">清空全部数据</button>
      </div>
      <div class="card"><p class="note">免责：疫苗排程/生长曲线/健康与用药内容均为育儿辅助参考，不构成医疗建议；EPDS 为简化自评非诊断。健康问题请咨询专业医生。</p>
        ${location.protocol === 'https:' ? `<p class="note">当前版本 ${SD.app.APP_VER}——桌面/主屏打开后无刷新按钮？新版本会自动检测并提示刷新，也可手动检查：<button class="btn ghost" id="s-upd">检查更新</button></p>` : ''}</div>
      <div class="sec-title">使用指南</div>
      <div id="help-slot"></div>`

    el.querySelector('#s-open-add').addEventListener('click', () =>
      openAddModal(() => { location.hash = '#settings'; SD.app.render() }))
    el.querySelector('#s-feedremind').addEventListener('change', e => { SD.state.feedRemind = e.target.checked; SD.store.save() })
    /* 家庭协作：创建/加入家庭 / 成员管理 / 本机身份 */
    const ROLES = ['妈妈', '爸爸', '爷爷', '奶奶', '外公', '外婆', '其他']
    const roleOptions = cur => ROLES.map(r => `<option ${r === cur ? 'selected' : ''}>${r}</option>`).join('')
    /* 本机身份：未开家庭=开启并设身份（creator 标记创建/加入）；已开家庭=新增身份并切换（共用设备换人记录）
       身份落库后自动认领本机未署名历史记录 */
    const openIdentityModal = (onDone = null, opts = { creator: true }) => {
      /* opts.claimOnly：加入端限定只认领「加入前本机已有」的记录（防误领家人同步来的历史） */
      const creating = !SD.state.family
      document.getElementById('identity-modal')?.remove()
      const ov = document.createElement('div')
      ov.className = 'overlay'; ov.id = 'identity-modal'
      ov.innerHTML = `<div class="modal"><h3>${creating ? '创建家庭 · 本机是谁？' : '新增本机身份'}</h3>
        <p class="note" style="display:block">这台设备上的记录将以此称呼署名（时间轴/交接卡可见），家人同步数据后一眼可辨。</p>
        <label class="field">称呼</label><input type="text" id="id-name" maxlength="8" placeholder="如：妈妈 / 爸爸 / 奶奶">
        <label class="field">角色</label><select id="id-role">${roleOptions('妈妈')}</select>
        <p></p><div class="row"><button class="btn ghost" id="id-cancel">取消</button><button class="btn" id="id-save">${creating ? '开启家庭模式' : '新增并切换'}</button></div></div>`
      document.body.appendChild(ov)
      const close = () => { ov.remove(); settings(el) }
      ov.addEventListener('click', e => { if (e.target === ov) close() })
      ov.querySelector('#id-cancel').addEventListener('click', close)
      ov.querySelector('#id-save').addEventListener('click', () => {
        const name = ov.querySelector('#id-name').value.trim()
        if (!name) return SD.ui.toast('请填一个称呼（家人一看就懂的那种）')
        const id = 'm' + Date.now().toString(36)
        const member = { id, name, role: ov.querySelector('#id-role').value, deviceId: SD.state.deviceId, createdAt: new Date().toISOString() }
        if (creating) SD.state.family = { members: [member], selfId: id, creator: opts.creator, localIds: [id] }
        else { SD.state.family.members.push(member); SD.state.family.localIds.push(id); SD.state.family.selfId = id }
        const claimed = SD.summary.claimUnsigned(SD.state.records, member, opts.claimOnly || null)
        SD.store.save(); ov.remove()
        SD.ui.toast(creating ? `家庭已创建 · 本机身份「${name}」` : `已切换到新身份「${name}」`)
        if (claimed) SD.ui.toast(`已将 ${claimed} 条本机历史记录归入「${name}」`)
        onDone ? onDone() : settings(el)
        /* 新成员立即上中转：创建者手机要能马上看到加入者（首同步发生在此之前的弹层不会带上新成员） */
        SD.sync?.syncNow?.().catch(() => SD.sync?.schedulePush?.())
      })
      ov.querySelector('#id-name').focus()
    }
    /* 成员改名（本机或家人）：id 不变 → 记录署名保持，改名经同步传播 */
    const openRenameModal = mid => {
      const m = SD.state.family.members.find(x => x.id === mid)
      if (!m) return
      document.getElementById('rename-modal')?.remove()
      const ov = document.createElement('div')
      ov.className = 'overlay'; ov.id = 'rename-modal'
      ov.innerHTML = `<div class="modal"><h3>修改成员</h3>
        <label class="field">称呼</label><input type="text" id="rn-name" maxlength="8" value="${esc(m.name)}">
        <label class="field">角色</label><select id="rn-role">${roleOptions(m.role)}</select>
        <p class="note" style="display:block">改名后所有记录（含历史）立即显示新称呼，并同步到家人设备；已删除成员的旧记录显示其被删时的称呼。</p>
        <p></p><div class="row"><button class="btn ghost" id="rn-cancel">取消</button><button class="btn" id="rn-save">保存</button></div></div>`
      document.body.appendChild(ov)
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove() })
      ov.querySelector('#rn-cancel').addEventListener('click', () => ov.remove())
      ov.querySelector('#rn-save').addEventListener('click', () => {
        const name = ov.querySelector('#rn-name').value.trim()
        if (!name) return SD.ui.toast('称呼不能为空')
        /* 竞态防护：自动拉取每 10s 会整体替换 SD.state（对象引用全部失效），
           打字期间弹层捕获的 m 已是孤儿——保存时必须按 id 在当前 state 重新解析 */
        const cur = SD.state.family?.members?.find(x => x.id === mid)
        if (!cur) { ov.remove(); return SD.ui.toast('该成员已被移除，改名未保存') }
        cur.name = name; cur.role = ov.querySelector('#rn-role').value
        cur.renamedAt = new Date().toISOString()   // LWW：改名时间戳，防刷新竞态回滚
        SD.store.save(); ov.remove(); settings(el)
        SD.sync?.syncNow?.().catch(() => SD.sync?.schedulePush?.())   // 立即推送（不等防抖）；失败退回防抖重试
      })
    }
    /* 退出家庭模式（回到单人；云同步一并关闭） */
    el.querySelectorAll('[data-fam]').forEach(b => b.addEventListener('click', () => {
      SD.ui.confirm('退出家庭模式？\n\n本机数据完整保留（含署名历史），云同步一并关闭。', () => {
        SD.state.family = null; SD.state.sync = null; SD.store.save(); settings(el)
      })
    }))
    el.querySelector('#fam-create')?.addEventListener('click', () => openIdentityModal())
    el.querySelector('#fam-newid')?.addEventListener('click', () => openIdentityModal())
    el.querySelectorAll('[data-mrn]').forEach(b => b.addEventListener('click', () => openRenameModal(b.dataset.mrn)))
    el.querySelector('#fam-claim')?.addEventListener('click', () => {
      SD.ui.confirm('确认这台设备创建了这个家庭？\n\n创建者可移除任何成员（含家人设备添加的）。', () => {
        SD.state.family.creator = true; SD.store.save(); settings(el)
      }, { okText: '我是创建者' })
    })
    /* 历史署名归集（创建者）：未署名 + 「家人」兜底显示的记录归入创建者本人 */
    el.querySelector('#fam-claimorph')?.addEventListener('click', () => {
      const me = SD.state.family.members.find(m => m.id === SD.state.family.selfId)
      if (!me) return SD.ui.toast('请先设置本机身份')
      SD.ui.confirm(`把全部未署名/显示为「家人」的历史记录归入「${me.name}」？\n\n有效署名与已删成员的称呼快照（如「奶奶」）不受影响；结果会同步到家人设备。`, () => {
        const n = SD.summary.claimOrphans(SD.state.records, SD.state.family, me)
        SD.store.save(); settings(el)
        SD.ui.toast(`已归集 ${n} 条历史记录`)
        SD.sync?.syncNow?.().catch(() => SD.sync?.schedulePush())
      }, { okText: '归入我' })
    })
    el.querySelector('#fam-self')?.addEventListener('change', e => {
      const f = SD.state.family
      f.selfId = e.target.value
      const m = f.members.find(x => x.id === f.selfId)
      const n = m ? SD.summary.claimUnsigned(SD.state.records, m) : 0   // 仍无署名的本机记录顺手认领
      SD.store.save()
      if (n) { SD.sync?.schedulePush?.(); SD.ui.toast(`已将 ${n} 条未署名记录归入「${m.name}」`) }
    })
    el.querySelectorAll('[data-mrm]').forEach(b => b.addEventListener('click', () => {
      const f = SD.state.family
      if (!f.creator) return SD.ui.toast('成员移除仅创建家庭的设备可操作')
      if (f.members.length <= 1) return SD.ui.toast('至少保留一位成员（可退出家庭模式代替）')
      const id = b.dataset.mrm
      f.members = f.members.filter(m => m.id !== id)
      f.removedMembers = [...new Set([...(f.removedMembers || []), id])]   // 墓碑：跨设备生效
      if (f.selfId === id) f.selfId = (f.members.find(m => (f.localIds || []).includes(m.id))?.id) ?? null
      f.localIds = (f.localIds || []).filter(x => x !== id)
      SD.store.save(); settings(el)
      SD.sync?.syncNow?.().catch(() => SD.sync?.schedulePush?.())   // 移除立即传播
    }))
    /* 加密上传告知弹层（用户核心要求：开启云同步必须明确说明数据以密文上传后端） */
    const openConsent = (onYes, onCancel = null) => {
      document.getElementById('cloud-consent')?.remove()
      const ov = document.createElement('div')
      ov.className = 'overlay'; ov.id = 'cloud-consent'
      ov.innerHTML = `<div class="modal"><h3>开启云同步前请了解</h3>
        <p class="note" style="display:block">为与家人共享数据，你的育儿记录将以<b>端到端加密（AES-256-GCM 密文）</b>上传到 Cloudflare 中转服务器：</p>
        <ul class="list" style="margin:8px 0">
          <li>⚠️ <b>数据会上传到后端</b>——但只有密文，服务器无法解密（零知识）</li>
          <li>🔒 加密密钥只保存在你与家人的设备上，永不上传</li>
          <li>📤 关闭同步即可停止上传；本地数据完整可随时导出脱离</li>
          <li>🗑 中转密文 90 天无同步活动自动清除</li>
        </ul>
        <p></p><div class="row"><button class="btn ghost" id="cc-no">取消</button><button class="btn" id="cc-yes">我已了解，开启</button></div></div>`
      document.body.appendChild(ov)
      const cancel = () => { ov.remove(); onCancel?.() }
      ov.addEventListener('click', ev => { if (ev.target === ov) cancel() })
      ov.querySelector('#cc-no').addEventListener('click', cancel)
      ov.querySelector('#cc-yes').addEventListener('click', () => { ov.remove(); onYes() })
    }
    /* 加入家庭：粘贴同步码 → 加密告知 → 首同步拉家人数据 → deviceId 复用旧身份（欢迎回来）或引导设身份 */
    const openJoinModal = () => {
      document.getElementById('join-modal')?.remove()
      const ov = document.createElement('div')
      ov.className = 'overlay'; ov.id = 'join-modal'
      ov.innerHTML = `<div class="modal"><h3>🔗 加入家庭</h3>
        <p class="note" style="display:block">粘贴家人分享的同步码（格式：房间码/密钥），加入后自动同步双方数据。</p>
        <label class="field">同步码</label><input type="text" id="jm-code" placeholder="如：K7Q2M9XCV4T8B3NL/J6H4K2M9P7Q3R5S8">
        <p></p><div class="row"><button class="btn ghost" id="jm-cancel">取消</button><button class="btn" id="jm-next">下一步</button></div></div>`
      document.body.appendChild(ov)
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove() })
      ov.querySelector('#jm-cancel').addEventListener('click', () => ov.remove())
      ov.querySelector('#jm-next').addEventListener('click', () => {
        const parsed = SD.sync.parseCode(ov.querySelector('#jm-code').value)
        if (!parsed) return SD.ui.toast('同步码格式不对（应为 房间码/密钥）')
        ov.remove()
        const go = () => {
          SD.state.sync = { ...parsed, lastPull: null, lastPush: null }
          SD.store.save(); settings(el)
          joinSync()
        }
        if (!SD.state.sync) return openConsent(go)
        go()
      })
      ov.querySelector('#jm-code').focus()
    }
    const joinSync = () => {
      const preChildIds = new Set(SD.state.children.map(c => c.id))
      const preRecordIds = new Set(SD.state.records.map(r => r.id))   // 加入前本机记录：身份认领仅限这些，防误领家人历史
      const b = el.querySelector('#fam-sync')
      if (b) { b.disabled = true; b.textContent = '同步中…' }
      SD.sync.syncNow()
        .then(() => {
          if (!SD.state.family) SD.state.family = { members: [], selfId: null, creator: false, localIds: [] }
          const mine = SD.summary.ownMember(SD.state.family, SD.state.deviceId)
          if (mine) {
            const f = SD.state.family
            f.selfId = mine.id; f.creator = false
            f.localIds = [mine.id, ...f.localIds.filter(i => i !== mine.id)]
            SD.store.save()
            SD.ui.toast(`欢迎回来「${mine.name}」`)
          } else {
            SD.store.save()
          }
          const arrived = SD.state.children.filter(c => !preChildIds.has(c.id))
          const localOnly = SD.state.children.filter(c => preChildIds.has(c.id))
          if (preChildIds.size === 1 && arrived.length === 1 && localOnly.length === 1)
            return offerChildMerge(arrived[0], localOnly[0], preRecordIds)
          settings(el); SD.app.render()
          if (!mine) { SD.ui.toast('已拉取家人数据，请设置本机身份'); openIdentityModal(null, { creator: false, claimOnly: preRecordIds }) }
        })
        .catch(err => { SD.ui.toast('加入同步失败：' + (err.message || '网络问题') + '——可点「立即同步」重试'); settings(el) })
    }
    el.querySelector('#fam-joinbtn')?.addEventListener('click', openJoinModal)
    /* F2 云同步开关（明确告知上传密文）；开启即自动创建家庭码并发起首同步 */
    el.querySelector('#fam-cloud')?.addEventListener('change', e => {
      if (!e.target.checked) {
        SD.ui.confirm('关闭云同步？\n\n本机数据完整保留，只是不再上传/拉取；家人设备的旧密文 90 天无活动后自动过期。', () => {
          SD.state.sync = null; SD.store.save(); settings(el)
        })
        return
      }
      openConsent(() => {
        const code = SD.sync.genCode()
        SD.state.sync = { ...code, lastPull: null, lastPush: null }
        SD.store.save(); settings(el)
        SD.ui.toast('已自动创建家庭同步码，发给家人即可加入')
        runFirstSync()
      }, () => { e.target.checked = false })
    })
    /* 首次配码（创建/加入）后立即自动同步一次：用户预期「加入即有数据」 */
    const runFirstSync = () => {
      const preChildIds = new Set(SD.state.children.map(c => c.id))
      const b = el.querySelector('#fam-sync')
      if (b) { b.disabled = true; b.textContent = '同步中…' }
      SD.sync.syncNow()
        .then(st => {
          /* 宝宝档案重复检测：加入前本机建过档 + 家人档新到 → 引导合并（双胞胎可保留两份） */
          const arrived = SD.state.children.filter(c => !preChildIds.has(c.id))
          const localOnly = SD.state.children.filter(c => preChildIds.has(c.id))
          if (preChildIds.size === 1 && arrived.length === 1 && localOnly.length === 1)
            return offerChildMerge(arrived[0], localOnly[0])
          SD.ui.toast(st.recordsAdded || st.recordsUpdated ? `同步完成：并入 ${st.recordsAdded} 条 · 更新 ${st.recordsUpdated} 条` : '同步完成')
          settings(el); SD.app.render()
        })
        .catch(err => { SD.ui.toast('自动同步失败：' + (err.message || '网络问题') + '——可点「立即同步」重试'); settings(el) })
    }
    /* 宝宝档案处理引导（加入家庭且本机已有档）：三选一——同时保留 / 合并为一份 / 丢弃本机只留家人数据 */
    const offerChildMerge = (remoteChild, localChild, claimOnly = null) => {
      document.getElementById('child-merge-modal')?.remove()
      const ov = document.createElement('div')
      ov.className = 'overlay'; ov.id = 'child-merge-modal'
      const info = c => `${esc(c.name)}（${c.birth ? '生日 ' + esc(c.birth) : '预产期 ' + esc(c.due || '—')}）`
      ov.innerHTML = `<div class="modal"><h3>本机已有宝宝档案</h3>
        <p class="note" style="display:block">加入家庭后检测到本机与家人各有宝宝档案——可能是各自添加了同一宝宝，也可能是本机之前的数据。请选择处理方式：</p>
        <p>家人的：${info(remoteChild)}<br>本机的：${info(localChild)}</p>
        <p></p><div class="row"><button class="btn ghost" id="cm-keep">同时保留</button></div>
        <p></p><div class="row"><button class="btn ghost" id="cm-merge">合并为一份（同一宝宝，家人档案为准，本机记录并入）</button></div>
        <p></p><div class="row"><button class="btn danger" id="cm-discard">丢弃本机档案（测试/旧数据，只留家人数据）</button></div>
        <p class="note">不确定就选「同时保留」，之后可在宝宝档案里手动处理。</p></div>`
      document.body.appendChild(ov)
      const finish = () => {
        ov.remove(); settings(el); SD.app.render()
        /* 闭环：三种选择后若本机尚无身份（新设备首次加入），继续引导设置——身份落库时自动认领本机旧记录署名 */
        if (!SD.summary.ownMember(SD.state.family, SD.state.deviceId))
          openIdentityModal(null, { creator: false, claimOnly })
      }
      ov.addEventListener('click', e => { if (e.target === ov) finish() })
      ov.querySelector('#cm-keep').addEventListener('click', finish)
      ov.querySelector('#cm-merge').addEventListener('click', () => {
        const { remapped } = SD.summary.mergeChildren(SD.state, remoteChild.id, localChild.id)
        SD.store.save(); finish()
        SD.ui.toast(`已合并宝宝档案 · 并入本机 ${remapped} 条记录`)
        SD.sync.syncNow().catch(() => SD.sync.schedulePush())
      })
      ov.querySelector('#cm-discard').addEventListener('click', () => {
        SD.ui.confirm(`丢弃本机档案「${localChild.name}」及其全部记录？\n此操作不可恢复（建议不确定时先选同时保留）。`, () => {
          const { removed } = SD.summary.discardChild(SD.state, localChild.id)
          SD.store.save(); finish()
          SD.ui.toast(`已丢弃本机档案（${removed} 条记录）`)
          SD.sync.syncNow().catch(() => SD.sync.schedulePush())
        }, { danger: true, okText: '丢弃' })
      })
    }
    el.querySelector('#fam-gencode')?.addEventListener('click', () => {
      const code = SD.sync.genCode()
      SD.state.sync = { ...code, lastPull: null, lastPush: null }
      SD.store.save(); settings(el)
      runFirstSync()   // 把本机数据推上中转，家人加入即能拉到
    })
    el.querySelector('#fam-copycode')?.addEventListener('click', () => {
      const code = `${SD.state.sync.room}/${SD.state.sync.pass}`
      navigator.clipboard?.writeText(code).then(() => SD.ui.toast('同步码已复制，发给家人吧'))
        .catch(() => SD.ui.toast(code))
    })
    el.querySelector('#fam-sync')?.addEventListener('click', async btn => {
      const b = el.querySelector('#fam-sync'), old = b.textContent
      b.disabled = true; b.textContent = '同步中…'
      try {
        const st = await SD.sync.syncNow()
        SD.ui.toast(st.recordsAdded || st.recordsUpdated ? `同步完成：并入 ${st.recordsAdded} 条 · 更新 ${st.recordsUpdated} 条` : '同步完成：已与家人数据一致')
        settings(el); SD.app.render()
      } catch (err) {
        SD.ui.toast('同步失败：' + (err.message || '网络问题或密钥不符'))
        b.disabled = false; b.textContent = old
      }
    })
    el.querySelector('#s-feednotify').addEventListener('change', e => {
      const on = () => { SD.state.feedNotify = true; SD.store.save(); SD.ui.toast('到时通知已开启（仅应用打开期间）') }
      const off = msg => { e.target.checked = false; SD.state.feedNotify = false; SD.store.save(); if (msg) SD.ui.toast(msg) }
      if (!e.target.checked) return off()
      if (!('Notification' in window)) return off('此环境不支持浏览器通知')
      if (Notification.permission === 'granted') return on()
      Notification.requestPermission().then(p => (p === 'granted' ? on() : off('浏览器未授权，通知保持关闭')))
        .catch(() => off('通知权限请求失败（file:// 环境可能受限）'))
    })
    helpBody(el.querySelector('#help-slot'))   // 使用指南内嵌（自育儿页迁入）
    if (sessionStorage.getItem('sd-open-add') === '1') {   // 顶栏下拉触发的添加
      sessionStorage.removeItem('sd-open-add')
      setTimeout(() => openAddModal(() => SD.app.render()), 50)
    }
    el.querySelectorAll('[data-sw]').forEach(b => b.addEventListener('click', () => { SD.store.switchChild(b.dataset.sw); settings(el); SD.app.render() }))
    // 出生转正：补生日，孕期记录自动归档
    el.querySelectorAll('[data-born]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.born
      document.getElementById('born-modal')?.remove()
      const ov = document.createElement('div')
      ov.className = 'overlay'; ov.id = 'born-modal'
      ov.innerHTML = `<div class="modal"><h3>🎉 恭喜！宝宝出生了</h3>
        <label class="field">出生日期</label><input type="date" id="b-date">
        <p class="note">保存后自动切换到育儿模式；孕期记录（产检/体重）原样保留可回看。</p>
        <p></p><div class="row"><button class="btn ghost" id="b-cancel">取消</button><button class="btn" id="b-save">转正</button></div></div>`
      document.body.appendChild(ov)
      const d = ov.querySelector('#b-date'); d.max = SD.time.todayStr(); d.value = SD.time.todayStr()
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove() })
      ov.querySelector('#b-cancel').addEventListener('click', () => ov.remove())
      ov.querySelector('#b-save').addEventListener('click', () => {
        if (SD.store.registerBirth(id, d.value)) { ov.remove(); SD.ui.toast('欢迎来到世界！'); location.hash = '#home'; SD.app.render() }
      })
    }))
    el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
      const c = st.children.find(x => x.id === b.dataset.rm)
      SD.ui.confirm(`删除「${c.name}」的全部记录？\n不可恢复，建议先导出备份`, () => { SD.store.removeChild(b.dataset.rm); settings(el) }, { danger: true, okText: '删除' })
    }))
    el.querySelector('#s-export').addEventListener('click', () => {
      const blob = new Blob([SD.store.exportJSON()], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = `superdaddy-backup-${SD.time.todayStr()}.json`
      a.click(); URL.revokeObjectURL(a.href)
      SD.store.markBackup(); settings(el)
    })
    el.querySelector('#s-import').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return
      const rd = new FileReader()
      rd.onload = () => {
        const text = rd.result
        if (!SD.state.family) {   // 单人模式：维持原有覆盖恢复
          try { SD.store.importJSON(text); SD.ui.toast('恢复成功'); location.hash = '#home' }
          catch (err) { SD.ui.toast('恢复失败：' + err.message) }
          return
        }
        /* 家庭模式：合并（并集去重）或覆盖 二选一 */
        document.getElementById('import-modal')?.remove()
        const ov = document.createElement('div')
        ov.className = 'overlay'; ov.id = 'import-modal'
        ov.innerHTML = `<div class="modal"><h3>导入家人备份</h3>
          <p class="note">合并：两台设备的记录并成一份（自动去重，删除不复活）；覆盖：用这份备份替换本机全部数据。</p>
          <p></p><div class="row">
            <button class="btn ghost" id="im-cancel">取消</button>
            <button class="btn ghost" id="im-replace">覆盖</button>
            <button class="btn" id="im-merge">合并导入</button>
          </div></div>`
        document.body.appendChild(ov)
        const done = msg => { ov.remove(); SD.ui.toast(msg); settings(el); SD.app.render() }
        ov.addEventListener('click', ev => { if (ev.target === ov) ov.remove() })
        ov.querySelector('#im-cancel').addEventListener('click', () => ov.remove())
        ov.querySelector('#im-merge').addEventListener('click', () => {
          try {
            const st = SD.store.importMerge(text)
            done(`合并完成：并入 ${st.recordsAdded} 条 · 更新 ${st.recordsUpdated} 条`)
          } catch (err) { SD.ui.toast('合并失败：' + err.message); ov.remove() }
        })
        ov.querySelector('#im-replace').addEventListener('click', () => {
          try { SD.store.importJSON(text); done('已覆盖恢复') } catch (err) { SD.ui.toast('恢复失败：' + err.message); ov.remove() }
        })
      }
      rd.readAsText(f)
      e.target.value = ''
    })
    el.querySelector('#s-clear').addEventListener('click', () => {
      SD.ui.confirm('确定清空全部数据？\n不可恢复（建议先导出）\n\n真的要清空吗？', () => {
        SD.store.clearAll(); location.hash = '#home'
      }, { danger: true, okText: '全部清空' })
    })
    el.querySelector('#s-upd')?.addEventListener('click', () => SD.app.checkUpdate(true))
  }

  /* 顶栏白噪音指示器（后台播放时显示 ♪，点击停止） */
  SD.noiseCtrl = {
    active: () => !!noiseNode,
    stop: () => { stopNoise(); SD.noiseCtrl.refresh() },
    refresh() {
      const ind = document.getElementById('noise-ind')
      if (ind) ind.hidden = !noiseNode
    },
  }

  return { home, feed, growth, guide, family, sound, settings, feedform: feedForm, sleepform: sleepForm, tempform: tempForm, suppform: suppForm }
})()
