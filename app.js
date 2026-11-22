(() => {
  'use strict';

  const STORAGE_KEY = 'diningmap.restaurants.v1';
  const MAX_RATING = 10;
  const BUDAPEST = [47.4979, 19.0402];
  const DISTRICTS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
    'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII'];
  const DEFAULT_CUISINES = ['magyar', 'olasz', 'pizza', 'burger', 'ázsiai', 'japán', 'kínai', 'vietnámi',
    'thai', 'indiai', 'közel-keleti', 'mexikói', 'francia', 'görög', 'vegán', 'street food', 'reggeliző', 'cukrászda', 'kávézó'];

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Storage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data.map(toTenScale) : [];
    } catch { return []; }
  }
  // Ratings used to be 1–5; entries without `scale: 10` are converted (×2).
  function toTenScale(it) {
    if (!it || it.scale === MAX_RATING) return it;
    const r = Number(it.rating) || 0;
    return { ...it, rating: r ? Math.min(MAX_RATING, r * 2) : 0, scale: MAX_RATING };
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items)); }
    catch (e) { alert('Nem sikerült menteni a böngészőbe: ' + e.message); }
  }

  const state = { items: load(), selectedId: null, editingId: null };

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
    return L.divIcon({
      className: '',
      html: `<div class="pin" style="background:${ratingColor(item.rating)}"><span>${item.rating || '?'}</span></div>`,
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

  function metaLine(it) {
    return [it.district && `${it.district}. ker.`, it.cuisine, priceText(it.price), fmtDate(it.date)]
      .filter(Boolean).map(esc).join(' · ');
  }

  // ---------- Filters ----------
  function filtered() {
    const q = $('#f-search').value.trim().toLowerCase();
    const cuisine = $('#f-cuisine').value;
    const district = $('#f-district').value;
    const minR = Number($('#f-rating').value);
    const onlyReturn = $('#f-return').checked;
    const sort = $('#f-sort').value;

    const out = state.items.filter((it) => {
      if (q && ![it.name, it.address, it.notes, it.cuisine].join(' ').toLowerCase().includes(q)) return false;
      if (cuisine && (it.cuisine || '').toLowerCase() !== cuisine) return false;
      if (district && it.district !== district) return false;
      if (minR && (Number(it.rating) || 0) < minR) return false;
      if (onlyReturn && !it.wouldReturn) return false;
      return true;
    });
    out.sort((a, b) => {
      if (sort === 'rating') return (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name, 'hu');
      if (sort === 'name') return a.name.localeCompare(b.name, 'hu');
      return (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name, 'hu');
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

    const rated = state.items.filter((i) => i.rating);
    const avg = rated.length ? (rated.reduce((s, i) => s + Number(i.rating), 0) / rated.length).toFixed(1) : '–';
    const ret = state.items.filter((i) => i.wouldReturn).length;
    $('#stats').innerHTML = `
      <div class="stat"><b>${state.items.length}</b><span>étterem</span></div>
      <div class="stat"><b>${avg}</b><span>átlag ★ (/10)</span></div>
      <div class="stat"><b>${ret}</b><span>visszamennék</span></div>`;

    $('#list').innerHTML = items.map((it) => `
      <li class="item${it.id === state.selectedId ? ' active' : ''}" data-id="${it.id}">
        <div class="item-head">
          <span class="item-name">${esc(it.name)}${it.wouldReturn ? '<span class="tag">↻ visszamennék</span>' : ''}</span>
          ${starsHtml(it.rating)}
        </div>
        <div class="item-meta">${metaLine(it) || esc(it.address)}</div>
        ${it.notes ? `<div class="item-notes">${esc(it.notes)}</div>` : ''}
      </li>`).join('');
    $('#empty').hidden = state.items.length > 0;
    if (state.items.length && !items.length) {
      $('#list').innerHTML = '<li class="empty">Nincs a szűrésnek megfelelő étterem.</li>';
    }

    markerLayer.clearLayers();
    markers.clear();
    items.forEach((it) => {
      if (it.lat == null || it.lng == null || it.lat === '' || it.lng === '') return;
      const m = L.marker([Number(it.lat), Number(it.lng)], { icon: pinIcon(it), title: it.name });
      m.bindPopup(`
        <div class="popup-name">${esc(it.name)}</div>
        <div class="popup-meta">${metaLine(it)}</div>
        ${starsHtml(it.rating)}
        ${it.address ? `<div>${esc(it.address)}</div>` : ''}
        ${it.notes ? `<div style="margin-top:4px">${esc(it.notes)}</div>` : ''}
        ${it.url ? `<div><a href="${esc(it.url)}" target="_blank" rel="noopener">Link ↗</a></div>` : ''}
        <button class="popup-edit" data-edit="${it.id}">Szerkesztés</button>`);
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
    const li = e.target.closest('.item');
    if (!li) return;
    const id = li.dataset.id;
    if (state.selectedId === id || !markers.has(id)) openForm(id);
    else select(id);
  });
  $('#list').addEventListener('dblclick', (e) => {
    const li = e.target.closest('.item');
    if (li) openForm(li.dataset.id);
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (btn) openForm(btn.dataset.edit);
  });

  ['#f-search', '#f-cuisine', '#f-district', '#f-rating', '#f-sort', '#f-return']
    .forEach((s) => $(s).addEventListener('input', render));

  // ---------- Form ----------
  const form = $('#form');
  const dlg = $('#dlg');

  $('#district-select').innerHTML = '<option value="">–</option>' + DISTRICTS.map((d) => `<option value="${d}">${d}. kerület</option>`).join('');
  $('#f-district').innerHTML = '<option value="">Minden kerület</option>' + DISTRICTS.map((d) => `<option value="${d}">${d}. kerület</option>`).join('');

  function setRating(r) {
    form.rating.value = r || '';
    const lbl = $('#rating-value');
    if (lbl) lbl.textContent = r ? `${r}/${MAX_RATING}` : '';
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
    $('#rating-value').textContent = form.rating.value ? `${form.rating.value}/${MAX_RATING}` : '';
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

  function openForm(id, preset = {}) {
    state.editingId = id;
    const it = id ? state.items.find((x) => x.id === id) : null;
    form.reset();
    $('#geo-results').innerHTML = '';
    $('#dlg-title').textContent = it ? 'Étterem szerkesztése' : 'Új étterem';
    $('#btn-delete').hidden = !it;
    const v = it || { date: new Date().toISOString().slice(0, 10), ...preset };
    ['name', 'address', 'district', 'cuisine', 'price', 'date', 'notes', 'url']
      .forEach((k) => { form[k].value = v[k] ?? ''; });
    form.wouldReturn.checked = !!v.wouldReturn;
    setRating(Number(v.rating) || 0);
    setCoords(v.lat, v.lng);
    map.closePopup();
    dlg.showModal();
    form.name.focus();
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
    const data = {
      name: form.name.value.trim(),
      address: form.address.value.trim(),
      district: form.district.value,
      cuisine: form.cuisine.value.trim().toLowerCase(),
      price: form.price.value,
      rating: Number(form.rating.value) || 0,
      scale: MAX_RATING,
      date: form.date.value,
      wouldReturn: form.wouldReturn.checked,
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
    render();
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
    const q = [form.address.value.trim() || form.name.value.trim()].filter(Boolean)[0];
    if (!q) { $('#geo-hint').textContent = 'Írj be egy címet vagy nevet a kereséshez.'; return; }
    const box = $('#geo-results');
    box.innerHTML = '<span class="hint">Keresés…</span>';
    try {
      const url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
        q: q + ', Budapest', format: 'jsonv2', addressdetails: '1', limit: '5', countrycodes: 'hu', 'accept-language': 'hu'
      });
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const list = await res.json();
      if (!list.length) { box.innerHTML = '<span class="hint">Nincs találat. Kattints a térképre a hely megadásához.</span>'; return; }
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
      box.innerHTML = `<span class="hint">Hiba a keresésnél (${esc(err.message)}). Kattints a térképre a hely megadásához.</span>`;
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
    a.download = `diningmap-${new Date().toISOString().slice(0, 10)}.json`;
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
      if (!Array.isArray(data)) throw new Error('A fájl nem étteremlistát tartalmaz.');
      const valid = data.filter((x) => x && typeof x.name === 'string').map((x) => toTenScale({ ...x, id: x.id || uid() }));
      const replace = state.items.length === 0 ||
        confirm(`${valid.length} étterem a fájlban.\n\nOK = a jelenlegi lista CSERÉJE\nMégse = HOZZÁFŰZÉS (azonos azonosítójúak frissülnek)`);
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
    if (!confirm('Biztosan törölsz MINDEN éttermet? Előtte érdemes fájlba menteni.')) return;
    state.items = [];
    save();
    render();
  });

  document.addEventListener('click', (e) => {
    const menu = $('.menu');
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });

  function fitAll() {
    const pts = state.items.filter((i) => i.lat != null && i.lng != null).map((i) => [i.lat, i.lng]);
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    else if (pts.length === 1) map.setView(pts[0], 16);
  }

  render();
  fitAll();
})();
