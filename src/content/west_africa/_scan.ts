import fs from 'node:fs'
import { loadEra } from '../index'
async function main() {
  const era = await loadEra('WAF')
  const d = 'src/content/common/'
  const ru: Record<string, string> = Object.assign({}, ...fs.readdirSync(d).filter((x) => x.startsWith('ru')).map((x) => JSON.parse(fs.readFileSync(d + x, 'utf8'))))
  const re = new RegExp(process.argv[2], 'i')
  for (const e of era.events) {
    if (e.id.startsWith('waf_')) continue
    const regs = new Set(['rome','athens','egypt'])
    for (const [k, v] of Object.entries(ru)) {
      if (!k.startsWith('ev.' + e.id + '.')) continue
      const last = k.split('.').pop()!
      if (/^[A-Z]{3}$/.test(last) || regs.has(last) || /^[a-z_]+$/.test(last) && process.argv[3] && !k.endsWith(last)) continue
      if (/(^|\.)(rome|athens|egypt|E03|CHN|JPN|IND|RUS|BYZ|EUR|AMR|MAY|ETH)$/.test(k)) continue
      const m = v.match(re)
      if (m) console.log(k, '|', v.slice(Math.max(0, m.index! - 60), m.index! + 40).replace(/\n/g, ' '))
    }
  }
}
main()
