# Screen Modules — Catatan TKL OEE

Modul CSS + JS per tab/screen sesuai screenshot UI.

## Mapping `button.screen-tab`

| nth-child | Label UI        | `data-screen` | CSS                         | JS                        |
|-----------|-----------------|---------------|-----------------------------|---------------------------|
| 1         | Shift&Produk    | `filter`      | `css/shift-produk.css`      | `js/shift-produk.js`      |
| 2         | Inisial         | `operator`    | `css/inisial.css`           | `js/inisial.js`           |
| 3         | Sheet           | `logsheet`    | `css/sheet.css`             | `js/sheet.js`             |
| 5*        | OEE OPE         | `oee`         | `css/oee-ope.css`           | `js/oee-ope.js`           |
| 6         | OEE 365         | `oee365`      | `css/oee365-screen.css`     | `js/oee365-screen.js`     |
| 7         | Dashboard       | `dashboard`   | `css/dashboard-screen.css`  | `js/dashboard-screen.js`  |

\* Tab ke-4 (`perf-produk`) disembunyikan di HTML (`hidden`).

## Cara pasang di `index.html`

### 1. CSS (di `<head>`, setelah stylesheet utama)

```html
<link rel="stylesheet" href="css/shift-produk.css">
<link rel="stylesheet" href="css/inisial.css">
<link rel="stylesheet" href="css/sheet.css">
<link rel="stylesheet" href="css/oee-ope.css">
<link rel="stylesheet" href="css/oee365-screen.css">
<link rel="stylesheet" href="css/dashboard-screen.css">
```

Atau salin file ke folder `css/` project yang sudah ada.

### 2. JS (sebelum `</body>`, setelah modul inti)

```html
<script src="js/shift-produk.js"></script>
<script src="js/inisial.js"></script>
<script src="js/sheet.js"></script>
<script src="js/oee-ope.js"></script>
<script src="js/oee365-screen.js"></script>
<script src="js/dashboard-screen.js"></script>
```

### 3. Selector yang dipakai

Semua style di-scope ke section:

```css
.sec[data-screen="filter"] { ... }
.sec[data-screen="operator"] { ... }
.sec[data-screen="logsheet"] { ... }
.sec[data-screen="oee"] { ... }
.sec[data-screen="oee365"] { ... }
.sec[data-screen="dashboard"] { ... }
```

Ini aman digabung dengan `app.css` / `redesign.css` yang sudah ada — tidak bentrok global.

## Event yang di-dispatch (bisa di-listen modul lain)

| Event                    | Detail                          | Dari modul        |
|--------------------------|---------------------------------|-------------------|
| `shiftproduk:change`     | `{ shift, line, stage }`        | shift-produk.js   |
| `shiftproduk:date`       | `{ date }`                      | shift-produk.js   |
| `inisial:change`         | `{ values: { op1..op6 } }`      | inisial.js        |
| `sheet:stage`            | `{ stage }`                     | sheet.js          |
| `sheet:line`             | `{ line }`                      | sheet.js          |
| `dashboard:preset`       | `{ preset, from, to }`          | dashboard-screen  |
| `dashboard:refresh`      | —                               | dashboard-screen  |
| `dashboard:export`       | —                               | dashboard-screen  |
| `dashboard:filter`       | `{ from, to, line, shift }`     | dashboard-screen  |

Contoh listen:

```js
document.addEventListener('shiftproduk:change', (e) => {
  console.log('Filter berubah', e.detail);
});
```

## Catatan

- Modul ini **UI-layer** saja. Perhitungan OEE, simpan Supabase, rows log sheet tetap di file inti (`calculation.js`, `rows.js`, `storage.js`, dll.).
- File `oee365.css` & `dashboard.css` yang sudah ada di project boleh tetap dipakai; modul `*-screen.css` menambah polish sesuai screenshot.
- Semua modul auto-init saat `DOMContentLoaded`.
