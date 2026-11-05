const fs=require('fs');const r=f=>fs.readFileSync(f,'utf8');
const head=`<title>VariLink</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Sans+3:wght@400;600;700&display=swap">
<style>${r('src/styles.css')}</style>`;
const body=`<header class="top"><button class="brand" id="brand">Vari<span>Link</span></button><nav class="crumbs" id="crumbs" aria-label="Location"></nav></header>
<main class="main" id="main"></main>
<script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>${r('src/engine.js')}</script><script>${r('src/reader.js')}</script><script>${r('src/sample.js')}</script><script>${r('src/app.js')}</script>`;
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/artifact.html',head+'\n'+body);
fs.writeFileSync('dist/index.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${head}</head><body>${body}</body></html>`);
