"""Shared, transactional preproduction abuse guard; no pricing or IP tracking."""
from datetime import datetime, timedelta
import math
import os
from fastapi import HTTPException


def load_limits():
    values=[]
    for name,default,seconds in [('UCP_APPLICATIONS_PER_MINUTE',10,60),('UCP_APPLICATIONS_PER_HOUR',50,3600)]:
        raw=os.getenv(name,str(default))
        if not raw.isascii() or not raw.isdecimal() or not 1<=int(raw)<=10000:
            raise RuntimeError(name+' must be an integer between 1 and 10000')
        values.append((seconds,int(raw)))
    if values[1][1]<values[0][1]:
        raise RuntimeError('UCP_APPLICATIONS_PER_HOUR must be at least UCP_APPLICATIONS_PER_MINUTE')
    return tuple(values)


def enforce(c,professional_id,project_id,stamp,limits):
    """Call after eligibility checks and inside the application write transaction."""
    if c.execute('SELECT 1 FROM applications WHERE professional_id=? AND project_id=?',(professional_id,project_id)).fetchone():
        raise HTTPException(409,'Candidature déjà enregistrée pour ce projet')
    current=datetime.fromisoformat(stamp)
    retry=0
    for seconds,maximum in limits:
        cutoff=(current-timedelta(seconds=seconds)).isoformat(timespec='seconds')
        rows=c.execute('SELECT created_at FROM applications WHERE professional_id=? AND created_at>? ORDER BY created_at', (professional_id,cutoff)).fetchall()
        if len(rows)>=maximum:
            # Also handles a newly lowered limit: enough entries must expire first.
            releases=datetime.fromisoformat(rows[-maximum]['created_at'])+timedelta(seconds=seconds)
            retry=max(retry,max(1,math.ceil((releases-current).total_seconds())))
    if retry:
        raise HTTPException(429,f'Trop de candidatures rapprochées. Réessayez dans {retry} s. Aucune nouvelle candidature n’a été enregistrée.',headers={'Retry-After':str(retry)})
