# 📋 Dokumentasi CSS Files - TKL OEE System

**Last Updated:** Agustus 2026  
**Total Files:** 19 CSS files  
**Tujuan:** Dokumentasi lengkap kegunaan setiap CSS untuk kemudahan editing & maintenance

---

## 🗂️ Daftar Isi
1. [Foundation & Base](#foundation--base)
2. [Layout & Navigation](#layout--navigation)
3. [Theme & Styling](#theme--styling)
4. [Features & Components](#features--components)
5. [Utilities & Overrides](#utilities--overrides)
6. [Responsive & Mobile](#responsive--mobile)
7. [Print & Export](#print--export)
8. [Loading Order & Dependencies](#loading-order--dependencies)

---

## Foundation & Base

### 📄 **tokens.css** ⭐ MUAT PALING AWAL
**Kegunaan:** Satu sumber kebenaran (single source of truth) untuk design system  
**Isi:**
- Warna (slate, brand biru, semantik)
- Tipografi (IBM Plex Sans, font-sizes, line-heights)
- Spacing (grid 8px)
- Radius (border-radius standar)
- Motion (transition speeds)
- Shadow & elevasi
- Alias backward-compatible ke variabel lama

**Kapan Edit:**
- Ubah palet warna brand/tema
- Adjust font sizes atau font-family
- Update spacing scale
- Tambah token baru untuk feature baru

**Catatan:** 
- Jangan definisikan hex color baru di file lain—gunakan token di sini
- Font IBM Plex Sans di-self-host (offline-safe PWA)
- Mendukung dark mode (`[data-theme="dark"]`)

---

### 📄 **base.css**
**Kegunaan:** CSS reset, elemen HTML dasar, grid background pattern  
**Isi:**
- Global `box-sizing`, margin/padding reset
- Font family default (IBM Plex Sans)
- Background gradient + grid pattern
- Selection color
- Keyboard hints (`<kbd>` styling)
- Smooth scroll behavior

**Kapan Edit:**
- Ubah background pattern / warna halaman
- Adjust default font atau text size
- Change global reset behavior

**Dependency:** Muat SETELAH `tokens.css`

---

## Layout & Navigation

### 📄 **layout.css**
**Kegunaan:** App bar, sheet wrapper, bottom navigation, sections  
**Isi:**
- `.toolbar` (sticky app bar) dengan menu dropdown
- `.sheet` (main content wrapper dengan header)
- `.hwrap` (header dengan brand, clock, status indicators)
- `.bottom-nav` (navigation bar bawah mobile)
- `.sec` (section styling untuk content area)
- Grid layouts (filter-grid, operator-grid, product-grid)
- Screen navigation & shift selector
- Indikator shift, OEE, position
- Status badges & animations (blink, pulse)

**Kapan Edit:**
- Ubah styling toolbar atau sheet container
- Adjust bottom nav appearance
- Modify section padding/spacing
- Change grid layouts untuk filter/operator/product

**Komponen Utama:**
```css
.toolbar         → App bar atas (sticky)
.sheet           → Container utama konten
.hwrap           → Header sheet (brand + clock)
.bottom-nav      → Navigation atas tombol
.bn-item         → Item navigation
.sec             → Section content area
.menu-item       → Menu dropdown item
```

**Dependency:** Setelah `tokens.css`, `base.css`

---

### 📄 **shell.css**
**Kegunaan:** Topbar modern, nav rail desktop, command palette, settings, empty-state  
**Isi:**
- `.topbar` (sticky header untuk desktop)
- `.nav-rail` (sidebar left navigation di desktop ≥1024px)
- `.cmdk-overlay` (command palette overlay)
- `.user-menu` (dropdown user profil)
- `.settings-card` (pengaturan layout)
- `.empty-state` (placeholder saat tidak ada data)
- Switch toggle component
- Rail collapse/expand behavior

**Kapan Edit:**
- Ubah topbar style / layout
- Modify nav-rail items atau sections
- Adjust command palette UI
- Change user menu options
- Style settings page

**Catatan:**
- Nav rail hanya muncul di desktop (`@media min-width: 1024px`)
- Bottom nav disembunyikan di desktop
- Support rail collapse mode

**Dependency:** Setelah `tokens.css`

---

### 📄 **sidebar.css**
**Kegunaan:** Menu & pengaturan sebagai sidebar overlay kiri (mobile)  
**Isi:**
- `.sidebar` (overlay drawer kiri, slide-in animation)
- `.sidebar-header` (judul sidebar)
- `.sidebar-section-label` (pemisah grup menu)
- `.sidebar-divider` (garis pemisah)
- `.sidebar-backdrop` (overlay backdrop)
- `.sidebar-footer` (info terakhir simpan)
- Menu items styling inside sidebar

**Kapan Edit:**
- Ubah sidebar width / positioning
- Adjust sidebar animations
- Modify menu item styling dalam sidebar
- Change backdrop color/opacity

**Catatan:**
- Sidebar hidden by default (`transform: translateX(-100%)`)
- Muncul dengan class `body.sidebar-open`
- Mobile-first (drawer), di desktop bisa di-hide

**Dependency:** Setelah `tokens.css`

---

## Theme & Styling

### 📄 **apple-style.css**
**Kegunaan:** Tema Apple Style 2026 (clean, glassmorphism, soft colors)  
**Isi:**
- Apple color palette (muted, soft shadows)
- Glassmorphic effects (backdrop-filter)
- Soft border-radius (18px)
- Delicate shadows (shadow-sm, shadow-md)
- Color: ink, ink2, mut, paper, card
- Button styles (primary, ghost, logout)
- Form field styling
- Table & OEE matrix styling
- Login card theme
- Toast notifications
- Smooth transitions

**Kapan Edit:**
- Jika ingin switch ke Apple theme
- Ubah soft color palette
- Adjust glassmorphism blur/opacity
- Modify button/form appearance

**Catatan:**
- Override terakhir, tidak merusak fungsionalitas
- Compatible dengan semua screen
- Smooth transitions (cubic-bezier)

**Dependency:** Setelah `layout.css`, `base.css`

---

## Features & Components

### 📄 **components.css** (tidak ditampilkan, diasumsikan ada)
**Kegunaan:** (Inferred) Button, form, card components  
**Catatan:** File ini referenced di dokumentasi tapi kontennya tidak disediakan

---

### 📄 **dashboard.css**
**Kegunaan:** Screen Dashboard: filter controls, chart layout, summary table  
**Isi:**
- `.dash-filters` (grid filter form)
- `.dash-status` (status indicator)
- `.dash-chart-wrap` (chart container)
- `.dash-chart` & `.dash-svg` (SVG chart styling)
- Chart bars (ok, warn, bad states)
- Target line styling
- `.dash-table` (summary table dengan sticky header)
- Color indicators (dot ok/warn/bad)
- `.dash-oee-cell` (OEE cell styling dengan warna status)
- Legend styling
- Empty state

**Kapan Edit:**
- Ubah layout filter dashboard
- Adjust chart bar colors
- Modify table appearance
- Change status indicator colors
- Adjust legend styling

**Komponen:**
```css
.dash-filters     → Filter form grid
.dash-chart-wrap  → Chart container
.dash-chart       → Chart SVG wrapper
.dash-table       → Summary table
.dash-oee-cell    → OEE display cell
```

**Dependency:** Setelah `tokens.css`, `base.css`

---

### 📄 **oee.css**
**Kegunaan:** Tabel matriks OEE, performance details, diagnostic messages  
**Isi:**
- `.oee-matrix-tbl` (OEE matrix table styling)
- Table header styling (navy bg, white text)
- `.sec-header` (section header dalam tabel)
- `.highlight-res` (hasil/result row styling)
- `.perf-head` & `.badge-avg` (performance summary)
- `.perf-detail-box` (detail box flexible)
- `.diag` (diagnostic section)
- `.d-item` (diagnostic item ok/error state)
- Color coding (green ok, red error)

**Kapan Edit:**
- Ubah OEE matrix table appearance
- Modify row highlighting
- Adjust diagnostic message styling
- Change color coding untuk result

**Komponen:**
```css
.oee-matrix-tbl   → Main OEE matrix table
.perf-head        → Performance header
.diag              → Diagnostic section
.d-item            → Diagnostic message
```

**Dependency:** Setelah `tokens.css`, `base.css`

---

### 📄 **logsheet.css** (tidak ditampilkan, diasumsikan ada)
**Kegunaan:** (Inferred) Log sheet form, input validation  

---

### 📄 **login.css** (tidak ditampilkan, diasumsikan ada)
**Kegunaan:** (Inferred) Login form styling (basic)  

---

### 📄 **login-professional.css**
**Kegunaan:** Tema login profesional (dark glassmorphism, blue accents)  
**Isi:**
- Login overlay background (gradient + animated blobs)
- `.login-card` (dark glass card)
- `.login-header` (logo + judul)
- `.login-form` (form fields styling)
- `.login-btn` (gradient button)
- Error & offline notes
- Input focus effects (glow effect)
- Staggered animations (fade-up)
- Mobile responsive
- Reduced motion support

**Kapan Edit:**
- Jika ingin switch ke professional login theme
- Ubah gradient colors
- Adjust blob animation
- Modify input field styling
- Change button gradient

**Catatan:**
- Di-scope dengan `body.login-theme-professional`
- Tema lama (nature.css) tetap aman & bisa dipakai bergantian
- Smooth fade-up animations

**Dependency:** Setelah `tokens.css`, `base.css`

---

### 📄 **modern-sheet.css**
**Kegunaan:** Native-inspired visual layer untuk sheet/logsheet (glass + soft nature bg)  
**Isi:**
- Modern background (gradient + radial blobs)
- `.sheet` (glassmorphic sheet)
- `.sheet-unified-control` (unified control bar)
- `.sheet-stage-btn` (tahapan proses buttons)
- `.sheet-kpi-row` & `.sheet-kpi` (KPI cards)
- `.kpi-fill` (progress bar dalam KPI)
- `.kpi-stars` (achievement sparkle effect)
- `.sheet-product-bar` (carousel produk)
- `.logsheet-topbar` (toolbar logsheet)
- `.tbl-wrap` (table wrapper)
- Table row categories (planned, unplanned, prod)
- Desktop & mobile optimizations

**Kapan Edit:**
- Ubah sheet background / glass effect
- Modify KPI card styling
- Adjust product carousel layout
- Change table row colors per kategori
- Modify sparkle animation

**Komponen:**
```css
.sheet                    → Sheet container
.sheet-kpi                → KPI card
.sheet-product-bar        → Product carousel
.tbl-wrap                 → Table wrapper
.sheet-stage-btn          → Process stage button
```

**Catatan:**
- Product bar di mobile jadi horizontal scroll (carousel)
- Desktop ≥900px: grid 3 kolom
- KPI achievement sparkle effect
- Soft nature background

**Dependency:** Setelah `tokens.css`, `base.css`, `layout.css`

---

## Utilities & Overrides

### 📄 **industrial-toolbar.css**
**Kegunaan:** Industrial toolbar styling (dark blue + green zig-zag + vertical lines)  
**Isi:**
- `.industrial-toolbar` (dark navy gradient dengan vertical line pattern)
- `.it-inner` (wrapper branding)
- `.it-logo` (neon green box with glow)
- `.it-title` & `.it-top` & `.it-sub` (typography hierarchy)
- `.it-zigzag` (green zig-zag decoration bottom)
- Button styling dalam toolbar (muted)
- Sembunyikan dashboard hero/banner
- Mobile optimization (ukuran kecil di <768px)

**Kapan Edit:**
- Ubah toolbar color scheme
- Modify neon green logo glow
- Adjust zig-zag pattern
- Change button styling dalam toolbar
- Update typography sizes

**Catatan:**
- Industrial aesthetic: gelap + neon accent
- Zig-zag pattern dekoratif
- Neon glow effect pada logo
- Mobile-responsive sizing

**Dependency:** Setelah `tokens.css`, `base.css`

---

### 📄 **nature.css**
**Kegunaan:** Elemen dekoratif background login (sungai, kincir, pohon, tenda, api, bunga, kupu-kupu, kunang-kunang, daun gugur)  
**Isi:**
- River body & shine animation
- Windmill (kincir angin) dengan spinning blades
- Round tree (pohon rimbun)
- Hut (gubuk kayu) dengan window glow
- Tent (tenda kemah)
- Campfire (api unggun) dengan flare animation
- Sunflower & rose (bunga)
- Wild grass (rumput dengan sway animation)
- Butterflies (dengan flap & wander animation)
- Fireflies (dengan glow & drift)
- Autumn leaves (falling animation)
- Scene modes: morning, sunrise, sunset, night (brightness/filter changes)
- Reduced motion support

**Kapan Edit:**
- Ubah scene (background untuk login)
- Modify animation speeds
- Adjust colors per season/scene
- Change filter effects untuk time-of-day

**Catatan:**
- Sangat dekoratif, banyak SVG animations
- Scene modes membuat dinamis siang/malam
- Smooth transitions antar elemen
- Reduced motion friendly

**Dependency:** Setelah `tokens.css`

---

### 📄 **clean-live.css**
**Kegunaan:** Menghilangkan jam LIVE, tanggal, status LIVE dari header  
**Isi:**
- Selector umum untuk live clock, live time, live date, live status
- Attribute selectors case-insensitive
- Set `display: none !important` dengan aggressive rules
- Hapus semua ukuran/padding/margin juga

**Kapan Edit:**
- Jika ingin hapus/tampilkan kembali live indicators
- Adjust selector patterns

**Catatan:**
- Override sangat aggressive (`!important` everywhere)
- Gunakan jika tidak perlu live clock di dashboard
- Compatible dengan berbagai selector patterns (class, id, attr)

**Dependency:** Setelah layout/style lain (override mereka)

---

## Responsive & Mobile

### 📄 **mobile-native.css**
**Kegunaan:** Optimasi tampilan mobile: tombol ringkas, spacing hemat, layout compact  
**Isi:**
- Media query breakpoints: 768px, 480px, 360px
- Toolbar compact (padding minimal, gap kecil)
- Button sizes untuk mobile (smaller padding, font)
- Form field sizing
- Section padding hemat
- Grid layouts untuk mobile (single column)
- Split input layouts
- Sheet & header sizing compact
- Screen navigation tabs compact
- Accessibility: reduced motion support

**Breakpoints:**
- `@media (max-width: 768px)` → Tablet & mobile
- `@media (max-width: 480px)` → Smartphone
- `@media (max-width: 360px)` → Very small

**Kapan Edit:**
- Ubah spacing untuk mobile
- Adjust button/font sizes di mobile
- Modify grid column count untuk narrow screens
- Change layout stacking behavior

**Catatan:**
- Mobile-first approach
- Progressively enhance untuk larger screens
- Hemat ruang sangat penting di 360px

**Dependency:** Setelah `tokens.css`, `layout.css`

---

## Print & Export

### 📄 **print.css**
**Kegunaan:** Khusus aturan cetak (print) A4 landscape  
**Isi:**
- Page setup: A4 landscape, kecil margin
- Hide all elements kecuali `#printArea`
- Print header (logo, title, tanggal)
- Print info table (shift, line, date)
- Print log sheet table (sangat kecil, 6.5px)
- Print legend table
- Print OEE matrix & defect table
- Column width setting
- Prevent row breaks (`page-break-inside: avoid`)
- Color print adjust (exact colors)
- Hide buttons/interaktif elements
- Print-only elements display

**Kapan Edit:**
- Ubah font size untuk print (sesuaikan dengan page width)
- Modify column widths
- Change table appearance saat diprint
- Adjust page break behavior

**Komponen:**
```css
.print-only         → Elements hanya muncul saat print
.print-page         → Print page container
.print-header       → Print header styling
.print-log-tbl      → Log sheet table print
.print-oee-col      → OEE matrix print
```

**Catatan:**
- Font size sangat kecil (6.5px) agar muat A4
- Table layout fixed untuk consistency
- Color adjust untuk exact printing
- Sembunyikan tombol & UI interaktif

**Dependency:** Last (override semua styling sebelumnya untuk print)

---

## Loading Order & Dependencies

### ✅ Rekomendasi Load Order HTML
```html
<!-- 1. Design System Token PALING AWAL -->
<link rel="stylesheet" href="./css/tokens.css">

<!-- 2. Global Base & Reset -->
<link rel="stylesheet" href="./css/base.css">

<!-- 3. Layout & Structure -->
<link rel="stylesheet" href="./css/layout.css">

<!-- 4. Theme Utama (pilih satu) -->
<link rel="stylesheet" href="./css/apple-style.css">
<!-- atau -->
<!-- <link rel="stylesheet" href="./css/industrial-toolbar.css"> -->

<!-- 5. Feature Modules -->
<link rel="stylesheet" href="./css/dashboard.css">
<link rel="stylesheet" href="./css/oee.css">
<link rel="stylesheet" href="./css/modern-sheet.css">

<!-- 6. Shell & Navigation (Desktop) -->
<link rel="stylesheet" href="./css/shell.css">
<link rel="stylesheet" href="./css/sidebar.css">

<!-- 7. Login Themes (sesuai kebutuhan) -->
<link rel="stylesheet" href="./css/login-professional.css">
<!-- atau -->
<!-- <link rel="stylesheet" href="./css/nature.css"> -->

<!-- 8. Utilities & Overrides -->
<link rel="stylesheet" href="./css/clean-live.css">

<!-- 9. Responsive (Mobile-First) -->
<link rel="stylesheet" href="./css/mobile-native.css">

<!-- 10. Print PALING AKHIR -->
<link rel="stylesheet" href="./css/print.css" media="print">
```

---

## 🎯 Quick Reference - Mau Edit Apa?

### Ubah Warna / Tema
→ Edit **`tokens.css`**
- Warna brand: `--brand-600`, `--brand-900`
- Semantik: `--success-600`, `--danger-600`, `--warning-700`
- Background: `--bg-page`, `--bg-surface`

### Ubah Layout / Spacing
→ Edit **`layout.css`** atau **`tokens.css`**
- Grid layouts: `filter-grid`, `operator-grid`, `product-grid`
- Section padding: `.sec { padding: ... }`
- Spacing scale: `--space-1` s/d `--space-16` di tokens.css

### Ubah Tombol / Form
→ Edit **`apple-style.css`** atau **`components.css`**
- Button: `.btn-primary`, `.btn-ghost`, `.btn-logout`
- Form field: `.field input`, `.field select`

### Ubah Bottom Nav / Top Bar
→ Edit **`layout.css`** atau **`shell.css`**
- Bottom nav: `.bottom-nav`, `.bn-item`
- Topbar desktop: `.topbar`, `.topbar-inner`

### Ubah Dashboard Chart
→ Edit **`dashboard.css`**
- Chart container: `.dash-chart-wrap`
- Chart bars: `.dash-bar`, `.dash-bar.ok`, `.dash-bar.warn`
- Legend: `.dash-legend`

### Ubah Login Screen
→ Edit **`login-professional.css`** atau **`nature.css`**
- Login card: `.login-card`
- Background: overlay gradient + blob animations
- Decorative: SVG elements (river, tree, tent, dll)

### Ubah Logsheet / Sheet
→ Edit **`modern-sheet.css`**
- Sheet container: `.sheet`
- KPI cards: `.sheet-kpi`
- Product carousel: `.sheet-product-bar`
- Table: `.tbl-wrap`, `.log th`, `.log td`

### Ubah Mobile Responsif
→ Edit **`mobile-native.css`**
- Padding/margin compact: `@media (max-width: 768px)`
- Tiny screens: `@media (max-width: 360px)`

### Ubah Print Output
→ Edit **`print.css`**
- Font size: `.print-log-tbl { font-size: ... }`
- Column width: `.print-log-tbl .col-num { width: ... }`
- Page breaks: `page-break-before`, `page-break-inside`

---

## 📋 Checklist Saat Maintenance

- [ ] Edit `tokens.css` dulu jika ubah warna/spacing global
- [ ] Test di berbagai breakpoint (desktop, tablet, mobile)
- [ ] Check print preview (`Ctrl+Shift+P` → Print)
- [ ] Verify dark mode jika applicable
- [ ] Test reduced motion (`prefers-reduced-motion`)
- [ ] Ensure no regression di halaman lain
- [ ] Update dokumentasi ini jika file baru ditambah

---

## 🔗 Related Files (assumed exist but not provided)
- `components.css` - Button, card, form components
- `logsheet.css` - Log sheet form & table
- `login.css` - Basic login styling
- `style.css` - Global styles (might be main file)

---

**Selesai! 🎉**

Gunakan dokumentasi ini sebagai reference saat ingin edit CSS. Cukup cari bagian yang sesuai, buka file CSS yang dimaksud, dan lakukan editing. Happy coding!
