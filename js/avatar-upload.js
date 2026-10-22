/* 头像更换：点击侧边栏头像 -> 选图 -> 压缩 -> 通过 GitHub API 提交到博客仓库
   依赖：GitHub 细粒度 token（该仓库 Contents: Read and write），只存在本机 localStorage
*/
(function () {
  'use strict'

  var REPO = 'Sakura707/Sakura707.github.io'
  var BRANCH = 'main'
  var STATE_PATH = 'img/avatar/state.json'
  var API = 'https://api.github.com/repos/' + REPO + '/contents/'
  var TOKEN_KEY = 'gh_avatar_token'
  var SIZE = 512

  function qs (s, root) { return (root || document).querySelector(s) }
  function qsa (s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)) }

  // ---------- 读取线上头像状态，替换成最新上传的那张 ----------
  function applyState () {
    fetch('/' + STATE_PATH + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null })
      .catch(function () { return null })
      .then(function (state) {
        if (!state || !state.file) return
        var url = '/' + state.file + '?v=' + (state.ts || Date.now())
        qsa('.avatar-img img').forEach(function (img) {
          img.removeAttribute('data-original')
          img.src = url
        })
      })
  }

  // ---------- 把选中的图裁成正方形并压到 512 ----------
  function processFile (file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader()
      reader.onerror = reject
      reader.onload = function () {
        var img = new Image()
        img.onerror = reject
        img.onload = function () {
          var side = Math.min(img.width, img.height)
          var sx = (img.width - side) / 2
          var sy = (img.height - side) * 0.15
          var canvas = document.createElement('canvas')
          canvas.width = canvas.height = SIZE
          var ctx = canvas.getContext('2d')
          ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)
          var dataUrl = canvas.toDataURL('image/jpeg', 0.9)
          resolve(dataUrl.split(',')[1])
        }
        img.src = reader.result
      }
      reader.readAsDataURL(file)
    })
  }

  // ---------- GitHub API ----------
  function gh (method, path, token, body) {
    return fetch(API + path, {
      method: method,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {} }).then(function (json) {
        if (!res.ok) throw new Error((json && json.message) || ('HTTP ' + res.status))
        return json
      })
    })
  }

  function putFile (path, base64, message, token) {
    return gh('GET', path + '?ref=' + BRANCH, token).then(function (cur) {
      return cur.sha
    }).catch(function () { return null }).then(function (sha) {
      var body = { message: message, content: base64, branch: BRANCH }
      if (sha) body.sha = sha
      return gh('PUT', path, token, body)
    })
  }

  function upload (base64, token) {
    var stamp = Date.now()
    var filePath = 'img/avatar/uploads/' + stamp + '.jpg'
    var state = { file: filePath, ts: stamp }
    var stateB64 = btoa(unescape(encodeURIComponent(JSON.stringify(state, null, 2))))

    return putFile(filePath, base64, 'avatar: add ' + stamp, token)
      .then(function () { return putFile(STATE_PATH, stateB64, 'avatar: switch to ' + stamp, token) })
      .then(function () { return state })
  }

  // ---------- 弹窗 ----------
  var modal, statusEl, tokenInput, fileInput, preview

  function buildModal () {
    modal = document.createElement('div')
    modal.className = 'avatar-modal'
    modal.innerHTML =
      '<div class="avatar-modal__mask"></div>' +
      '<div class="avatar-modal__panel">' +
      '  <h3>更换头像</h3>' +
      '  <div class="avatar-modal__row">' +
      '    <div class="avatar-modal__preview"><img alt="preview"></div>' +
      '    <div class="avatar-modal__pick">' +
      '      <button type="button" class="avatar-modal__btn avatar-modal__btn--ghost">选择图片</button>' +
      '      <p class="avatar-modal__hint">会自动裁成方形并压缩到 512×512</p>' +
      '    </div>' +
      '  </div>' +
      '  <label class="avatar-modal__label">GitHub Token（只保存在本机浏览器）' +
      '    <input type="password" class="avatar-modal__input" placeholder="github_pat_... 或 ghp_...">' +
      '  </label>' +
      '  <p class="avatar-modal__status"></p>' +
      '  <div class="avatar-modal__actions">' +
      '    <button type="button" class="avatar-modal__btn avatar-modal__btn--ghost" data-close>取消</button>' +
      '    <button type="button" class="avatar-modal__btn avatar-modal__btn--primary" data-upload disabled>上传并更换</button>' +
      '  </div>' +
      '</div>'
    document.body.appendChild(modal)

    statusEl = qs('.avatar-modal__status', modal)
    tokenInput = qs('.avatar-modal__input', modal)
    fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.style.display = 'none'
    document.body.appendChild(fileInput)
    preview = qs('.avatar-modal__preview img', modal)

    tokenInput.value = localStorage.getItem(TOKEN_KEY) || ''

    qs('.avatar-modal__mask', modal).addEventListener('click', close)
    qs('[data-close]', modal).addEventListener('click', close)
    qs('.avatar-modal__btn--ghost', modal).addEventListener('click', function () { fileInput.click() })

    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0]
      if (!f) return
      processFile(f).then(function (b64) {
        preview.src = 'data:image/jpeg;base64,' + b64
        preview.dataset.b64 = b64
        qs('[data-upload]', modal).disabled = false
        statusEl.textContent = '已选择：' + f.name
      }).catch(function (e) { statusEl.textContent = '图片处理失败：' + e.message })
    })

    qs('[data-upload]', modal).addEventListener('click', function () {
      var token = tokenInput.value.trim()
      var b64 = preview.dataset.b64
      if (!token) { statusEl.textContent = '请先填 GitHub Token'; return }
      if (!b64) { statusEl.textContent = '请先选择图片'; return }
      localStorage.setItem(TOKEN_KEY, token)
      var btn = this
      btn.disabled = true
      statusEl.textContent = '正在上传到 GitHub…'
      upload(b64, token).then(function (state) {
        statusEl.textContent = '上传成功，GitHub Pages 构建约 1 分钟后生效'
        var url = '/' + state.file + '?v=' + state.ts
        qsa('.avatar-img img').forEach(function (img) { img.removeAttribute('data-original'); img.src = url })
        setTimeout(close, 1800)
      }).catch(function (e) {
        btn.disabled = false
        statusEl.textContent = '上传失败：' + e.message
      })
    })
  }

  function open (e) {
    if (e) e.preventDefault()
    if (!modal) buildModal()
    modal.classList.add('is-open')
  }

  function close () {
    if (modal) modal.classList.remove('is-open')
  }

  function bind () {
    // 用事件委托，PJAX 换页后依然有效
    document.addEventListener('click', function (e) {
      var img = e.target && e.target.closest ? e.target.closest('.avatar-img img') : null
      if (!img) return
      e.preventDefault()
      open(e)
    })
    qsa('.avatar-img img').forEach(function (img) {
      img.style.cursor = 'pointer'
      img.title = '点击更换头像'
    })
  }

  function init () {
    applyState()
    bind()
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()

  // PJAX 局部刷新后重新拉状态
  document.addEventListener('pjax:complete', function () {
    applyState()
    qsa('.avatar-img img').forEach(function (img) {
      img.style.cursor = 'pointer'
      img.title = '点击更换头像'
    })
  })
})()
