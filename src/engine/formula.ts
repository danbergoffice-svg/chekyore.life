// Маленький безопасный вычислитель формул снов (без eval): числа, параметры, + − × / ^, скобки,
// функции sin, cos, tan (в градусах), sqrt, abs, round, константа pi.

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokens(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
    } else if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      out.push({ t: 'num', v: Number(src.slice(i, j)) })
      i = j
    } else if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < src.length && /[a-zA-Z_0-9]/.test(src[j])) j++
      out.push({ t: 'id', v: src.slice(i, j) })
      i = j
    } else if ('+-*/^(),'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
    } else throw new Error(`Формула: непонятный символ «${c}» в ${src}`)
  }
  return out
}

const RAD = Math.PI / 180
const FUNCS: Record<string, (x: number) => number> = {
  sin: (x) => Math.sin(x * RAD),
  cos: (x) => Math.cos(x * RAD),
  tan: (x) => Math.tan(x * RAD),
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
}

/** Посчитать формулу с параметрами. Ошибка — если параметра нет или формула записана неверно. */
export function evaluate(src: string, vars: Record<string, number>): number {
  const ts = tokens(src)
  let p = 0
  const peek = () => ts[p]
  const take = () => ts[p++]
  const expect = (v: string) => {
    const t = take()
    if (!t || t.t !== 'op' || t.v !== v) throw new Error(`Формула: ожидалось «${v}» в ${src}`)
  }
  // expr := term (('+'|'-') term)*; term := power (('*'|'/') power)*; power := unary ('^' power)?
  const expr = (): number => {
    let v = term()
    for (let t = peek(); t && t.t === 'op' && (t.v === '+' || t.v === '-'); t = peek()) {
      take()
      v = t.v === '+' ? v + term() : v - term()
    }
    return v
  }
  const term = (): number => {
    let v = power()
    for (let t = peek(); t && t.t === 'op' && (t.v === '*' || t.v === '/'); t = peek()) {
      take()
      v = t.v === '*' ? v * power() : v / power()
    }
    return v
  }
  const power = (): number => {
    const base = unary()
    const t = peek()
    if (t && t.t === 'op' && t.v === '^') {
      take()
      return base ** power()
    }
    return base
  }
  const unary = (): number => {
    const t = peek()
    if (t && t.t === 'op' && t.v === '-') {
      take()
      return -unary()
    }
    return atom()
  }
  const atom = (): number => {
    const t = take()
    if (!t) throw new Error(`Формула оборвалась: ${src}`)
    if (t.t === 'num') return t.v
    if (t.t === 'op' && t.v === '(') {
      const v = expr()
      expect(')')
      return v
    }
    if (t.t === 'id') {
      if (FUNCS[t.v]) {
        expect('(')
        const v = expr()
        expect(')')
        return FUNCS[t.v](v)
      }
      if (t.v === 'pi') return Math.PI
      if (t.v in vars) return vars[t.v]
      throw new Error(`Формула: нет параметра «${t.v}» в ${src}`)
    }
    throw new Error(`Формула: лишний знак в ${src}`)
  }
  const v = expr()
  if (p < ts.length) throw new Error(`Формула: лишнее в конце ${src}`)
  return v
}
