#!/usr/bin/env python3
"""Récupère l'illustrateur de chaque carte de la base (data/cartes.json).

Usage : python3 outils/illustrateurs.py

Écrit data/artistes.json : {"a": [noms d'illustrateurs triés], "c": {id carte: rang dans a}}.
Incrémental : les cartes déjà connues sont gardées, seules les manquantes
sont demandées. À relancer après chaque nouvelle extension (puis
incrémenter DATA_VER dans pokoala_mobile.html).

Sources, dans l'ordre :
  1. pokemontcg.io (champ artist), une requête par extension : ses
     identifiants de cartes sont ceux de la base ;
  2. TCGdex (champ illustrator), carte par carte, pour le reste.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

ICI = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')


def get(url, essais=5):
    for k in range(essais):
        r = subprocess.run(['curl', '-s', '-m', '60', url], capture_output=True, text=True)
        try:
            return json.loads(r.stdout)
        except ValueError:
            time.sleep(2 + 3 * k)
    return None


def main():
    sets = json.load(open(os.path.join(ICI, 'sets.json'), encoding='utf-8'))['sets']
    cartes = json.load(open(os.path.join(ICI, 'cartes.json'), encoding='utf-8'))
    ids = {c['i'] for c in cartes}
    chemin = os.path.join(ICI, 'artistes.json')
    art = {}
    if os.path.exists(chemin):
        d = json.load(open(chemin, encoding='utf-8'))
        art = {i: d['a'][n] for i, n in d['c'].items() if i in ids}

    # 1. pokemontcg.io, extension par extension (seulement celles incomplètes)
    manque = {}
    for c in cartes:
        if c['i'] not in art:
            manque.setdefault(c['s'], 0)
            manque[c['s']] += 1
    for st in sets:
        if st['id'] not in manque:
            continue
        page = 1
        while True:
            q = urllib.parse.quote('set.id:' + st['id'])
            d = get(f'https://api.pokemontcg.io/v2/cards?q={q}&pageSize=250&page={page}&select=id,artist')
            if not d:
                print('  pokemontcg.io sans réponse :', st['id'])
                break
            for c in d.get('data', []):
                if c.get('artist') and c['id'] in ids:
                    art[c['id']] = c['artist'].strip()
            if page * 250 >= d.get('totalCount', 0):
                break
            page += 1

    # 2. TCGdex carte par carte pour le reste
    t_de = {st['id']: st.get('t') for st in sets}
    reste = [c for c in cartes if c['i'] not in art]

    def tcgdex(c):
        m = re.search(r'assets\.tcgdex\.net/[a-z]+/[^/]+/([^/]+)/([^/]+)$', c.get('g') or '')
        cand = []
        if m:
            cand.append(f'{m.group(1)}-{m.group(2)}')
        t = t_de.get(c['s'])
        if t:
            cand += [f"{t}-{c['u']}", f"{t}-{str(c['u']).zfill(3)}"]
        for cid in dict.fromkeys(cand):
            for lang in ('fr', 'en'):
                d = get(f'https://api.tcgdex.net/v2/{lang}/cards/{urllib.parse.quote(cid)}', essais=2)
                if d and d.get('illustrator'):
                    return c['i'], d['illustrator'].strip()
        return c['i'], None

    with ThreadPoolExecutor(8) as ex:
        for i, a in ex.map(tcgdex, reste):
            if a:
                art[i] = a

    # Une même personne écrite de plusieurs façons (« K Hoshiba » / « K. Hoshiba »,
    # « saino misaki ») : on garde la graphie la plus fréquente
    cle = lambda n: re.sub(r'[\s.]', '', n.lower())
    freq = {}
    for a in art.values():
        freq[a] = freq.get(a, 0) + 1
    best = {}
    for a, f in freq.items():
        k = cle(a)
        if k not in best or f > freq[best[k]]:
            best[k] = a
    art = {i: best[cle(a)] for i, a in art.items()}

    noms = sorted(set(art.values()), key=lambda s: s.lower())
    rang = {n: k for k, n in enumerate(noms)}
    out = {'a': noms, 'c': {i: rang[a] for i, a in sorted(art.items())}}
    json.dump(out, open(chemin, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    sans = {}
    for c in cartes:
        if c['i'] not in art:
            sans[c['s']] = sans.get(c['s'], 0) + 1
    print(f'{len(art)}/{len(ids)} cartes avec illustrateur, {len(noms)} illustrateurs')
    if sans:
        print('Sans illustrateur :', ', '.join(f'{k} ({v})' for k, v in sorted(sans.items(), key=lambda x: -x[1])))


if __name__ == '__main__':
    main()
