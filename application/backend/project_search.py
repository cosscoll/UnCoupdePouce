"""Filters only an already authorized project list. Never broadens discovery rights."""
import json
import unicodedata
from datetime import datetime, timedelta, timezone

TIMINGS={'flexible','month','quarter','urgent'}
def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFD',value.casefold()) if unicodedata.category(c)!='Mn')

def decorate(row):
    item=dict(row)
    payload=item.pop('draft_payload',None)
    try:timing=json.loads(payload or '{}').get('timing','flexible')
    except (ValueError,TypeError):timing='flexible'
    item['timing']=timing if timing in TIMINGS else 'flexible'
    return item

def filter_projects(items,taxonomy,*,q='',trade='',town='',category='',timing=None,status=None,published_within=None,sort='newest'):
    catalog={r['id']:r for r in taxonomy}
    terms=normalize(q).split();cutoff=datetime.now(timezone.utc)-timedelta(days=published_within) if published_within else None
    def eligible(p):
        scope=json.loads(p.get('trades_json') or '[]') or [p['trade']]
        if trade and trade not in scope:return False
        if town and normalize(p['town'])!=normalize(town.strip()):return False
        if category and not any(normalize(catalog.get(t,{}).get('group_name',''))==normalize(category) for t in scope):return False
        if timing and p['timing']!=timing:return False
        if status and p['status']!=status:return False
        if cutoff:
            try:stamp=datetime.fromisoformat(p['created_at'])
            except (ValueError,TypeError):return False
            if stamp.tzinfo is None:stamp=stamp.replace(tzinfo=timezone.utc)
            if stamp<cutoff:return False
        if terms:
            text=[p['title'],p['description'],p['town']]
            for t in scope:
                r=catalog.get(t,{})
                text.extend([t,r.get('label',''),r.get('group_name',''),*json.loads(r.get('synonyms') or '[]')])
            normalized=normalize(' '.join(text))
            if not all(term in normalized for term in terms):return False
        return True
    return sorted((p for p in items if eligible(p)),key=lambda p:(p['created_at'],p['id']),reverse=sort=='newest')
