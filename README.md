# NoliktavaPRIM v1.4.0 — bezsaistes tīmekļa lietotne (PWA) iPhone

Inventarizācija un izdošana ar kameras skenēšanu; dati glabājas telefonā; eksports CSV pēc `06_CSV_specifikacija v1.5`.

## Faili
`index.html`, `app.js`, `core.js`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `zxing.min.js` (skenēšanas bibliotēka, @zxing/library 0.21.3, Apache-2.0).
Visiem failiem jābūt vienā mapē (bez apakšmapēm).

## Publicēšana (vienreiz) — GitHub Pages
Kamera Safari darbojas tikai ar HTTPS, bezsaistes režīmam vajag service worker, tāpēc lietotnei jābūt HTTPS adresē.
1. Jaunā GitHub repozitorijā ielieciet visus failus (saknē).
2. Settings → Pages → Branch: `main` / `(root)` → Save.
3. Adrese būs `https://<lietotājs>.github.io/<repo>/`. Dati paliek tikai telefonā, serverī netiek glabāti.

## Uzstādīšana uz iPhone
1. Atveriet adresi Safari (nevis citā pārlūkā) un atļaujiet kameru.
2. Kopīgot → **Pievienot sākuma ekrānam**; turpmāk atveriet no ikonas (tad Safari nedzēš datus un lietotne darbojas bez interneta).
3. Pirmo reizi atveriet ar internetu, lai ielādējas bezsaistes kešs.

## Pirmā palaišana (Admins)
1. Augšējā labajā stūrī nospiediet **Darbinieks** → izveidojiet Admina PIN (4–8 cipari; atjaunot nevar — pierakstiet).
2. **Iestatījumi**: ievadiet noliktavu kodus (K1, K2, HMP…), saņēmēju sarakstu (tieši kā Excel Iestatījumu kolonna N) un, ja vēlaties “neatpazītas preces” atzīmi, preču kodu sarakstu. Var ielādēt no .txt/.csv.
3. Atgriezieties Darbinieka režīmā (nospiediet **Admins**).

## Ikdiena
- **Inventarizācija**: noliktavas kods → preces kods → skaits → **APSTIPRINĀT**. Sesija paliek atvērta, līdz nospiežat **Pabeigt sesiju**.
- **Sūtīšana datoram (v1.4.0)**: pēc **Pabeigt sesiju** lietotne uzreiz izveido CSV un atver iOS koplietošanas izvēlni (ja iOS prasa pieskārienu — parāda pogu SŪTĪT DATORAM). Izvēlnē izvēlieties komandu “Uz datoru” (skat. IOS_komanda_Uz_datoru.md). Faili vienmēr paliek arī sadaļā Datu apmaiņa.
- **Izdošana (v1.3.0)**: noliktava → saņēmējs (vienreiz visai izdošanai) → preces kods → skaits → **APSTIPRINĀT** (atkārtoti katrai precei) → **Pabeigt sesiju**. Viena izdošana = viens akts; vienlaikus var būt tikai viena atvērta izdošana. Citam saņēmējam pabeidziet izdošanu un sāciet jaunu.
- **Datu apmaiņa (Admins)**: EKSPORTĒT → katram modulim atsevišķs fails → **Kopīgot / saglabāt** (AirDrop, Faili, e-pasts) → mapē `DATU_APMAINA\02_IENAKOSIE` → validators 03 / 03b.
- Eksportēti ieraksti vairs nav labojami; faili paliek sarakstā atkārtotai kopīgošanai.
- **Rezerves kopija (JSON)** — izveidojiet regulāri.

## Preces nosaukums (v1.1.0)
Iestatījumos preču sarakstu var ielādēt ar nosaukumiem: rinda `kods;nosaukums;mērvienība` (UTF-8, `;`). Pēc skenēšanas lietotne rāda preces nosaukumu un mērvienību, ieraksts saglabā nosaukumu (CSV eksports nemainās). Sarakstu izveido QR ģeneratorā: **Eksportēt lietotnei**.

## Darba datu dzēšana (v1.2.0)
Admins → Datu apmaiņa → apakšā “Dzēst visus ierakstus…”. Izdzēš visus ierakstus, sesijas un eksporta failus šajā ierīcē (piem., pēc testēšanas, pirms reālās uzskaites sākuma). Nepieciešams ierakstīt “DZEST” (derīgs arī “DZĒST”) un ievadīt Admina PIN; ja ir neeksportēti ieraksti, tiek rādīts brīdinājums. Iestatījumi (PIN, noliktavas, saņēmēji, preču saraksts) paliek. Darbība nav atceļama — iepriekš var izveidot rezerves kopiju. Darbiniekam šīs iespējas nav.

## Atjaunināšana
Nomainiet failus repozitorijā; `VERSION` jāsaskaņo `core.js` un `sw.js`. Lokālie dati netiek dzēsti. Lietotne parādīs ziņu — aizveriet un atveriet to vēlreiz.
