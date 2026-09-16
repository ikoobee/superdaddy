/* SD.ui —— 轻量弹层：toast（替代 alert）+ confirm（替代原生 confirm） */
SD.ui = (() => {
  let toastBox = null

  function toast(msg, type = 'ok') {
    if (!toastBox) {
      toastBox = document.createElement('div')
      toastBox.id = 'toast-box'
      document.body.appendChild(toastBox)
    }
    const t = document.createElement('div')
    t.className = 'toast ' + type
    t.textContent = msg
    toastBox.appendChild(t)
    requestAnimationFrame(() => t.classList.add('show'))
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250) }, 2200)
  }

  function confirmBox(msg, onOk, opts = {}) {
    document.getElementById('confirm-modal')?.remove()
    const ov = document.createElement('div')
    ov.className = 'overlay'; ov.id = 'confirm-modal'
    ov.innerHTML = `<div class="modal">
      <h3>${opts.title || '请确认'}</h3>
      <p class="cmsg">${msg}</p>
      <div class="row">
        <button class="btn ghost" data-c="0">取消</button>
        <button class="btn ${opts.danger ? 'danger2' : ''}" data-c="1">${opts.okText || '确定'}</button>
      </div>
    </div>`
    document.body.appendChild(ov)
    const close = () => ov.remove()
    ov.addEventListener('click', e => { if (e.target === ov) close() })
    ov.querySelector('[data-c="0"]').addEventListener('click', close)
    ov.querySelector('[data-c="1"]').addEventListener('click', () => { close(); onOk && onOk() })
  }

  return { toast, confirm: confirmBox }
})()
