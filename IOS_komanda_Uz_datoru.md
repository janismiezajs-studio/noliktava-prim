# iOS komanda “Uz datoru” (vienreizēja iestatīšana)

Mērķis: pēc **Pabeigt sesiju** koplietošanas izvēlnē pieskarties vienai pogai, un CSV nonāk OneDrive mapē `NOLITAVA_Stegra\TESTA_VIDE\DATU_APMAINA\02_IENAKOSIE` (vēlāk — ražošanas `DATU_APMAINA\02_IENAKOSIE`) bez jautājumiem par mapi.

## Pirms tam
1. iPhone ir uzstādīta lietotne **OneDrive**, pierakstīts PRIMEKSS konts.
2. **Faili** → Pārlūkot → ⋯ → Rediģēt → ieslēgts **OneDrive**.
3. Datorā mapei `02_IENAKOSIE`: labais klikšķis → **Always keep on this device**.

## Komandas izveide (lietotne “Komandas / Shortcuts”)
1. **+** (jauna komanda), nosaukums: **Uz datoru**.
2. Nospiediet **ⓘ** (komandas iestatījumi) → ieslēdziet **Rādīt koplietošanas izvēlnē (Show in Share Sheet)** → pie “Pieņemt” atstājiet tikai **Faili** (Files) / “Jebkuri”.
3. Pievienojiet darbību **Saglabāt failu (Save File)**:
   - Fails: **Koplietošanas ievade (Shortcut Input)**
   - **Jautāt, kur saglabāt (Ask Where to Save)**: IZSLĒGTS
   - Galamērķis: izvēlieties **OneDrive → … → DATU_APMAINA → 02_IENAKOSIE** (vienreiz norādiet mapi)
   - **Pārrakstīt, ja eksistē (Overwrite If File Exists)**: IZSLĒGTS
4. (Neobligāti) Pievienojiet **Rādīt paziņojumu (Show Notification)**: “CSV nodots datoram”.
5. Saglabājiet (**Gatavs / Done**).

## Lietošana
**Pabeigt sesiju** → atveras koplietošanas izvēlne → **Uz datoru**. Pēc dažām sekundēm OneDrive nosinhronizē failu, un datorā atvērtā `IZDOSANA_validators_v2.html` lapa to apstrādā pati.

Ja komanda koplietošanas izvēlnē nav redzama: izvēlnes apakšā **Rediģēt darbības (Edit Actions)** → pievienojiet **Uz datoru** favorītiem.
