(function () {
  'use strict'

  const PORTALS = [
    ['Procacciatori', 'https://portale.leoneconsultingitalia.it', 'Area commerciale'],
    ['Docenti e Tutor', 'https://docenti.leoneconsultingitalia.it', 'Area didattica'],
    ['Dipendenti', 'https://dipendenti.leoneconsultingitalia.it', 'Area aziendale']
  ]

  function clean(value) { return String(value == null ? '' : value).trim() }
  function initials(name) {
    const parts = clean(name).split(/\s+/).filter(Boolean)
    return (parts.slice(0, 2).map(function (p) { return p.charAt(0) }).join('') || 'LC').toUpperCase()
  }
  function node(tag, className, text) {
    const el = document.createElement(tag)
    if (className) el.className = className
    if (text != null) el.textContent = text
    return el
  }
  function setMessage(host, message, ok) {
    host.textContent = message || ''
    host.classList.toggle('is-ok', !!ok)
  }
  function fieldValue(record, key) {
    const value = record && record[key]
    return value == null ? '' : String(value)
  }
  function makeField(def, record) {
    const label = node('label', 'lc-settings-field' + (def.wide ? ' lc-wide' : ''))
    label.appendChild(node('span', '', def.label))
    let input
    if (def.type === 'select') {
      input = document.createElement('select')
      ;(def.options || []).forEach(function (option) {
        const value = Array.isArray(option) ? option[0] : option
        const caption = Array.isArray(option) ? option[1] : option
        const choice = document.createElement('option')
        choice.value = value
        choice.textContent = caption
        input.appendChild(choice)
      })
    } else {
      input = document.createElement('input')
      input.type = def.type || 'text'
      if (def.autocomplete) input.autocomplete = def.autocomplete
      if (def.placeholder) input.placeholder = def.placeholder
    }
    input.name = def.key
    input.value = fieldValue(record, def.key)
    label.appendChild(input)
    return label
  }
  function makeLocked(items) {
    const wrap = node('div', 'lc-settings-locked')
    items.forEach(function (item) {
      const box = node('div', 'lc-settings-locked-item')
      box.append(node('span', '', item[0]), node('strong', '', item[1] || '—'))
      wrap.appendChild(box)
    })
    return wrap
  }
  function makeHeader(name, subtitle, role) {
    const head = node('div', 'lc-settings-head')
    const avatar = node('div', 'lc-settings-avatar', initials(name))
    const copy = node('div')
    copy.append(node('h2', '', name || 'Il tuo profilo'), node('p', '', subtitle))
    head.append(avatar, copy, node('span', 'lc-settings-role', role))
    return head
  }
  function makeSecurityCard(passkeyId) {
    const card = node('section', 'lc-settings-card')
    const body = node('div', 'lc-settings-body lc-settings-security')
    const host = node('div')
    host.id = passkeyId
    body.appendChild(host)
    card.appendChild(body)
    return card
  }

  function mount(options) {
    const host = document.getElementById(options.containerId)
    if (!host || !options.record) return
    host.replaceChildren()
    host.className = 'lc-settings-stack'

    const formCard = node('section', 'lc-settings-card')
    formCard.appendChild(makeHeader(options.record.nome || options.user.email, 'Dati del profilo personale e professionale', options.roleLabel))
    const body = node('div', 'lc-settings-body')
    body.appendChild(makeLocked([
      ['Email aziendale', options.user.email],
      ['Ruolo e permessi', options.roleLabel]
    ]))
    body.appendChild(node('p', 'lc-settings-note', 'Email aziendale, ruolo, stato di approvazione e dati contrattuali sono protetti e possono essere cambiati soltanto dall’amministrazione.'))

    const form = document.createElement('form')
    form.noValidate = true
    ;(options.sections || []).forEach(function (section) {
      const sectionNode = node('section', 'lc-settings-section')
      sectionNode.appendChild(node('h3', '', section.title))
      const grid = node('div', 'lc-settings-grid')
      section.fields.forEach(function (def) { grid.appendChild(makeField(def, options.record)) })
      sectionNode.appendChild(grid)
      form.appendChild(sectionNode)
    })

    const actions = node('div', 'lc-settings-actions')
    const save = node('button', 'lc-settings-save', 'Salva modifiche')
    save.type = 'submit'
    const message = node('span', 'lc-settings-message')
    actions.append(save, message)
    form.appendChild(actions)
    body.appendChild(form)
    formCard.appendChild(body)

    form.addEventListener('submit', async function (event) {
      event.preventDefault()
      if (!options.client || !options.recordId) return
      save.disabled = true
      setMessage(message, 'Salvataggio in corso…')
      const updated = Object.assign({}, options.record)
      delete updated._id
      ;(options.sections || []).forEach(function (section) {
        section.fields.forEach(function (def) {
          const input = form.elements.namedItem(def.key)
          updated[def.key] = clean(input && input.value)
        })
      })
      try {
        const result = await options.client.from(options.table).update({ data: updated }).eq('id', options.recordId)
        if (result.error) throw result.error
        Object.assign(options.record, updated)
        setMessage(message, 'Profilo aggiornato.', true)
        const header = formCard.querySelector('.lc-settings-head')
        header.replaceWith(makeHeader(options.record.nome || options.user.email, 'Dati del profilo personale e professionale', options.roleLabel))
        if (typeof options.onSaved === 'function') options.onSaved(options.record)
      } catch (error) {
        console.error('salvataggio impostazioni profilo:', error)
        setMessage(message, 'Non è stato possibile salvare. Riprova o contatta l’amministrazione.')
      } finally {
        save.disabled = false
      }
    })

    const passkeyId = options.containerId + '-passkeys'
    host.append(formCard, makeSecurityCard(passkeyId))
    window.LC_PASSKEY?.mountManager(passkeyId)
  }

  function mountAdmin(options) {
    const host = document.getElementById(options.containerId)
    if (!host) return
    const user = options.user
    const metadata = Object.assign({}, user.user_metadata || {})
    const fullName = clean(metadata.full_name) || 'Leonardo Angelucci'
    const company = clean(metadata.business_name) || 'Leone Consulting di Leonardo Angelucci'
    host.replaceChildren()
    host.className = 'lc-settings-stack'

    const card = node('section', 'lc-settings-card')
    card.appendChild(makeHeader(fullName, company, 'Amministratore'))
    const body = node('div', 'lc-settings-body')
    body.appendChild(makeLocked([
      ['Email amministrativa', user.email],
      ['Ruolo e permessi', 'Amministratore']
    ]))
    body.appendChild(node('p', 'lc-settings-note', 'Questo è il tuo unico profilo amministrativo condiviso tra i tre portali. Email, ruolo e permessi restano protetti.'))

    const form = document.createElement('form')
    form.noValidate = true
    const section = node('section', 'lc-settings-section')
    section.appendChild(node('h3', '', 'Dati amministratore'))
    const grid = node('div', 'lc-settings-grid')
    const adminRecord = { full_name: fullName, business_name: company, phone: metadata.phone || '', location: metadata.location || '' }
    ;[
      { key: 'full_name', label: 'Nome e cognome', autocomplete: 'name' },
      { key: 'phone', label: 'Telefono', type: 'tel', autocomplete: 'tel' },
      { key: 'business_name', label: 'Ragione sociale', wide: true, autocomplete: 'organization' },
      { key: 'location', label: 'Sede / località', wide: true, autocomplete: 'address-level2' }
    ].forEach(function (def) { grid.appendChild(makeField(def, adminRecord)) })
    section.appendChild(grid)
    form.appendChild(section)

    const actions = node('div', 'lc-settings-actions')
    const save = node('button', 'lc-settings-save', 'Salva profilo amministratore')
    save.type = 'submit'
    const message = node('span', 'lc-settings-message')
    actions.append(save, message)
    form.appendChild(actions)
    body.appendChild(form)

    const portals = node('section', 'lc-settings-section')
    portals.appendChild(node('h3', '', 'Portali amministrati'))
    const portalGrid = node('div', 'lc-settings-portals')
    PORTALS.forEach(function (item) {
      const link = node('a', 'lc-settings-portal', item[0])
      link.href = item[1]
      link.appendChild(node('small', '', item[2]))
      portalGrid.appendChild(link)
    })
    portals.appendChild(portalGrid)
    body.appendChild(portals)
    card.appendChild(body)

    form.addEventListener('submit', async function (event) {
      event.preventDefault()
      save.disabled = true
      setMessage(message, 'Salvataggio in corso…')
      const next = Object.assign({}, metadata, {
        full_name: clean(form.elements.full_name.value),
        phone: clean(form.elements.phone.value),
        business_name: clean(form.elements.business_name.value),
        location: clean(form.elements.location.value)
      })
      try {
        const result = await options.client.auth.updateUser({ data: next })
        if (result.error) throw result.error
        const freshUser = result.data && result.data.user ? result.data.user : user
        setMessage(message, 'Profilo aggiornato su tutti i portali.', true)
        card.querySelector('.lc-settings-head').replaceWith(makeHeader(next.full_name, next.business_name, 'Amministratore'))
        if (typeof options.onSaved === 'function') options.onSaved(freshUser)
      } catch (error) {
        console.error('salvataggio profilo amministratore:', error)
        setMessage(message, 'Non è stato possibile salvare il profilo amministratore.')
      } finally {
        save.disabled = false
      }
    })

    const passkeyId = options.containerId + '-passkeys'
    host.append(card, makeSecurityCard(passkeyId))
    window.LC_PASSKEY?.mountManager(passkeyId)
  }

  window.LC_PROFILE_SETTINGS = { mount: mount, mountAdmin: mountAdmin }
})()
