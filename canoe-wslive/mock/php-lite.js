'use strict';

/**
 * Évaluateur du (très petit) sous-ensemble de PHP utilisé par les pages ws_live.
 *
 * macOS ne fournit plus de PHP et installer Laragon pour trois `echo` serait
 * absurde. Les gabarits n'utilisent que quatre constructions :
 *
 *   define("VERSION_BOOTSTRAP", "5.3.3");        -> constante
 *   <?php echo VERSION_BOOTSTRAP;?>  /  <?= X ?> -> substitution
 *   $iframe = ''; if (isset($_GET['iframe'])) $iframe = $_GET['iframe'];
 *   <?php if ($iframe == '1') { ?> … <?php }?>   -> bloc conditionnel
 *
 * Tout ce qui sort de ce périmètre est ignoré et signalé sur la sortie standard,
 * pour qu'une page qui se met à faire du vrai PHP ne casse pas en silence.
 */

const RE_BLOCK = /<\?php([\s\S]*?)\?>|<\?=([\s\S]*?)\?>/g;

function evalEcho(expr, env) {
  return String(resolve(expr.replace(/;$/, '').trim(), env));
}

function evalPhp(code, env, stack) {
  let emitted = null;

  for (let stmt of splitStatements(code)) {
    stmt = stmt.trim();
    if (!stmt) continue;

    // fin de bloc conditionnel
    if (stmt === '}') {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // define("NAME", "value")
    let mm = stmt.match(/^define\s*\(\s*(['"])(.+?)\1\s*,\s*(['"])(.*?)\3\s*\)$/);
    if (mm) {
      env.consts[mm[2]] = mm[4];
      continue;
    }

    // echo EXPR
    mm = stmt.match(/^echo\s+(.+)$/);
    if (mm) {
      emitted = (emitted || '') + String(resolve(mm[1].trim(), env));
      continue;
    }

    // if (COND) {   |   if (COND) STATEMENT
    mm = stmt.match(/^if\s*\((.+)\)\s*\{?$/s);
    if (mm) {
      const active = stack[stack.length - 1] && testCondition(mm[1], env);
      if (stmt.endsWith('{')) stack.push(active);
      else if (active) {
        /* if sans accolade : le corps suit dans splitStatements */
      }
      continue;
    }

    // if (isset($_GET['k'])) $var = $_GET['k'];  — forme sur une seule ligne
    mm = stmt.match(/^if\s*\(\s*isset\s*\(\s*\$_GET\[(['"])(.+?)\1\]\s*\)\s*\)\s*(.+)$/s);
    if (mm) {
      if (env.query && env.query[mm[2]] !== undefined) evalPhp(mm[3], env, stack);
      continue;
    }

    // $var = EXPR
    mm = stmt.match(/^\$(\w+)\s*=\s*(.+)$/s);
    if (mm) {
      env.vars[mm[1]] = resolve(mm[2].trim(), env);
      continue;
    }

    if (!/^\}?\s*$/.test(stmt)) {
      console.warn(`[php-lite] instruction non gérée, ignorée : ${stmt.slice(0, 80)}`);
    }
  }

  return emitted;
}

/** Découpe sur les `;` et les `{`/`}` de premier niveau, hors chaînes. */
function splitStatements(code) {
  const parts = [];
  let cur = '';
  let quote = null;
  let depth = 0;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      cur += ch;
      if (ch === quote && code[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ';' && depth === 0) {
      parts.push(cur);
      cur = '';
      continue;
    }
    if (ch === '{' && depth === 0) {
      parts.push(cur + '{');
      cur = '';
      continue;
    }
    if (ch === '}' && depth === 0) {
      if (cur.trim()) parts.push(cur);
      parts.push('}');
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function resolve(expr, env) {
  expr = expr.replace(/;$/, '').trim();

  let mm = expr.match(/^(['"])([\s\S]*?)\1$/);
  if (mm) return mm[2];

  mm = expr.match(/^\$_GET\[(['"])(.+?)\1\]$/);
  if (mm) return env.query && env.query[mm[2]] !== undefined ? env.query[mm[2]] : '';

  mm = expr.match(/^\$(\w+)$/);
  if (mm) return env.vars[mm[1]] !== undefined ? env.vars[mm[1]] : '';

  if (Object.prototype.hasOwnProperty.call(env.consts, expr)) return env.consts[expr];
  if (/^-?\d+$/.test(expr)) return expr;

  console.warn(`[php-lite] expression non gérée : ${expr.slice(0, 80)}`);
  return '';
}

function testCondition(cond, env) {
  cond = cond.trim();

  let mm = cond.match(/^isset\s*\(\s*\$_GET\[(['"])(.+?)\1\]\s*\)$/);
  if (mm) return env.query && env.query[mm[2]] !== undefined;

  mm = cond.match(/^(.+?)\s*(===|==|!==|!=)\s*(.+)$/);
  if (mm) {
    const a = String(resolve(mm[1].trim(), env));
    const b = String(resolve(mm[3].trim(), env));
    return mm[2].startsWith('!') ? a !== b : a === b;
  }

  return Boolean(resolve(cond, env));
}

function render(source, query = {}) {
  const env = { vars: {}, consts: {}, query };
  const stack = [true]; // pile des conditions : sort-on du HTML ?
  let out = '';
  let last = 0;
  let m;

  RE_BLOCK.lastIndex = 0;
  while ((m = RE_BLOCK.exec(source)) !== null) {
    if (stack[stack.length - 1]) out += source.slice(last, m.index);
    last = m.index + m[0].length;

    const isShortEcho = m[2] !== undefined;
    const code = (isShortEcho ? m[2] : m[1]).trim();
    const emitted = isShortEcho ? evalEcho(code, env) : evalPhp(code, env, stack);
    if (emitted !== null && stack[stack.length - 1]) out += emitted;
  }

  if (stack[stack.length - 1]) out += source.slice(last);
  return out;
}

module.exports = { render, _internals: { splitStatements, resolve, testCondition } };
