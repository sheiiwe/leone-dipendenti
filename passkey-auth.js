(function () {
  'use strict'

  let client = null
  let onSession = null
  let accountButton = null
  let modal = null
  let currentUser = null
  let showFloating = true

  function supported() {
    return !!(window.PublicKeyCredential && navigator.credentials)
  }

  function errorCode(error) {
    return String((error && (error.code || error.name)) || '').toLowerCase()
  }

  function errorMessage(error) {
    const code = errorCode(error)
    const message = String((error && error.message) || '').toLowerCase()
    if (code === 'notallowederror' || message.includes('not allowed') || message.includes('cancel')) {
      return 'Operazione annullata.'
    }
    if (code === 'passkey_disabled' || message.includes('passkey_disabled')) {
      return 'Le Passkey devono ancora essere attivate nella configurazione di sicurezza.'
    }
    if (code === 'webauthn_credential_exists' || message.includes('credential_exists')) {
      return 'Questa Passkey è già collegata al tuo account.'
    }
    if (code === 'too_many_passkeys' || message.includes('too_many_passkeys')) {
      return 'Hai raggiunto il numero massimo di Passkey per questo account.'
    }
    if (code === 'webauthn_credential_not_found' || message.includes('credential_not_found')) {
      return 'Questa Passkey non risulta collegata a un account abilitato.'
    }
    if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
      return 'Devi prima confermare la tua email aziendale.'
    }
    if (!supported()) {
      return 'Questo dispositivo o browser non supporta le Passkey.'
    }
    return 'Non è stato possibile completare l’operazione. Riprova.'
  }

  function setLoginMessage(node, text, ok) {
    if (!node) return
    node.textContent = text || ''
    node.classList.toggle('is-ok', !!ok)
  }

  function renderLogin(containerId) {
    const host = document.getElementById(containerId)
    if (!host) return
    host.className = 'lc-passkey-login'
    host.replaceChildren()

    const divider = document.createElement('div')
    divider.className = 'lc-passkey-divider'
    divider.innerHTML = '<span>oppure</span>'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'lc-passkey-login-btn'
    button.innerHTML = '<span aria-hidden="true">🔑</span><span>Accedi con Passkey</span>'

    const message = document.createElement('div')
    message.className = 'lc-passkey-login-message'
    message.setAttribute('aria-live', 'polite')

    if (!supported()) {
      button.disabled = true
      setLoginMessage(message, 'Passkey non supportata da questo browser.')
    }

    button.addEventListener('click', async function () {
      if (!client || !client.auth || typeof client.auth.signInWithPasskey !== 'function') {
        setLoginMessage(message, 'Aggiornamento di sicurezza non disponibile. Ricarica la pagina.')
        return
      }
      button.disabled = true
      button.classList.add('is-loading')
      setLoginMessage(message, '')
      try {
        const result = await client.auth.signInWithPasskey()
        if (result.error) throw result.error
        if (!result.data || !result.data.session) throw new Error('Sessione non disponibile')
        setLoginMessage(message, 'Accesso completato.', true)
        await onSession(result.data.session)
      } catch (error) {
        setLoginMessage(message, errorMessage(error))
      } finally {
        button.disabled = false
        button.classList.remove('is-loading')
      }
    })

    host.append(divider, button, message)
  }

  function makeModal() {
    if (modal) return modal
    const backdrop = document.createElement('div')
    backdrop.className = 'lc-passkey-modal'
    backdrop.hidden = true
    backdrop.innerHTML = [
      '<section class="lc-passkey-dialog" role="dialog" aria-modal="true" aria-labelledby="lc-passkey-title">',
      '  <button type="button" class="lc-passkey-close" aria-label="Chiudi">×</button>',
      '  <div class="lc-passkey-heading">',
      '    <span class="lc-passkey-heading-icon" aria-hidden="true">🔑</span>',
      '    <div><h2 id="lc-passkey-title">Accesso con Passkey</h2><p>La Passkey resta collegata al tuo account con email aziendale.</p></div>',
      '  </div>',
      '  <div class="lc-passkey-notice">Puoi usare Face ID, Touch ID, il codice del dispositivo o una chiave di sicurezza. Apple e Google possono custodire la Passkey sul dispositivo, ma non diventano il tuo account di accesso.</div>',
      '  <div id="lc-passkey-panel-message" class="lc-passkey-panel-message" aria-live="polite"></div>',
      '  <div class="lc-passkey-list-title">Le tue Passkey</div>',
      '  <div id="lc-passkey-list" class="lc-passkey-list"></div>',
      '  <button type="button" id="lc-passkey-add" class="lc-passkey-add">Aggiungi una Passkey</button>',
      '</section>'
    ].join('')
    document.body.appendChild(backdrop)

    const close = function () {
      backdrop.hidden = true
      document.body.classList.remove('lc-passkey-modal-open')
      if (accountButton) accountButton.focus()
    }
    backdrop.querySelector('.lc-passkey-close').addEventListener('click', close)
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) close()
    })
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !backdrop.hidden) close()
    })
    backdrop.querySelector('#lc-passkey-add').addEventListener('click', registerPasskey)
    modal = backdrop
    return modal
  }

  function panelMessage(text, ok) {
    if (!modal) return
    const node = modal.querySelector('#lc-passkey-panel-message')
    node.textContent = text || ''
    node.classList.toggle('is-ok', !!ok)
  }

  function dateLabel(value) {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })
  }

  function passkeyName(passkey, index) {
    return passkey.friendly_name || passkey.friendlyName || ('Passkey ' + (index + 1))
  }

  async function loadPasskeys() {
    if (!modal) return
    const list = modal.querySelector('#lc-passkey-list')
    list.replaceChildren()
    const loading = document.createElement('div')
    loading.className = 'lc-passkey-empty'
    loading.textContent = 'Caricamento…'
    list.appendChild(loading)

    try {
      if (!client || !client.auth || !client.auth.passkey || typeof client.auth.passkey.list !== 'function') {
        throw new Error('API Passkey non disponibile')
      }
      const result = await client.auth.passkey.list()
      if (result.error) throw result.error
      const passkeys = Array.isArray(result.data) ? result.data : []
      list.replaceChildren()
      if (!passkeys.length) {
        const empty = document.createElement('div')
        empty.className = 'lc-passkey-empty'
        empty.textContent = 'Non hai ancora registrato una Passkey.'
        list.appendChild(empty)
        return
      }

      passkeys.forEach(function (passkey, index) {
        const row = document.createElement('div')
        row.className = 'lc-passkey-row'

        const details = document.createElement('div')
        details.className = 'lc-passkey-details'
        const name = document.createElement('strong')
        name.textContent = passkeyName(passkey, index)
        const meta = document.createElement('span')
        const used = dateLabel(passkey.last_used_at || passkey.lastUsedAt)
        const created = dateLabel(passkey.created_at || passkey.createdAt)
        meta.textContent = used ? ('Ultimo utilizzo: ' + used) : (created ? ('Creata: ' + created) : 'Passkey registrata')
        details.append(name, meta)

        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'lc-passkey-remove'
        remove.textContent = 'Revoca'
        remove.setAttribute('aria-label', 'Revoca ' + passkeyName(passkey, index))
        remove.addEventListener('click', function () {
          deletePasskey(passkey.id, remove)
        })
        row.append(details, remove)
        list.appendChild(row)
      })
    } catch (error) {
      list.replaceChildren()
      const empty = document.createElement('div')
      empty.className = 'lc-passkey-empty is-error'
      empty.textContent = errorMessage(error)
      list.appendChild(empty)
    }
  }

  async function registerPasskey() {
    const button = modal && modal.querySelector('#lc-passkey-add')
    if (!button) return
    if (!supported()) {
      panelMessage('Questo dispositivo o browser non supporta le Passkey.')
      return
    }
    button.disabled = true
    button.textContent = 'Registrazione in corso…'
    panelMessage('')
    try {
      const result = await client.auth.registerPasskey()
      if (result.error) throw result.error
      panelMessage('Passkey registrata correttamente. Da ora puoi usarla nella pagina di accesso.', true)
      await loadPasskeys()
    } catch (error) {
      panelMessage(errorMessage(error))
    } finally {
      button.disabled = false
      button.textContent = 'Aggiungi una Passkey'
    }
  }

  async function deletePasskey(passkeyId, button) {
    if (!passkeyId || !window.confirm('Vuoi revocare questa Passkey? Non potrai più usarla per accedere.')) return
    button.disabled = true
    panelMessage('')
    try {
      const result = await client.auth.passkey.delete({ passkeyId: passkeyId })
      if (result.error) throw result.error
      panelMessage('Passkey revocata.', true)
      await loadPasskeys()
    } catch (error) {
      button.disabled = false
      panelMessage(errorMessage(error))
    }
  }

  function ensureAccountButton() {
    if (accountButton) return accountButton
    accountButton = document.createElement('button')
    accountButton.type = 'button'
    accountButton.className = 'lc-passkey-account'
    accountButton.innerHTML = '<span aria-hidden="true">🔑</span><span>Passkey</span>'
    accountButton.hidden = true
    accountButton.addEventListener('click', openManager)
    document.body.appendChild(accountButton)
    return accountButton
  }

  async function openManager() {
    if (!currentUser) return
    const dialog = makeModal()
    dialog.hidden = false
    document.body.classList.add('lc-passkey-modal-open')
    panelMessage('')
    dialog.querySelector('.lc-passkey-close').focus()
    await loadPasskeys()
  }

  function mountManager(containerId) {
    const host = document.getElementById(containerId)
    if (!host) return
    host.replaceChildren()

    const text = document.createElement('div')
    text.className = 'lc-passkey-settings-copy'
    const title = document.createElement('strong')
    title.textContent = 'Accesso con Passkey'
    const description = document.createElement('p')
    description.textContent = 'Registra Face ID, Touch ID, il codice del dispositivo o una chiave di sicurezza. La Passkey può essere custodita da Portachiavi iCloud o Google Password Manager, ma l’account resta quello aziendale.'
    text.append(title, description)

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'lc-passkey-settings-btn'
    button.innerHTML = '<span aria-hidden="true">🔑</span><span>Gestisci le Passkey</span>'
    button.disabled = !currentUser
    button.addEventListener('click', openManager)
    host.append(text, button)
  }

  function init(options) {
    client = options && options.client
    onSession = options && options.onSession
    showFloating = !(options && options.floating === false)
    if (!client || typeof onSession !== 'function') return
    renderLogin((options && options.loginContainerId) || 'lc-passkey-login')
    ensureAccountButton()
  }

  function authorize(user) {
    currentUser = user || null
    const button = ensureAccountButton()
    button.hidden = !currentUser || !showFloating
  }

  window.LC_PASSKEY = { init: init, authorize: authorize, mountManager: mountManager, open: openManager }
})()
