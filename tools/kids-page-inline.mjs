// Склеивает out/kids-page в один файл out/kids-play.html: скрипт и стили - внутрь страницы.
import fs from 'node:fs'
import path from 'node:path'
const dir = 'out/kids-page'
const htmlPath = path.join(dir, 'tools/kids-play.html')
let html = fs.readFileSync(htmlPath, 'utf8')
const read = (rel) => fs.readFileSync(path.resolve(path.dirname(htmlPath), rel), 'utf8')
html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, (_, src) => `<script type="module">${read(src).replace(/<\/script/g, '<\\/script')}</script>`)
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/g, (_, href) => `<style>${read(href)}</style>`)
fs.writeFileSync('out/kids-play.html', html)
console.log('out/kids-play.html', Math.round(fs.statSync('out/kids-play.html').size / 1024), 'КБ', /src="\.\//.test(html) ? '(остались внешние ссылки!)' : '')
