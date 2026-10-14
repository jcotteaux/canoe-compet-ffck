// Hook de chargement ESM : les scripts de gestion_kcross_series sont des modules
// ES écrits pour le navigateur, mais le package.json du dépôt est en CommonJS.
// Sans ce hook, Node les lirait comme du CommonJS et refuserait leurs `import`.
//
// Les imports internes portent un suffixe de cache (`./utils.js?v=2.2.0`) : on
// le retire pour lire le fichier, l'URL complète reste la clé du module.

import { readFile } from 'node:fs/promises';

export async function load(url, context, next) {
  if (url.startsWith('file:') && url.includes('/gestion_kcross_series/') && /\.js(\?|$)/.test(url)) {
    const file = new URL(url);
    file.search = '';
    return { format: 'module', source: await readFile(file), shortCircuit: true };
  }
  return next(url, context);
}
