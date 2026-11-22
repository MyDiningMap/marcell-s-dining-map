# diningmap

Személyes webapp a kipróbált budapesti éttermek nyilvántartására, térképpel.

## Funkciók

- **Térkép** (OpenStreetMap + Leaflet): minden étterem egy pin, az értékelés szerint színezve.
- **Új étterem**: a „+ Új étterem” gombbal vagy a térképre kattintva.
  - A helyet cím alapján is keresheted (OpenStreetMap Nominatim), vagy kijelölheted a térképen.
  - Az irányítószámból automatikusan kitölti a kerületet.
- Adatok: név, cím, kerület, konyha, 1–10 csillag, árszint, látogatás dátuma, „visszamennék”, jegyzetek, link.
- **Szűrés és rendezés**: szöveges keresés, konyha, kerület, minimum értékelés, „csak ahová visszamennék”.
- **Statisztika**: darabszám, átlagos értékelés, hány helyre mennél vissza.
- **Mentés / betöltés JSON fájlba** (⋯ menü): biztonsági mentéshez, vagy hogy átvidd az adatokat másik eszközre.
- Mobilon is használható, és van sötét mód.

## Hol tárolódnak az adatok?

A böngésző `localStorage`-ában, csak az adott eszközön és böngészőben.
Más eszközre a ⋯ → „Mentés fájlba” / „Betöltés fájlból” menüponttal tudod átvinni őket.
Időnként érdemes menteni egy JSON fájlt.

## Futtatás

Nincs build lépés, ez három statikus fájl (`index.html`, `style.css`, `app.js`).

Helyben:

```bash
python3 -m http.server 8000
```

Utána nyisd meg a http://localhost:8000 címet.

Online: GitHub Pages-en (Settings → Pages → Deploy from a branch → válaszd ki az ágat és a `/ (root)` mappát).
