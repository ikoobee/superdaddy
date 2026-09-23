# -*- coding: utf-8 -*-
# 声音库扩展：羊水(子宫)/海浪/雨声/吹风机/摇篮曲 —— 全部 WebAudio 合成，零资产
p = 'src/views.js'
s = open(p, encoding='utf-8').read()

def rep(old, new, tag):
    global s
    i = s.find(old)
    assert i >= 0, 'MISS: ' + tag
    s = s[:i] + new + s[i + len(old):]

# ── 1) 声音清单扩展 ──
rep("""  const NOISES = [
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
  }""",
"""  const NOISES = [
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
  }""", 'noises+helpers')

# ── 2) 默认声音改 womb ──
rep("  let noiseKind = 'white'", "  let noiseKind = 'womb'", 'default kind')

# ── 3) 声音选择 UI：seg → chips 网格（9 个放不下单行）──
rep("""        <div class="seg">
          ${NOISES.map(n => `<button class="seg-btn ${n.key === noiseKind ? 'on' : ''}" data-kind="${n.key}" ${playing ? 'disabled' : ''}>${n.label}</button>`).join('')}
        </div>""",
"""        <div class="noise-grid">
          ${NOISES.map(n => `<button class="noise-cell ${n.key === noiseKind ? 'on' : ''}" data-kind="${n.key}" ${playing ? 'disabled' : ''}>${n.label}</button>`).join('')}
        </div>
        <p class="note" style="margin:6px 0 0">${cur ? cur.note : ''}</p>""", 'chips ui')

# ── 4) 启动逻辑：按 kind 分发合成 ──
rep("""      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
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
      }""",
"""      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
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
      }""", 'start dispatch')

open(p, 'w', encoding='utf-8').write(s)
print('sound patched')
