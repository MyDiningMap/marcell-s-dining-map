# diningmap

Személyes webapp a kipróbált és a kinézett budapesti éttermek, pékségek, kávézók nyilvántartására, térképpel.

## Funkciók

- **Térkép** (OpenStreetMap + Leaflet): minden hely egy pin, az értékelés szerint színezve; a kívánságlistás helyek kék ♡ pint kapnak.
- **Kipróbált / Kívánságlista / Mind** fülek. A kívánságlistára azokat a helyeket veheted fel, amiket kinéztél, de még nem voltál ott.
  A „✓ Voltam itt!” gombbal egy kattintással áttehetők a kipróbáltak közé (ilyenkor megadhatod az értékelést).
- **Típus**: étterem, pékség, kávézó, cukrászda, bár – szűrhető.
- **Új hely**: a „+ Új hely” gombbal vagy a térképre kattintva.
  - A helyet cím alapján is keresheted (OpenStreetMap Nominatim), vagy kijelölheted a térképen.
  - Az irányítószámból automatikusan kitölti a kerületet.
- Adatok: név, típus, cím, kerület, konyha, 1–10 csillag, árszint, látogatás dátuma, „visszamennék”, jegyzetek, link.
- **Szűrés és rendezés**: szöveges keresés, típus, konyha, kerület, minimum értékelés, „csak ahová visszamennék”.
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
