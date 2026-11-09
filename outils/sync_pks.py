#!/usr/bin/env python3
"""Copie la base de cartes de PoKoalaShop dans PoKoala.

Usage : python3 outils/sync_pks.py <dossier du dépôt PokoalaShop>

PoKoala garde sa propre copie (choix de Thomas, nov. 2026) : une nouvelle
extension ajoutée à PoKoalaShop doit être recopiée ici en relançant ce script,
puis en incrémentant DATA_VER dans pokoala_mobile.html.

Écrit :
  data/sets.json   copie de pks_sets.json (extensions, blocs, symboles, codes)
  data/cartes.json toutes les cartes des fichiers cards/<id>.json, réunies en
                   un seul fichier (une requête au lieu de ~205), dans l'ordre
                   des extensions de sets.json
  data/familles.json  copie de pks_familles.json (pastilles de famille)
  data/especes.json   copie de pks_especes.json (espèces, ordre d'évolution)
"""
import json
import os
import sys


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
    os.makedirs(dst, exist_ok=True)

    with open(os.path.join(src, 'pks_sets.json'), encoding='utf-8') as f:
        sets = json.load(f)

    cartes, manquants, ecartees = [], [], []
    for st in sets['sets']:
        p = os.path.join(src, 'cards', st['id'] + '.json')
        if not os.path.exists(p):
            manquants.append(st['id'])
            continue
        with open(p, encoding='utf-8') as f:
            for c in json.load(f):
                # Entrée incohérente : le numéro ne correspond pas à l'identifiant
                # (ex. zsv10pt5 : un doublon parasite de la n°60 portant l'id de
                # la n°80). On l'écarte plutôt que de laisser deux cartes
                # partager un identifiant.
                suf = c['i'].rsplit('-', 1)[1]
                if '_' not in suf and suf.lstrip('0').upper() != str(c.get('u', '')).lstrip('0').upper():
                    ecartees.append(f"{c['i']} (n°{c.get('u')} {c.get('n')})")
                    continue
                cartes.append(c)

    ids = [c['i'] for c in cartes]
    if len(ids) != len(set(ids)):
        doubles = sorted({i for i in ids if ids.count(i) > 1})
        sys.exit('ERREUR : identifiants en double : ' + ', '.join(doubles[:10]))

    with open(os.path.join(dst, 'sets.json'), 'w', encoding='utf-8') as f:
        json.dump(sets, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(dst, 'cartes.json'), 'w', encoding='utf-8') as f:
        json.dump(cartes, f, ensure_ascii=False, separators=(',', ':'))

    for a, b in (('pks_familles.json', 'familles.json'), ('pks_especes.json', 'especes.json')):
        with open(os.path.join(src, a), encoding='utf-8') as f:
            j = json.load(f)
        with open(os.path.join(dst, b), 'w', encoding='utf-8') as f:
            json.dump(j, f, ensure_ascii=False, separators=(',', ':'))

    print(f"{len(sets['sets'])} extensions, {len(cartes)} cartes copiées")
    if manquants:
        print('Extensions sans fichier de cartes :', ', '.join(manquants))
    if ecartees:
        print('Entrées incohérentes écartées :', '; '.join(ecartees))


if __name__ == '__main__':
    main()
