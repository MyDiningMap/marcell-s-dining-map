(() => {
  'use strict';

  const STORAGE_KEY = 'diningmap.restaurants.v1';
  const TAB_KEY = 'diningmap.tab';
  const MAX_RATING = 10;
  const BUDAPEST = [47.4979, 19.0402];
  const DISTRICTS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
    'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII'];
  const TYPES = {
    etterem: { label: 'Étterem', icon: '🍽️' },
    pekseg: { label: 'Pékség', icon: '🥐' },
    kavezo: { label: 'Kávézó', icon: '☕' },
    cukraszda: { label: 'Cukrászda', icon: '🍰' },
    bar: { label: 'Bár', icon: '🍷' },
  };
  const DEFAULT_CUISINES = ['magyar', 'olasz', 'pizza', 'burger', 'ázsiai', 'japán', 'kínai', 'vietnámi',
    'thai', 'indiai', 'közel-keleti', 'mexikói', 'francia', 'görög', 'vegán', 'street food', 'reggeliző',
    'kovászos kenyér', 'péksütemény', 'croissant'];

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);

  // ---------- Storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data.map(normalize) : [];
    } catch { return []; }
  }
  // Fills in defaults for older entries. Ratings used to be 1–5:
  // entries without `scale: 10` are converted (×2).
  function normalize(it) {
    if (!it) return it;
    const out = { status: 'visited', type: 'etterem', ...it };
    if (out.scale !== MAX_RATING) {
      const r = Number(out.rating) || 0;
      out.rating = r ? Math.min(MAX_RATING, r * 2) : 0;
      out.scale = MAX_RATING;
    }
    if (!TYPES[out.type]) out.type = 'etterem';
    if (out.status !== 'wishlist') out.status = 'visited';
    return out;
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)); }
    catch (e) { alert('Nem sikerült menteni a böngészőbe: ' + e.message); }
  }
  function loadTab() {
    try { const t = localStorage.getItem(TAB_KEY); return ['visited', 'wishlist', 'all'].includes(t) ? t : 'visited'; }
    catch { return 'visited'; }
  }

  const state = { items: load(), selectedId: null, editingId: null, tab: loadTab() };
  const isWish = (it) => it.status === 'wishlist';

  // ---------- Map ----------
  const map = L.map('map', { zoomControl: true }).setView(BUDAPEST, 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  const markerLayer = L.layerGroup().addTo(map);
  const markers = new Map();
  let draftMarker = null;

  function ratingColor(r) {
    if (!r) return '#8a8580';
    if (r <= 2) return '#b91c1c';
    if (r <= 4) return '#ea580c';
    if (r <= 6) return '#ca8a04';
    if (r <= 8) return '#65a30d';
    return '#15803d';
  }
  function pinIcon(item) {
    const wish = isWish(item);
    const bg = wish ? '#2563eb' : ratingColor(item.rating);
    const label = wish ? '♡' : (item.rating || '?');
    return L.divIcon({
      className: '',
      html: `<div class="pin${wish ? ' wish' : ''}" style="background:${bg}"><span>${label}</span></div>`,
      iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26]
    });
  }

  let pickMode = false;
  map.on('click', (e) => {
    if (pickMode) {
      pickMode = false;
      document.body.classList.remove('picking');
      setCoords(e.latlng.lat, e.latlng.lng);
      $('#dlg').showModal();
      return;
    }
    if ($('#dlg').open) return;
    openForm(null, { lat: e.latlng.lat, lng: e.latlng.lng });
  });

  // ---------- Helpers ----------
  const starsHtml = (r) => {
    r = Number(r) || 0;
    return `<span class="stars" title="${r}/${MAX_RATING}">${'★'.repeat(r)}<span class="off">${'★'.repeat(MAX_RATING - r)}</span></span>`;
  };
  const priceText = (p) => (p ? Array(Number(p)).fill('Ft').join(' ') : '');
  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' }) : '');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const typeIcon = (it) => (TYPES[it.type] || TYPES.etterem).icon;

  function metaLine(it) {
    return [(TYPES[it.type] || TYPES.etterem).label, it.district && `${it.district}. ker.`, it.cuisine,
      priceText(it.price), !isWish(it) && fmtDate(it.date)]
      .filter(Boolean).map(esc).join(' · ');
  }

  // ---------- Tabs ----------
  function setTab(tab) {
    state.tab = tab;
    try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ }
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    document.body.dataset.tab = tab;
    render();
    fitAll();
  }
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b) setTab(b.dataset.tab);
  });

  // ---------- Filters ----------
  function filtered() {
    const q = $('#f-search').value.trim().toLowerCase();
    const type = $('#f-type').value;
    const cuisine = $('#f-cuisine').value;
    const district = $('#f-district').value;
    const minR = state.tab === 'wishlist' ? 0 : Number($('#f-rating').value);
    const onlyReturn = state.tab !== 'wishlist' && $('#f-return').checked;
    const sort = $('#f-sort').value;

    const out = state.items.filter((it) => {
      if (state.tab === 'visited' && isWish(it)) return false;
      if (state.tab === 'wishlist' && !isWish(it)) return false;
      if (q && ![it.name, it.address, it.notes, it.cuisine].join(' ').toLowerCase().includes(q)) return false;
      if (type && it.type !== type) return false;
      if (cuisine && (it.cuisine || '').toLowerCase() !== cuisine) return false;
      if (district && it.district !== district) return false;
      if (minR && (isWish(it) || (Number(it.rating) || 0) < minR)) return false;
      if (onlyReturn && !it.wouldReturn) return false;
      return true;
    });
    const when = (x) => (isWish(x) ? (x.createdAt || '').slice(0, 10) : x.date) || '';
    out.sort((a, b) => {
      if (sort === 'rating') return (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name, 'hu');
      if (sort === 'name') return a.name.localeCompare(b.name, 'hu');
      return when(b).localeCompare(when(a)) || a.name.localeCompare(b.name, 'hu');
    });
    return out;
  }

  function refreshFilterOptions() {
    const cur = $('#f-cuisine').value;
    const cuisines = [...new Set(state.items.map((i) => (i.cuisine || '').trim().toLowerCase()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'hu'));
    $('#f-cuisine').innerHTML = '<option value="">Minden konyha</option>' +
      cuisines.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    $('#f-cuisine').value = cuisines.includes(cur) ? cur : '';

    const all = [...new Set([...DEFAULT_CUISINES, ...cuisines])];
    $('#cuisine-list').innerHTML = all.map((c) => `<option value="${esc(c)}">`).join('');
  }

  // ---------- Render ----------
  function render() {
    refreshFilterOptions();
    const items = filtered();

    const visited = state.items.filter((i) => !isWish(i));
    const wish = state.items.length - visited.length;
    const rated = visited.filter((i) => i.rating);
    const avg = rated.length ? (rated.reduce((s, i) => s + Number(i.rating), 0) / rated.length).toFixed(1) : '–';
    const ret = visited.filter((i) => i.wouldReturn).length;
    $('#cnt-visited').textContent = visited.length;
    $('#cnt-wishlist').textContent = wish;
    $('#cnt-all').textContent = state.items.length;
    $('#stats').innerHTML = `
      <div class="stat"><b>${visited.length}</b><span>kipróbált</span></div>
      <div class="stat"><b>${avg}</b><span>átlag ★ (/10)</span></div>
      <div class="stat"><b>${state.tab === 'visited' ? ret : wish}</b><span>${state.tab === 'visited' ? 'visszamennék' : 'kívánságlistán'}</span></div>`;

    $('#list').innerHTML = items.map((it) => `
      <li class="item${it.id === state.selectedId ? ' active' : ''}${isWish(it) ? ' is-wish' : ''}" data-id="${it.id}">
        <div class="item-head">
          <span class="item-name"><span class="type-ico" title="${esc(TYPES[it.type].label)}">${typeIcon(it)}</span>${esc(it.name)}${!isWish(it) && it.wouldReturn ? '<span class="tag">↻ visszamennék</span>' : ''}</span>
          ${isWish(it) ? '<span class="tag wish">♡ kívánságlista</span>' : starsHtml(it.rating)}
        </div>
        <div class="item-meta">${metaLine(it) || esc(it.address)}</div>
        ${it.notes ? `<div class="item-notes">${esc(it.notes)}</div>` : ''}
        ${isWish(it) ? `<button class="btn small visited-btn" data-visit="${it.id}">✓ Voltam itt!</button>` : ''}
      </li>`).join('');

    const empty = $('#empty');
    if (!items.length) {
      const none = state.tab === 'wishlist'
        ? 'Még üres a kívánságlistád. Az <b>+ Új hely</b> gombbal vagy a térképre kattintva vehetsz fel helyet, amit ki szeretnél próbálni.'
        : 'Még nincs hely a listán. Kattints az <b>+ Új hely</b> gombra, vagy a térképen egy pontra.';
      const tabHas = state.items.some((i) => state.tab === 'all' || (state.tab === 'wishlist') === isWish(i));
      empty.innerHTML = tabHas ? 'Nincs a szűrésnek megfelelő hely.' : none;
      empty.hidden = false;
    } else empty.hidden = true;

    markerLayer.clearLayers();
    markers.clear();
    items.forEach((it) => {
      if (it.lat == null || it.lng == null || it.lat === '' || it.lng === '') return;
      const m = L.marker([Number(it.lat), Number(it.lng)], { icon: pinIcon(it), title: it.name, zIndexOffset: isWish(it) ? 0 : 100 });
      m.bindPopup(`
        <div class="popup-name">${typeIcon(it)} ${esc(it.name)}</div>
        <div class="popup-meta">${metaLine(it)}</div>
        ${isWish(it) ? '<div class="popup-wish">♡ Kívánságlistán</div>' : starsHtml(it.rating)}
        ${it.address ? `<div>${esc(it.address)}</div>` : ''}
        ${it.notes ? `<div style="margin-top:4px">${esc(it.notes)}</div>` : ''}
        ${it.url ? `<div><a href="${esc(it.url)}" target="_blank" rel="noopener">Link ↗</a></div>` : ''}
        <button class="popup-edit" data-edit="${it.id}">Szerkesztés</button>
        ${isWish(it) ? `<button class="popup-edit" data-visit="${it.id}">✓ Voltam itt!</button>` : ''}`);
      m.on('click', () => select(it.id, false));
      m.addTo(markerLayer);
      markers.set(it.id, m);
    });
  }

  function select(id, pan = true) {
    state.selectedId = id;
    document.querySelectorAll('.item').forEach((el) => el.classList.toggle('active', el.dataset.id === id));
    const m = markers.get(id);
    if (m && pan) {
      map.setView(m.getLatLng(), Math.max(map.getZoom(), 16));
      m.openPopup();
    }
    const el = document.querySelector(`.item[data-id="${id}"]`);
    if (el && !pan) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  $('#list').addEventListener('click', (e) => {
    if (e.target.closest('[data-visit]')) return;
    const li = e.target.closest('.item');
    if (!li) return;
    const id = li.dataset.id;
    if (state.selectedId === id || !markers.has(id)) openForm(id);
    else select(id);
  });
  $('#list').addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-visit]')) return;
    const li = e.target.closest('.item');
    if (li) openForm(li.dataset.id);
  });
  document.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) { openForm(edit.dataset.edit); return; }
    const visit = e.target.closest('[data-visit]');
    if (visit) openForm(visit.dataset.visit, {}, { markVisited: true });
  });

  ['#f-search', '#f-type', '#f-cuisine', '#f-district', '#f-rating', '#f-sort', '#f-return']
    .forEach((s) => $(s).addEventListener('input', render));

  // ---------- Form ----------
  const form = $('#form');
  const dlg = $('#dlg');

  const districtOpts = DISTRICTS.map((d) => `<option value="${d}">${d}. kerület</option>`).join('');
  $('#district-select').innerHTML = '<option value="">–</option>' + districtOpts;
  $('#f-district').innerHTML = '<option value="">Minden kerület</option>' + districtOpts;
  const typeOpts = Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.icon} ${t.label}</option>`).join('');
  $('#type-select').innerHTML = typeOpts;
  $('#f-type').innerHTML = '<option value="">Minden típus</option>' + typeOpts;

  function setRating(r) {
    form.rating.value = r || '';
    $('#rating-value').textContent = r ? `${r}/${MAX_RATING}` : '';
    $('#stars-input').querySelectorAll('button').forEach((b, i) => {
      b.classList.toggle('on', i < r);
      b.setAttribute('aria-checked', String(i + 1 === Number(r)));
    });
  }
  $('#stars-input').innerHTML = Array.from({ length: MAX_RATING }, (_, i) => i + 1)
    .map((n) => `<button type="button" role="radio" data-r="${n}" aria-label="${n} csillag">★</button>`).join('');
  $('#stars-input').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const r = Number(b.dataset.r);
    setRating(Number(form.rating.value) === r ? 0 : r);
  });

  function setStatus(status) {
    form.status.value = status;
    form.classList.toggle('is-wish', status === 'wishlist');
    document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === status)));
    form.notes.placeholder = status === 'wishlist' ? 'Miért szeretném kipróbálni? Ki ajánlotta?' : '';
    if (status === 'visited' && !form.date.value) form.date.value = today();
  }
  $('#status-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setStatus(b.dataset.status);
  });

  function setCoords(lat, lng) {
    form.lat.value = lat ?? '';
    form.lng.value = lng ?? '';
    $('#coords').textContent = lat != null && lat !== ''
      ? `📍 Hely beállítva (${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}).`
      : 'Nincs hely megadva.';
    if (draftMarker) { map.removeLayer(draftMarker); draftMarker = null; }
    if (lat != null && lat !== '') {
      draftMarker = L.marker([Number(lat), Number(lng)], { draggable: true, opacity: 0.75 }).addTo(map);
      draftMarker.on('dragend', () => {
        const p = draftMarker.getLatLng();
        setCoords(p.lat, p.lng);
      });
    }
  }

  function openForm(id, preset = {}, opts = {}) {
    state.editingId = id;
    const it = id ? state.items.find((x) => x.id === id) : null;
    form.reset();
    $('#geo-results').innerHTML = '';
    $('#btn-delete').hidden = !it;
    const v = it || {
      status: state.tab === 'wishlist' ? 'wishlist' : 'visited',
      type: $('#f-type').value || 'etterem',
      ...preset,
    };
    ['name', 'address', 'district', 'cuisine', 'price', 'date', 'notes', 'url']
      .forEach((k) => { form[k].value = v[k] ?? ''; });
    form.type.value = v.type || 'etterem';
    form.wouldReturn.checked = !!v.wouldReturn;
    setRating(Number(v.rating) || 0);
    let status = v.status || 'visited';
    if (opts.markVisited) { status = 'visited'; form.date.value = today(); }
    setStatus(status);
    setCoords(v.lat, v.lng);
    $('#dlg-title').textContent = opts.markVisited ? `Milyen volt? – ${it.name}` : (it ? 'Hely szerkesztése' : 'Új hely');
    map.closePopup();
    dlg.showModal();
    (opts.markVisited ? $('#stars-input button') : form.name).focus();
  }

  function closeForm() {
    dlg.close();
    if (draftMarker) { map.removeLayer(draftMarker); draftMarker = null; }
  }

  $('#btn-add').addEventListener('click', () => openForm(null));
  $('#btn-cancel').addEventListener('click', closeForm);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pickMode) {
      pickMode = false;
      document.body.classList.remove('picking');
      dlg.showModal();
    }
  });
  dlg.addEventListener('cancel', () => { if (draftMarker) { map.removeLayer(draftMarker); draftMarker = null; } });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const wish = form.status.value === 'wishlist';
    const data = {
      name: form.name.value.trim(),
      status: wish ? 'wishlist' : 'visited',
      type: form.type.value,
      address: form.address.value.trim(),
      district: form.district.value,
      cuisine: form.cuisine.value.trim().toLowerCase(),
      price: form.price.value,
      rating: wish ? 0 : Number(form.rating.value) || 0,
      scale: MAX_RATING,
      date: wish ? '' : form.date.value,
      wouldReturn: !wish && form.wouldReturn.checked,
      notes: form.notes.value.trim(),
      url: form.url.value.trim(),
      lat: form.lat.value === '' ? null : Number(form.lat.value),
      lng: form.lng.value === '' ? null : Number(form.lng.value),
    };
    if (!data.name) return;
    let id = state.editingId;
    if (id) {
      Object.assign(state.items.find((x) => x.id === id), data, { updatedAt: new Date().toISOString() });
    } else {
      id = uid();
      state.items.push({ id, createdAt: new Date().toISOString(), ...data });
    }
    save();
    closeForm();
    // Make sure the saved place is visible in the current tab
    if (state.tab !== 'all' && (state.tab === 'wishlist') !== wish) setTab(wish ? 'wishlist' : 'visited');
    else render();
    select(id);
  });

  $('#btn-delete').addEventListener('click', () => {
    const it = state.items.find((x) => x.id === state.editingId);
    if (!it || !confirm(`Biztosan törlöd: „${it.name}”?`)) return;
    state.items = state.items.filter((x) => x.id !== it.id);
    save();
    closeForm();
    render();
  });

  // ---------- Geocoding (OpenStreetMap Nominatim) ----------
  function districtFromPostcode(pc) {
    const m = /^1(\d\d)\d$/.exec(pc || '');
    if (!m) return '';
    const n = Number(m[1]);
    return n >= 1 && n <= 23 ? DISTRICTS[n - 1] : '';
  }

  $('#btn-geocode').addEventListener('click', async () => {
    const q = form.address.value.trim() || form.name.value.trim();
    if (!q) { $('#geo-hint').textContent = 'Írj be egy címet vagy nevet a kereséshez.'; return; }
    const box = $('#geo-results');
    box.innerHTML = '<span class="hint">Keresés…</span>';
    try {
      const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
        q: q + ', Budapest', format: 'jsonv2', addressdetails: '1', limit: '5', countrycodes: 'hu', 'accept-language': 'hu'
      });
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const list = await res.json();
      if (!list.length) { box.innerHTML = '<span class="hint">Nincs találat. Jelöld ki a helyet a térképen.</span>'; return; }
      box.innerHTML = list.map((r, i) => `<button type="button" data-i="${i}">${esc(r.display_name)}</button>`).join('');
      box.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const r = list[Number(b.dataset.i)];
        setCoords(Number(r.lat), Number(r.lon));
        const a = r.address || {};
        if (!form.address.value.trim() || form.address.value.trim() === form.name.value.trim()) {
          form.address.value = [a.road, a.house_number].filter(Boolean).join(' ') || form.address.value;
        }
        const d = districtFromPostcode(a.postcode);
        if (d && !form.district.value) form.district.value = d;
        map.setView([Number(r.lat), Number(r.lon)], 17);
        box.innerHTML = '';
      };
    } catch (err) {
      box.innerHTML = `<span class="hint">Hiba a keresésnél (${esc(err.message)}). Jelöld ki a helyet a térképen.</span>`;
    }
  });

  // Pick a spot on the map: hide the dialog until the next map click
  $('#btn-pick').addEventListener('click', () => {
    pickMode = true;
    document.body.classList.add('picking');
    dlg.close();
  });

  // ---------- Import / Export ----------
  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.items, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `diningmap-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    $('.menu').open = false;
  });

  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    $('.menu').open = false;
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('A fájl nem helylistát tartalmaz.');
      const valid = data.filter((x) => x && typeof x.name === 'string').map((x) => normalize({ ...x, id: x.id || uid() }));
      const replace = state.items.length === 0 ||
        confirm(`${valid.length} hely a fájlban.\n\nOK = a jelenlegi lista CSERÉJE\nMégse = HOZZÁFŰZÉS (azonos azonosítójúak frissülnek)`);
      if (replace) state.items = valid;
      else {
        const byId = new Map(state.items.map((x) => [x.id, x]));
        valid.forEach((x) => byId.set(x.id, x));
        state.items = [...byId.values()];
      }
      save();
      render();
      fitAll();
    } catch (err) {
      alert('Nem sikerült betölteni: ' + err.message);
    }
  });

  $('#btn-clear').addEventListener('click', () => {
    $('.menu').open = false;
    if (!state.items.length) return;
    if (!confirm('Biztosan törölsz MINDEN helyet (a kívánságlistát is)? Előtte érdemes fájlba menteni.')) return;
    state.items = [];
    save();
    render();
  });

  document.addEventListener('click', (e) => {
    const menu = $('.menu');
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });

  function fitAll() {
    const pts = [...markers.values()].map((m) => m.getLatLng());
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    else if (pts.length === 1) map.setView(pts[0], 16);
  }

  setTab(state.tab);
})();
